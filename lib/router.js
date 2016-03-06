var Utils       = require('./utils.js');
var Hapi        = require('hapi');
var Async       = require('async');
var Cache       = require('memory-cache');
var Mustache    = require('mustache');
var D           = require('./database.js');

var index       = require('fs').readFileSync('./templates/index.html', 'utf8')
var thingTempl  = require('fs').readFileSync('./templates/thing.html', 'utf8')
var thingsTempl = require('fs').readFileSync('./templates/things.html', 'utf8')

var Database,
    Server,
    Models;

/**
 *  Constructor for router
 */
function Router(s, m) {
    var that    = this;

    console.log('Setting up router!');

    Models      = m;
    Server      = s;
    Database    = new D(Cache, m);

    //try to render something
    Server.route({
        method : 'GET',
        path : '/things',
        handler : that.renderThingTemplate
    });

    //try to render something
    Server.route({
        method : 'GET',
        path : '/things/{id}',
        handler : that.renderThingsTemplate
    });

    //route for fetch items
    Server.route({
        method: 'GET',
        path: '/api/items',
        handler: that.getItems
    });

    //get trending
    Server.route({
        method: 'GET',
        path: '/api/trending',
        handler: that.getTrending
    });

    //route for fetch one item
    Server.route({
        method: 'GET',
        path: '/api/item',
        handler: that.getItem,
        config : {
            cache : {
                expiresIn: 1000 * 60
            }
        }
    });

    //route for fetch ratings
    Server.route({
        method: 'GET',
        path: '/api/ratings',
        handler: that.getRatings,
        config : {
            cache : {
                expiresIn: 1000 * 60
            }
        }
    });

    //route for fetch ratings
    Server.route({
        method: 'GET',
        path: '/api/bestratings',
        handler: that.getBestRatings,
        config : {
            cache : {
                expiresIn: 1000 * 60
            }
        }
    });

    //route for post item
    Server.route({
        method: 'POST',
        path: '/api/items',
        handler: that.postItem
    });

    //route for post item
    Server.route({
        method: 'POST',
        path: '/api/feedback',
        handler: that.postFeedback
    });

    //route for no vote (pressed next)
    Server.route({
        method: 'POST',
        path: '/api/novote/{hash}',
        handler: that.noVote
    });

    //route for upvote
    Server.route({
        method: 'POST',
        path: '/api/upvote/{hash}',
        handler: that.upVote
    });

    //route for downvote
    Server.route({
        method: 'POST',
        path: '/api/downvote/{hash}',
        handler: that.downVote
    });

    //route for vieweditem
    Server.route({
        method: 'POST',
        path: '/api/view/{hash}',
        handler: that.viewedItem
    });

    //endpoint for getting info about the current stuff in the app
    Server.route({
        method : 'GET',
        path : '/api/info',
        handler: that.getInfo
    });

    //route for adjectives
    Server.route({
        method: 'GET',
        path: '/api/adjectives',
        handler: that.getAdjectives,
        config : {
            cache : {
                expiresIn: 1000 * 600
            }
        }
    });
};

/**
 *  Render a frontend a single item
 */
Router.prototype.renderThingTemplate = function(request, reply) {
    var thingHash = request.query.thing;

    if (!thingHash) {
        return reply({'status' : 'not_found', 'error' : new Error('no such thing')}).code(404);
    }

    return Database.getItem(thingHash, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('item.' + thingHash, doc, 9000000);

        if (doc.type === 'vimeo') {
            doc.data = doc.data.split('/').pop();
        }

        var templObj = {
            "title"  : doc.title,
            "data" : doc.data,
            "fragments" : doc.fragments,
            "url" : 'http://getsomeinternet.com/things?thing=' + thingHash,
            "source" : doc.source
        };

        templObj[doc.type] = true;

        var output = Mustache.render(thingTempl, templObj);

        return reply(output).header('content-type', 'text/html; charset=utf-8').code(200);
    });
};

/**
 *  Render a frontend for a list
 */
