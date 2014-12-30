/**
 *  Gerneate unique hash out of data field
 */
module.exports.generateHash = function(raw) {
    return require('crypto').createHash('md5').update(JSON.stringify(raw.data)).digest("hex");
};

/**
 *  Gerneate sort time for items
 */
module.exports.generateSort = function(raw) {
    var now  = Date.now(),
        aDay = 60 * 60 * 24;

    //if this item is scraped it should get a lower sort time
    if (raw.scraped === true) {
        now -= Math.floor((Math.random() * (aDay * 2)) - aDay);
    } else {
        now += Math.floor(Math.random() * aDay);
    }
        
    return now;
};


/**
 * Decides the type of the raw data recieved from client
 */
module.exports.decideType = function(raw) {
    if (!raw.data) {
        return 'other';
    }
    
    var youRex = new RegExp(/youtube|youtu\.be/gi);
    var gifRex = new RegExp(/\.gif$|\.gifv/gi);
    var imgRex = new RegExp(/\.jpg$|\.png$|\.jpeg$/gi);
    var vidRex = new RegExp(/\.mp4$|\.ogg$/gi);
    var sndRex = new RegExp(/soundcloud\.com/gi);
        
    if (youRex.test(raw.data)) {
        return 'youtube';
    } 
    
    if (gifRex.test(raw.data)){
        return 'gif';
    } 
    
    if (imgRex.test(raw.data)) {
        return 'img';
    }

    if (vidRex.test(raw.data)) {
        return 'video';
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
module.exports.convertData = function(raw) {
    if (!raw.type) {
        console.log('No type on ' + JSON.stringify(raw, null, " "));
        return ;
    }
    
    switch (raw.type) {
        case 'youtube':
            module.exports.peelYoutubeId(raw);
            break;
        default:
            
    }
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
