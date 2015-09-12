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
  'blogname': String,
  'decoratedblogname' : String,
  'post' : String,
  'picture' : String,
  'photos' : [Object],
  'sockets' : [Object],
  'PicType' : Object,
  'dbRecords' : [Object]
};

model.blogname = config.blogname;

var setupDatabase = function (setupCallback) {
  mongoose.connect('mongodb://' + process.env.IP);

  var picSchema = mongoose.Schema({
  	"url" : String,
  	"date_liked" : Date,
  	"date_discovered" :  Date,
  	"date_downloaded" : Date,
  	"download_path" : String
  });

  model.PicType = mongoose.model('Pic', picSchema);

  var db = mongoose.connection;
  db.on('error', console.error.bind(console, 'mongodb: connection error'));
  db.once('open', function (callback) {
    console.log('mongodb: connected successfully, database open');
    console.log("setupDatabase: we're done here");
    setupCallback();
  });
};

var setupWebserver = function(setupCallback) {
  var router = express();
  model.server = http.createServer(router);
  router.use(express.static(path.resolve(__dirname, 'client')));
  console.log("setupWebServer: we're done here")
  setupCallback();
};


var setupDashboard = function(setupCallback) {

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
  
          
          broadcast('tellclientblogname', model.decoratedblogname);
          broadcast('tellclientposts', model.posts);
        });
  
  // maybe you got an actual post
      
      socket.on('tellserverpostkey', function (msg) {
        model.post = String(msg || '');
  
        if (!model.post)
          return;
          
          // imagine we actually got the posts associated with this blog
  
          model.picture = model.posts[model.post].url;
          
          // tell him what he's won
          broadcast('tellclientpost', model.post);
          broadcast('tellclientpicture', model.picture);
        });
    });

 //   var addr = server.address();
  //  console.log("server is " + server)
  //  console.log("Dashboard server listening at", addr.address + ":" + addr.port);
    setupCallback();
};


function bindToTumblrBlog(blogname, consumer_key) {
  console.log("bindToTumblrBlog: starting");
  var client = tumblr.createClient(consumer_key);
  console.log("bindToTumblrBlog: getting photo posts from", blogname);
  client.posts(blogname, { type: 'photo'}, function(err,data) {
    
    
    if (err) {
      console.log("bindToTumblrBlog: Got an error");
      console.log(err);
      return;
    } else {
      console.log("bindToTumblrBlog: Got a response from tumblr");
    }
  
    model.posts = data["posts"];
    console.log("bindToTumblrBlog: There are " + model.posts.length + " posts")

    var localphotos = [];
    model.posts.forEach(function (thispost) {
      console.log("bindToTumblrBlog: Post ID is ",thispost.id," URL is ",thispost.short_url);
      thispost.photos.forEach(function (thisphoto) {
          localphotos.push(thisphoto);
      });
    });
    model.photos = localphotos;
    processPhotos();
  });
}

function listenWebServer(setupCallback){
  console.log("listenWebServer: starting");
  model.server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function () {
      console.log("listenWebServer: we're done here.");
      setupCallback();
  });
}

function broadcast(event, data) {
  model.sockets.forEach(function (socket) {
    socket.emit(event, data);
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


function doBody() {
  console.log("Calling bindToTumblrBlog");
  bindToTumblrBlog(model.blogname,tumblr_consumer_key);
  console.log("Returned from bindToTumblr blog, we're done here");
}

var startupTasksZero = [
    setupDatabase,
    setupWebserver
];

var startupTasksOne = [
  setupDashboard,
  listenWebServer
];

async.parallel(startupTasksZero,function(){
  async.parallel(startupTasksOne,doBody());
});






