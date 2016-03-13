'use strict';

var Hapi        = require('hapi');
var Models      = require('gsi-models');
var Router      = require('./lib/router');
var Uuid        = require('node-uuid');

require('dotenv').load();

var internals = {};

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
	    'routes': {
            cors: true
        }
    });

    return Server.register([
        {
            register: require('yar'),
            options : {
                name : 'session',
                cookieOptions: {
                    password: process.env.COOKIE_PASSWORD,
                    isSecure: false,
                    ttl: 1000 * 3600 * 24 * 3650
                }
            }
        }
    ], function (err) {
        if (err) {
            throw err;
        }

        //Check and set the session
        Server.ext('onPreHandler', (request, response) => {
            if (request.yar.get('session')) {
                return response.continue();
            }

            const session = Uuid.v4();

            console.log('Wooo new user ' + session);
            request.yar.set('session', {
                'token' : session
            });

            //create a user async
            Models.model['user'].create({
                _token : session,
                user_agent : request.headers['user-agent'] || 'none',
                ip : request.headers['x-forwarded-for'] || 'none'
            });

            return response.continue();
        });

       return Server.start(function () {
            console.info('Server started at ' + Server.info.uri);
            new Router(Server, Models);
        });
    });
};
