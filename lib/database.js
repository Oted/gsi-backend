var Utils       = require('./utils.js');
var Async       = require('async');

var Cache,
    Models;

var internals = {};

/**
 *  Constructor to Database, takes mongostring as parameter
 */
function Database(c, m) {
    Cache = c;
    Models = m;
};

/**
 *  Get item
 */
Database.prototype.getQuery = function(requestQuery, done) {
    console.time('query');
    var _unhash = Utils.generateUniqueQueryString(requestQuery);
    var _hash   = Utils.generateHash(_unhash);

    return Models.model['query'].findOne({_hash : _hash}, function(err, doc) {
        if (err) {
            console.timeEnd('query');
            return done(err);
        }

        if (doc) {
            console.timeEnd('query');
            return done(null, doc, true);
        }

        var newQuery = {
            _unhash : _unhash,
            _hash : Utils.generateHash(_unhash),
            title : requestQuery.search || '',
            type : 'generated',
            es_query : Utils.generateQuery(requestQuery),
            created : new Date(),
            lastUpdated : new Date(),
            enabled : true
        };

        console.timeEnd('query');
        return done(null, newQuery, false);
    });
};

/**
 *  Update a query object
 */
Database.prototype.getFragments = function(amount, type, done) {
    if (Cache.get('fragments.' + '.' + amount + '.' + type)) {
        console.log('returning Cache for getFragments');
        return done(null, Cache.get('fragments.' + '.' + amount + '.' + type));
    };

    switch (type) {
        case "trending" :
            return Models.model['title-fragment'].find({}).sort({score : -1}).limit(amount || 50).exec(done);

        case "popular" :
            return Models.model['title-fragment'].find({}).sort({median : -1}).limit(amount || 50).exec(done);

        case "fresh" :
            return Models.model['title-fragment'].find({total : {"$gt" : 20}}).sort({created : -1}).limit(amount || 50).exec(done);

        case "random" :
            return Models.model['title-fragment'].find({}).limt(amount || 50).exec(function(err, docs) {
                if (err) {
                    return done(err);
                }

                return done(null, Utils.shuffle(docs).slice(amount || 50));
            });
    }
};

/**
 *  Update a query object
 */
Database.prototype.upsertQuery = function(query, done) {
    return Models.model['query'].update({_hash: query._hash}, query, {upsert: true}, done);
};

/**
 *  Fetch items
 */
Database.prototype.getItems = function(requestQuery, query, done) {
    if (Cache.get('items.' + requestQuery.first + '.' + requestQuery.last + '.' + query._hash)) {
        console.log('Returning cache for getItems : ' + query._hash);
        return done(null, Cache.get('items.' + requestQuery.first + '.' + requestQuery.last + '.' + query._hash));
    };

    const es_query = JSON.parse(JSON.stringify(query.es_query));

    console.time('items');

    if (requestQuery.first && !requestQuery.last) {
        es_query.query.bool.filter.bool.must.push({
            "range": {
                "_sort": {
                    "gt": parseInt(requestQuery.first)
                }
            }
        });
    }

    //last is the sort time of the latest item seen
    if (!requestQuery.first && requestQuery.last) {
        es_query.query.bool.filter.bool.must.push({
            "range": {
                "_sort": {
                    "lt": parseInt(requestQuery.last)
                }
            }
        });
    }

    //last is the sort time of the latest item seen
    if (requestQuery.first && requestQuery.last) {
        es_query.query.bool.filter.bool.must.push({
            "range": {
                "_sort": {
                    "gt": parseInt(requestQuery.first),
                    "lt": parseInt(requestQuery.last)
                }
            }
        });
    }

    return Models.searchItems(es_query, function(err, docs) {
        console.timeEnd('items');
        if (err) {
            return done(err);
        }

        return done(null, docs);
    });
};

/**
 *  Creates a new item
 */
Database.prototype.createItem = function(raw, done) {
    if (!raw.type) {
        raw.type = Utils.decideType(raw);
    }

    if (!raw.source_type) {
        raw.source_type = Utils.decideSourceType(raw);
    }

    if (!raw._hash) {
        raw._hash = Utils.generateHash(raw.data);
    }

    if (raw.height || raw.width) {
        raw.dimensions = {};
        if (raw.height) {
            raw.dimensions['height'] = parseInt(raw.height);
        }

        if (raw.width) {
            raw.dimensions['width'] = parseInt(raw.width);
        }
    }

    console.log(raw);

    return Models.model['item'].findOne({_hash : raw._hash}, function(err, doc) {
        if (doc) {
            return done(new Error('Duplication error.'));
        }

        if (!raw.type) {
            raw.type = 'other';
        }

        var item = new Models.model['item']({
            _hash           : raw._hash,
            _sort           : Utils.generateSort(raw),
            title           : raw.title || '',
            source          : raw.source || raw.data,
            type            : raw.type || 'other',
            data            : raw.data,
            ip              : raw.ip || null,
            category        : raw.category || null,
            token           : raw.token || null,
            scraped         : raw.scraped === "true" || raw.scraped === true ? true : false,
            enabled         : raw.type === 'other' ? false : true,
            source_type     : raw.source_type,
            dimensions      : raw.dimensions || null,
            author          : raw.author || null
        });

        return item.save(function(err, newDoc) {
            if (err) {
                return done(err);
            }

            return done(null, newDoc);
        });
    });
};

