var Mongoose    = require('mongoose');
var TimeStamp   = require('mongoose-times');
var Utils       = require('./utils.js');
var Async       = require('async');
var db          = Mongoose.connection;
var internals   = {};

//these keys will end up on the clien side
var keepTheseKeys   = {_id : 0, _hash : 1, data : 1, title : 1, type : 1, score : 1, _sort : 1, likes : 1, dislikes : 1, source : 1};

//enum schema types
var itemTypes       = ['youtube', 'img', 'gif', 'soundcloud', 'vimeo', 'vine', 'text', 'video', 'twitch', 'ted', 'instagram', 'sound', 'other'];

//adjectives, fetched on init.
var adjectives     = [];
var positives       = [];
var negatives       = [];

//hot and new items are stored in memory and vill have the structure [{_hash : {object....}}]
var hotItems    = [];
var hotSize     = 10;

var RatingModel,
    ItemModel,
    AdjectiveModel;

db.on('error', console.error.bind(console, 'connection error:'));

/**
 *  Constructor to DbWrapper, takes mongostring as parameter
 */
function DbWrapper(url, done) {
    var that = this;
    Mongoose.connect(url);
    
    //open it once!
    db.once('open', function() {
        //item schema
        var itemSchema = new Mongoose.Schema({
            _hash       : { type : String, unique : true },
            _sort       : { type : String },
            title       : { type : String },
            source      : { type : String },
            type        : { type: String, enum: itemTypes },
            data        : { type : Mongoose.Schema.Types.Mixed, required : 'Data is required.' },
            score       : { type : Number, default : 0 },
            likes       : { type : Number, default : 0 },
            dislikes    : { type : Number, default : 0 },
            ip          : { type : String, default : null },
            token       : { type : String, default : null },
            sfw         : { type : Boolean, default : true },
            scraped     : { type : Boolean, default : false },
            enabled     : { type : Boolean, default : true }
        }).plugin(TimeStamp);
        
        //item model
        ItemModel = Mongoose.model('Item', itemSchema);

        //rating schmea
        var ratingSchema = new Mongoose.Schema({
            _hash       : { type : String, required : true },
            value       : { type : Number, required : true },
            adjective   : { type: String },
            ip          : { type : String },
            token       : { type : String, required : true}
        }).plugin(TimeStamp);

        //rating model
        RatingModel = Mongoose.model('Rating', ratingSchema);
        
        //adjective schmea
        var adjectiveSchema = new Mongoose.Schema({
            positive    : { type : Boolean, required : true },
            expression  : { type : String, unique : true, lowercase : true}
        });

        //adjective model
        AdjectiveModel = Mongoose.model('Adjective', adjectiveSchema);
        
        AdjectiveModel.find({}, function(err, docs) {
            if (err) {
                throw err;
            }

            docs.forEach(function(item) {
                item = item.toObject();
                item.positive ? positives.push(item.expression) : negatives.push(item.expression);
                adjectives.push(item.expression);
            });
            
            console.log('Fetched all adjectives ' + JSON.stringify(adjectives, null, " "));
            return done();
        }); 
    });
};

/**
 *  Get item
 */
DbWrapper.prototype.getItem = function(hash, done) {
    ItemModel.findOne({_hash : hash}, keepTheseKeys, done);
};

/**
 *  Fetch items
 */
