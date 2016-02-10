var Utils       = require('./utils.js');
var Async       = require('async');

var Cache,
    Models;
   
var internals = {
    'onboarding' : require('../onboarding.json')
};

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
Database.prototype.getItem = function(hash, done) {
    if (Cache.get('item.' + hash)) {
        console.log('returning Cache for getItem : item.' + hash);
        return done(null, Cache.get('item.' + hash));
    };

    return Models.model['item'].findOne({_hash : hash}, done);
};

/**
 *  Fetch items
 */
Database.prototype.getItems = function(amount, first, last, types, done) {
    if (Cache.get('items.' + amount + '.' + first + '.' + last + '.' + types)) {
        console.log('returning Cache for getItems : items.' + amount + '.' + first + '.' + last + '.' + types);
        return done(null, Cache.get('items.' + amount + '.' + first + '.' + last + '.' + types));
    };

    if (types) {
        types = JSON.parse(types);
        types = types.length === 0 ? null : types;
    }
    
    var query, types = types || Models.getItemTypes();

    //if the client has not seen anything yet
    if (!last && !first) {
        query = Models.model['item'].find({enabled : true, type : {$in : types}}).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //first is the sort time of the earliest item seen
    if (first && !last) {
        query = Models.model['item'].find({enabled : true, _sort : {$gt : first}, type : {$in : types}}).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //last is the sort time of the latest item seen
    if (!first && last) {
        query = Models.model['item'].find({enabled : true, _sort : {$lt : last}, type : {$in : types}}).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //outside of the seen window
    if (first && last) {
        query = Models.model['item'].find({ $or : [
			{enabled : true, _sort : {$lt : last}, type : {$in : types}},
			{enabled : true, _sort : {$gt : first}, type : {$in : types}}
		]}).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }
    
    query.exec(function(err, docs) {
        if (err) {
            return done(err);
        }
        
        //add the popular stuf here ?
        return done(null, docs);
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
            _hash       : Utils.generateHash(raw.data),
            _sort       : Utils.generateSort(raw),
            title       : raw.title || '',
            source      : raw.source || raw.data,
            type        : raw.type || 'other',
            data        : raw.data,
            ip          : raw.ip || null,
            token       : raw.token,
            scraped     : raw.scraped === "true" || raw.scraped === true ? true : false,
            enabled     : raw.type === 'other' ? false : true,
            source_type : raw.source_type
        });

        item.save(function(err, newDoc) {
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

    if (value > 60000) {
        value = 60000;
    }
  
    var rating = new Models.model['rating']({
        _hash       : hash,
        value       : 0,
        ip          : ip,
        adjective   : null,
        token       : token
    });
        
    rating.save(function(err, docRating) {
        if (err) {
            return done(err);
        }

        Models.model['item'].findOneAndUpdate({_hash  : hash}, {$inc: {view_time : value}}, function(err, docItem) {
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

    info = {
        'onboarding' : internals.onboarding || []
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
        },
        function(cb) {
            info.adjectives = {
                "positives" : positives,
                "negatives" : negatives
            }

            return cb(); 
        }
    ], function(err, res) {
        if (err) {
            return done(err);
        }

        return done(err, info);
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
            'likes'     : state.interactions.upvotes,
            'dislikes'  : state.interactions.downvotes,
            'fetches'   : state.fetches,
            'visits'    : state.visits,
            'filters'   : state._filters
        };
    } catch (err) {
        return done(err);
    }

    return Models.model['user'].findOneAndUpdate({'token' : state.token}, userObject, {upsert:true}, done);  
};

/**
 *  Get best ratings with amount
 */
Database.prototype.getBestRatings = function(amount, types, adjectives, done) {
    amount = amount > 25 ? 25 : amount;

    if (types) {
        types = JSON.parse(types);
        types = types.length === 0 ? null : types;
    }

    //if adjectives are not provided
    if (!adjectives) {
        var query, types = types || Models.getItemTypes();

        query = Models.model['item'].find({enabled : true, type : {$in : types}}).sort({score : -1}).limit(amount);
        return query.exec(done);
    }
}; 

/**
 * Close the connection
 */
Database.prototype.close = function() {
    db.close();
    console.log('Bye cruel world!');
};

module.exports = Database;
