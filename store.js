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
  getPicType: getPicType
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

