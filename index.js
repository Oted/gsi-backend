var Hapi        = require('hapi');
var Models      = require('gsi-models');
var Router      = require('./lib/router');

require('dotenv').load();

var Database,
    Server;

//set connection to local
//process.env.MONGO_URL = 'mongodb://localhost:27017/GSI';

/**
 *  Connect to db then
 *  Start and set up the Server config
 */
Models.connect(function(err) {
    if (err) {
        throw err;
    }

    console.log('Conneced to mongo!');
    Database = require('./lib/database');

    return startServer();
});

/**
 *  Starts the happiiii Server
 */
var startServer = function() {
    var Server = new Hapi.Server();

    //connecttt
    Server.connection({
        'host': 'localhost',
        'port': 3000,
	    'routes': { cors: true }
    });

    //set cookies
    Server.state('session', {
        ttl: 24 * 60 * 60 * 1000 * 730, // Two years lol
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

    return Server.register({
        register: require('good'),
        options: options
    }, function (err) {
        if (err) {
            return console.error(err);
        }

        return Server.start(function () {
            console.info('Server started at ' + Server.info.uri);
            new Router(Server, Models);
        });
    });
};