Router.prototype.renderThingsTemplate = function(request, reply) {
    var thing   = request.query.thing,
        list    = request.query.list;

    return Database.getItem(thing, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('item.' + thing, doc, 9000000);

        var output = Mustache.render(template, {
            "header"  : doc.title
        });

        return reply(output).code(200);
    });
};

/**
 *  Post an item
 */
Router.prototype.postItem = function(request, reply) {
    var ip = request.headers['x-forwarded-for'],
        session = request.state.session;

    if (typeof request.payload === 'string') {
        try {
            var raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({
                'status' : 'not_created',
                'error' : err
            }).code(422);
        };
    } else {
        var raw = request.payload;
    }

    //store the ip
    raw.ip = request.headers['x-forwarded-for'];

    //store the token
    raw.token = session ? session.token : null;

    if (!raw || !raw.data) {
        return reply('invalid parameters ' + JSON.stringify(raw, null, " ")).code(422);
    }

    if (!raw.type) {
        raw.type = Utils.decideType(raw);
    }

    if (!raw.source_type) {
        raw.source_type = Utils.decideSourceType(raw);
    }

    return Async.series([
        Utils.convertData.bind(this, raw),
        Database.createItem.bind(Database, raw)],
    function(err, results) {
        if (err || results.length < 2) {
            return reply({'status' : 'not_created', 'error' : err}).code(422);
        }

        var doc = results[1];
        reply(doc).code(200);
    });
};

/**
 *  Post an item
 */
Router.prototype.postFeedback = function(request, reply) {
    var ip = request.headers['x-forwarded-for'],
        session = request.state.session;

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
    raw.ip = ip;

    //store the token
    raw.token = session ? session.token : null;

    if (!raw.message) {
        return reply({'status' : 'not_created', 'error' : new Error('No message provided')}).code(422);
    }

    return Database.createFeedback(raw, function(err, doc) {
        if (err || !doc) {
            return reply({'status' : 'not_created', 'error' : err || new Error('Could not create doc')}).code(422);
        }

        return reply(doc).code(200);
    });
};

/**
 * Get trends
 */
Router.prototype.getTrending = function(request, reply) {
    var ip      = request.headers['x-forwarded-for'];

    var amount = request.query.amount;
    var threshold  = request.query.threshold;

    return Database.getTrending(amount, threshold, function(err, docs) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('trending.' + '.' + amount + '.' + threshold, docs, 600000);
        return reply(docs).code(200);
    });
};

//getItemsWithId

/**
 *  Get items
 */
Router.prototype.getItems = function(request, reply) {
    var ip = request.headers['x-forwarded-for'];

    //this can be an id and then just skip it

    var search  = request.query.search || null,
        types,
        sources;

    if (request.query.sources) {
        sources = Array.isArray(request.query.sources) ? request.query.sources : [request.query.sources];
    }

    if (request.query.types) {
        types   = Array.isArray(request.query.types) ? request.query.types : [request.query.types];
    }

    var first   = request.query.first || null;
    var last    = request.query.last || null;

    return Database.getQuery(search, types, sources, function(err, query, exist) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        return Database.getItems(first, last, query, function(err, resObj) {
            if (err) {
                return reply({'status' : 'not_found', 'error' : err}).code(400);
            }

            Cache.put('items.' + first + '.' + last + '.' + query._hash, resObj, 60000);

            if (!first && !last) {
                query.results = resObj.count;
            }

            query.queried = (query.queried || 0) + 1;

            reply({
                'items' : resObj.docs,
                'query' : query
            }).code(200);

            return Database.upsertQuery(query, function() {
                console.log(arguments);
            });
        });
    });
};

/**
 *  Get item, this returns an object with
 *  {item : obj, ratings : [ratings for item]}
 *
 *  Hash    the hash of the item to get
 */
