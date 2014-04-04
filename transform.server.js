var PassThrough = Npm.require('stream').PassThrough;

FS.Transform = function(options) {
  var self = this;

  options = options || {};

  if (!(self instanceof FS.Transform))
    throw new Error('FS.Transform must be called with the "new" keyword');

  if (!options.store)
    throw new Error('Transform expects option.store to be a storage adapter');

  // Support both Storage adapter and internal SA api
  self.storage = options.store.adapter || options.store;
  self.storeName = options.storeName;

  // Fetch the transformation functions if any
  self.transformWrite = options.transformWrite;
  self.transformRead = options.transformRead;
};

// Allow packages to add scope
FS.Transform.scope = {};

// The transformation stream triggers an "stored" event when data is stored into
// the storage adapter
FS.Transform.prototype.createWriteStream = function(fileObj, options) {
  var self = this;

  // If this fileObj has been stored before, we use the key that was generated at that time.
  // Otherwise, we have the SA generate a new key.
  var copyInfo = fileObj.getCopyInfo(self.storeName);
  var fileKey = copyInfo && copyInfo.key ? copyInfo.key : self.storage.fileKey(fileObj);

  // Rig write stream
  var destinationStream = self.storage.createWriteStream(fileKey, {
    // Not all SA's can set these options and cfs dont depend on setting these
    // but its nice if other systems are accessing the SA that some of the data
    // is also available to those
    aliases: [fileObj.name],
    contentType: fileObj.type,
    metadata: fileObj.metadata
  });

  if (typeof self.transformWrite === 'function') {

    // Rig read stream for gm
    var sourceStream = new PassThrough();

    // We pass on the special "stored" event for those listening
    destinationStream.on('stored', function(result) {
      sourceStream.emit('stored', result);
    });

    // Rig transform
    try {
      self.transformWrite.call(FS.Transform.scope, fileObj, sourceStream, destinationStream);
      // XXX: If the transform function returns a buffer should we stream that?
    } catch(err) {
      // We emit an error - should we throw an error?
      sourceStream.emit('error', 'FS.Transform.createWriteStream transform function failed');
    }

    // Return write stream
    return sourceStream;
  } else {

    // We dont transform just normal SA interface
    return destinationStream;
  }

};

FS.Transform.prototype.createReadStream = function(fileObj, options) {
  var self = this;

  // If this fileObj has been stored before, we use the key that was generated at that time.
  // Otherwise, we have the SA generate the key (but the file will probably not exist?).
  var copyInfo = fileObj.getCopyInfo(self.storeName);
  var fileKey = copyInfo && copyInfo.key ? copyInfo.key : self.storage.fileKey(fileObj);

  // Rig read stream
  var sourceStream = self.storage.createReadStream(fileKey, options);

  if (typeof self.transformRead === 'function') {
    // Rig write stream
    var destinationStream = new PassThrough();

    // Rig transform
    try {
      self.transformRead.call(FS.Transform.scope, fileObj, sourceStream, destinationStream);
    } catch(err) {
      //throw new Error(err);
      // We emit an error - should we throw an error?
      sourceStream.emit('error', 'FS.Transform.createReadStream transform function failed');
    }

    // Return write stream
    return destinationStream;

  }

  // We dont transform just normal SA interface
  return sourceStream;
};
