/* Persistent config for Tumblr Scraper 
   Requires database module but invoker shouldn't know that */

var mongoose = require('mongoose');
var logger = require('./multilog.js');

var db = undefined; // filled in by init
var DbConfig = undefined;

var configSchemaInitializer = {
    locator: String,
    
    tumblrOauthAccessToken: String,
    tumblrOauthAccessTokenSecret: String,
    
    tumblrFreshestPostRecorded : Number,
    tumblrOldestPostRecorded: Number,
    tumblrBedrockPost: Number, // stamp of oldest post service knows of
    
    fsFreshestPic: Date,
    fsOldestPic: Date
};

module.exports = {
  init: init,
  getConfig: getConfig,
  setConfig: setConfig,
  getConfigType: getConfigType
};

// ip is the ip we should use to connect to db
// TODO: we should update this to take like a conneciton string or
// something
// next is the async callback to continue
function init (ip, callback) {

  // logger.log('appstate:init: starting');
    
  if (db != undefined) {
      var err = new Error('appstate:init: called init twice');
      throw err;
  }

  mongoose.set('debug', true);
  
  //mongoose.connect('mongodb://' + ip);
  //db = mongoose.connection;

  db = mongoose.createConnection('mongodb://' + ip); 

  var configSchema = mongoose.Schema(configSchemaInitializer);
  DbConfig = db.model('Config', configSchema);

  db.on('error', console.error.bind(console, 
                                    'appstate:init: db connection error'));
  db.once('open', function (cb) {
    logger.log('appstate:init: connected successfully, database open');
    callback(null);
  });
}

function setConfig (newConfig,callback) {
    logger.log('appstate:setConfig:starting');
    
    if (db === undefined) {
        var err = new Error('appstate:setConfig: not initialized');
        throw err;
    }

    newConfig.locator = 'CURRENT';
    
    DbConfig.find({ locator : 'CURRENT'}, 
        function doResults(error,results) {
        if (error) {
            logger.log('appstate:setConfig: error from find', error);
            throw error;
        }
        
        logger.log('dbSetConfig: results from find:', results);

        // if there is no current config record, save this one
        
        if (results.length === 0) {
            logger.log('dbSetConfig: saving config for first time:',
            newConfig._id);
            
            newConfig.save(function PostSaveCallback (err) {
                if (err) {
                    logger.log('appstate:setConfig: got err from save:',err);
                    var outererr = new Error(
                        'appstate:setConfig: failed to save config');
                    outererr.previous = error;
                    callback(outererr, null);
                } else {
                    // logger.log('dbSetConfig: saved record for the first time');
                    logger.log('appstate:setConfig:we\'re done here');
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
            // here to enumerate the property names we care about for copying
            
            if (current._id != newConfig._id) {
                var propsToCopy = 
                    Object.getOwnPropertyNames(configSchemaInitializer);
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
                    logger.log('appstate:setConfig:we\'re done here');
                    callback(null,current);
                }
            });
        }
    });
}

function getConfig (callback) {
    
    if (db === undefined) {
        var err = new Error('appstate:GetConfig: not initialized');
        throw err;
    }
    
    // logger.log('getConfig: starting');

    DbConfig.find({ locator : 'CURRENT'}, 
      function doResults(err, results) {
        // logger.log('getConfig: doResults: starting');
        if (err) {
            var outererr = new Error(
                'appstate:GetConfig: find failed getting current config record');
            outererr.previous = err;
            callback(outererr,null);
        }
        
        if (results.length == 0) { // we need to initialize this config database
            logger.log('getConfig: no config record found; creating...');
            var initialConfig = new DbConfig;
            setConfig(initialConfig, function doResults(err, config) {
                logger.log('getConfig: db initialize starting');
                if (err) {
                    logger.log('getConfig: db initilize failed',err);
                } else {
                    callback(null,config);
                }
            });
        } else {
            if (results.length != 1) {
                var err = new Error(
                    'appstate:getConfig: got incorrect # of config records:', 
                    results.length);
                callback(err, null);
            
            } else {
                // logger.log('getConfig: returning ',results[0]);
                callback(null,results[0]);
            }
        }
    });
}

function getConfigType (cb) {
    
    if (db === undefined) {
        var err = new Error('appstateGetConfigType: not initialized');
        throw err;
    }
    
    // logger.log('getConfigType: starting');

    return DbConfig;
    
    // logger.log('getConfigType: done');
}
