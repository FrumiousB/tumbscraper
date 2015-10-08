//
// # Scraper
//
// A Tumblr post scraper/syncer using tumblr.js, express, and mongoose
// Controlled by a dashboard with socket.IO
//
var http = require('http');
var path = require('path');
var express = require('express');
var async = require('async');

var appmodel = require('./model.js');
var logger = require('./multilog.js');
logger.addSink(console.log);
var tumblrSync = require('./tumblrsync.js');
var dashboard = require('./dashboard.js');
var controller = require('./controller.js');
var store = require('./store.js');
var appState = require('./appstate.js');
var tumbhelper = require('./tumbhelper.js');

var model = appmodel.model;
var wiring = appmodel.wiring;

// process all the info from the config file
var config = require('../config/config.js');

var appConfig = undefined;

model.fsSyncPicSavePath = config.savepath;

if (process.env.IP)
  wiring.IP = process.env.IP;
else  
  wiring.IP = config.ip;
  
if (process.env.PORT)
  wiring.PORT = process.env.PORT;
else
  wiring.PORT = config.port;

var setupWebServer = function(next) {
  logger.log('setupWebServer: starting');
  var app = express();
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.errorHandler());

  wiring.server = http.createServer(app);
  app.use(express.static(path.resolve(__dirname, 'client')));
  wiring.app = app;

  logger.log('setupWebServer: we\'re done here');
  next();
};

function listenWebServer(next){
  logger.log('listenWebServer: starting');
  var listener = wiring.server.listen(wiring.PORT, wiring.IP, function () {
      logger.log('listenWebServer:',listener.address().address,':',
        listener.address().port);
      logger.log('listenWebServer: we\'re done here');
      next();
  });
}

function setupAppConfig(next){
  logger.log('setupAppConfig: starting');
  appState.init(wiring.IP, function finishAppStateInit (err) {
    if (err) {
      logger.log('setupAppConfig: error from init',err);
      model.appStateReadyState = model.APPSTATE_RUNSTATE_ERROR;
    } else {
      model.appStateReadyState = model.APPSTATE_RUNSTATE_READY;
      appState.getConfig(function finishAppStateGetConfig(error, result) {
        if (error) {
          var outererr = new Error(
            'setupAppConfig: error from getconfig');
          outererr.previous = error;
          throw outererr;
        } else {
          appConfig = result;
          logger.log('setupAppConfig: we\'re done here');
          return next();
        }
      });
    }
  });
}

function setupStore(next) {
  logger.log('setupStore: starting');
  store.init(wiring.IP, function finishStoreInit (err) {
    if (err) {
      logger.log('setupStore: error from init',err);
      model.storeReadyState = model.STORE_RUNSTATE_ERROR;
    } else {
      model.storeReadyState = model.STORE_RUNSTATE_READY;
      var PicType = store.getPicType();
      if (!PicType) {
        model.storeReadyState = model.STORE_RUNSTATE_ERROR;
        logger.log('setupStore: getPicType failed');
      } else {
        wiring.PersistentPicRecord = PicType;
        logger.log('setupStore: we\'re done here');
        next();
      }
    }
  });
}

function setupDashboard(next) {
  logger.log('setupDashboard: starting');
  dashboard.init(model,controller,wiring.server);
  wiring.notify = dashboard.notify;
  logger.addSink(dashboard.log);
  logger.log('setupDashboard: we\'re done here');
  next();
}

function setupTumblr(next) {
  logger.log('setupTumblr: starting');
  tumbhelper.init(config.tumblr_consumer_key, config.tumblr_consumer_secret,
                  wiring.app, appState, function postInit(err, result) {
                    if (err) {
                      logger.log('setupTumblr: helper init failed');
                      throw(err);
                    } else {
                      wiring.tumblrClient = result;
                      logger.log('setupTumblr: we\'re done here');
                      return next();
                    }
  });
}

function setupTumblrSync(next) {
  logger.log('setupTumbSync: starting');
  tumblrSync.init(model, appConfig, dashboard.notify, wiring.tumblrClient,
                  wiring.PersistentPicRecord);
  logger.log('setupTumbSync: we\'re done here');
  next();
}

// main just toggles we're ready for action
function main(next) {
  controller.init(model);
  model.appRunState = appmodel.APP_RUNSTATE_READY;
  wiring.notify({appRunState: appmodel.APP_RUNSTATE_READY});
  wiring.notify(null);  // update dashboard with all info
  logger.log('scraper main - all set up, ready for action');

  async.forever(function(iterate) {
      wiring.PersistentPicRecord.count(function handlePicsCount(err,result) {
      if (err) logger.log('tumbsync:dopostsbatch:failed to get pic count:',
          err);
      else {
          if (model.picEntryCount != result) {
            model.picEntryCount = result;
            wiring.notify({'picEntryCount' : model.picEntryCount});
          }
      }
    });
    
    setTimeout(function ContinueAfterWait() {
          return iterate();
        },2000);
    
  });

  next();
}

// program run sequence

model.appRunState = appmodel.APP_RUNSTATE_INITIALIZING;

var runTasks = {
  setupAppConfig: setupAppConfig,
  setupStore: setupStore,
  setupWebServer: setupWebServer,
  listenWebServer: ['setupWebServer', 
                    listenWebServer],
  setupDashboard: ['listenWebServer', setupDashboard],
  setupTumblr: ['listenWebServer', 'setupAppConfig', setupTumblr],
  setupTumblrSync: ['setupTumblr', 'setupStore', setupTumblrSync],
  main: ['setupTumblrSync','setupDashboard', main]
};

async.auto(runTasks);
