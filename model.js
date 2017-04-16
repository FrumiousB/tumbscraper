// Constants

exports.FS_SYNC_RUNSTATE_RUNNING = 'running';
exports.FS_SYNC_RUNSTATE_STOPPED = 'stopped';
exports.FS_SYNC_RUNSTATE_STOPPING = 'stopping';
exports.FS_SYNC_RUNSTATE_ERROR = 'error';

exports.TUMBLR_SYNC_RUNSTATE_RUNNING_FIRST= 'runningfirst';
exports.TUMBLR_SYNC_RUNSTATE_RUNNING_MINOR = 'runningminor';
exports.TUMBLR_SYNC_RUNSTATE_STOPPED = 'stopped';
exports.TUMBLR_SYNC_RUNSTATE_STOPPING = 'stopping';
exports.TUMBLR_SYNC_RUNSTATE_ERROR = 'error';

exports.APPSTATE_RUNSTATE_READY = 'ready';
exports.APPSTATE_RUNSTATE_ERROR = 'error';

exports.STORE_RUNSTATE_READY = 'ready';
exports.STORE_RUNSTATE_ERROR = 'error';

exports.APP_RUNSTATE_READY = 'ready';
exports.APP_RUNSTATE_INITIALIZING = 'initializing';

// this is the model we share with clients
exports.model = {

  appStateReadyState: String,
  storeReadyState: String,
  fsSyncRunState: exports.FS_SYNC_RUNSTATE_STOPPED,
  appRunState: String,
  tumblrSyncRunState: exports.TUMBLR_SYNC_RUNSTATE_STOPPED,

  tumblrPostsSoFar: Number,  // # of posts fetched and saved this session
  tumblrOldestPostRecorded: Date,  // stamp of most ancient post we have written
  tumblrFreshestPostRecorded: Date,  // stamp of most recent post we have written
  tumblrFreshestPostSeen: Date, // stamp of most recent post service knows of
  tumblrBedrockPost: Date, // stamp of oldest post service knows of
  tumblrMinorSyncOldest: Date,
  tumblrTotalLikes: Number,
  
  
  fsPicsSoFar: Number,  // # of pics feteched and saved this session
  fsCurrentTime: Date,  // timestamp cursor
  fsEarliestPic: Date,  // time of most recent pic we have fetched and saved
  fsFreshestPic: Date,  // time of most ancient pic we have fetched and saved
  
  picEntryCount: Number, // total # of pic records in db
  picFileCount: Number   // total # of pic files in fs
  
};

// this is a bag of objects and functions we use for wiring up all 
// the program components

exports.wiring = {
  app: Object,       //express instance
  server: Object,    //web server
  model: Object,     //model for client-server communication
  notify: Function,
  tumblrClient: Object,
  PersistentPicRecord: Object,
  
  IP: String,
  PORT: Number,

  fsSyncPicSavePath: String,
};
