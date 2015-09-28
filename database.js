/* Persistent objects for Tumblr Scraper */

var mongoose = require('mongoose');
var logger = require('./multilog.js');
var appmodel = require('./model.js');  // only for constants

var model = undefined // filled in by init
var db = undefined // filled in by init
var configSchemaInitializer = undefined;
var picSchemaInitializer = undefined;

module.exports = {
  init: init,
  getConfig: getConfig,
  setConfig: setConfig,
  getPicType: getPicType
};

// m is the model object
// next is the async callback to continue
function init (m, next) {

  logger.log('dbInit: starting');
    
  if (model != undefined) {
      var err = new Error('dbInit: called init twice');
      throw err;
  }
  
  model = m;
  
  mongoose.connect('mongodb://' + model.IP);

  configSchemaInitializer = {
    locator: String,
    tumblrOauthAccessToken: String,
    tumblrOauthAccessTokenSecret: String,
    tumblrFreshestPost : Number,
    tumblrOldestPost: Number,
    fsFreshestPic: Date,
    fsOldestPic: Date,
  };

  var configSchema = mongoose.Schema(configSchemaInitializer);

  model.DbConfig = mongoose.model('Config', configSchema);

  picSchemaInitializer = {
  	url : String,
  	id : String,
  	parentPostId : String,
  	parentPostURL : String,
  	dateLiked : Number,
  	dateDiscovered :  Date,
  	dateDownloaded : Date,
  	downloadPath : String
  };

  var picSchema = mongoose.Schema(picSchemaInitializer);

  model.DbPic = mongoose.model('Pic', picSchema);

  db = mongoose.connection;
  db.on('error', console.error.bind(console, 
                                    'setupDatabase: db connection error'));
  db.once('open', function (callback) {
    logger.log('dbInit: connected successfully, database open');
    logger.log('dbInit: we\'re done here');
    model.dbReadyState = db.readyState;
    next();
  });
}

function setConfig (newConfig,callback) {
    
    if (db === undefined) {
        var err = new Error('dbGetConfig: not initialized');
        throw err;
    }

    newConfig.locator = 'CURRENT';
    
    
    model.DbConfig.find({ locator : 'CURRENT'}, function doResults(error,results) {
    
        if (error) {
            logger.log('dbSetConfig: error from find', error);
            throw error;
        }
        
        // logger.log('dbSetConfig: results from find:', results);

        // if there is no current config record, save this one
        
        if (results.length === 0) {
            // logger.log('dbSetConfig: saving config for first time:',newConfig._id);
            newConfig.save(function PostSaveCallback (err) {
                if (err) {
                    logger.log('setConfig: got err from save:',err);
                    var outererr = new Error('setConfig: failed to save config');
                    outererr.previous = error;
                    callback(outererr, undefined);
                } else {
                    // logger.log('dbSetConfig: saved record for the first time');
                    callback (null, newConfig);
                }
            });
        } else {
            
        // otherwise, update the current record and save it to the database
    
            // logger.log('dbSetConfig: updating current config record');
            var current = results[0];

            // if caller is just giving us back our own object, we can
            // just save it.  Otherwise, we copy updates into our own
            // config record and save it
            
            // there is something I don't understand about either for x in y
            // or type conversion, because the below loop should be able to
            // be written much more simply.  ConfigSchemaInitializer is where
            // we defined the fields we use in the config record.  We use it
            // here to enumerate the property names we care about
            
            if (current._id != newConfig._id) {
                var propsToCopy = Object.getOwnPropertyNames(configSchemaInitializer);
                for (var prop in propsToCopy) {
                    current[propsToCopy[prop]] = newConfig[propsToCopy[prop]]; 
                }
            }
            
            // save updated object
            // logger.log('dbSetConfig: saving:',current._id);
            current.save(function PostSaveCallback (err) {
                if (err) {
                    logger.log(
                        'setConfig: got err saving current config record:',err);
                    var outererr = new Error(
                        'setConfig: failed to save updated config record');
                    outererr.previous = err;
                    callback(outererr,null);
                } else {
                    // logger.log('dbSetConfig: saved updated config record');
                    callback(null,current);
                }
            });
        }
    });
}

function getConfig (callback) {
    
    if (db === undefined) {
        var err = new Error('dbGetConfig: not initialized');
        throw err;
    }
    
    model.DbConfig.find({ locator : 'CURRENT'}, function doResults(err, results) {
        if (err) {
            var outererr = new Error('dbGetConfig: find failed getting current config record');
            outererr.previous = err;
            callback(outererr,null);
        }
        
        if (results.length != 1) {
            var err = new Error(
                'getConfig: got incorrect # of config records:', 
                results.length);
            callback(err, null);
        } else {
            // logger.log('getConfig: returning ',results[0]);
            callback(null,results[0]);
        }
    });
}

function getPicType () {}

