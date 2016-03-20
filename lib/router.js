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
        path: '/api/fragments',
        handler: that.getFragments
    });

    //route for fetch items
    Server.route({
        method: 'GET',
        path: '/api/items',
        handler: that.getItems
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

    //route for vieweditem
    Server.route({
        method: 'POST',
        path: '/api/view/{hash}',
        handler: that.viewedItem
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

        reply(output).header('content-type', 'text/html; charset=utf-8').code(200);

        Database.updateUser(request.yar.get('session'), {$inc : {visits : 1}} , function(err) {
            if (err) {
                console.log('ERR IN UPDATE U', err);
            }
        });
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

        reply(output).code(200);

        Database.updateUser(request.yar.get('session'), {$inc : {visits : 1}} , function(err) {
            if (err) {
                console.log('ERR IN UPDATE U', err);
            }
        });
    });
};

/**
 *  Post an item
 */
Router.prototype.postItem = function(request, reply) {
    var ip = request.headers['x-forwarded-for'];

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
        Database.createItem.bind(Database, raw)
    ], function(err, results) {
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
        token = request.yar.get('session').token;

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
    raw.token = token || null;

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
 * Get fragments, types
 * trending
 * popular
 * fresh
 * random
 */
Router.prototype.getFragments = function(request, reply) {
    var ip = request.headers['x-forwarded-for'];
    var amount = request.query.amount || 20;
    var type  = request.query.type || 'trending';

    return Database.getFragments(amount, type, function(err, docs) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('fragments.' + '.' + amount + '.' + type, docs, 600000);
        return reply(docs).code(200);
    });
};

/**
 *  Get items
 */
Router.prototype.getItems = function(request, reply) {
    console.log('request query', request.query);
    return Database.getQuery(request.query, function(err, query, exist) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        return Database.getItems(request.query, query, function(err, esRes) {
            if (err) {
                return reply({'status' : 'not_found', 'error' : err}).code(400);
            }

            Cache.put('items.' + request.query.first + '.' + request.query.last + '.' + query._hash, esRes, 60000);

            query.response_time = esRes.took;

            if (!request.query.first && !request.query.last) {
                query.results = esRes.hits.total;
            }

            query.queried = (query.queried || 0) + 1;

            reply({
                'items' : esRes.hits.hits.map(item => {return item._source}),
                'query' : query
            }).code(200);

            Database.upsertQuery(query, function() {
                if (err) {
                    console.log('ERR IN UPSER Q', err);
                }
            });

            Database.updateUser(request.yar.get('session'), {$inc : {fetches : 1}, $addToSet : {queries : query._hash}} , function(err) {
                if (err) {
                    console.log('ERR IN UPDATE U', err);
                }
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
 *  Vote down
 */
Router.prototype.viewedItem = function(request, reply) {
    var ip      = request.headers['x-forwarded-for'],
        hash    = encodeURIComponent(request.params.hash),
        token   = request.yar.get('token'),
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

    return Database.view(token, hash, ip, raw.view_time, function(err, doc) {
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

module.exports = Router;
