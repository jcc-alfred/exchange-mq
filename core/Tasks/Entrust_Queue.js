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
                    socket.emit('entrustList', {coin_exchange_id: item.coin_exchange_id});
                    socket.emit('userEntrustList', {user_id: params.user_id, coin_exchange_id: item.coin_exchange_id});
                    let result = await matchOrder(params);
                    if (!result) {
                        console.log("send back to mq " + params.entrust_id);
                        ch.nack(msg);
                        return
                        // throw new Error("send back to mq "+params.entrust_id);
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

async function getSellEntrustList(coinExchangeId, refresh = true) {
    let sellList = [];
    if (refresh) {
        let arr = await EntrustModel.getSellEntrustListByCEId(coinExchangeId, refresh);
        sellList = arr.sort(sortASC);
    } else {
        let arr = await EntrustModel.getSellEntrustListByCEId(coinExchangeId);
        sellList = arr.sort(sortASC);
    }
    return sellList;
}

async function getBuyEntrustList(coinExchangeId, refresh = true) {
    let buyList = [];
    if (refresh) {
        let arr = await EntrustModel.getBuyEntrustListByCEId(coinExchangeId, refresh);
        buyList = arr.sort(sortDESC);
    } else {
        let arr = await EntrustModel.getBuyEntrustListByCEId(coinExchangeId);
        buyList = arr.sort(sortDESC);
    }
    return buyList;
}


async function matchOrder(entrust) {
    try {
        if (!entrust.entrust_id) {
            return true
        }
        let result = await EntrustModel.updatEntrustCache(entrust);
        if (result.status == 0) {
            console.log("DB cannot find the entrust " + entrust.entrust_id);
            //数据库找不到这条entrust，先放回MQ
            return false
        } else if (result.status == 1) {
            //数据库记录 状态为不可交易，！=0，1
            console.log("Entrust " + entrust.entrust_id + " already finished");
            return true
        }
        let entrustItem = result.data;
        if (entrustItem.entrust_type_id == 1) {
            let sellList = await getSellEntrustList(entrustItem.coin_exchange_id);
            if (sellList.length > 0) {
                let sellItem = sellList[0];
                //价格匹配
                if (entrustItem.entrust_price >= sellItem.entrust_price) {
                    let nextOrder = await EntrustModel.processOrder(entrustItem, sellItem);
                    if (nextOrder) {
                        await matchOrder(nextOrder);
                    } else {
                        await matchOrder(entrust);
                    }
                }
            }
        } else {
            let buyList = await getBuyEntrustList(entrustItem.coin_exchange_id);
            if (buyList.length > 0) {
                let buyItem = buyList[0];
                //价格匹配
                if (buyItem.entrust_price >= entrustItem.entrust_price) {
                    let nextOrder = await EntrustModel.processOrder(buyItem, entrustItem);
                    if (nextOrder) {
                        await matchOrder(nextOrder);
                    } else {
                        await matchOrder(entrust);
                    }
                }
            }
        }
        return true;
    } catch (e) {
        throw e;
    }
    

}

