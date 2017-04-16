// Process likes by batch until done

var async = require('async');
var appmodel = require('./model.js');
var logger = require('./multilog.js');

var POSTSLIMIT = 100;
var initialized = false;

var tumblrClient = undefined;  // injected
var notify = undefined;        // injected
var appConfig = undefined;     // injected
var model = undefined;         // injected
var PicRecord = undefined;     // injected

var tumblrFreshestPostSeen = undefined;
var tumblrTempOldestRecorded = undefined;

module.exports = {
    init: init,
    reset: reset,
    go: go,
    stop: stop
};

var workq = undefined;

function init(m, appcfg, notifier, client, prt) {
    
    model = m;
    appConfig = appcfg;
    notify = notifier;
    tumblrClient = client;
    PicRecord = prt;

    initialized = true;
    workq = async.queue(doPostsBatch,1);
}


function validateStartingState () {
  
    if (initialized != true) {
      var err = new Error('tumblrSyncStart: not initialized:');
        throw err;
    }
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_ERROR) {
        logger.log('tumblrSyncStart: can\'t start from error state');
        return false;
    }
    
    if ((model.tumblrSyncRunState === 
         appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING_FIRST) || 
        (model.tumblrSyncRunState === 
         appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING_MINOR)) {
           
        logger.log('tumblrSyncStart: already running');
        return false;
    }

    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING) {
        logger.log('tumblrSyncStart: can\'t start when stopping');
        return false;
    }
    
    // otherwise
    return true;
    
}

function reset() {
  
  if (initialized != true) {
    var err = new Error('tumblrsync:reset: not initialized:');
      throw err;
  }

  // starting values
  appConfig.tumblrFreshestPostRecorded = 0;
  appConfig.tumblrOldestPostRecorded = Infinity;
  appConfig.tumblrBedrockPost = undefined;
  
  // store those starting values
  appConfig.save(function checkSaveResults(error) {
    if (err) {
      logger.log('tumblrsync:reset:failed to save updated state');
    }
  });
  
  // push them into the dashboard model so everyone can see them
  model.tumblrFreshestPostRecorded = appConfig.tumblrFreshestPostRecorded;
  model.tumblrBedrockPost = appConfig.tumblrBedrockPost;
  model.tumblrOldestPostRecorded = appConfig.tumblrOldestPostRecorded;
  model.tumblrPostsSoFar = 0;

  // let everyone know what they are
  notify({'tumblrFreshestPostRecorded' : 
             new Date(model.tumblrFreshestPostRecorded*1000),
          'tumblrOldestPostRecorded' : 
             new Date(model.tumblrOldestPostRecorded*1000),
          'tumblrPostsSoFar' : model.tumblrPostsSoFar.toString()
         });
}    

function go() {
  
  logger.log('tumblrsync:go:starting');    
  
  if (!validateStartingState()) {
    return;
  }

  // let everyone know where we are  
  model.tumblrFreshestPostRecorded = 
    new Date(appConfig.tumblrFreshestPostRecorded*1000);
  notify({'tumblrFreshestPostRecorded' : model.tumblrFreshestPostRecorded});
  model.tumblrOldestPostRecorded = 
    new Date(appConfig.tumblrOldestPostRecorded*1000);
  notify({'tumblrOldestPostRecorded' : model.tumblrOldestPostRecorded});
 
  // find freshest post accordint to tumblr seen so we know when we're done
  findTimeStampOfFreshestPost(function processFreshestTimestamp(err, result) {
    if (err) {
      logger.log('TumbSyncBatchWorker: error from TimeStampOfLatestPost:',err);
      model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_ERROR;
      notify({'tumblrSyncRunstate' : model.tumblrSyncRunState});
      return;
    } else { 
      tumblrFreshestPostSeen = result;
      model.tumblrFreshestPostSeen = new Date(result*1000);
      notify({'tumblrFreshestPostSeen' : model.tumblrFreshestPostSeen});
      
      // everything is set up, we can go
//      workq.push({after: appConfig.tumblrOldestPostRecorded});

      // if we haven't ever hit bottom, sync from our oldest recorded post 
      // to what the service thinks is the oldest post: first sync
      if (appConfig.tumblrBedrockPost === undefined) {
        logger.log('tumblrsync:go:starting first sync');
        doFirstSync();
      } else if (tumblrFreshestPostSeen != 
                  appConfig.tumblrFreshestPostRecorded) {
        logger.log('tumblrsync:go:starting minor sync');
        doMinorSync();
      } else {
        logger.log('tumblrsync:go:fully synced already');
      }
      logger.log('tumblrsync:go:workq tasks =',workq.tasks);
      logger.log('tumblrsync:go:started');
    }
  });
}

function doMinorSync ()
{
  model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING_MINOR;
  notify({'tumblrSyncRunState' : model.tumblrSyncRunState});
  tumblrTempOldestRecorded = tumblrFreshestPostSeen + 1;
  workq.push({ phase: 'minorSync'});
}

