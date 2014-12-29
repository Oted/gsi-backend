var Hapi        = require('hapi');
var DbWrapper   = require('./lib/dbwrapper');
var Router      = require('./lib/router'),
    dbWrapper,
    routeWrapper,
    server;

process.env.MONGO_URL = 

//callback of db connection
dbWrapper = new DbWrapper('mongodb://localhost/messapp', function() {
    console.log('Connectied to DB!'); 
    
    server = new Hapi.Server();
    server.connection({
        'host': '0.0.0.0',
        'port': 3000 
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
