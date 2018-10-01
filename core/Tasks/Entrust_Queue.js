let amqp = require('amqplib');
let CodeUtils = require('../Base/Utils/CodeUtils');
let MailUtils = require('../Base/Utils/MailUtils');
let config = require('../Base/config');
let Cache = require('../Base/Data/Cache');
let Utils = require('../Base/Utils/Utils');

let CoinModel = require('../Model/CoinModel');
let EntrustModel = require('../Model/EntrustModel');

let io = require('socket.io-client');
let socket = io(config.socketDomain);

(async () => {
    try {
        let conn = await amqp.connect(config.MQ);
        let ch = await conn.createChannel();
        let coinExList = await CoinModel.getCoinExchangeList();
        coinExList.forEach(async (item) => {
            ch.prefetch(1);
            //消费队列
            ch.assertQueue(config.MQKey.Entrust_Queue + item.coin_exchange_id, {durable: true});
            ch.consume(config.MQKey.Entrust_Queue + item.coin_exchange_id, async (msg) => {
                try {
                    let params = JSON.parse(msg.content.toString());
                    console.log("<--" + params.entrust_id + ' ' + new Date());
                    let cache = await Cache.init(config.cacheDB.order);
                    //buy or sell entrust list
                    let ckey = (params.entrust_type_id == 1 ? config.cacheKey.Buy_Entrust : config.cacheKey.Sell_Entrust) + item.coin_exchange_id;
                    if (await cache.exists(ckey) && await cache.hexists(ckey, params.entrust_id)) {
                        await cache.hdel(ckey, params.entrust_id);
                    }
                    await cache.hset(ckey, params.entrust_id, params);
                    //entrust_ceid_userid
                    let uckey = config.cacheKey.Entrust_UserId + params.user_id;
                    if (await cache.exists(uckey) && await cache.hexists(uckey, params.entrust_id)) {
                        await cache.hdel(uckey, params.entrust_id);
                    }
                    await cache.hset(uckey, params.entrust_id, params);
                    cache.close();
                    socket.emit('entrustList', {coin_exchange_id: item.coin_exchange_id});
                    socket.emit('userEntrustList', {user_id: params.user_id, coin_exchange_id: item.coin_exchange_id});

                    this.sellList = await getSellEntrustList(item.coin_exchange_id);
                    this.buyList = await getBuyEntrustList(item.coin_exchange_id);
                    if (params.entrust_type_id == 1) {
                        if (this.sellList.length > 0) {
                            let sellItem = this.sellList[0];
                            //价格匹配
                            if (parseFloat(params.entrust_price) >= parseFloat(sellItem.entrust_price)) {
                                console.log(sellItem.entrust_id);
                                await matchOrder(params.entrust_id, params.entrust_type_id, sellItem);
                            }
                        }
                    } else {
                        if (this.buyList.length > 0) {
                            let buyItem = this.buyList[0];
                            //价格匹配
                            if (parseFloat(buyItem.entrust_price) >= parseFloat(params.entrust_price)) {
                                await matchOrder(params.entrust_id, params.entrust_type_id, buyItem);
                            }
                        }
                    }
                    ch.ack(msg);
                    console.log("-->" + params.entrust_id + ' ' + new Date());
                } catch (error) {
                    throw error;
                }
            }, {noAck: false})
        });
    } catch (error) {
        throw error;
    }
})();

function sortDESC(item1, item2) {
    if (parseFloat(item1.entrust_price) == parseFloat(item2.entrust_price)) {
        return item1.entrust_id - item2.entrust_id;
    }
    return parseFloat(item2.entrust_price) - parseFloat(item1.entrust_price);
}

function sortASC(item1, item2) {
    if (parseFloat(item1.entrust_price) == parseFloat(item2.entrust_price)) {
        return item1.entrust_id - item2.entrust_id;
    }
    return parseFloat(item1.entrust_price) - parseFloat(item2.entrust_price);
}

async function getSellEntrustList(coinExchangeId, refresh = false) {
    if (!this.sellList || this.sellList.length == 0 || refresh) {
        let arr = await EntrustModel.getSellEntrustListByCEId(coinExchangeId, refresh);
        this.sellList = arr.sort(sortASC);
    } else {
        let arr = await EntrustModel.getSellEntrustListByCEId(coinExchangeId);
        this.sellList = arr.sort(sortASC);
    }
    return this.sellList;
}

async function getBuyEntrustList(coinExchangeId, refresh = false) {
    if (!this.buyList || this.buyList.length == 0 || refresh) {
        let arr = await EntrustModel.getBuyEntrustListByCEId(coinExchangeId, refresh);
        this.buyList = arr.sort(sortDESC);
    } else {
        let arr = await EntrustModel.getBuyEntrustListByCEId(coinExchangeId);
        this.buyList = arr.sort(sortDESC);
    }
    return this.buyList;
}

async function matchOrder(entrustId, entrustTypeId, resItem) {
    let reqItem = await EntrustModel.getEntrustByEntrustId(entrustId, resItem.coin_exchange_id, entrustTypeId);
    if (reqItem && reqItem.entrust_type_id == 1) {
        //处理订单
        let res = await EntrustModel.processOrder(reqItem, resItem);
        if (res) {
            if (parseFloat(reqItem.no_completed_volume) > parseFloat(resItem.no_completed_volume)) {
                this.sellList = await getSellEntrustList(resItem.coin_exchange_id);
                if (this.sellList && this.sellList.length > 0) {
                    let sellItem = this.sellList[0];
                    if (sellItem && parseFloat(reqItem.entrust_price) >= parseFloat(sellItem.entrust_price)) {
                        await matchOrder(reqItem.entrust_id, reqItem.entrust_type_id, sellItem);
                    }
                }

            } else if (parseFloat(reqItem.no_completed_volume) < parseFloat(resItem.no_completed_volume)) {
                this.buyList = await getBuyEntrustList(reqItem.coin_exchange_id);
                if (this.buyList && this.buyList.length > 0) {
                    let buyItem = this.buyList[0];
                    if (buyItem && parseFloat(buyItem.entrust_price) >= parseFloat(resItem.entrust_price)) {
                        await matchOrder(resItem.entrust_id, resItem.entrust_type_id, buyItem);
                    }
                }
            } else {
            }
        }
    } else if (reqItem && reqItem.entrust_type_id == 0) {
        //处理订单
        let res = await EntrustModel.processOrder(reqItem, resItem);
        if (res) {
            if (parseFloat(reqItem.no_completed_volume) > parseFloat(resItem.no_completed_volume)) {
                this.buyList = await getBuyEntrustList(resItem.coin_exchange_id);
                if (this.buyList && this.buyList.length > 0) {
                    let buyItem = this.buyList[0];
                    if (buyItem && parseFloat(reqItem.entrust_price) <= parseFloat(buyItem.entrust_price)) {
                        await matchOrder(reqItem.entrust_id, reqItem.entrust_type_id, buyItem);
                    }
                }
            } else if (parseFloat(reqItem.no_completed_volume) < parseFloat(resItem.no_completed_volume)) {
                this.sellList = await getSellEntrustList(reqItem.coin_exchange_id);
                if (this.sellList && this.sellList.length > 0) {
                    let sellItem = this.sellList[0];
                    if (sellItem && parseFloat(sellItem.entrust_price) <= parseFloat(resItem.entrust_price)) {
                        await matchOrder(resItem.entrust_id, resItem.entrust_type_id, sellItem);
                    }
                }
            } else {
            }
        }
    }
    else {

    }
}