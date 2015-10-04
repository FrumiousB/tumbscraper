var store = require('./store.js');
var logger = require('./multilog.js');
logger.addSink(console.log);

// var connection = undefined;

store.init(process.env.IP, function results(err) {
    if (err) { 
        logger.log('failed to get bind to database');
    } else {
        logger.log('init successful');
    }
});


