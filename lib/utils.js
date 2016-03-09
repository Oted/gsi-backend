var Request     = require('request'),
    Uuid        = require('node-uuid'),
    Validator   = require('validator');

/**
 *  Transform a query to be savable in the db also transforms back when back
 */
module.exports.transformQuery = function(query) {
    delete query._sort;
    var newQuery = query,
        search,
        source;

    var str = JSON.stringify(newQuery);

    if (str.indexOf('$') > -1) {
        //to db
        if (query.search) {
            search = query.search.toString().match(/\/(.*)\//)[1];
        }

        if (query.source) {
            source = query.source.toString().match(/\/(.*)\//)[1];
        }

        delete newQuery.search;
        delete newQuery.source;
        newQuery = JSON.parse(str.replace(/\$/g,'£'));
    } else if (str.indexOf('£') > -1) {
        //from db
        if (query.search) {
            search = new RegExp(query.search, 'gi');
        }

        if (query.source) {
            source = new RegExp(query.source, 'gi');
        }

        delete newQuery.search;
        delete newQuery.source;
        newQuery = JSON.parse(str.replace(/£/g,'$'));
    }

    if (search) {
        newQuery.search = search;
    }

    if (source) {
        newQuery.source = source;
    }

    return newQuery;
};

/**
 *  Gerneate unique hash out of data field
 */
module.exports.generateHash = function(string) {
    if (typeof string !== 'string') {
        string = JSON.stringify(string);
    }

    return require('crypto').createHash('md5').update(string).digest("hex");
};

/**
 *  Hash the arrays and search into one unique hash
 */
module.exports.generateQueryHash = function(search, types) {
    var t = (types || []).sort(function(a,b){return a > b}).join('').toLowerCase();

    var str = (search || '').toLowerCase() + t;

    return this.generateHash(str);
};

/**
 * Generates a query based on the search and types
 */
module.exports.generateQuery = function(search, types) {
    var q = {};

    q.enabled = true;

    q.search = new RegExp(search || '.*');

    if (types) {
        q.type = {$in : types};
    }

    return q;
};

/**
 *  Generate new user token
 */
module.exports.generateToken = function() {
   return Uuid.v1();
};

/**
 *  Gerneate sort time for items
 */
module.exports.generateSort = function(raw) {
    var now  = Date.now(),
        aDay = 1000 * 60 * 60 * 24;

    //if this item is scraped it should get a lower sort time
    // if (raw.scraped === true) {
        // now -= Math.floor((Math.random() * (aDay * 2)) - aDay);
    // } else {
        // now += Math.floor(Math.random() * aDay);
    // }

    return now;
};

/**
 * Decides the type of the raw data recieved from client
 */
module.exports.decideType = function(raw) {
    if (!raw.data) {
        return 'other';
    }

    var youRex      = new RegExp(/youtube|youtu\.be/gi);
    var vimeoRex    = new RegExp(/vimeo/gi);
    var vineRex     = new RegExp(/vine/gi);
    var gifRex      = new RegExp(/\.gif$|.gifv/gi);
    var imgRex      = new RegExp(/\.jpg$|\.png$|\.jpeg$/gi);
    var vidRex      = new RegExp(/\.mp4$|\.ogg$|\.webm$$/gi);
    var soundRex    = new RegExp(/\.mp3$|\.wav$/gi);
    var instaRex    = new RegExp(/instagram\.com/gi);
    var sndRex      = new RegExp(/soundcloud\.com/gi);
    var twitchRex   = new RegExp(/twitch\.tv/gi);

    if (twitchRex.test(raw.data)){
        return 'twitch';
    }

    if (gifRex.test(raw.data)){
        raw.data = raw.data.replace('.gifv', '.gif');
        return 'gif';
    }

    if (imgRex.test(raw.data)) {
        return 'img';
    }

    if (vidRex.test(raw.data)) {
        return 'video';
    }

    if (soundRex.test(raw.data)) {
        return 'sound';
    }

    if (youRex.test(raw.data)) {
        return 'youtube';
    }

    if (imgRex.test(raw.data)) {
        return 'instagram';
    }

    if (vimeoRex.test(raw.data)) {
        return 'vimeo';
    }

    if (vineRex.test(raw.data)) {
        return 'vine';
    }

    if (sndRex.test(raw.data)) {
        return 'soundcloud';
    }

    return 'other';
};


/**
 * Decides the type of the raw data recieved from client
 */
module.exports.decideSourceType = function(raw) {
    var s = raw.source || raw.data || '';

    var youRex      = new RegExp(/youtube\.com|youtu\.be/gi);
    var vimeoRex    = new RegExp(/vimeo\.com/gi);
    var vineRex     = new RegExp(/vine\.com|vine\.co/gi);
    var imgurRex    = new RegExp(/imgur\.com/gi);
    var soundRex    = new RegExp(/soundcloud\.com/gi);
    var giphyRex    = new RegExp(/giphy\.com/gi);
    var instaRex    = new RegExp(/instagram\.com/gi);
    var twitchRex   = new RegExp(/twitch\.tv|twitch\.com/gi);
    var gagRex      = new RegExp(/9gag\.com/gi);
    var redditRex   = new RegExp(/reddit\.com/gi);
    var deviantRex  = new RegExp(/deviantart\.com/gi);
    var junkRex	    = new RegExp(/funnyjunk\.com/gi);

    if (junkRex.test(s)) {
        return 'funnyjunk';
    }

    if (twitchRex.test(s)) {
        return 'twitch';
    }

    if (youRex.test(s)) {
        return 'youtube';
    }

    if (vineRex.test(s)) {
        return 'vine';
    }

    if (imgurRex.test(s)) {
        return 'imgur';
    }

    if (instaRex.test(s)) {
        return 'instagram';
    }

    if (vimeoRex.test(s)) {
        return 'vimeo';
    }

    if (giphyRex.test(s)) {
        return 'giphy';
    }

    if (soundRex.test(s)) {
        return 'soundcloud';
    }

    if (redditRex.test(s)) {
        return 'reddit';
    }

    if (gagRex.test(s)) {
        return '9gag';
    }

    if (deviantRex.test(s)) {
        return 'deviant';
    }

    return 'other';
};

/**
 *  Expects type to be set,
 *  converts the data to the correct format
 */
module.exports.convertData = function(raw, done) {
    if (!raw.type) {
        console.log('No type on ' + JSON.stringify(raw, null, " "));
        return done();
    }

    if (!raw.data) {
        console.log('No data on ' + JSON.stringify(raw, null, " "));
        return done();
    }

    switch (raw.type) {
        case 'img' :
            raw.data.replace(/^(http:\/\/)+/, 'http://');
            raw.data.replace(/^http:\/\/https:\/\//, 'http://');

            if (!raw.data.match(/^http:\/\/|https:\/\//)) {
                raw.data = 'http://' + raw.data;
            }
            return done();

        case 'video':
            if (!raw.data.match(/^http:\/\/|https:\/\//)) {
                raw.data = 'http://' + raw.data;
            }
            return done();

        case 'gif':
            raw.data.replace(/^(http:\/\/)+/, 'http://');
            raw.data.replace(/^http:\/\/https:\/\//, 'http://');

            if (!raw.data.match(/^http:\/\/|https:\/\//)) {
                raw.data = 'http://' + raw.data;
            }
            return done();

        case 'youtube':
            done(module.exports.peelYoutubeId(raw));
            break;

        default:
            return done();
    }
};


/**
 *  Get data of soundcloud url
 */
module.exports.getSoundcloudData = function(url, done) {
    Request('http://api.soundcloud.com/resolve.json?url=' + url + '&client_id=e6c07f810cdefc825605d23078c77e8d', done);
};


/**
 *  Gets the id of the youtube video
 */
module.exports.peelYoutubeId = function(raw) {
    var url = unescape(raw.data),
        regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/,
        match = url.match(regExp);

    //if we had a match edit the raw data, else do nothing
    if (match && match[2].length == 11) {
        raw.data = match[2];
    } else {
        console.log('Cound not extract youtube id from ' + url);
    }
};
