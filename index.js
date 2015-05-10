var Hapi        = require('hapi');
var DbWrapper   = require('./lib/dbwrapper');
var Router      = require('./lib/router'),
    dbWrapper,
    routeWrapper,
    server;

process.env.MONGO_URL = 'mongodb://localhost:27017/messapp';

//callback of db connection
dbWrapper = new DbWrapper(process.env.MONGO_URL, function() {
    console.log('Connectied to DB!');
    
    server = new Hapi.Server();
    server.connection({
        'host': '188.166.45.196',
        'port': 3000,
	    'routes': { cors: true }
    });

    //start da server
    server.start(function() {
        console.log('Server running at:', server.info.uri);
        routeWrapper = new Router(server, dbWrapper);
    });
});

//on exit, close db
process.on('exit', function(code) {
    DbWrapper.close();
});

module.exports = server;
