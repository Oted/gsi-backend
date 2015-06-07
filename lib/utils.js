var Request     = require('request'),
    Uuid        = require('node-uuid'),
    Validator   = require('validator');

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
    var tedRex      = new RegExp(/ted\.com/gi);
   
    if (twitchRex.test(raw.data)){
        return 'twitch';
    }
   
    if (tedRex.test(raw.data)){
        return 'ted';
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

            if (raw.data.indexOf('http://') !== 0) {
                raw.data = 'http://' + raw.data;
            }
            return done();

        case 'gif':
            raw.data.replace(/^(http:\/\/)+/, 'http://');
            raw.data.replace(/^http:\/\/https:\/\//, 'http://');
            
            if (raw.data.indexOf('http://') !== 0) {
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
    var url = raw.data,
        regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/,
        match = url.match(regExp);
    
    //if we had a match edit the raw data, else do nothing
    if (match && match[2].length == 11) {
        raw.data = match[2];
    } else {
        console.log('Cound not extract youtube id from ' + url);
    }
};
