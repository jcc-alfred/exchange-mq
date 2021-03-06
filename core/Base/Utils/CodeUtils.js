let Cache = require('../Data/Cache');
let config = require('../config');

let CodeUtils = {
    async codeIsCanReSend(username){
        let cache = await Cache.init(config.cacheDB.users);
        let ckey = config.cacheKey.User_Code+username.toLocaleLowerCase();
        let data = await cache.get(ckey);
      
        cache.close();
        if(!data){
            return true
        }
        if( (Date.now()/1000 - data.sendTime) < config.sys.codeSendIntervalTime){
            return false
        }
        return true
    },

    async codeQuals(username,code){

        let cache = await Cache.init(15);
        let ckey = config.cacheKey.User_Code+username.toLocaleLowerCase();
        let data = await cache.get(ckey) || {};
        cache.close();
        return  data.code == code ? true : false;
    },

    async delCode(username){
        let cache = await Cache.init(15);
        let ckey = config.cacheKey.User_Code+username.toLocaleLowerCase();
        await cache.del(ckey);
        cache.close()
    },

    makeCode(places){
        var random = '';
        for(var i=0;i<places;i++) { 
            random += Math.floor(Math.random()*10); 
        }
        return random;
    },
}

module.exports = CodeUtils;