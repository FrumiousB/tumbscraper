// Test the dashboard by echoing events and sending properties

var http = require('http');
var path = require('path');
var socketio = require('socket.io');
var express = require('express');
var async = require('async');
var logger = require('./multilog.js');
logger.addSink(console.log);

var appmodel = require('./model.js');
var dashboard = require('./dashboard.js');

var model = appmodel.model;

// process all the info from the config file
var config = require('../config/config.js');

if (process.env.IP)
  model.IP = process.env.IP
else  
  model.IP = config.ip;
  
if (process.env.PORT)
  model.PORT = process.env.PORT
else
  model.PORT = config.port;

function fakeControllerExecute (command) {

  if (model === undefined) {

  }
  
  if (typeof(command) != 'string') {
      var err = new Error('controller execute: bad command, string expected',
                          command);
      throw err;
  }
  
  switch (command) {
      case 'fssyncstart':
          // code
          break;
          
      case 'fsssyncstop':
          // code
          break;
          
      case 'tumbsyncstart':
          // code
          logger.log('controller execute: tumbsyncstart');
          //tumblrsync.start();
          model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING;
          model.notify({tumblrSyncRunState: appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING});
          break;
          
      case 'tumbsyncstop':
          // code
          logger.log('controller execute: tumbsyncstop');
          //tumblrsync.stop();

          model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING;
          model.notify({tumblrSyncRunState: appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING});
          
          setTimeout(function ContinueAfterWait() {
            model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED;
            model.notify({tumblrSyncRunState: appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED});
          },2000);
          
          break;
      
      default:
          // should never get here
          var err = new Error ('controller execute: unknown command:',
                               command);
          throw err;
  }
}



function fakeControllerInit (m) { logger.log('shimController:init'); }
var controller = { init: fakeControllerInit,
                   execute: fakeControllerExecute};
                   
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

function setupDashboard(next) {
  dashboard.init(model,controller);
  logger.addSink(dashboard.log);
  next();
}

// main just toggles we're ready for action
function main(next) {
  controller.init(model);
  model.appRunState = appmodel.APP_RUNSTATE_READY;
  model.notify({appRunState: appmodel.APP_RUNSTATE_READY});
  logger.log('scraper main - all set up, ready for action');
//  controller.execute('tumbsyncstart');
  next();
}

// program run sequence

model.appRunState = appmodel.APP_RUNSTATE_INITIALIZING;

var runTasks = {
  setupWebServer: setupWebServer,
  setupDashboard: ['setupWebServer', setupDashboard],
  listenWebServer: ['setupWebServer', 
                    'setupDashboard', 
                    listenWebServer],
  main: ['listenWebServer', main]
};
async.auto(runTasks);