DbWrapper.prototype.getItems = function(amount, first, last, types, done) {
    if (types) {
        types = JSON.parse(types);
        types = types.length === 0 ? null : types;
    }
    
    var query, types = types || itemTypes;

    //if the client has not seen anything yet
    if (!last && !first) {
        query = ItemModel.find({enabled : true, type : {$in : types}}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //first is the sort time of the earliest item seen
    if (first && !last) {
        query = ItemModel.find({enabled : true, _sort : {$gt : first}, type : {$in : types}}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //last is the sort time of the latest item seen
    if (!first && last) {
        query = ItemModel.find({enabled : true, _sort : {$lt : last}, type : {$in : types}}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //outside of the seen window
    if (first && last) {
        query = ItemModel.find({ $or : [
			{enabled : true, _sort : {$lt : last}, type : {$in : types}},
			{enabled : true, _sort : {$gt : first}, type : {$in : types}}
		]}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
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
DbWrapper.prototype.createItem = function(raw, done) {
    if (!raw.data) {
        return done(new Error('No data provided at item.save'));
    }

    if (!raw.hash) {
        raw.hash = Utils.generateHash(raw);
    }

    ItemModel.findOne({_hash : raw.hash}, function(err, doc) {
        if (doc) {
            return done(new Error('Duplication error.'));
        }
 
        if (!raw.type) {
            raw.type = 'other';
        }

        var item = new ItemModel({
            _hash   : Utils.generateHash(raw.data),
            _sort   : Utils.generateSort(raw),
            title   : raw.title || '',
            source  : raw.source || raw.data,
            type    : raw.type || 'other',
            data    : raw.data,
            ip      : raw.ip || null,
            token   : raw.token,
            scraped : raw.scraped === "true" || raw.scraped === true ? true : false,
            enabled : raw.type === 'other' ? false : true
        });

        item.save(function(err, newDoc) {
            if (err) {
                return done(err);
            }

            if (newDoc.scraped === false) {
                internals.dealWithHotItems(newDoc.toObject());
            }

            return done(null, newDoc);
        });
    });
};

/**
 *  Votes a new value to an item
 */
DbWrapper.prototype.vote = function(session, hash, ip, value, adjective, done) {
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

    ItemModel.findOne({_hash  : hash}, function(err, docItem) {
        if (err) {
            return done(err);
        }

        if (!docItem) {
            return done(new Error('No item found for ' + hash));
        }

        //if this is an upvote, we want to change the sort time for better bouncing
        if (value > 0) {
            docItem._sort = Utils.generateSort(docItem.toObject());
            internals.dealWithHotItems(docItem.toObject());
        }
    
        var rating = new RatingModel({
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
 *  Get all votes for an item
 */
DbWrapper.prototype.getRatings = function(hash, done) {
    var query = RatingModel.find({_hash  : hash}, {_id : 0, ip : 0, __v : 0, adjective : 0}).sort({created : -1});
    query.exec(done);
}; 

/**
 * Get info about stuff
 */
DbWrapper.prototype.getInfo = function(done) {
    var info = {};

    Async.parallel([
        function(cb) {
            info.types = itemTypes;
            return cb();
        },
        function(cb) {
            ItemModel.aggregate([
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
        done(err, info);
    });
}; 

/**
 *  Get best ratings with amount
 */
DbWrapper.prototype.getBestRatings = function(amount, types, adjectives, done) {
    amount = amount > 25 ? 25 : amount;

    if (types) {
        types = JSON.parse(types);
        types = types.length === 0 ? null : types;
    }

    //if adjectives are not provided
    if (!adjectives) {
        var query, types = types || itemTypes;

        query = ItemModel.find({enabled : true, type : {$in : types}}, {_id : 0, _hash : 1}).sort({score : -1}).limit(amount);
        return query.exec(done);
    }

    //TODO ADD FETCH OF ADEJCTIVES
}; 


/**
 *  Get adjectives
 */
DbWrapper.prototype.getAdjectives = function(amount, done) {
    var result  = {'positives' : [], 'negatives' : []},
        tempP   = JSON.parse(JSON.stringify(positives)),
        tempN   = JSON.parse(JSON.stringify(negatives)),
        max     = Math.min(positives.length, negatives.length);

    if (amount > max) {
        amount = max;
    }

    while (amount > 0) {
        var pR = Math.floor(Math.random() * tempP.length),
            nR = Math.floor(Math.random() * tempN.length);
        
        result.positives.push(tempP.splice(pR, 1).join());
        result.negatives.push(tempN.splice(nR, 1).join());
        amount--;
    }

    return done(null, result);
};

/**
 *  Deal with the hot items
 */
internals.dealWithHotItems = function(item) {
    var exists = -1,
        newHot = {};

    for (var key in item) {
        if (keepTheseKeys[key] && keepTheseKeys[key] === 1) {}
        else {
            delete item[key];
        }
    }

    newHot[item._hash] = item;
    
    for (var i = 0; i < hotItems.length; i++) {
        if (hotItems[i][item._hash]) exists = i;
    }

    if (exists > -1) {
        //deletes it to add it to the top
        hotItems.splice(exists, 1);
    }
    
    hotItems.unshift(newHot);

    //make sure the size is right
    hotItems = hotItems.slice(0, hotSize);
    
    return hotItems;
};

/**
 * Close the connection
 */
DbWrapper.prototype.close = function() {
    db.close();
    console.log('Bye cruel world!');
};

module.exports = DbWrapper;
