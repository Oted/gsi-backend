var Request     = require('request'),
    Uuid        = require('node-uuid'),
    Validator   = require('validator');

/**
 *  Shuffle list
 */
module.exports.shuffle = function(list) {
    var nItems  = list.length,
       counter = nItems,
       index,
       temp;

    while (counter > 0) {
        //pick a randum index and decrease counter
        index = Math.floor(Math.random() * counter--);

        //swap the elemets
        temp = list[counter];
        list[counter] = list[index];
        list[index] = temp;
    }

    return list;
};

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
 *  Hash the arrays and search into one unique hash,
 *  {
 *      search : '',
 *      authors : [],
 *      source_types : [],
 *      types : [],
 *      categories : []
 *  }
 */
module.exports.generateUniqueQueryString = function(requestQuery, types) {
    var str = Object.keys(requestQuery).sort(function(a, b) {
        return a > b;
    }).map((key) => {
        if (!key || key === 'first' || key === 'last') {
            return '';
        }

        if (Array.isArray(requestQuery[key])) {
            return requestQuery[key].sort(function(a,b) {
                return a > b;
            }).join(',').toLowerCase();
        }

        return requestQuery[key].toLowerCase();

    }).filter(function(str) {
        return str ? true : false;
    }).join('.').toLowerCase();

    return str;
};

/**
 * Generates a query based on the requestQuery
 *  {
 *      search : '',
 *      authors : [],
 *      source_types : [],
 *      types : [],
 *      categories : []
 *  }
 */
module.exports.generateQuery = function(requestQuery, types) {
    var query = {
        "sort" : {
            "_sort" : {
                "order" : "desc"
            }
        },
        "query": {
            "bool": {
                "must": [],
                "must_not": [],
                "should": [],
                "filter": {
                    "bool": {
                        "must": []
                    }
                }
            }
        },
        "_source": {
            "exclude": [
                "ip",
                "token",
                "scraped",
                "likes",
                "dislikes",
                "score"
            ]
        },
        "size": 20
    };

    Object.keys(requestQuery).forEach(function(key) {
        if (key === "search") {
            query.query.bool.filter.bool.must.push({
                "simple_query_string": {
                    "query": requestQuery[key].split(' ').map(text => {
                        return text ? '\"' + text.toLowerCase() + '\"' : '';
                    }).join(' '),
                    "analyzer": "snowball",
                    "fields": [
                        "title^5",
                        "source",
                        "author^2",
                        "category^2",
                        "source_type^3",
                        "type^1"
                    ],
                    "default_operator": "and"
                }
            })
        }

        if (key === "types") {
            query.query.bool.filter.bool.must.push({
                "terms": {
                    "type": (Array.isArray(requestQuery[key]) ? requestQuery[key] : [requestQuery[key]])
                }
            });
        }

        if (key === "source_types") {
            query.query.bool.filter.bool.must.push({
                "terms": {
                    "source_type": (Array.isArray(requestQuery[key]) ? requestQuery[key] : [requestQuery[key]])
                }
            });
        }

        if (key === "categories") {
            query.query.bool.filter.bool.must.push({
                "terms": {
                    "category": (Array.isArray(requestQuery[key]) ? requestQuery[key] : [requestQuery[key]])
                }
            });
        }

        if (key === "authors") {
            query.query.bool.filter.bool.must.push({
                "terms": {
                    "author": (Array.isArray(requestQuery[key]) ? requestQuery[key] : [requestQuery[key]])
                }
            });
        }

    });

    return query;
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
    return +(new Date());
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
    var gifRex      = new RegExp(/\.gif$|.gifv/gi);
    var imgRex      = new RegExp(/\.jpg$|\.png$|\.jpeg$/gi);
    var vidRex      = new RegExp(/\.mp4$|\.ogg$|\.webm$$/gi);
    var soundRex    = new RegExp(/\.mp3$|\.wav$/gi);
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
        regExp = /^.*(\&amp;v=|youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/,
        match = url.match(regExp);

    //if we had a match edit the raw data, else do nothing
    if (match && match[2].length == 11) {
        raw.data = match[2];
    } else {
        console.log('Could not extract youtube id from ' + url);
    }
};
