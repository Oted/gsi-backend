Messapp-backend api
=================
#####Good to know : 
```json 
{
    "item_types"                : ["youtube", "img", "gif", "gifv", "soundcloud", "vimeo", "vine", "text", "video", "instagram", "sound", "other"],
    "example_addjective_types"  : ["arty", "funny", "inspiring", "creepy", "beautiful", "cute", "crazy", "offensive", "boring", "uggly", "disturbing"]
}
```

###- **[<code>GET</code> api/items]**
#####Get items from the database sorted on their _sort time
```json 
{
    "query": {
        "amount" : "optional, defaults to 20, max(99)",
        "last" : "optional, get items with a sort time greater",
        "first" : "optional, get items with a sort time less than"
    },
    "response": [{
        "_hash": "c0e7ec652aedac7b8b79d9555a77ada3",
        "_sort": "1420465320873",
        "title": "Tornadoes: Some people just don't give a shit.",
        "type": "gif",
        "data": "i.imgur.com/mdsO8zd.gif",
        "score": -7
    }]
}
```
###- **[<code>POST</code> api/items]**
#####Post a new item to the server, use only type if you are sure of it!
```json 
{
    "params": {
        "data" : "required, usually the link of an item",
        "title" : "preferred but not required, the title of the item",
        "type" : "optional, the type of the item, see the lib/dbWrapper for the types available",
        "scraped" : "optional, true or false"
    }
}
```
###- **[<code>GET</code> api/item]**
#####Get an item together with its ratings
```json 
{
    "query": {
        "hash" : "required, the _hash of the item"
    },
    "response": {
        "item" : {
            "_hash": "c0e7ec652aedac7b8b79d9555a77ada3",
            "_sort": "1420465320873",
            "title": "Tornadoes: Some people just don't give a shit.",
            "type": "gif",
            "data": "i.imgur.com/mdsO8zd.gif",
            "score": -7
        },
        "ratings" : [{
            "lastUpdated": "2015-01-05T14:55:42.100Z",
            "created": "2015-01-05T14:55:42.100Z",
            "_hash": "c0e7ec652aedac7b8b79d9555a77ada3",
            "value": -1,
            "expression": "creepy"
        }]
    }
}
```
###- **[<code>GET</code> api/ratings]**
#####Get all ratings for a specific items _hash
```json 
{
    "query": {
        "hash" : "required, the _hash of the item"
    },
    "response": {
        "ratings" : [{
            "lastUpdated": "2015-01-05T14:55:42.100Z",
            "created": "2015-01-05T14:55:42.100Z",
            "_hash": "c0e7ec652aedac7b8b79d9555a77ada3",
            "value": -1,
            "expression": "creepy"
        }]
    }
}
```
###- **[<code>POST</code> api/upvote/{hash}]**
#####Create a new rating with a +1 value, addjective is optional
```json 
{
    "params": {
        "hash" : "required, the _hash of the item"
    },
    "query" : {
        "addjective" : "optional, the addjective of the item, should be one of the queried in GET api/addjectives"
    }
}
```
###- **[<code>POST</code> api/novote/{hash}]**
#####Create a new rating with a 0 value, addjective is optional
```json 
{
    "params": {
        "hash" : "required, the _hash of the item"
    },
    "query" : {
        "addjective" : "optional, the addjective of the item, should be one of the queried in GET api/addjectives"
    }
}
```
###- **[<code>POST</code> api/downvote/{hash}]**
#####Create a new rating with a -1 value, addjective is optional
```json 
{
    "params": {
        "hash" : "required, the _hash of the item"
    },
    "query" : {
        "addjective" : "optional, the addjective of the item, should be one of the queried in GET api/addjectives"
    }
}
```
###- **[<code>GET</code> api/addjectives]**
#####Get an object of equally many shuffeld positive as nagative addjectives that can be used when voting
```json
{
    "query" : {
        "amount" : "optional, amount of positives and negatives"
    },
    "ex.result" : {
        "positives": [
            "inspiring",
            "beautiful",
            "creative"
        ],
        "negatives": [
            "boring",
            "disturbing",
            "annoying"
        ]
    }
}
```
