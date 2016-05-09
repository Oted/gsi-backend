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
                name : 'session-v1',
                cookieOptions: {
                    password: process.env.COOKIE_PASSWORD,
                    isSecure: false,
                    ttl: 1000 * 3600 * 24 * 3650
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
            if (request.yar.get('session-v1') || 
                request.headers['x-forwarded-for'] === process.env.SCRAPER_IP ||
                request.headers['user-agent'].indexOf('SkypeUriPreview') > -1 ||
                request.headers['user-agent'].indexOf('Googlebot') > -1 ||
                request.headers['user-agent'].indexOf('facebookexternalhit') > -1) {
                return response.continue();
            }

            //if here, in theory we have a new user
            const session = Uuid.v4();

            request.yar.set('session-v1', {
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
