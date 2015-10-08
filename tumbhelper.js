/* tumblr helper -- all the functions necessary to get logged in
   to tumblr, using oauth and tumblr.js, using config passed in
   
   call init, and if/once init succeeds you can call
   
   getClient or client to get the tumblr client
*/

var oauthmodule = require('./oauthmodule.js');
var tumblr = require('tumblr.js');
var logger = require('./multilog.js');

module.exports = {
    init: init,
    client: tumblrClient,
    getClient: getClient
};

// these four keys are what you need to log into tumblr
var tumblrConsumerKey = undefined;
var tumblrConsumerSecret = undefined;
var tumblrOauthAccessToken = undefined;
var tumblrOauthAccessTokenSecret = undefined;

var appConfig = undefined;         // appstate config: this will be injected
var appConfigFactory = undefined;  // appstate config: this will be injected

var tumblrClient = undefined;  // this will become the tumblr.js client

function init (ckey, csecret, app, appcf, callback) {

    logger.log('tumbhelper:init: starting');

    if (!ckey || !csecret) {
        var err = new Error('tumbhelper:init:null consumer keys');
        logger.log(err);
        return callback(err, null);
    }
    
    tumblrConsumerKey = ckey;
    tumblrConsumerSecret = csecret;

    if (!appcf) {
        var err = new Error('tumbhelper:init: appconfig not set up');
        throw err;
    } else {
        appConfigFactory = appcf;
        appConfigFactory.getConfig(function(err, result) {
            if (err) {
                logger.log('tumbhelper:init:getConfig failed:',err);
                throw err;
            } else {
                appConfig = result;
                // if we have some tokens from app state, then try them
                tumblrOauthAccessToken = appConfig.tumblrOauthAccessToken;
                tumblrOauthAccessTokenSecret = 
                    appConfig.tumblrOauthAccessTokenSecret;
                    
                // continue on to configure oauth
                setupOauthHelper(app, callback);
            }
        });
    }
}

function validateKeys(ck, cs, at, ats, callback) {

    var tryClient = tumblr.createClient({
      consumer_key: ck,
      consumer_secret: cs,
      token: at,
      token_secret: ats
    });
    
    tryClient.userInfo(function (err, result) {
        if (err) {
            callback(err, null);
        } else {
            callback(null, tryClient);
        }
    });
}

function setupOauthHelper(app, callback) {

  if (!tumblrOauthAccessToken || !tumblrOauthAccessTokenSecret)
  {
    oauthmodule.tumblrOauthSetup(app, tumblrConsumerKey, 
                                 tumblrConsumerSecret, 
                                 function ProcessOauthSetup (accessKeys, err) {
      if (err) {
        logger.log('TumblrOAuthSetup: error getting tumblr oauth access:', err);
        return callback(err, null);
      }
      else {
        logger.log('TumblrOAuthSetup: Auth successful');
//        logger.log('Access token =', accessKeys.access_token);
//        logger.log('Access secret =', accessKeys.access_secret);
        tumblrOauthAccessToken = accessKeys.access_token;
        tumblrOauthAccessTokenSecret = accessKeys.access_secret;
        
        validateKeys(tumblrConsumerKey, tumblrConsumerSecret, 
            tumblrOauthAccessToken, tumblrOauthAccessTokenSecret,
            function processValideKeysResult(err, result) {
                if (err) {
                    logger.log(
                    'tumbhelper:init:fresh new keys failed');
                    callback(err, null);
                } else {
                    // keys are good 
                    tumblrClient = result;
                    // save 'em
                    appConfig.tumblrOauthAccessToken = tumblrOauthAccessToken;
                    appConfig.tumblrOauthAccessTokenSecret = 
                        tumblrOauthAccessTokenSecret;
                    logger.log('TumblrOAuthSetup: Saving new keys in db');
                    appConfigFactory.setConfig(appConfig, 
                        function checkResult(err, result) {
                            if (err) {
                                logger.log('TumblrOAuthSetup: ', err);
                                var outererr = new Error(
                                  'TumblrOAuthSetup: failed to save new keys');
                                outererr.previous = err;
                                return callback(outererr, null);
                            } else {
                                return callback(null, tumblrClient);        
                            }
                    });
                }
            });
      }
    });
  } else {
  // if we're using cached tokens, we can see if they're still good
    logger.log('TumblrOAuthSetup: Using cached token');

    validateKeys(tumblrConsumerKey, tumblrConsumerSecret, 
                 tumblrOauthAccessToken, tumblrOauthAccessTokenSecret,
         function processValidateKeysResult (err, result) {
            if (err) {
                // if something failed, we can imagine the tokens were bad and try to 
                // re-authenticate
                logger.log(
                  'setupTumblrOauth: cached tokens didn\'t work, need to re-auth');
                tumblrOauthAccessToken = null;
                tumblrOauthAccessTokenSecret = null;
                // call ourselves again with null tokens to do re-auth
                setupOauthHelper(app, callback);
            } else { // if everything went fine, then we can be done
                logger.log('setupTumblrOauth: cached tokens are good.');
                tumblrClient = result;
                return callback(null, tumblrClient);
            }
         });
  }
}
                 
function getClient() {
    if (!tumblrClient) {
        logger.log('tumbhelper: getclient calld, but no client');
        return null;
    } else {
        return tumblrClient;
    }
}