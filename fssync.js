// Keep database and filesystem in sync

var async = require('async');
var mongoose = require('mongoose');
var logger = require('./multilog.js');
var appmodel = require('./model.js');

var initialized = false;
var notify = undefined;
var workq = undefined;
var model = undefined;

module.exports = {
    init: init,
    start: start,
    stop: stop
};

function init(m, notifier) {
    initialized = true;
    model = m;
    workq = async.queue(fsSyncWorker,1);
    notify = notifier;
}

function start() {
    logger.log('fsSyncStart command');
    if (model.fsSyncRunState === appmodel.FS_SYNC_RUNSTATE_ERROR) {
        logger.log('fsSyncStart: can\'t start from error state');
        return;
    }
    
    if (model.fsSyncRunState === appmodel.FS_SYNC_RUNSTATE_RUNNING) {
        logger.log('fsSyncStart: already running');
        return;
    }

    if (model.fsSyncRunState === appmodel.FS_SYNC_RUNSTATE_STOPPING) {
        logger.log('fsSyncStart: can\'t start when stopping');
        return;
    }

    // assert that the queue is currently not running.  if it is, we're in a
    // bad place
    
    // get a batch of first N records that aren't marked as being in the 
    // filesystem
    
    // put that batch in the work queue
    
    // mark our state as running
    model.fsSyncRunState = appmodel.FS_SYNC_RUNSTATE_RUNNING;
    model.notifier({'fsSyncRunState' : appmodel.FS_SYNC_RUNSTATE_RUNNING});
}

function stop() {
    
}

function fsSyncWorker (batch) {
    
}

