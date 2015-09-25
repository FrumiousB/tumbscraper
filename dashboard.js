/* Dashboard - communicating model and commands with clients via 
   socket.io
   
   Initialize in the beginning by passing in the global model, then
   setup the dashboard.
*/

var path = require('path');
var tumblr = require('tumblr.js');
var socketio = require('socket.io');
var express = require('express');
var logger = require('./multilog.js');

module.exports = {
    init: init,
    notify: notify,
    log: log
}

var dboardModel = undefined;
var controller = undefined;
var sockets = [];

function init (m,c) {
    if (typeof(m) != 'object') {
        var err = new Error(
            'dashboard init: bad parameter: should be model object:', m);
        throw err;
    } else {
    dboardModel = m;
    m.notify = notify;  // put this in the model so model-writers can update
    }
    
    if (typeof(c) != 'object') {
        var err = new Error(
            'dashboard init: bad parameter: should be controller object:', c);
        throw err;
    } else {
    controller = c;
    }
    
    var io = socketio.listen(dboardModel.server);
    
    io.on('connection', function socketConnect (socket) {
      // keep a list of clients
      sockets.push(socket);
      
      // give new clients some state
      sendCurrentModel(socket);
      
      // maintain the list of clients after disconnect
      socket.on('disconnect', function socketDisconnect (socket) {
          sockets.splice(sockets.indexOf(socket), 1);
      });
      
      // dispatch commands to controller  
      socket.on('command', processCommand);
      
      // when asked, dump state
      // socket.on('refresh', sendCurrentModel(socket));
    
    });
  
    logger.log('setupDashboard: done: listening at', dboardModel.IP + ':' + dboardModel.PORT);
};

function sendCurrentModel(socket) {
    var packet = {};
  
    if(dboardModel.appRunState)
        packet.appRunState = dboardModel.appRunState;
        
    if(dboardModel.tumblrSyncRunState)
        packet.tumblrSyncRunState = dboardModel.tumblrSyncRunState;
        
    if (packet != {}) {
        socket.emit('update',packet);
    }
}

function dashboardBroadcast(event, data) {
  sockets.forEach(function (socket) {
    socket.emit(event, data);
  });
}

function processCommand (cmd) {
    // logger.log('got controller command:',cmd);
    controller.execute(cmd);
}

function notify (data) {
    dashboardBroadcast('update',data);
}

function log(message) {
    dashboardBroadcast('log',message);
}

