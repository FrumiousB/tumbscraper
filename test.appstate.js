var async = require('async');

var store = require('./store.js');
var appstate = require('./appstate.js');
var logger = require('./multilog.js');
logger.addSink(console.log);

// var connection = undefined;

function testInitAppState (next) {
    logger.log('test:calling appstate.init');
    appstate.init(process.env.IP, function results(err) {
        if (err) { 
            logger.log('test: appstate:failed to get bind to database');
        } else {
            logger.log('test: appstate: init succeeded:');
            var Ct = appstate.getConfigType();
            Ct.find(function(err, results) {
                if (err) {
                    logger.log('test:appstate:configsfind:failure:',err);
                } else {
                    logger.log('test:appstate:configsfind:success',results);
                    next();
                }
            });
        }
    });
}

function testInitStore (next) {
    logger.log('test:calling store.init');
    store.init(process.env.IP, function results(err) {
        if (err) { 
            logger.log('test:store:failed to get bind to database');
        } else {
            logger.log('test:store:init successful');
            var Pt = store.getPicType();
            Pt.find(function(err, results) {
                if (err) {
                    logger.log('test:store:picsfind:failure:',err);
                } else {
                    logger.log('test:store:picsfind:success',results);
                    next();
                }
            });
        }
    });
}

var initTasks = {
    testInitAppState: testInitAppState,
    testInitStore: testInitStore,
    main: ['testInitAppState','testInitStore', main]
};

async.auto(initTasks, function ultimate (err,result) {
    logger.log('test: completed:',err);
    process.exit(0);
});

function main(next) {

    var DbConfig = appstate.getConfigType();

    logger.log('test:startup complete');
    
    var testConfig = new DbConfig;
    
    logger.log('test:new config = ',testConfig);
    
    testConfig.tumblrOauthAccessToken = '50 characters of blood';
    testConfig.tumblrOauthAccessTokenSecret = '50 characters of sweat';
    testConfig.tumblrFreshestPost = 12;
    testConfig.tumblrOldestPost = 4;
    
    logger.log('test:new config = ',testConfig);
    
    logger.log('test #1: saving config for first time');
    var savedconfig = undefined;
    appstate.setConfig(testConfig,function(err,config) {
        if (err) {
            logger.log('test #1:got an error from setConfig');
        } else {
            logger.log('test #1: no error from setConfig:', config);
            savedconfig = config;
            logger.log('test #2: getting config');
            var gottenconfig = undefined;
            appstate.getConfig(function(err,c) {
                if (err) {
                    logger.log('test #2: screwed up getting current config',err);
                } else {
                    logger.log('test #2: got current config record',c);
                    gottenconfig = c;
                    logger.log('test #3: updating gotten config');
                    
                    gottenconfig.tumblrOauthAccessTokenSecret = '49 characters of secret blood';
                    gottenconfig.tumblrOauthAccessToken = '49 characters of blood';
                    appstate.setConfig(gottenconfig,function(err,c) {
                        if (err) {
                            logger.log('test #3: screwed up saving current config');
                        } else {
                            logger.log('test #3: setConfig succeeded:',gottenconfig);
                            next('tests done');
                        }
                    });
            
                }
            });

        }
    });
}
