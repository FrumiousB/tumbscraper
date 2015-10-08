/* Command handler for tumblr scraper
*/

// we need this for constants, not for the actual model, which is 
// passed in to us on init

var appmodel = require('./model.js');
var tumblrsync = require('./tumblrsync.js');
var fssync = require('./fssync.js');
var logger = require('./multilog.js');

module.exports = {
    init: init,
    execute: execute
};

var model = undefined;

function init(m) {
    if ((typeof(m) != 'object') || (m === undefined)) {
        var err = new Error('controller init: bad model:',m);
        throw err;
    }
    model = m;
}

function execute (command) {
    
    if (model === undefined) {

    }
    
    if (typeof(command) != 'string') {
        var err = new Error('controller execute: bad command, string expected',
                            command);
        throw err;
    }
    
    if (model.appRunState != appmodel.APP_RUNSTATE_READY) {
        logger.log ('controller execute: dumping command because app is not ready');
        return;
    }
    
    switch (command) {
        case 'fssyncstart':
            // code
            break;
            
        case 'fsssyncstop':
            // code
            break;
            
        case 'tumbsyncreset':
            // code
            logger.log('controller execute: tumbsyncreset');
            tumblrsync.reset();
            break;
            
        case 'tumbsyncgo':
            // code
            logger.log('controller execute: tumbsyncgo');
            tumblrsync.go();
            break;
            
        case 'tumbsyncstop':
            // code
            logger.log('controller execute: tumbsyncstop');
            tumblrsync.stop();
            break;
        
        default:
            // should never get here
            var err = new Error ('controller execute: unknown command:',
                                 command);
            throw err;
    }
}

