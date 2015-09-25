//
// # Scraper
//
// A Tumblr post scraper/syncer using tumblr.js, express, and mongoose
// Controlled by a dashboard with socket.IO
//
var http = require('http');
var path = require('path');
var tumblr = require('tumblr.js');
var socketio = require('socket.io');
var express = require('express');
var mongoose = require('mongoose');
var async = require('async');

var appmodel = require('./model.js');
var logger = require('./multilog.js');
logger.addSink(console.log);
var oauthmodule = require('./oauthmodule.js');
var tumblrSync = require('./tumblrsync.js');
var dashboard = require('./dashboard.js');
var controller = require('./controller.js');

var model = appmodel.model;

// process all the info from the config file
var config = require('../config/config.js');

// tumblr information -- we don't need this in the model
var tumblrConsumerKey = config.tumblr_consumer_key;
var tumblrConsumerSecret = config.tumblr_consumer_secret;
var tumblrOauthAccessToken = undefined;
var tumblrOauthAccessTokenSecret = undefined;
if (config.tumblr_use_cached_access_token === true) {
  tumblrOauthAccessToken = config.tumblr_access_token;
  tumblrOauthAccessTokenSecret = config.tumblr_access_secret;
}

model.fsSyncPicSavePath = config.savepath;

if (process.env.IP)
  model.IP = process.env.IP
else  
  model.IP = config.ip;
  
if (process.env.PORT)
  model.PORT = process.env.PORT
else
  model.PORT = config.port;

var setupDatabase = function (next) {
  logger.log('setupDatabase: starting');
  mongoose.connect('mongodb://' + model.IP);

  var picSchema = mongoose.Schema({
  	url : String,
  	date_liked : Date,
  	date_discovered :  Date,
  	date_downloaded : Date,
  	download_path : String
  });

  model.DbPicRecord = mongoose.model('Pic', picSchema);

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'setupDatabase: db connection error'));
  db.once('open', function (callback) {
    logger.log('setupDatabase: connected successfully, database open');
    logger.log('setupDatabase: we\'re done here');
    model.dbReadyState = db.readyState;
    next();
  });
};

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
      logger.log('listenWebServer:',listener.address().address,':',listener.address().port);
      next();
  });
}

function setupOauth(next) {
  logger.log('TumblrOauthSetup: setupOauth: starting');
  if (!tumblrOauthAccessToken || !tumblrOauthAccessTokenSecret)
  {
    oauthmodule.tumblrOauthSetup(model.app, tumblrConsumerKey, 
                                 tumblrConsumerSecret, 
                                 function ProcessOauthSetup (accessKeys, err) {
      if (err) {
        logger.log('TumblrOAuthSetup: error getting tumblr oauth access:', err);
        return;
      }
      else {
        logger.log('TumblrOAuthSetup: Auth successful');
        logger.log('Access token =', accessKeys.access_token);
        logger.log('Access secret =', accessKeys.access_secret);
        tumblrOauthAccessToken = accessKeys.access_token;
        tumblrOauthAccessTokenSecret = accessKeys.access_secret;
        return next();
      }
    });
  } else {
  // if we're using cached token, we can just return successfully
  logger.log('TumblrOAuthSetup: Using cached token');
  next();
  }
}

function processPhotos() {
  logger.log('processPhotos: starting');
  logger.log('processPhotos: Populating ' + model.photos.length + ' dbRecords');
  model.photos.forEach(function (inPic) {
    var thisPic = new model.PicType ({
      'date_liked' : new Date(),
      'date_discovered' : new Date(),
      'date_downloaded' : new Date(),
      'url' : inPic.original_size.url
    });
    thisPic.save(function (err, data) {
      if (err) return console.error('Save failed for ' + data.url + ':' + err);
      else logger.log('Saved ' + thisPic.url);
    });
  });
}

function setupDashboard(next) {
  dashboard.init(model,controller);
  logger.addSink(dashboard.log);
  next();
}

function setupTumblr(next) {
  logger.log('setupTumblr: starting');
 
  var arg0 = {
    consumer_key : tumblrConsumerKey,
    consumer_secret : tumblrConsumerSecret,
    token : tumblrOauthAccessToken,
    token_secret : tumblrOauthAccessTokenSecret
  };

  model.tumblrClient = tumblr.createClient(arg0);

  logger.log('setupTumblr: we\'re done here');
  next();
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
//  controller.execute('tumbsyncstart');
  next();
}

// program run sequence

model.appRunState = appmodel.APP_RUNSTATE_INITIALIZING;

var runTasks = {
  setupDatabase: setupDatabase,
  setupWebServer: setupWebServer,
  setupDashboard: ['setupWebServer', setupDashboard],
  listenWebServer: ['setupWebServer', 
                    'setupDashboard', 
                    listenWebServer],
  setupOauth: ['listenWebServer', setupOauth],
  setupTumblr: ['setupOauth', setupTumblr],
  setupTumblrSync: ['setupTumblr', 'setupDatabase', setupTumblrSync],
  main: ['setupTumblrSync','setupDashboard', main]
};

async.auto(runTasks);
