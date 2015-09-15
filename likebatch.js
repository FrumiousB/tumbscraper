// Process likes by batch until done
var tumblr = require('tumblr.js');

var POSTSLIMIT = 1000;
var postsSoFar = 0;
var initialized = false;
var tumblrClient = undefined;
var workq;

module.exports = {
    init: init,
    doPostsBatch: doPostsBatch
};

function init(client,q) {
    tumblrClient = client;
    initialized = true;
    workq = q;
}

function findTimeStampOfLatestPost(callback) {
  // get one post @ offset 0
  var options = {
      offset : 0,
      limit : 1
  }
  
  tumblrClient.likes(options, function(err,response) {
    if (err) {
      console.log('findTimeStampOfLatestPost: Got an error from tumblr');
      console.log(err);
      callback(err,undefined);
    } else { // otherwise we got a post
      var timestamp = response.liked_posts[0].liked_timestamp;
      console.log('findTimeStampOfLatestPost: timestamp=',timestamp);
      callback(undefined,timestamp);
    }
  });
}

function doPostsBatch(batch, next) {
  
  console.log("Posts Batch Worker: starting batch @", batch.before);
  
  var before = batch.before;
  
  if (before === 0) { // if we're starting at the beginning
    findTimeStampOfLatestPost(function getFreshestTimestamp (err, response) {
        if (err) {
          console.log('doPostsBatch: error from TimeStampOfLatestPost:',err)
          return next();
        } else { 
          before = response+1;
        }
    });
  }

// by now, we either have a valid before because it was passed in, or because 
// we got the timestamp of the freshest post + 1 second
// so we get a batch of all posts before that timestamp

  var posts = undefined;
  var options = { 'before' : before };
  tumblrClient.likes(options, function(err,response) {
    if (err) {
      console.log("Posts Batch Worker: Got an error");
      console.log(err);
      return next();
    } else {
      posts = response["liked_posts"];
      if (posts.length == 0) {
        console.log("Posts Batch Worker: No more posts");
        return next();
      } else {  // otherwise we are good, and we can extract photos
      
      // get a flat array of all the photos from every post 
        var photos = photosFromPosts(posts);
        var earliest = earliestFromPosts(posts);
        
        // now go through and do work to (eventually) log them in the database
        photos.forEach(function (thisphoto) {
          console.log("Posts Batch Worker: extracted photo ",
                      thisphoto.original_size.url);
        });
    
        // Now we st up the next 
        var newbatch = { 
          'before': earliest
        };
        
        console.log('postsSoFar =',postsSoFar);
        console.log('posts.length',posts.length);
        console.log('POSTSLIMIT =',POSTSLIMIT)
        postsSoFar += posts.length;
        if (postsSoFar < POSTSLIMIT) {
          workq.push(newbatch);
        } else {
          console.log('Posts Batch Worker: Hit max posts');
        }
    //  console.log("Posts Batch Worker: done with batch");
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
    thispost.photos.forEach(function (thisphoto) {
      localphotos.push(thisphoto);
    });
  });
  return localphotos;
}
      
      
      
