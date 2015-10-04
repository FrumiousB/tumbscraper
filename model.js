// Constants
var logger = require('./multilog.js');

exports.FS_SYNC_RUNSTATE_RUNNING = 'running';
exports.FS_SYNC_RUNSTATE_STOPPED = 'stopped';
exports.FS_SYNC_RUNSTATE_STOPPING = 'stopping';
exports.FS_SYNC_RUNSTATE_ERROR = 'error';

exports.TUMBLR_SYNC_RUNSTATE_RUNNING = 'running';
exports.TUMBLR_SYNC_RUNSTATE_STOPPED = 'stopped';
exports.TUMBLR_SYNC_RUNSTATE_STOPPING = 'stopping'
exports.TUMBLR_SYNC_RUNSTATE_ERROR = 'error';

exports.APPSTATE_RUNSTATE_READY = 'ready';
exports.APPSTATE_RUNSTATE_ERROR = 'error';

exports.STORE_RUNSTATE_READY = 'ready';
exports.STORE_RUNSTATE_ERROR = 'error';

exports.APP_RUNSTATE_READY = 'ready';
exports.APP_RUNSTATE_INITIALIZING = 'initializing'

// this is our model

exports.model = {
  app: Object,    //express instance
  server: Object, //web server
  IP: String,
  PORT: Number,
  appRunState: String,
  
  tumblrClient : Object,
  
  notify : Object,
  
  appStoreReadyState: String,
  storeReadyState: String,
  
  PersistentPicRecord: Object,     // the mongoose type for saving pic records

  fsSyncRunState: exports.FS_SYNC_RUNSTATE_STOPPED,
  fsSyncPicSavePath: String,
  
  tumblrSyncRunState: exports.TUMBLR_SYNC_RUNSTATE_STOPPED,
  tumblrPostsSoFar: Number,
  tumblrCurrentTime: Date
  
};
