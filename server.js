//
// # Scraper
//
// A Tumblr post scraper/syncer using tumblr.js, express, and mongoose
// Controlled by a dashboard with socket.IO
//
var http = require('http');
var path = require('path');
var tumblr = require('tumblr.js');
var mongoose = require('mongoose');
var config = require('../config/config');

var async = require('async');
var socketio = require('socket.io');
var express = require('express');

var tumblr_consumer_key = config.consumer_key;
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
  'posts' : [Object],
  'tummblrClient' : Object,
  'blogname': String,
  'ip' : String,
  'port' : Number,
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
  model.ip = process.env.IP
else  
  model.ip = config.ip;
  
if (process.env.PORT)
  model.port = process.env.PORT
else
  model.port = config.port;

var setupDatabase = function (next) {
  console.log('setupDatabase: starting');
  mongoose.connect('mongodb://' + model.ip);

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
  var router = express();
  model.server = http.createServer(router);
  router.use(express.static(path.resolve(__dirname, 'client')));
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
  model.tumblrClient = tumblr.createClient(consumer_key);
  console.log("bindToTumblrBlog: getting photo posts from", blogname);
  model.tumblrClient.posts(blogname, { type: 'photo'}, function(err,data) {
    
    
    if (err) {
      console.log("bindToTumblrBlog: Got an error");
      console.log(err);
      return;
    } else {
      console.log("bindToTumblrBlog: Got a response from tumblr");
    }
  });
}

function listenWebServer(next){
  console.log("listenWebServer: starting");
  model.server.listen(model.port || 3000, model.ip || "0.0.0.0", function () {
      console.log("listenWebServer: we're done here.");
      next();
  });
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


function doBody(next) {
  console.log("Calling bindToTumblrBlog");
  bindToTumblrBlog(model.blogname,tumblr_consumer_key);
  console.log("Returned from bindToTumblr blog, we're done here");
  next();
}

function doPostsBatch(batch, next) {
  console.log("Posts Batch Worker: starting batch @", batch.offset);
  model.tumblrClient.posts(model.blogname, { type: 'photo', offset: batch.offset}, function(err,response) {
    if (err) {
      console.log("Posts Batch Worker: Got an error");
      console.log(err);
      return;
    } else {
      console.log("Posts Batch Worker: Got a response from tumblr");
    }
  
    // Fuck, now what?
    // I guess -- get the posts and pictures from this batch
 
  
    var posts = response["posts"];
 
    // this could be the last batch, in which case we return without adding to the queue or processing posts
    if (posts.length == 0) {
      console.log("Posts Batch Worker: No more posts");
      return next();
    }
  
    var localphotos = [];
    posts.forEach(function (thispost) {
      console.log("Posts Batch Worker: Post ID is ",thispost.id," URL is ",thispost.short_url);
      thispost.photos.forEach(function (thisphoto) {
          localphotos.push(thisphoto);
      });
    });
    
    localphotos.forEach(function (thisphoto) {
      console.log("Posts Batch Worker: extracted photo ",thisphoto.original_size.url);
    });

    var nextOffset = batch.offset + posts.length;
    var newbatch = { 
      'offset':nextOffset,
    };
    
    q.push(newbatch);
    console.log("Posts Batch Worker: done with batch");
    next();
  });
}


function postMain(next) {
  // start initial batch at zero
  q.push({'offset' : 0});
}

var q = async.queue(doPostsBatch);

var startupTasks = {
  labelSetupDatabase: setupDatabase,
  labelSetupWebServer: setupWebServer,
  labelSetupDashboard: ['labelSetupWebServer', setupDashboard],
  labelListenWebServer: ['labelSetupWebServer', 'labelSetupDashboard', listenWebServer],
  main: ['labelListenWebServer','labelSetupDatabase', doBody],
  postmain: ['main', postMain]
};

async.auto(startupTasks);
// set up queue and worker