/**
 *  Creates a new feedback
 */
Database.prototype.createFeedback = function(raw, done) {

    var feedback = new Models.model['feedback']({
        message     : raw.message,
        ip          : raw.ip || null,
        token       : raw.token
    });

    return feedback.save(function(err, newDoc) {
        if (err) {
            return done(err);
        }

        return done(null, newDoc);
    });
};

/**
 *  Votes a new value to an item
 */
Database.prototype.vote = function(session, hash, ip, value, adjective, done) {
    if (!hash) {
        return done(new Error('Invalid hash'));
    }

    if (!session || !session.token) {
        return done(new Error('No token'));
    }

    var token = session.token;

    //if an adjective is provided control it
    if (adjective) {
        adjective = adjective.toLowerCase().trim();
        if (adjectives.indexOf(adjective) === -1) {
            return done(new Error('Invalid adjective ' + adjective + ' when voting for ' + hash));
        }

        if (value > 0 && positives.indexOf(adjective) === -1) {
            return done(new Error('Invalid positive adjective ' + adjective + ' when voting for ' + hash));
        }

        if (value < 0 && negatives.indexOf(adjective) === -1) {
            return done(new Error('Invalid negtive adjective ' + adjective + ' when voting for ' + hash));
        }
    }

    return Models.model['item'].findOne({_hash  : hash}, function(err, docItem) {
        if (err) {
            return done(err);
        }

        if (!docItem) {
            return done(new Error('No item found for ' + hash));
        }

        var rating = new Models.model['rating']({
            _hash       : hash,
            value       : value,
            ip          : ip,
            adjective   : adjective || null,
            token       : token
        });

        rating.save(function(err, docRating) {
            if (err) {
                return done(err);
            }

            if (value > 0) {
                docItem.likes++;
            }

            if (value < 0) {
                docItem.dislikes++;
            }

            docItem.score += value;

            docItem.save(function(itemErr, newItem) {
                if (itemErr) {
                    return done(itemErr);
                }

                delete docRating._id;
                delete docRating._hash;
                delete docRating.token;
                delete docRating.ip;

                return done(null, docRating);
            });
        });
    });
};

/**
 *  View increase view value for an item
 */
Database.prototype.view = function(session, hash, ip, value, done) {
    if (!hash) {
        return done(new Error('Invalid hash'));
    }

    if (!session || !session.token) {
        return done(new Error('No token'));
    }

    var token = session.token;

    var rating = new Models.model['rating']({
        _hash       : hash,
        value       : 0,
        ip          : ip,
        adjective   : null,
        token       : token
    });

    return rating.save(function(err, docRating) {
        if (err) {
            return done(err);
        }

        return Models.model['item'].findOneAndUpdate({_hash  : hash}, {$inc: {views : 1}}, function(err, docItem) {
            if (err) {
                return done(err);
            }

            if (!docItem) {
                return done(new Error('No item found for ' + hash));
            }

            return done(null, docItem);
        });
    });
};

/**
 *  Get all votes for an item
 */
Database.prototype.getRatings = function(hash, done) {
    if (Cache.get('ratings.' + hash)) {
        console.log('returning Cache for getRatings');
        return done(null, Cache.get('ratings.' + hash));
    };

    var query = Models.model['rating'].find({_hash  : hash}, {_id : 0, ip : 0, __v : 0, adjective : 0}).sort({created : -1});
    query.exec(done);
};

/**
 * Get info about stuff
 */
Database.prototype.getInfo = function(done) {
    if (Cache.get('info')) {
        console.log('returning Cache for getInfo');
        return done(null, Cache.get('info'))
    };

    Async.parallel([
        function(cb) {
            info.types = Models.getItemTypes();
            return cb();
        },
        function(cb) {
            Models.model['item'].aggregate([
                {$match : {enabled : true}},
                {$group: { _id: "$type", count:  {$sum : 1}}},
                {$sort : {count : -1}}
             ], function(err, result) {
                info.counts = result;
                return cb(err);
             });
        }
    ], function(err, res) {
        if (err) {
            return done(err);
        }

        return done(null, info);
    });
};

/**
 *  Update a user.
 */
Database.prototype.updateUser = function(session, update, done) {
    if (!session || !session.token) {
	    return done(new Error('No token provided'));
    }

    return Models.model['user'].findOneAndUpdate({_token : session.token}, update, done);
};

/**
 * Close the connection
 */
Database.prototype.close = function() {
    db.close();
    console.log('Bye cruel world!');
};

module.exports = Database;