function doFirstSync ()
{
  
  logger.log('tumblrsync:doFirstSync');
  
  model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_RUNNING_FIRST;
  notify({'tumblrSyncRunState' : model.tumblrSyncRunState});
  
  appConfig.tumblrOldestPostRecorded = tumblrFreshestPostSeen + 1;
  appConfig.save(function(err) {
    if (err) logger.log('tumbsync:dofirstsync:config save failed');
  });
  
  workq.push({ phase: 'firstSync'});
}

function stop(){
    logger.log('tumblrSyncStop command');
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_ERROR) {
        logger.log('tumblrSyncStop: can\'t stop from error state');
        return;
    }
    
    if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED) {
        logger.log('tumblrSyncStop: already stopped');
        return;
    }

    // mark our state as stopping -- the batch worker will eventually notice
    model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING;
    notify({'tumblrSyncRunState' : appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING});
}

function findTimeStampOfFreshestPost(callback) {
  // get one post @ offset 0
  var options = {
      offset : 0,
      limit : 1
  };
  
  tumblrClient.likes(options, function(err,response) {
    if (err) {
      logger.log('findTimeStampOfLatestPost: Got an error from tumblr');
      logger.log(err);
      callback(err,null);
    } else { // otherwise we got a post
      
      model.tumblrTotalLikes = response.liked_count;
      notify({'tumblrTotalLikes': model.tumblrTotalLikes});

      var timestamp = response.liked_posts[0].liked_timestamp;
      var tdate = new Date(timestamp*1000);
      logger.log('findTimeStampOfFreshestPost: timestamp=',tdate.toUTCString());
      
      model.tumblrFreshestPostSeen = tdate;
      notify({'tumblrFreshestPostSeen': model.tumblrFreshestPostSeen});
      callback(null,timestamp);
    }
  });
}


