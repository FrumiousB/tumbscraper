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

// process all the info from the config file
var config = require('../config/config.js');

var appConfig = undefined;

model.fsSyncPicSavePath = config.savepath;

if (process.env.IP)
  model.IP = process.env.IP;
else  
  model.IP = config.ip;
  
if (process.env.PORT)
  model.PORT = process.env.PORT;
else
  model.PORT = config.port;

var setupWebServer = function(next) {
  logger.log('setupWebServer: starting');
  var app = express();
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.errorHandler());

  model.server = http.createServer(app);
  app.use(express.static(path.resolve(__dirname, 'client')));
  model.app = app;

  logger.log('setupWebServer: we\'re done here');
  next();
};

function listenWebServer(next){
  logger.log('listenWebServer: starting');
  var listener = model.server.listen(model.PORT, model.IP, function () {
      logger.log('listenWebServer:',listener.address().address,':',
        listener.address().port);
      next();
  });
}

function setupAppConfig(next){
  logger.log('setupAppConfig: starting');
  appState.init(model.IP, function finishAppStateInit (err) {
    if (err) {
      logger.log('setupAppConfig: error from init',err);
      model.appStoreReadyState = model.APPSTATE_RUNSTATE_ERROR;
    } else {
      model.appStoreReadyState = model.APPSTATE_RUNSTATE_READY;
      appState.getConfig(function finishAppStateGetConfig(error, results) {
        if (error) {
          var outererr = new Error(
            'setupAppConfig: error from getconfig');
          outererr.previous = error;
          throw outererr;
        } else {
          appConfig = results;
          logger.log('setupAppConfig: we\'re done here');
          return next();
        }
      });
    }
  });
}

function setupStore(next) {
  logger.log('setupStore: starting');
  store.init(model.IP, function finishStoreInit (err) {
    if (err) {
      logger.log('setupStore: error from init',err);
      model.storeReadyState = model.STORE_RUNSTATE_ERROR;
    } else {
      model.storeReadyState = model.STORE_RUNSTATE_READY;
      var PicType = store.getPicType();
      if (!PicType) {
        model.appStoreReadyState = model.STORE_RUNSTATE_ERROR;
        logger.log('setupStore: getPicType failed');
      } else {
        model.PersistentPicRecord = PicType;
        next();
      }
    }
  });
}

function setupDashboard(next) {
  dashboard.init(model,controller);
  logger.addSink(dashboard.log);
  next();
}

function setupTumblr(next) {
  logger.log('setupTumblr: starting');
  tumbhelper.init(config.tumblr_consumer_key, config.tumblr_consumer_secret,
                  model.app, appState, function postInit(err, result) {
                    if (err) {
                      logger.log('setupTumblr: helper init failed');
                      throw(err);
                    } else {
                      model.tumblrClient = result;
                      logger.log('setupTumblr: we\'re done here');
                      return next();
                    }
  });
}

function setupTumblrSync(next) {
  logger.log('setupTumbSync: starting');
  tumblrSync.init(model, dashboard.notify, model.tumblrClient);
  logger.log('setupTumbSync: we\'re done here');
  next();
}

// main just toggles we're ready for action
function main(next) {
  controller.init(model);
  model.appRunState = appmodel.APP_RUNSTATE_READY;
  model.notify({appRunState: appmodel.APP_RUNSTATE_READY});
  logger.log('scraper main - all set up, ready for action');

  next();
}

// program run sequence

model.appRunState = appmodel.APP_RUNSTATE_INITIALIZING;

var runTasks = {
  setupAppConfig: setupAppConfig,
  setupStore: setupStore,
  setupWebServer: setupWebServer,
  setupDashboard: ['setupWebServer', setupDashboard],
  listenWebServer: ['setupWebServer', 
                    'setupDashboard', 
                    listenWebServer],
  setupTumblr: ['listenWebServer', 'setupAppConfig', setupTumblr],
  setupTumblrSync: ['setupTumblr', 'setupStore', setupTumblrSync],
  main: ['setupTumblrSync','setupDashboard', main]
};

async.auto(runTasks);
