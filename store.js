/* Picture and File sync store */

var mongoose = require('mongoose');
var logger = require('./multilog.js');
var appmodel = require('./model.js');  // only for constants

var db = undefined; // filled in by init

var picSchemaInitializer = {
  	url : String,
  	id : String,
  	parentPostId : String,
  	parentPostURL : String,
  	dateLiked : Number,
  	dateDiscovered :  Date,
  	dateDownloaded : Date,
  	downloadPath : String
};

var PicType = undefined;

module.exports = {
  init: init,
  getPicType: getPicType,
  getStoredPixCount: getStoredPixCount,
  getOldestStoredPic: getOldestStoredPic,
  getFreshestStoredPic: getFreshestStoredPic,
  clearPix: clearPix,
  logPic: logPic
};

// m is the model object
// next is the async callback to continue
function init (ip, callback) {

  // logger.log('storeinit: starting');
    
  if (db != undefined) {
      var err = new Error('storeInit: called init twice');
      throw err;
  }
  
  //  mongoose.connect('mongodb://' + ip);
  //  db = mongoose.connection;
  db = mongoose.createConnection('mongodb://' + ip);

  var picSchema = mongoose.Schema(picSchemaInitializer);

  PicType = db.model('Pic', picSchema);

  // db = mongoose.connection;
  db.on('error', console.error.bind(console, 
                                    'store:init: db connection error'));
  db.once('open', function (cb) {
    logger.log('store:init: connected successfully, database open');
    callback(null, null);
  });
}

function getPicType () {
    if (!PicType) {
        logger.log('store:getPicType: PicType not initialized');
        return null;
    } else {
        return PicType;
    }
}

function getStoredPixCount (callback) {
  PicType.count(function (err,result) {
  if (err) {
    logger.log('tumbsync:store:failed to get pic count:',err);
    callback(err,null);
  } else {
    logger.log('getStoredPix:Count returned ',result);
    callback(null,result);
    }
  });
}

function getOldestStoredPic (callback) {
  
  getStoredPixCount (function (err, result) {
    if (err) {
      logger.log('tumbsync:store:getOldest:failed to get count:',err);
    } else {
      if (result == 0) {
        logger.log('tumbsync:store:getOldest:no pics');
        callback(new Error('tumbsync:getOldest:no pics'),null);
      }
    }
  });
  
  PicType.findOne().sort('DateLiked').exec(function(err,result) {
    if (err) {
      logger.log('tumbsync:store:getOldestStoredPic:query failed:',err);
      callback(err,null);
    } else {
      callback(null,result);
    }
  });
}

function getFreshestStoredPic (callback) {

  getStoredPixCount (function(err, result) {
    if (err) {
      logger.log('tumbsync:store:getFreshest:failed to get count:',err);
    } else {
      if (result == 0) {
        logger.log('tumbsync:store:getFreshest:no pics');
        callback(new Error('tumbsync:getFreshest:no pics'),null);
      } else {
        PicType.findOne().sort('-DateLiked').exec(function(err,result){
          if (err) {
            logger.log('tumbsync:store:getOldestStoredPic:query failed:',err);
            callback(err,null);
          } else {
            callback(null,result);
          }
        });
      }
    }
  });
}

function getNthPic (n, callback) {
  var index = 0;
  var cursor = PicType.find({}).sort('DateLiked').cursor();

  cursor.on('data', function(pic) {
    if (index == n) callback(null, pic);
    else ++index;});

  cursor.on('close', function() {
    logger.log(
      'tumbsync:store:getNth:wanted ',n,'th, but only ',index,' exist.');
    callback(new Error('store:getNth:not enough items'),null);
  });
}

//reset the pix collection
function clearPix () {
  PicType.remove({},function(err) {
    if (err) logger.log('tumbsync:store:failed to remove collection:',err);
  });
}

//dump pic info to the log
function logPic (p) {
  logger.log('Pic:');
  logger.log('URL:',p.url);
  logger.log('ID:',	p.id);
  logger.log('ParentPostID:',	p.parentPostId);
  logger.log('ParentPostURL:',	p.parentPostURL);
  logger.log('DateLiked:',	p.dateLiked);
  logger.log('DateDiscovered:',	p.dateDiscovered);
  logger.log('DateDownloaded:',	p.dateDownloaded);
  logger.log('DownloadPath:',	p.downloadPath);
}