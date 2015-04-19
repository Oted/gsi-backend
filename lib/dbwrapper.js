var Mongoose    = require('mongoose');
var TimeStamp   = require('mongoose-times');
var Utils       = require('./utils.js');
var db          = Mongoose.connection;
var internals   = {};

//these keys will end up on the clien side
var keepTheseKeys   = {_id : 0, _hash : 1, data : 1, title : 1, type : 1, score : 1, _sort : 1};

//enum schema types
var itemTypes       = ['youtube', 'img', 'gif', 'gifv', 'soundcloud', 'vimeo', 'vine', 'text', 'video', 'instagram', 'sound', 'other'];

//addjectives, fetched on init.
var addjectives     = [];
var positives       = [];
var negatives       = [];

//hot and new items are stored in memory and vill have the structure [{_hash : {object....}}]
var hotItems    = [];
var hotSize     = 10;

var RatingModel,
    ItemModel,
    AddjectiveModel;

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
            _hash   : { type : String, unique : true },
            _sort   : { type : String },
            title   : { type : String },
            type    : { type: String, enum: itemTypes },
            data    : { type : Mongoose.Schema.Types.Mixed, required : 'Data is required.' },
            score   : { type : Number, default : 0 },
            ip      : { type : String },
            scraped : { type : Boolean, default : false },
            enabled : { type : Boolean, default : true }
        }).plugin(TimeStamp);
        
        //item model
        ItemModel = Mongoose.model('Item', itemSchema);

        //rating schmea
        var ratingSchema = new Mongoose.Schema({
            _hash       : { type : String, required : true },
            value       : { type : Number, required : true },
            addjective  : { type: String },
            ip          : { type : String }
        }).plugin(TimeStamp);

        //rating model
        RatingModel = Mongoose.model('Rating', ratingSchema);
        
        //addjective schmea
        var addjectiveSchema = new Mongoose.Schema({
            positive    : { type : Boolean, required : true },
            expression  : { type : String, unique : true, lowercase : true}
        });

        //addjective model
        AddjectiveModel = Mongoose.model('Addjective', addjectiveSchema);
        
        AddjectiveModel.find({}, function(err, docs) {
            if (err) {
                throw err;
            }

            docs.forEach(function(item) {
                item = item.toObject();
                item.positive ? positives.push(item.expression) : negatives.push(item.expression);
                addjectives.push(item.expression);
            });
            
            console.log('Fetched all addjectives ' + JSON.stringify(addjectives, null, " "));
            return done();
        }); 
    });
};

/**
 *  Fetches the sum of votes for an item
 */
DbWrapper.prototype.fetchVotesForItem = function(hash, done) {
    RatingModel.find({_hash : hash}, function(err, doc) {
        if (err) {
            return done(err);
        }

        var total = 0;

        doc.forEach(function(rating){
            total += rating.value;
        });

        return done(null, total);
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
DbWrapper.prototype.getItems = function(amount, first, last, done) {
    var query;


    //if the client has not seen anything yet
    if (!last && !first) {
        query = ItemModel.find({enabled : true}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //first is the sort time of the earliest item seen
    if (first && !last) {
        query = ItemModel.find({enabled : true, _sort : {$gt : first}}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //last is the sort time of the latest item seen
    if (!first && last) {
        query = ItemModel.find({enabled : true, _sort : {$lt : last}}, keepTheseKeys).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    }

    //outside of the seen window
    if (first && last) {
        query = ItemModel.find({ $or : [
			{enabled : true, _sort : {$lt : last}},
			{enabled : true, _sort : {$gt : first}}
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
            type    : raw.type || 'other',
            data    : raw.data,
            ip      : raw.ip || 'Unknown',
            scraped : raw.scraped === true ? true : false,
            enabled : raw.type === 'other' ? false : true
        });

        item.save(function(err, newDoc) {
            if (err) {
                return done(err);
            }

            internals.dealWithHotItems(newDoc.toObject());
            return done(null, newDoc);
        });
    });
};

/**
 *  Votes a new value to an item
 */
DbWrapper.prototype.vote = function(hash, ip, value, addjective, done) {
    if (!hash) {
        return done(new Error('Invalid hash'));
    }
    
    //if an addjective is provided control it
    if (addjective) {
        addjective = addjective.toLowerCase().trim();
        if (addjectives.indexOf(addjective) === -1) {
            return done(new Error('Invalid addjective ' + addjective + ' when voting for ' + hash));
        }
        
        if (value > 0 && positives.indexOf(addjective) === -1) {
            return done(new Error('Invalid positive addjective ' + addjective + ' when voting for ' + hash));
        }
        
        if (value < 0 && negatives.indexOf(addjective) === -1) {
            return done(new Error('Invalid negtive addjective ' + addjective + ' when voting for ' + hash));
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
            addjective  : addjective || null
        });
        
        rating.save(function(err, docRating) {
            if (err) {
                return done(err);
            }
           
            docItem.score += value;

            docItem.save(function(itemErr, newItem) {
                if (itemErr) {
                    return done(itemErr);
                }

                return done(null, docRating);
            });
        });
    });
};

/**
 *  Get all votes for an item
 */
DbWrapper.prototype.getRatings = function(hash, done) {
    var query = RatingModel.find({_hash  : hash}, {_id : 0, ip : 0, __v : 0, addjective : 0}).sort({created : -1});
    query.exec(done);
}; 

/**
 *  Get all votes for an item
 */
DbWrapper.prototype.getAddjectives = function(amount, done) {
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
