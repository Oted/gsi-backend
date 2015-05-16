var Utils   = require('./utils.js'),
    Hapi    = require('hapi'),
    Async   = require('async'),
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

    //route for fetch items
    server.route({
        method: 'GET',
        path: '/api/items',
        handler: that.getItems
    });

    //route for fetch one item
    server.route({
        method: 'GET',
        path: '/api/item',
        handler: that.getItem
    });

    //route for fetch ratings
    server.route({
        method: 'GET',
        path: '/api/ratings',
        handler: that.getRatings
    });

    //route for fetch ratings
    server.route({
        method: 'GET',
        path: '/api/bestratings',
        handler: that.getBestRatings
    });

    //route for post item
    server.route({
        method: 'POST',
        path: '/api/items',
        handler: that.postItem
    });

    //route for no vote (pressed next)
    server.route({
        method: 'POST',
        path: '/api/novote/{hash}',
        handler: that.noVote
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

    //route for adjectives
    server.route({
        method: 'GET',
        path: '/api/adjectives',
        handler: that.getAdjectives
    });
};

/**
 *  Post an item 
 */
Router.prototype.postItem = function(request, reply) {
    console.log('Insertion request received : ' + JSON.stringify(request.payload));
    
    if (typeof request.payload === 'string') {
        try {
            var raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({'status' : 'not_created', 'error' : err}).code(422);
        };
    } else {
        var raw = request.payload;
    }

    //store the ip
    raw.ip = request.info.remoteAddress;
   
    if (!raw || !raw.data) {
        return reply('invalid parameters ' + JSON.stringify(raw, null, " ")).code(422);
    }

    if (!raw.type) {
        raw.type = Utils.decideType(raw);
    }

    //consverts any type of data to the correct format
    Async.series([
        Utils.convertData.bind(this, raw), 
        dbWrapper.createItem.bind(dbWrapper, raw)],
    function(err, results) {
        if (err || results.length < 2) {
            return reply({'status' : 'not_created', 'error' : err}).code(422);
        }
        
        var doc = results[1];
        
        reply(doc).code(200);
    });
};

/**
 *  Get items
 *
 *  Amount  the number of items being fetched
 *  Last    the latest date of all the items already fetched
 */
Router.prototype.getItems = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var amount  = request.query.amount || 10;
    var types   = request.query.types || null;
    var first   = request.query.first;
    var last    = request.query.last;
    
    console.log(ip + ' requested ' + amount + ' items!'); 
    dbWrapper.getItems(amount, first, last, types, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        reply(doc).code(200);
    });
};


/**
 *  Get item, this returns an object with 
 *  {item : obj, ratings : [ratings for item]}
 *
 *  Hash    the hash of the item to get 
 */
Router.prototype.getItem = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var hash    = request.query.hash;
    
    if (!hash) {
        console.error('No hash provided.');
        return reply({'status' : 'not_found', 'error' : err}).code(400);
    }

    console.log(ip + ' requested ' + hash); 
    
    //get both the item and all its ratings
    Async.series([
        dbWrapper.getItem.bind(dbWrapper, hash),
        dbWrapper.getRatings.bind(dbWrapper, hash)   
    ], function(err, results) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        var res = {
            'item' : results[0],
            'ratings' : results[1]
        }
    
        reply(res).code(200);
    });
};

/**
 *  Get ratings
 *
 *  Hash  the items hash
 */
Router.prototype.getRatings = function(request, reply) {
    var ip      = request.info.remoteAddress;
    var hash    = request.query.hash;
    
    console.log(ip + ' requested all ratings for ' + hash); 
    dbWrapper.getRatings(hash, function(err, docs) {
        if (err) {
            console.error(err);
            return reply().code(400);
        }

        reply(docs).code(200);
    });
};


/**
 *  Get ratings
 *
 *  Hash  the items hash
 */
Router.prototype.getBestRatings = function(request, reply) {
    var ip              = request.info.remoteAddress;
    var amount          = request.query.amount || 25;
    var types           = request.query.types || null;
    var adjectives      = request.query.adjectives || null;
    
    console.log(ip + ' requested best ratings with amount ' + amount); 
    dbWrapper.getBestRatings(amount, types, adjectives, function(err, docs) {
        if (err) {
            console.error(err);
            return reply().code(400);
        }

        reply(docs).code(200);
    });
};

/**
 *  No vote
 */
Router.prototype.noVote = function(request, reply) {
    var ip          = request.info.remoteAddress;
    var hash        = encodeURIComponent(request.params.hash);
    var raw;
    
    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({'status' : 'not_created', 'error' : err}).code(400);
        };
    } else {
        raw = request.payload;
    }
    
    var adjective  = raw.adjective;
    
    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }
    
    dbWrapper.vote(hash, ip, 0, adjective, function(err, doc) {
        if (err) {
            return reply().code(304);
        }
        
        console.log(ip + ' novoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Vote up
 */
Router.prototype.upVote = function(request, reply) {
    var ip          = request.info.remoteAddress;
    var hash        = encodeURIComponent(request.params.hash);
    var adjective   = request.query.adjective;

    var raw;
    
    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({'status' : 'not_created', 'error' : err}).code(400);
        };
    } else {
        raw = request.payload;
    }
    
    var adjective  = raw.adjective;
    
    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }
    
    dbWrapper.vote(hash, ip, 1, adjective, function(err, doc) {
        if (err) {
            console.error(err);
            return reply().code(304);
        }
        
        console.log(ip + ' upvoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Vote down
 */
Router.prototype.downVote = function(request, reply) {
    var ip          = request.info.remoteAddress;
    var hash        = encodeURIComponent(request.params.hash);
    var raw;
    
    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            return reply({'status' : 'not_created', 'error' : err}).code(400);
        };
    } else {
        raw = request.payload;
    }
    
    var adjective  = raw.adjective;
 
    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }
    
    dbWrapper.vote(hash, ip, -1, adjective, function(err, doc) {
        if (err) {
            return reply().code(304);
        }
        
        console.log(ip + ' downvoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Get items
 *
 *  Amount  the number of items being fetched
 *  Last    the latest date of all the items already fetched
 */
Router.prototype.getAdjectives = function(request, reply) {
    var ip          = request.info.remoteAddress;
    var amount      = request.query.amount || 3;
    
    console.log(ip + ' requested ' + amount + ' adjectives!'); 
    dbWrapper.getAdjectives(amount, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        reply(doc).code(200);
    });
};


module.exports = Router;
