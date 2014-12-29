var Utils   = require('./utils.js'),
    Hapi    = require('hapi'),
    dbWrapper, 
    server;

/**
 *  Constructor for router
 */
function Router(aServer, aDbWrapper) {
    console.log('Setting up router!');
    var that    = this;
    dbWrapper   = aDbWrapper;
    server      = aServer;

    //route for post item
    server.route({
        method: 'POST',
        path: '/api/items',
        handler: that.postItem
    });

    //route for fetch items
    server.route({
        method: 'GET',
        path: '/api/items',
        handler: that.getItems
    });

    //route for upvote
    server.route({
        method: 'POST',
        path: '/api/upvote/{hash}',
        handler: that.upVote
    });

    //route for downvote
    server.route({
        method: 'POST',
        path: '/api/downvote/{hash}',
        handler: that.downVote
    });
};

/**
 *  Post an item 
 */
Router.prototype.postItem = function(request, reply) {
    try {
        var raw = JSON.parse(request.payload);
    } catch (err) {
        console.log('Error in parsing ' + err);
        return reply({'status' : 'not_created', 'error' : err}).code(503);
    };

    //store the ip
    raw.ip = request.info.remoteAddress;
   
    if (!raw || !raw.data) {
        return reply('invalid parameters ' + JSON.stringify(raw, null, " ")).code(400);
    }

    if (!raw.type) {
        raw.type = Utils.decideType(raw);
    }

    //consverts any type of data to the correct format
    Utils.convertData(raw);

    console.log('Creating new item with ' + JSON.stringify(raw, null, " "));
  
    dbWrapper.createItem(raw, function(err, doc) {
        if (err) {
            console.log(err);
            return reply({'status' : 'not_created', 'error' : err}).code(503);
        }
        
        reply({'status' : 'created'}).code(200);
    });
};

/**
 *  Get items
 */
Router.prototype.getItems = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var amount  = request.query.amount || 10;
    
    console.log(ip + ' requested ' + amount + ' items!'); 
    dbWrapper.getItems(amount, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(503);
        }

        reply(doc).code(201);
    });
};

/**
 *  Get items
 */
Router.prototype.upVote = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var hash    = encodeURIComponent(request.params.hash);

    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }
    
    dbWrapper.vote(hash, 1, function(err, doc) {
        if (err) {
            reply({'status' : 'not_found', 'error' : err}).code(304);
        }
        
        console.log(ip + ' upvoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Get items
 */
Router.prototype.downVote = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var hash    = encodeURIComponent(request.params.hash);

    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }
    
    dbWrapper.vote(hash, -1, function(err, doc) {
        if (err) {
            reply({'status' : 'not_found', 'error' : err}).code(304);
        }
        
        console.log(ip + ' downvoted ' + hash);
        reply(doc).code(200);
    });
};

module.exports = Router;
