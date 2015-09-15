var express = require('express');
var oauth = require('oauth');
var http = require('http');
var tumblr = require('tumblr.js');

module.exports = {
    tumblrOauthSetup: setupTumblrOauth
};

var tumblrAccessTokens = {
    access_token: String,
    access_secret: String
};
tumblrAccessTokens.access_token = undefined;
tumblrAccessTokens.access_secret = undefined;

/**
 * These four variables will be needed to use tumblr.js
 */
var tumblrConsumerKey,
    tumblrConsumerSecret,
    // tumblrOauthAccessToken = undefined,
    // tumblrOauthAccessTokenSecret = undefined,
    // Temporary request tokens
    oauthRequestToken,
    oauthRequestTokenSecret,
    consumer;

function setupTumblrOauth(app,consumer_key,consumer_secret,callback) {


    /**
    * This object will be used for OAuth
    **/
    tumblrConsumerKey = consumer_key;
    tumblrConsumerSecret = consumer_secret;
    consumer = new oauth.OAuth(
    "http://www.tumblr.com/oauth/request_token",
    "http://www.tumblr.com/oauth/access_token",
    tumblrConsumerKey,
    tumblrConsumerSecret,
    "1.0A",
    "https://scrape-frumiousb.c9.io/auth/callback",
    "HMAC-SHA1");

    app.get('/', function (req, res) {
        if (!tumblrAccessTokens.access_token || !tumblrAccessTokens.access_secret) {
            res.redirect('/auth/request');
        }
        console.log('get \/')
        res.send('You are logged in and ready to go');
    });

    app.get('/auth/request', function (req, res) {
        consumer.getOAuthRequestToken(function(error, oauthToken, oauthTokenSecret){
            if (error) {
                res.send("Error getting OAuth request token: " + error, 500);
            } else {
                oauthRequestToken = oauthToken,
                oauthRequestTokenSecret = oauthTokenSecret;
    
                res.redirect("http://www.tumblr.com/oauth/authorize?oauth_token=" + oauthRequestToken);
            }
        });
    });
    
    
    app.get('/auth/callback', function (req, res) {
        console.log('OAuth callback: URL =',req.originalUrl);
        console.log('OAuth callback: Trying verifier:', req.query.oauth_verifier);
        console.log('Oauth callback:',oauthRequestToken.length,':', oauthRequestTokenSecret.length,':',req.query.oauth_verifier.length);
        consumer.getOAuthAccessToken(oauthRequestToken, oauthRequestTokenSecret, req.query.oauth_verifier, function(error, _oauthAccessToken, _oauthAccessTokenSecret) {
            if (error) {
                res.send("Error getting OAuth access token: " + error, 500);
                callback(null, error);
            } else {

                res.send("You are signed in. <a href='/test'>Test</a>");
                
                tumblrAccessTokens.access_token = _oauthAccessToken;
                tumblrAccessTokens.access_secret = _oauthAccessTokenSecret;
                callback(tumblrAccessTokens,0);
            }
        });
    });
    
    app.get('/test', function (req, res) {
        if (!tumblrAccessTokens.access_token || !tumblrAccessTokens.access_secret) {
            res.redirect('/auth/request');
        }
    
        var client = tumblr.createClient({
            consumer_key: tumblrConsumerKey,
            consumer_secret: tumblrConsumerSecret,
            token: tumblrAccessTokens.access_token,
            token_secret: tumblrAccessTokens.access_secret
        });
    
        client.userInfo(function (err, data) {
            res.send(data);
        });
    });
}
