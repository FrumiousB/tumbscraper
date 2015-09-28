/* tests for db module */

var logger = require('./multilog.js');
logger.addSink(console.log);
var appmodel = require('./model.js');
var model = appmodel.model;
var database = require('./database.js');
var config = require('../config/config.js');
var async = require('async');

if (process.env.IP)
  model.IP = process.env.IP;
else  
  model.IP = config.ip;
  
function setupDatabase(next) {
    database.init(model,next);
}
var runTasks = {
  setupDatabase: setupDatabase,
  main: ['setupDatabase', main]
};

async.auto(runTasks);

function main(next) {
    
    logger.log('startup complete');
    
    var testConfig = new model.DbConfig;
    
    logger.log('new config = ',testConfig);
    
    testConfig.tumblrOauthAccessToken = '50 characters of blood';
    testConfig.tumblrOauthAccessTokenSecret = '50 characters of sweat';
    testConfig.tumblrFreshestPost = 12;
    testConfig.tumblrOldestPost = 4;
    
    logger.log('new config = ',testConfig);
    
    logger.log('test #1: saving config for first time');
    var savedconfig = undefined;
    database.setConfig(testConfig,function(err,config) {
        if (err) {
            logger.log('test #1:got an error from setConfig');
        } else {
            logger.log('test #1: no error from setConfig:', config);
            savedconfig = config;
            logger.log('test #2: getting config');
            var gottenconfig = undefined;
            database.getConfig(function(err,c) {
                if (err) {
                    logger.log('test #2: screwed up getting current config',err);
                } else {
                    logger.log('test #2: got current config record',c);
                    gottenconfig = c;
                    logger.log('test #3: updating gotten config');
                    
                    gottenconfig.tumblrOauthAccessTokenSecret = '49 characters of secret blood';
                    gottenconfig.tumblrOauthAccessToken = '49 characters of blood';
                    database.setConfig(gottenconfig,function(err,c) {
                        if (err) {
                            logger.log('test #3: screwed up saving current config');
                        } else {
                            logger.log('test #3: setConfig succeeded:',gottenconfig);
                        }
                    });
            
                }
            });

        }
    });
    
    next();
}