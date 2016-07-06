var Utils       = require('./utils.js');
var Hapi        = require('hapi');
var Async       = require('async');
var Cache       = require('memory-cache');
var Mustache    = require('mustache');
var D           = require('./database.js');

var thingTempl  = require('fs').readFileSync('gsi-react/public/thing.html', 'utf8');
var thingsTempl = require('fs').readFileSync('gsi-react/public/things.html', 'utf8');

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

    //static files
    Server.route({
        method: 'GET',
        path: '/thing/public/{param*}',
        handler: {
            directory: {
                path: 'gsi-react/public'
            }
        }
    });

    //static files
    Server.route({
        method: 'GET',
        path: '/things/public/{param*}',
        handler: {
            directory: {
                path: 'gsi-react/public'
            }
        }
    });

    //try to render something
    Server.route({
        method : 'GET',
        path : '/thing/{hash}',
        handler : that.renderThingTemplate
    });

    // //try to render something
    Server.route({
        method : 'GET',
        path : '/things/{hash}',
        handler : that.renderThingsTemplate
    });

    //route for fetch fragments
    Server.route({
        method: 'GET',
        path: '/api/fragments',
        handler: that.getFragments
    });

    //route for fetch related fragments
    Server.route({
        method: 'GET',
        path: '/api/relatedfragments',
        handler: that.getRelatedFragments
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
}

/**
 *  Render a frontend a single item
 */
Router.prototype.renderTemplate = function(request, reply) {
    var output = Mustache.render(index);

    reply(output).header('content-type', 'text/html; charset=utf-8').code(200);

    return Database.updateUser(request.yar.get('session-v1'), {$inc : {visits : 1}} , function(err) {
        if (err) {
            console.log('ERR IN UPDATE U', err);
        }
    });
};

/**
 *  Render a frontend a single item
 */
Router.prototype.renderThingTemplate = function(request, reply) {
    var thingHash = request.params.hash;

    if (!thingHash) {
        return reply({'status' : 'not_found', 'error' : new Error('no such thing')}).code(404);
    }

    return Database.getItem(thingHash, function(err, doc) {
        if (err || !doc) {
            return reply({'status' : 'not_found', 'error' : err || 'No such thing'}).code(400);
        }

        Cache.put('item.' + thingHash, doc, 9000000);

        if (doc.type === 'vimeo') {
            doc.data = doc.data.split('/').pop();
        }

        var templObj = {
            "_hash"  : thingHash,
            "title"  : doc.title.toString(),
            "data" : doc.data.toString(),
            "fragments" : doc.fragments,
            "author" : doc.author,
            "category" : doc.category,
            "url" : 'http://getsomeinternet.com/thing/' + thingHash,
            "source" : doc.source
        };

        templObj[doc.type] = true;

        var output = Mustache.render(thingTempl, templObj);

        reply(output).header('content-type', 'text/html; charset=utf-8').code(200);

        Database.updateUser(request.yar.get('session-v1'), {$inc : {visits : 1}} , function(err) {
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
    var queryHash = request.params.hash;

    return Database.getQuery({query : queryHash}, function(err, doc) {
        if (err || !doc) {
            return reply({'status' : 'not_found', 'error' : err || 'No such thing'}).code(400);
        }

        Cache.put('query.' + queryHash, doc, 9000000);

        var res = doc.toObject();
        res.url = 'http://getsomeinternet.com/thing/' + queryHash;

        var output = Mustache.render(thingsTempl, res);

        reply(output).code(200);

        Database.updateUser(request.yar.get('session-v1'), {$inc : {visits : 1}} , function(err) {
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
    var raw;

    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({
                'status' : 'not_created',
                'error' : err
            }).code(422);
        }
    } else {
        raw = request.payload;
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
        token = request.yar.get('session-v1').token,
        raw;

    if (typeof request.payload === 'string') {
        try {
            raw = JSON.parse(request.payload);
        } catch (err) {
            console.log('Error in parsing ' + err);
            return reply({'status' : 'not_created', 'error' : err}).code(422);
        }
    } else {
        raw = request.payload;
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
 * Get scored and related fragments given a fragment
 */
Router.prototype.getRelatedFragments = function(request, reply) {
    var fragment = request.query.fragment;

    return Database.getRelatedFragments(fragment, function(err, result) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('related-fragments.' + '.' + fragment, result, 600000);
        return reply(result).code(200);
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
 *
 *  All items needs to be fetched with a query bound to them,
 *  the query can either be generated with the arguemnts given like
 *  title, types and _sort
 *  or the hash for the query is passed instead.
 */
Router.prototype.getItems = function(request, reply) {
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

            Database.updateUser(request.yar.get('session-v1'), {$inc : {fetches : 1}, $addToSet : {queries : query._hash}} , function(err) {
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
    var hash   = request.query.hash;

    if (!hash) {
        console.error('No hash provided.');
        return reply({'status' : 'not_found', 'error' : err}).code(400);
    }

    console.log(ip + ' requested ' + hash);

    return Database.getItem(hash, function(err, doc) {
        if (err) {
            return reply({'status' : 'not_found', 'error' : err}).code(400);
        }

        Cache.put('item.' + hash, doc, 60 * 60 * 1000);

        return reply(doc.toObject()).code(200);
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
        }
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

module.exports = Router;
