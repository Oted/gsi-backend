var Mongoose    = require('mongoose');
var TimeStamp   = require('mongoose-times');
var Utils       = require('./utils.js');
var db          = Mongoose.connection;

var RatingModel,
    ItemModel;

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
            _sort   : { type : String},
            title   : { type : String },
            type    : { type: String, enum: ['youtube', 'img', 'gif', 'soundcloud', 'text', 'video', 'other'] },
            data    : { type : Mongoose.Schema.Types.Mixed, required : 'Data is required.' },
            score   : { type : Number, default : 0 },
            ip      : { type : String },
            scraped : { type : Boolean, default : false},
            enabled : { type : Boolean, default : true }
        }).plugin(TimeStamp);
        
        //item model
        ItemModel = Mongoose.model('Item', itemSchema);

        //rating schmea
        var ratingSchema = new Mongoose.Schema({
            _hash : { type : String, required : true},
            value : { type : Number, required : true},
            ip    : { type : String }
        }).plugin(TimeStamp);

        //intem model
        RatingModel = Mongoose.model('Rating', ratingSchema);

        /**
         *  Pre save, adds the unique hash and fetch the count
         */
        itemSchema.pre('save', function(next) {
            var self = this;
            this._hash  = Utils.generateHash(this.toObject());

            that.fetchVotesForItem(this._hash, function(err, score) {
                if (err) {
                    return done(err);
                }

                self.score = score;
                next();
            });
        });
    
        return done();
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
 *  Fetch items
 */
DbWrapper.prototype.getItems = function(amount, done) {
    var query = ItemModel.find({}, {_id : 0, _hash : 1, data : 1, title : 1, type : 1, score : 1}).sort({_sort : -1}).limit(amount > 99 ? 99 : amount);
    query.exec(done);
};

/**
 *  Creates a new item, expects
 */
DbWrapper.prototype.createItem = function(raw, done) {
    if (!raw.data) {
        return done(new Error('No data provided at item.save'));
    }

    if (!raw.hash) {
        raw.hash = Utils.generateHash(raw);
    }

    ItemModel.findOne({_hash : raw.hash}, function(err, doc){
        if (doc) {
            return done(new Error('Duplication error.'));
        }
 
        var item = new ItemModel({
            _sort   : Utils.generateSort(raw),
            title   : raw.title || '',
            type    : raw.type || 'other',
            data    : raw.data,
            ip      : raw.ip || 'Unknown',
            scraped : raw.scraped === true ? true : false
        });

        item.save(done);
    });
};

/**
 *  Votes a new value to an item
 */
DbWrapper.prototype.vote = function(hash, ip, value, done) {
    var query = ItemModel.findOne({_hash  : hash}, function(err, docItem){
        if (err) {
            return done(err);
        }

        if (!docItem) {
            return done(new Error('No item found for ' + hash));
        }

        //if this is an upvote, we want to change the sort time for better bouncing
        if (value > 0) {
            docItem._sort = Utils.generateSort(docItem.toObject());
        } else {
            docItem._sort -= Math.floor(Math.random() * (60 * 60 * 24)); 
        }
    
        var rating = new RatingModel({
            _hash   : hash,
            value   : value,
            ip      : ip
        });
        
        rating.save(function(err, docRating) {
            if (err) {
                return done(err);
            }
            
            //kind of unefficient, making use of pre('save) on Item to update votes
            docItem.save();
            return done(null, docRating);
        });
    });
};


/**
 * Close the connection
 */
DbWrapper.prototype.close = function() {
    db.close();
    console.log('Bye cruel world!');
};

module.exports = DbWrapper;