Router.prototype.getItem = function(request, reply) {
    var ip      = request.headers['x-forwarded-for'];
    var hash    = request.query.hash;

    if (!hash) {
        console.error('No hash provided.');
        return reply({'status' : 'not_found', 'error' : err}).code(400);
    }

    console.log(ip + ' requested ' + hash);

    //get both the item and all its ratings
    return Async.series([
        Database.getItem.bind(Database, hash),
        Database.getRatings.bind(Database, hash)
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
    var ip      = request.headers['x-forwarded-for'];
    var hash    = request.query.hash;

    console.log(ip + ' requested all ratings for ' + hash);
    return Database.getRatings(hash, function(err, docs) {
        if (err) {
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
    var ip              = request.headers['x-forwarded-for'];
    var amount          = request.query.amount || 25;
    var types           = request.query.types || null;
    var adjectives      = request.query.adjectives || null;

    console.log(ip + ' requested best ratings with amount ' + amount);
    return Database.getBestRatings(amount, types, adjectives, function(err, docs) {
        if (err) {
            return reply().code(400);
        }

        reply(docs).code(200);
    });
};

/**
 *  No vote
 */
Router.prototype.noVote = function(request, reply) {
    var ip          = request.headers['x-forwarded-for'],
        hash        = encodeURIComponent(request.params.hash),
        session     = request.state.session,
        raw;

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

    return Database.vote(session, hash, ip, 0, adjective, function(err, doc) {
        if (err) {
            return reply().code(401);
        }

        console.log(ip + ' novoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Vote up
 */
Router.prototype.upVote = function(request, reply) {
    var ip          = request.headers['x-forwarded-for'],
        hash        = encodeURIComponent(request.params.hash),
        session     = request.state.session,
        adjective   = request.query.adjective;

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

    return Database.vote(session, hash, ip, 1, adjective, function(err, doc) {
        if (err) {
            console.error(err);
            return reply().code(401);
        }

        console.log(ip + ' upvoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Vote down
 */
Router.prototype.downVote = function(request, reply) {
    var ip          = request.headers['x-forwarded-for'],
        hash        = encodeURIComponent(request.params.hash),
        session     = request.state.session,
        raw;

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

    return Database.vote(session, hash, ip, -1, adjective, function(err, doc) {
        if (err) {
            return reply().code(401);
        }

        console.log(ip + ' downvoted ' + hash);
        reply(doc).code(200);
    });
};

/**
 *  Vote down
 */
Router.prototype.viewedItem = function(request, reply) {
    var ip          = request.headers['x-forwarded-for'],
        hash        = encodeURIComponent(request.params.hash),
        session     = request.state.session,
        raw;

    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            return reply({'status' : 'not_created', 'error' : err}).code(400);
        };
    } else {
        raw = request.payload;
    }

    if (!hash) {
        return reply({'err' : 'not_found'}).code(400);
    }

    if (!raw || !raw.view_time) {
        return reply({'err' : 'not_found'}).code(400);
    }

    return Database.view(session, hash, ip, raw.view_time, function(err, doc) {
        if (err) {
            return reply().code(401);
        }

        console.log(ip + ' viewed ' + hash);
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
    var ip          = request.headers['x-forwarded-for'];
    var amount      = request.query.amount || 3;

    console.log(ip + ' requested ' + amount + ' adjectives!');
    return Database.getAdjectives(amount, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        reply(doc).code(200);
    });
};


/**
 *  Get info,
 *  Also used as init to give a user token upon first request
 */
Router.prototype.getInfo = function(request, reply) {
    var ip      = request.headers['x-forwarded-for'],
        state   = request.query.state,
        session = request.state.session;

    if (!session) {
        session = { "token" : Utils.generateToken() };
        console.log('New user! ' + ip, session);
    }

    Database.addOrUpdateUserState(state, ip, session.token, function(err){
        if (err) {
            console.log('Could not update user state', err);
        }

        console.log('Updated user state!');
    });

    console.log(ip + ' requested info!');
    return Database.getInfo(function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('info', doc, 60000);
        return reply(doc).code(200).state('session', session);
    });
};


module.exports = Router;
