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
Database.prototype.getQuery = function(search, types, done) {
    var qHash = Utils.generateQueryHash(search, types);

    console.time('query');
    return Models.model['query'].findOne({_hash : qHash}, function(err, doc) {
        console.timeEnd('query');
        if (err) {
            return done(err);
        }

        if (doc) {
            doc.query = Utils.transformQuery(doc.query);
            return done(null, doc, true);
        }

        var newQuery = {
            _hash : qHash,
            search : search,
            type : 'generated',
            query : Utils.generateQuery(search, types),
            created : new Date(),
            lastUpdated : new Date(),
            enabled : true
        };

        return done(null, newQuery, false);
    });
};

/**
 *  Update a query object
 */
Database.prototype.getTrending = function(amount, threshold, done) {
    if (Cache.get('trending.' + '.' + amount + '.' + threshold)) {
        console.log('returning Cache for getTrending');
        return done(null, Cache.get('trending.' + '.' + amount + '.' + threshold));
    };

    return Models.model['title-fragment'].find({score : {$gte : threshold || 0.2}}).sort({score : -1}).limit(amount || 30).exec(done);
};

/**
 *  Update a query object
 */
Database.prototype.upsertQuery = function(query, done) {
    query.query = Utils.transformQuery(query.query);
    return Models.model['query'].update({_hash: query._hash}, query, {upsert: true}, done);
};

/**
 *  Fetch items
 */
Database.prototype.getItems = function(first, last, query, done) {
    if (Cache.get('items.' + first + '.' + last + '.' + query._hash)) {
        console.log('returning Cache for getItems : items', query.query);
        return done(null, Cache.get('items.' + first + '.' + last + '.' + query._hash));
    };

    if (!first && !last) {
        query.query['_sort'] = {$lte : +(new Date())};
    }

    if (first && !last) {
        query.query['_sort'] = {$gt : first};
    }

    //last is the sort time of the latest item seen
    if (!first && last) {
        query.query['_sort'] = {$lt : last};
    }

    //outside of the seen window
    if (first && last) {
        query.query['_sort'] = {
            '$or' : [
                {$lt : last},
                {$gt : first}
            ]
        };
    }

    console.time('items');
    return Models.model['item'].find(query.query).count(function(err, count) {
        return Models.model['item'].find(query.query).sort({_sort : -1}).limit(50).exec(function(err, docs) {
            console.timeEnd('items');
            if (err) {
                return done(err);
            }

            return done(null, {
                'count' : count,
                'docs' : docs
            });
        });
    });
};

/**
 *  Creates a new item
 */
Database.prototype.createItem = function(raw, done) {
    if (!raw.data) {
        return done(new Error('No data provided at item.save'));
    }

    if (!raw.hash) {
        raw.hash = Utils.generateHash(raw);
    }

    Models.model['item'].findOne({_hash : raw.hash}, function(err, doc) {
        if (doc) {
            return done(new Error('Duplication error.'));
        }

        if (!raw.type) {
            raw.type = 'other';
        }

        var item = new Models.model['item']({
            _hash           : Utils.generateHash(raw.data),
            _sort           : Utils.generateSort(raw),
            title           : raw.title || '',
            search          : ((raw.search || '') + ' ' +
                               (raw.title || '') + ' ' +
                               (raw.type || '') + ' ' +
                               (raw.source_type)).trim().replace(/[^a-zA-Z\d\s]/g, '').toLowerCase(),
            source          : raw.source || raw.data,
            type            : raw.type || 'other',
            data            : raw.data,
            ip              : raw.ip || null,
            token           : raw.token,
            scraped         : raw.scraped === "true" || raw.scraped === true ? true : false,
            enabled         : raw.type === 'other' ? false : true,
            source_type     : raw.source_type,
            height          : raw.height || null
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
 *  Add or update a user
 */
Database.prototype.addOrUpdateUserState = function(state, ip, token, done) {
    if (!state) {
	    return done(new Error('No state provided'));
    }

    try {
	    state = JSON.parse(state);

        var userObject =  {
            'token'     : token,
            'email'     : state.email || null,
            'ip'        : ip,
            'views'     : state.fetches,
            'visits'    : state.visits
        };
    } catch (err) {
        return done(err);
    }

    return Models.model['user'].findOneAndUpdate({'token' : state.token}, userObject, {upsert:true}, done);
};

/**
 * Close the connection
 */
Database.prototype.close = function() {
    db.close();
    console.log('Bye cruel world!');
};

module.exports = Database;
