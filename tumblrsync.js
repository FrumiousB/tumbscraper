// Process likes by batch until done
var tumblr = require('tumblr.js');
var async = require('async');
var mongoose = require('mongoose');
var appmodel = require('./model.js');
var logger = require('./multilog.js');

var POSTSLIMIT = 1000;
var postsSoFar = 0;
var initialized = false;
var tumblrClient = undefined;
var model = undefined;
var notify = undefined;

module.exports = {
    init: init,
    start: start,
    stop: stop
};

var workq = undefined;

function init(m, notifier, client) {
    tumblrClient = client;
    model = m;
    notify = notifier;
    initialized = true;
    workq = async.queue(doPostsBatch,1);
}

function start() {
    logger.log('tumblrSyncStart command');
    
    if (initialized != true) {
      var err = new Error('tumblrSyncStart: not initialized:');
        throw err;
    }
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_ERROR) {
        logger.log('tumblrSyncStart: can\'t start from error state');
        return;
    }
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING) {
        logger.log('tumblrSyncStart: already running');
        return;
    }

    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING) {
        logger.log('tumblrSyncStart: can\'t start when stopping');
        return;
    }

    // assert that the queue is currently not running.  if it is, we're in a
    // bad place
    
    // mark our state as running
    model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING;
    notify({'tumblrSyncRunState' : appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING});
    model.tumblrPostsSoFar = postsSoFar = 0;
    workq.push({before : 0});
    logger.log('workq tasks =',workq.tasks);
}

function stop(){
    // logger.log('tumblrSyncStop command');
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_ERROR) {
        logger.log('tumblrSyncStop: can\'t stop from error state');
        return;
    }
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED) {
        logger.log('tumblrSyncStop: already stopped');
        return;
    }

    // mark our state as stopping
    model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING;
    notify({'tumblrSyncRunState' : appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING});
}

function findTimeStampOfFreshestPost(callback) {
  // get one post @ offset 0
  var options = {
      offset : 0,
      limit : 1
  }
  
  tumblrClient.likes(options, function(err,response) {
    if (err) {
      logger.log('findTimeStampOfLatestPost: Got an error from tumblr');
      logger.log(err);
      callback(err,undefined);
    } else { // otherwise we got a post
      var timestamp = response.liked_posts[0].liked_timestamp;
      var tdate = new Date(timestamp*1000);
      logger.log('findTimeStampOfFreshestPost: timestamp=',tdate.toUTCString());
      callback(undefined,timestamp);
    }
  });
}

function doPostsBatch(batch, next) {
  
  var before = batch.before;
  var beforetime = new Date(before*1000);
  model.tumblrCurrentTime = beforetime;
  notify({'tumblrCurrentTime': model.tumblrCurrentTime});
  logger.log('TumbSyncBatchWorker: starting batch @', beforetime.toUTCString() , ', ', 
              postsSoFar, ' posts fetched');
  
  if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING) {
    logger.log('TumbSyncBatchWorker: Runstate == stopping. Worker stopping.');
    model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED;
    notify({'tumblrSyncRunState' : appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED});
    // still need to tell work queue manager (async) that this worker is done
    // with the task - that's why we return next() instead of just returning.
    // this means we can restart later
    return next();
  }

  if (before === 0) { // if we're starting at the beginning
    findTimeStampOfFreshestPost(function processFreshestTimestamp (err, response) {
        if (err) {
          logger.log('TumbSyncBatchWorker: error from TimeStampOfLatestPost:',err)
          return next();
        } else { 
          before = response + 1; // we want the freshest post and everything 
        }                      // before, so we anchor just after
    });
  }

// by now, we either have a valid before because it was passed in, or because 
// we got the timestamp of the freshest post + 1 second
// so we get a batch of all posts before that timestamp

  var posts = undefined;
  var options = { 'before' : before };
  tumblrClient.likes(options, function(err,response) {
    if (err) {
      logger.log('Posts Batch Worker: Got an error');
      logger.log(err);
      return next();
    } else {
      posts = response['liked_posts'];
      if (posts.length == 0) {
        logger.log('Posts Batch Worker: No earlier tumblr posts');
        return next();
      } else {  // otherwise we are good, and we can extract photos
      
        // get a flat array of all the photos from every post 
        var photos = photosFromPosts(posts);
        // and figure out which post is earliest
        var earliest = earliestFromPosts(posts);
        
        // now go through and do work to (eventually) log them in the database
        photos.forEach(function (thisphoto) {
        //            thisphoto.original_size.url);
        });
    
        // Now we set up parameter block for the next batch
        var newbatch = { 
          'before': earliest
        };
        
//        logger.log('posts.length',posts.length);

        // Here we're keeping track of whether we went past our self-imposed
        // limit of posts.  In production, there won't be a limit
        postsSoFar += posts.length;
        model.tumblrPostsSoFar = postsSoFar;
        notify({'tumblrPostsSoFar': postsSoFar});
        if (postsSoFar < POSTSLIMIT) {
          workq.push(newbatch);
        } else {
          logger.log('Posts Batch Worker: Hit max posts');
        }
        
        // We wait a bit in order to be polite, then call next() which is 
        // a completion callback from the async library so the next batch can
        // be processed.
        
        setTimeout(function ContinueAfterWait() {
          return next();
        },2000);
      }
    }
  });
}

function earliestFromPosts(posts)
{
  var winner = Infinity;
  posts.forEach(function (thispost) {
    if (thispost.liked_timestamp < winner) {
      winner = thispost.liked_timestamp;
    }
  });
  return winner;
}

function photosFromPosts(posts)
{
  var localphotos = [];
  posts.forEach(function (thispost) {
    if (thispost.photos != undefined) {
      thispost.photos.forEach(function (thisphoto) {
        localphotos.push(thisphoto);
      });
    }
  });
  
  return localphotos;
}
      
      
      
