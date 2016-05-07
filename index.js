'use strict';

var Hapi        = require('hapi');
var Models      = require('gsi-models');
var Router      = require('./lib/router');
var Uuid        = require('node-uuid');

require('dotenv').load();

var internals = {};

var Database,
    Server;

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

    var serverOptions = {
        'host': 'localhost',
        'port': 3000
    };

    if (process.env.NODE_ENV === 'development') {
        serverOptions.routes = {
            cors: true
        }
    }

    //connecttt
    Server.connection(serverOptions);

    return Server.register([
        {
            register: require('yar'),
            options : {
                name : 'session',
                cookieOptions: {
                    password: process.env.COOKIE_PASSWORD,
                    isSecure: process.env.NODE_ENV !== 'development',
                    ttl: 1000 * 3600 * 24 * 3650,
                    clearInvalid: true
                }
            }
        },
        {
            register : require('inert')
        }
    ], function (err) {
        if (err) {
            throw err;
        }

        //Check and set the session
        Server.ext('onPreHandler', (request, response) => {
            if (request.yar.get('session') || request.headers['x-forwarded-for'] === process.env.SCRAPER_IP) {
                return response.continue();
            }

            const session = Uuid.v4();

            request.yar.set('session', {
                'token' : session
            });

            //create a user async
            if (process.env.NODE_ENV !== 'development') {
                Models.model['user'].create({
                    _token : session,
                    user_agent : request.headers['user-agent'] || 'none',
                    ip : request.headers['x-forwarded-for'] || 'none'
                }, function(err, newUser) {
                    if (err) {
                        console.log('Could not create new user', err);
                    }

                    console.log('New user created!', newUser._token);
                });
            }

            return response.continue();
        });

       return Server.start(function () {
            console.info('Server started at ' + Server.info.uri);
            new Router(Server, Models);
        });
    });
};