function doPostsBatch(batch, next) {

  
  if (model.tumblrSyncRunState === appmodel.TUMBLR_SYNC_RUNSTATE_STOPPING) {
    logger.log('tumbsync:dopostsbatch:stopping');
    model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED;
    notify({'tumblrSyncRunState' : model.tumblrSyncRunState});

    // still need to tell work queue manager (async) that this worker is done
    // with the task - that's why we return next() instead of just returning.
    // this means we can restart later
    
    // since we didn't do anything, no need to save state
    // since we didn't push a batch on the queue, we can just return
    // and the queue will be empty
    
    return next();
  }

  // so now we get a batch of all posts, based on what phase we are in 

  var options = undefined;
  switch (batch.phase) {
    case 'firstSync':
      logger.log('tumbsync:dopostpbatch:detected first sync');
      options = { 'before' : appConfig.tumblrOldestPostRecorded };
      break;
    case 'minorSync':
      logger.log('tumbsync:dopostpbatch:detected minor sync');
      options = { 'before' : tumblrTempOldestRecorded };
      logger.log('options = ',options);
      break;
    default:
      var err = new Error('tumbsync:dopostsbatch:bad phase:',batch.phase);
      throw err;
  }

  logger.log('tumbsync:dopostsbatch:',batch.phase,' getting ', options);
  
  var posts = undefined;

  tumblrClient.likes(options, function(err,response) {
    if (err) {
      logger.log('tumbsync:dopostsbatch:error from tumblr:',err);
      model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_ERROR;
      notify({'tumblrSyncRunState' : model.tumblrSyncRunState});
      return next();
    } else {
      posts = response['liked_posts'];
      if (posts.length == 0) {
        logger.log('Posts Batch Worker: No earlier tumblr posts');
        
        // this means we hit bedrock
        
        appConfig.tumblrBedrockPost = options.before;
        
        // save this glorious state
        appConfig.save(function(err) {
          if (err) {
            logger.log('tubmlrsync:dopostbatch:error saving bedrock');
          }
        });
        
        // update clients
        model.tumblrBedrockPost = new Date(appConfig.tumblrBedrockPost*1000);
        notify({'tumblrBedrockPost' : model.tumblrBedrockPost});
        
        // if this was a first sync (which it should be)
        // check to see if we need a minor sync
        logger.log(
          'tumblrsync:dopostsbatch:checking to see if there is more work');
        if (batch.phase === 'firstSync') {
          if (tumblrFreshestPostSeen != 
                  appConfig.tumblrFreshestPostRecorded) {
            logger.log('tumblrsync:dopostsbatch:starting minor sync');
            doMinorSync();
          } else {
            logger.log('tumblrsync:dopostsbatch:fully synced already');
          }
        } else {
          logger.log('tumblrsync:dopostsbatch: hit bedrock on minor sync?');
          model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED;
          notify({'tumblrSyncRunState' : model.tumblrSyncRunState});
        }
        
        logger.log('tumblrsync:dopostsbatch:done');
        return(next);
      } else {  // otherwise we got some posts, and we can extract photos
      
        model.tumblrPostsSoFar += posts.length;
        notify({'tumblrPostsSoFar': model.tumblrPostsSoFar.toString()});
  
        // get a flat array of all the photos from every post 
        var photos = photosFromPosts(posts);
        // and figure out which post is earliest and latest
        var oldest = oldestFromPosts(posts);
        var freshest = freshestFromPosts(posts);

        // now go through and log them in the database asynchronously
        photos.forEach(function (thisphoto) {
                    processPhoto(thisphoto);
        });
        
        if (batch.phase === 'firstSync') {
          // move the low watermark down further
          if (oldest >= appConfig.tumblrOldestPostRecorded) {
            // every batch we get should have an earliest datestamp earlier
            // than the low watermark
            logger.log('tumbsync:dopostsbatch:first sync but window stuck');
          }
          
          if (freshest > appConfig.tumblrFreshestPostRecorded) {
            appConfig.tumblrFreshestPostRecorded = freshest;
          }
          appConfig.tumblrOldestPostRecorded = oldest;

          appConfig.save(function checkSaveResults(error) {
            if (err) {
              logger.log('tumblrsync:doPostsBatch:failed to save updated state');
            }
          });
          // we can keep going
          pushCheckingLimit(batch);

          // tell everyone what happened
          model.tumblrOldestPostRecorded = 
            new Date(appConfig.tumblrOldestPostRecorded*1000);
          model.tumblrFreshestPostRecorded = 
            new Date(appConfig.tumblrFreshestPostRecorded*1000);
          notify({'tumblrOldestPostRecorded' : model.tumblrOldestPostRecorded,
                  'tumblrFreshestPostRecorded' :
                     model.tumblrFreshestPostRecorded});

        } else {  // if minor sync insteand
          if (oldest < tumblrTempOldestRecorded) {
            // move down our temp cursor
            tumblrTempOldestRecorded = oldest;
            
            if (tumblrTempOldestRecorded <= // if we hit recorded posts
                  appConfig.tumblrFreshestPostRecorded) {
              // then save state that we are now up to date
              logger.log('tumblrsync:dopostsbatch:minor sync hit bottom');
              appConfig.tumblrFreshestPostRecorded = tumblrFreshestPostSeen;
              appConfig.save(function checkSaveResults(error) {
                if (err) {
                  logger.log('tumblrsync:doPostsBatch:failed to save updated state');
                }
              });

              // tell observers we are now up to date & mark our state
              // as stopped
              model.tumblrFreshestPostRecorded = tumblrFreshestPostSeen;
              model.tumblrSyncRunState = appmodel.TUMBLR_SYNC_RUNSTATE_STOPPED;
              notify({'tumblrSyncRunState' : model.tumblrSyncRunState},
                     {'tumblrFreshestPostRecorded' : tumblrFreshestPostSeen});
            } else {
              // if we haven't hit bottom, add another work item to 
              // the work queue
              pushCheckingLimit(batch);
            }
          }
          // tell observers how far down we got in this batch
          model.tumblrMinorSyncOldest = new Date(tumblrTempOldestRecorded*1000);
          notify({'tumblrMinorSyncOldest' : model.tumblrMinorSyncOldest});
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

function pushCheckingLimit(batch) {
  if (model.tumblrPostsSoFar >= POSTSLIMIT) {
     logger.log('tumblrsync:dopostbatch:hit max posts');
     model.tumblrSyncRunState = model.TUMBLR_SYNC_RUNSTATE_STOPPED;
     notify({'tumblrSyncRunState' : model.tumblrSyncRunstate});
     
     // fakes out that we hit bottom
     appConfig.tumblrBedrockPost = appConfig.tumblrOldestPostRecorded;
     
  } else {
     workq.push(batch);
  }
}

function oldestFromPosts(posts)
{
  var winner = Infinity;
  posts.forEach(function (thispost) {
    if (thispost.liked_timestamp < winner) {
      winner = thispost.liked_timestamp;
    }
  });
  return winner;
}

function freshestFromPosts(posts)
{
  var winner = 0;
  posts.forEach(function (thispost) {
    if (thispost.liked_timestamp > winner) {
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
        thisphoto.parentPost = thispost.id;
        thisphoto.parentPostURL = thispost.post_url;
        thisphoto.dateLiked = thispost.dateLiked;
        localphotos.push(thisphoto);
      });
    }
  });
  
  return localphotos;
}

// this function is not used anywhere; keeping it for inspiration
function processPhoto(photo) {
  
  // find a record for this photo in the db
  
  PicRecord.find({url : photo.original_size.url}, 
    function checkFindResults(err, result) {

    if (err) {
      logger.log('tumbsync:processphoto:pics->find failed');
    } else {
      if (result.length === 0) {// we don't have a record of this picture
        // so let's save one
        
        var newrec = new PicRecord;
        
        newrec.url = photo.original_size.url;
        newrec.parentPostId = photo.parentPost;
        newrec.parentPostURL = photo.parentPostURL;
        newrec.dateLiked = photo.dateLiked;
        newrec.dateDiscovered = new Date();
        
        newrec.save(function checkSaveResults(err) {
          if (err) logger.log('tumbsync:processphoto:pic save failed');
//          else logger.log('tumbsync:processphoto:saved ',newrec.url);
        });
      } else {
//        logger.log('tumbsync:processphoto:pic already in db');
      }
    }
  });
}
  
 
      
      
