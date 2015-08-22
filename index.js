var Hapi        = require('hapi');
var DbWrapper   = require('./lib/dbwrapper');
var Router      = require('./lib/router'),
    
var dbWrapper,
    routeWrapper,
    server;

process.env.MONGO_URL = 'mongodb://188.166.45.196:27017/messapp';

/**
 *  Start and set up the server config
 */
var startServer = function() {
    var server = new Hapi.Server();

    //connecttt
    server.connection({
        'host': 'localhost',
        'port': 3000
    });

    //set cookies
    server.state('session', {
        ttl: 24 * 60 * 60 * 1000 * 730,     // Two years lol
        encoding: 'base64json'
    });

    //set up logging
    var options = {
        opsInterval: 60000,
        reporters: [{
            reporter: require('good-console'),
            events: { log: '*', response: '*' }
        }, {
            reporter: require('good-file'),
            events: { ops: '*' },
            config: './logs/lol_logs'
        }]
    };

    server.register({
        register: require('good'),
        options: options
    }, function (err) {
        if (err) {
            return console.error(err);
        } 

        server.start(function () {
            console.info('Server started at ' + server.info.uri);
            routeWrapper = new Router(server, dbWrapper);
        });
    });
};

//callback of db connection
dbWrapper = new DbWrapper(process.env.MONGO_URL, startServer);

//on exit, close db
process.on('exit', function(code) {
    DbWrapper.close();
});

module.exports = server;
