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

var config = require('../config/config');
var oauthmodule = require('./oauthmodule.js');
var batcher = require('./likebatch.js');

var tumblrConsumerKey = config.tumblr_consumer_key;
var tumblrConsumerSecret = config.tumblr_consumer_secret;
var tumblrOauthAccessToken = undefined;
var tumblrOauthAccessTokenSecret = undefined;

if (config.tumblr_use_cached_access_token === true) {
  tumblrOauthAccessToken = config.tumblr_access_token;
  tumblrOauthAccessTokenSecret = config.tumblr_access_secret;
}

var picsavepath = config.savepath;

//
// ## SimpleServer `SimpleServer(obj)`
//
// Creates a new instance of SimpleServer with the following options:
//  * `port` - The HTTP port to listen on. If `process.env.PORT` is set, _it overrides this value_.
//

// This is our model

var model = {
  'server' : Object,
  'app' : Object,
  'posts' : [Object],
  'tummblrClient' : Object,
  'blogname': String,
  'IP' : String,
  'PORT' : Number,
  'decoratedblogname' : String,
  'post' : String,
  'picture' : String,
  'photos' : [Object],
  'sockets' : [Object],
  'PicType' : Object,
  'dbRecords' : [Object]
};

model.blogname = config.blogname;

if (process.env.IP)
  model.IP = process.env.IP
else  
  model.IP = config.ip;
  
if (process.env.PORT)
  model.PORT = process.env.PORT
else
  model.PORT = config.port;

var setupDatabase = function (next) {
  console.log('setupDatabase: starting');
  mongoose.connect('mongodb://' + model.IP);

  var picSchema = mongoose.Schema({
  	"url" : String,
  	"date_liked" : Date,
  	"date_discovered" :  Date,
  	"date_downloaded" : Date,
  	"download_path" : String
  });

  model.PicType = mongoose.model('Pic', picSchema);

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'setupDatabase: db connection error'));
  db.once('open', function (callback) {
    console.log('setupDatabase: connected successfully, database open');
    console.log("setupDatabase: we're done here");
    next();
  });
};

var setupWebServer = function(next) {
  console.log("setupWebServer: starting")
  var app = express();
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.errorHandler());

  model.server = http.createServer(app);
  app.use(express.static(path.resolve(__dirname, 'client')));
  model.app = app;

  console.log("setupWebServer: we're done here")
  next();
};


var setupDashboard = function(next) {

  var io = socketio.listen(model.server);
  
  io.on('connection', function (socket) {
  
      console.log("Entered socket connect routine");
  
      if(model.decoratedblogname)
        socket.emit('tellclientblogname', model.decoratedblogname);
      
      if (model.posts)
        socket.emit('tellclientposts', model.posts);
        
      if (model.post)
        socket.emit('tellclientpost', model.post);
  
  // keep a list of clients
      model.sockets.push(socket);
  
  // maintain the list of clients after disconnect
      socket.on('disconnect', function () {
        model.sockets.splice(model.sockets.indexOf(socket), 1);
      });
  
  // if you receive a blog name, first make sure the text is a string
      socket.on('tellserverblogname', function (msg) {
        model.blogname = String(msg || '');
        
        console.log('onTellserverblogname: ',model.blogname);
        
        if (!model.blogname)
          return;
          
          // imagine we actually got the posts associated with this blog
          model.decoratedblogname = 'http://'+model.blogname+'.tumblr.com';
          model.posts = {
               "a":{"key":"a","url":"http://bitemea.com"},
               "b":{"key":"b","url":"http://bitemeb.com"},
               "c":{"key":"c","url":"http://bitemec.com"},
               "d":{"key":"d","url":"http://bitemed.com"}
              };
  
          
          dashboardBroadcast('tellclientblogname', model.decoratedblogname);
          dashboardBroadcast('tellclientposts', model.posts);
        });
  
  // maybe you got an actual post
      
      socket.on('tellserverpostkey', function (msg) {
        model.post = String(msg || '');
  
        if (!model.post)
          return;
          
          // imagine we actually got the posts associated with this blog
  
          model.picture = model.posts[model.post].url;
          
          // tell him what he's won
          dashboardBroadcast('tellclientpost', model.post);
          dashboardBroadcast('tellclientpicture', model.picture);
        });
    });

  var addr = model.server.address();
  console.log("setupDashboard: listening at", addr + ":" + addr);
  console.log("setupDashboard: we're done here");
  next();
};


function dashboardBroadcast(event, data) {
  model.sockets.forEach(function (socket) {
    socket.emit(event, data);
  });
}


function bindToTumblrBlog(blogname, consumer_key) {
  console.log("bindToTumblrBlog: starting");

  var arg0 = {
    'consumer_key' : tumblrConsumerKey,
    'consumer_secret' : tumblrConsumerSecret,
    'token' : tumblrOauthAccessToken,
    'token_secret' : tumblrOauthAccessTokenSecret
  };
//  console.log(arg0);
  model.tumblrClient = tumblr.createClient(arg0);
}

function listenWebServer(next){
  console.log("listenWebServer: starting");
  model.server.listen(model.PORT, model.IP, function () {
      console.log("listenWebServer:",model.IP,':',model.PORT);
      next();
  });
}

function setupOauth(next) {
  console.log("setupOauth: starting");
  if (!tumblrOauthAccessToken || !tumblrOauthAccessTokenSecret)
  {
    oauthmodule.tumblrOauthSetup(model.app, tumblrConsumerKey, tumblrConsumerSecret, function ProcessOauthSetupResults(accessKeys, err) {
      if (err) {
        console.log("error getting tumblr oauth access");
        return;
      }
      else {
        console.log("you got in");
        console.log("Access token =", accessKeys.access_token);
        console.log("Access secret =", accessKeys.access_secret);
        tumblrOauthAccessToken = accessKeys.access_token;
        tumblrOauthAccessTokenSecret = accessKeys.access_secret;
        return next();
      }
    });
  } else {
  // if we're using cached token, we can just return successfully
  console.log('Using cached token');
  next();
  }
}

function processPhotos() {
  console.log("processPhotos: starting");
  console.log("processPhotos: Populating " + model.photos.length + " dbRecords");
  model.photos.forEach(function (inPic) {
    var thisPic = new model.PicType ({
      'date_liked' : new Date(),
      'date_discovered' : new Date(),
      'date_downloaded' : new Date(),
      'url' : inPic.original_size.url
    });
    thisPic.save(function (err, data) {
      if (err) return console.error('Save failed for ' + data.url + ':' + err);
      else console.log('Saved ' + thisPic.url);
    });
  });
}

function setupTumblr(next) {
  console.log("Calling bindToTumblrBlog");
  bindToTumblrBlog(tumblrConsumerKey,next);
  console.log("Returned from bindToTumblr blog, we're done here");
  next();
}

// set up queue and worker
var q = async.queue(batcher.doPostsBatch,1);
function main(next) {
  // start initial batch at zero
  batcher.init(model.tumblrClient,q);
  q.push({before : 0});
}

// program run sequence
var runTasks = {
  SetupDatabase: setupDatabase,
  SetupWebServer: setupWebServer,
  SetupDashboard: ['SetupWebServer', setupDashboard],
  ListenWebServer: ['SetupWebServer', 
                    'SetupDashboard', 
                    listenWebServer],
  SetupOauth: ['ListenWebServer', setupOauth],
  SetupTumblr: ['SetupDatabase', 'SetupOauth', setupTumblr],
  main: ['SetupTumblr', main]
};

async.auto(runTasks);
