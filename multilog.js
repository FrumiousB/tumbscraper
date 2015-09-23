/* mulitlogger - log to multiple sinks */

var sinks = [];

module.exports = {
        addSink: addSink,
        log: log
};

function addSink (s) {
    if (typeof(s) != 'function') {
        var err = new Error('multilog: addsink: sink must be function');
        throw err;
    }
    sinks.push(s);
};

function log () {
    var outstring = '';
    for (var i=0;i<arguments.length;i++) {
        var arg = arguments[i];
        if (typeof(arg) === 'object')
            outstring += JSON.stringify(arg);
        else
            outstring += String(arg);
    }
    
    sinks.forEach(function logToSink(sink) 
    {
        sink(outstring);
    });
};

/* random test code for logging 
console.log('trying this in situ');
log();
log('marmoset');
log('marmoset',':');
log('marmoset',':','budgerigar');
log('picanic',':',{booboo: 12, bear: 'fozzy'});
log(23,':',true,':',[0,1,2,3,4]);
*/