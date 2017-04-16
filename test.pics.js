var async = require('async');

var store = require('./store.js');
var appstate = require('./appstate.js');
var logger = require('./multilog.js');
logger.addSink(console.log);

var pt = null;

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
                    pt = results;
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

    logger.log('test:startup complete');

    logger.log('test:getting count of pix in db');
    store.getStoredPixCount(function(err,result) {
        if(err){
            logger.log('test:GetStorePicCount failed:',err);
        } else {
           logger.log('there are ',result,' pix in the database');
           if (result == 0) {
               logger.log ('test:Not getting freshest pic since db is empty.');
               next();
           } else {
               logger.log('test:getting freshest stored pic');
               store.getFreshestStoredPic(function(err,result) {
                 if(err){
                   logger.log('test:GetFreshestPic failed:',err);
                   next();
                 } else {
                   store.logPic(result);
                   next();
                 }
               });
           }
        }
    });
}
