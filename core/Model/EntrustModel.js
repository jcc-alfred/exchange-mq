let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');

let AssetsModel = require('../Model/AssetsModel');
let AssetsLogModel = require('../Model/AssetsLogModel');
let CoinModel = require('../Model/CoinModel');

let io = require('socket.io-client');
let socket = io(config.socketDomain);

class EntrustModel {

    constructor() {

    }

    async getEntrustListByUserId(userId, refresh = false) {
        try {

            let cache = await Cache.init(config.cacheDB.order);
            let ckey = config.cacheKey.Entrust_UserId + userId;
            if (await cache.exists(ckey) && !refresh) {
                let cRes = await cache.hgetall(ckey);
                if (cRes) {
                    let data = [];
                    for (let i in cRes) {
                        let item = cRes[i];
                        data.push(JSON.parse(item));
                    }
                    return data;
                }
            }
            let cnt = await DB.cluster('slave');
            let sql = `SELECT * FROM m_entrust WHERE user_id = ? and (entrust_status = 0 or entrust_status = 1) `;
            let res = await cnt.execQuery(sql, userId);
            cnt.close();

            let chRes = await Promise.all(res.map((info) => {
                return cache.hset(
                    ckey,
                    info.entrust_id,
                    info,
                    6000
                )
            }));

            cache.close();

            return res;

        } catch (error) {
            throw error;
        }
    }

    async getEntrustByEntrustId(entrustId, coinExchangeId, entrustTypeId, refresh = false) {
        let cache = await Cache.init(config.cacheDB.order);
        try {
            let ckey = (entrustTypeId == 1 ? config.cacheKey.Buy_Entrust : config.cacheKey.Sell_Entrust) + coinExchangeId;
            if (await cache.exists(ckey) && !refresh) {
                let cRes = await cache.hgetall(ckey);
                if (Object.keys(cRes) && await Object.keys(cRes).includes(entrustId.toString())) {
                    return JSON.parse(cRes[entrustId])
                }
            }
            let cnt = await DB.cluster('salve');
            let sql = `select * from m_entrust where entrust_id = ? and (entrust_status = 0 or entrust_status = 1)`;
            let res = await cnt.execReader(sql, [entrustId]);
            cnt.close();
            if (res) {
                await cache.hset(ckey, res.entrust_id, res, 300);
                //let cRes = await cache.hgetall(ckey);
            }
            return res;

        } catch (error) {
            throw error;
        }
        finally {
            cache.close();
        }

    }

    async getBuyEntrustListByCEId(coinExchangeId) {
        let cnt = await DB.cluster('slave');
        try {
            let sql = `SELECT * FROM m_entrust WHERE coin_exchange_id = ? and entrust_type_id = 1 and entrust_status in (0,1) ORDER BY entrust_price DESC, entrust_id ASC LIMIT 20`;
            let res = await cnt.execQuery(sql, coinExchangeId);
            return res;
        } catch (error) {
            throw error;
        } finally {
            cnt.close();
        }
    }

    async getSellEntrustListByCEId(coinExchangeId) {
        let cnt = await DB.cluster('slave');
        try {
            let sql = `SELECT * FROM m_entrust WHERE coin_exchange_id = ? and entrust_type_id = 0 and entrust_status in (0,1) ORDER BY entrust_price ASC, entrust_id ASC LIMIT 20`;
            let res = await cnt.execQuery(sql, coinExchangeId);
            return res;
        } catch (error) {
            throw error;
        } finally {
            cnt.close();
        }
    }

    async deleteEntrust(ckey, field) {
        let cache = await Cache.init(config.cacheDB.order);
        try {
            if (await cache.exists(ckey) && await cache.hexists(ckey, field)) {
                await cache.hdel(ckey, field);
            }
        } catch (e) {
            throw e;
        } finally {
            cache.close();
        }
    }

    async updateEntrust(ckey, field, value) {
        let cache = await Cache.init(config.cacheDB.order);
        if (await cache.exists(ckey) && await cache.hexists(ckey, field)) {
            await cache.hset(ckey, field, value);
        }
        cache.close();
    }

    async addOrder(params) {
        let cache = await Cache.init(config.cacheDB.order);
        let cacheKline = await Cache.init(config.cacheDB.kline);
        try {
            let ckey = config.cacheKey.Order_Coin_Exchange_Id + params.coin_exchange_id;
            if (await cache.exists(ckey)) {
                // await cache.hdel(ckey, params.order_id);
                await cache.hset(ckey, params.order_id, params);
            }
            // socket.emit('orderList', {coin_exchange_id: params.coin_exchange_id});

            let timeObj = {
                '1d': 86400000,
                '12h': 43200000,
                '6h': 21600000,
                '4h': 14400000,
                '1h': 3600000,
                '30m': 1800000,
                '15m': 900000,
                '5m': 300000,
                '1m': 60000
            };
            let sArr = [60000, 3600000, 86400000];//1m 1h 1d
            let minArr = [300000, 900000, 1800000];//5 15 30
            let hourArr = [14400000, 21600000, 43200000];//4 6 12
            await Promise.all(Object.values(timeObj).map(async (range) => {
                let ckeyKline = config.cacheKey.KlineData_CEID_Range + params.coin_exchange_id + '_' + range;
                // if (await cacheKline.exists(ckeyKline)) {
                    let createTime = new Date(params.create_time);
                    let newTime = createTime;
                    let timestamp = 0;
                    if (sArr.includes(range)) {
                        let dateFormatStr = "yyyy-MM-dd HH:mm:00";//1m
                        if (range == 60000) {
                            dateFormatStr = "yyyy-MM-dd HH:mm:00";//1m
                        } else if (range == 3600000) {
                            dateFormatStr = "yyyy-MM-dd HH:00:00";//1h
                        } else {
                            dateFormatStr = "yyyy-MM-dd 00:00:00";//1d
                        }
                        newTime = new Date(new Date(createTime.Format(dateFormatStr)).getTime());
                        timestamp = Math.round(newTime.getTime() / 1000);
                    }
                    else if (minArr.includes(range)) {
                        let i = 5;
                        if (range == 300000) {//5m
                            i = 5;
                        } else if (range == 900000) {//15
                            i = 15;
                        } else if (range == 1800000) {//30
                            i = 30;
                        }
                        var m = parseInt(createTime.getMinutes() / i) * i;
                        newTime = new Date(new Date(createTime.Format('yyyy-MM-dd HH:00:00')).getTime() + 60000 * m);
                        timestamp = Math.round(newTime.getTime() / 1000);

                    } else if (hourArr.includes(range)) {
                        let i = 4;
                        if (range == 14400000) {//4h
                            i = 4;
                        } else if (range == 21600000) {//6h
                            i = 6;
                        } else if (range == 43200000) {//12h
                            i = 12;
                        }
                        var h = parseInt(createTime.getHours() / i) * i;
                        newTime = new Date(new Date(createTime.Format('yyyy-MM-dd HH:00:00')).getTime() + 3600000 * h);
                        timestamp = Math.round(newTime.getTime() / 1000);
                    }
                    let datestamp = newTime.Format("yyyy-MM-dd HH:mm:ss");
                    let newObj = {};
                    newObj.timestamp = timestamp;
                    newObj.datestamp = datestamp;
                    newObj.close_price = parseFloat(params.trade_price);
                    if (await cacheKline.exists(ckeyKline) && await cacheKline.hexists(ckeyKline, timestamp)) {
                        let obj = await cacheKline.hget(ckeyKline, timestamp);
                        newObj.open_price = parseFloat(obj.open_price);
                        newObj.high_price = parseFloat(params.trade_price) > parseFloat(obj.high_price) ? parseFloat(params.trade_price) : parseFloat(obj.high_price);
                        newObj.low_price = parseFloat(params.trade_price) < parseFloat(obj.low_price) ? parseFloat(params.trade_price) : parseFloat(obj.low_price);
                        newObj.volume = Utils.add(parseFloat(obj.volume), params.trade_volume);
                    } else {
                        newObj.open_price = parseFloat(params.trade_price);
                        newObj.high_price = parseFloat(params.trade_price);
                        newObj.low_price = parseFloat(params.trade_price);
                        newObj.volume = parseFloat(params.trade_volume);
                    }
                    await this.addKline(ckeyKline, newObj);
                // }
            }));
            // socket.emit('kline', {coin_exchange_id: params.coin_exchange_id});
        } catch (e) {
            throw e;
        } finally {
            cache.close();
            cacheKline.close();
        }

    }

    async addKline(coin_exchange_id_range, {timestamp, datestamp, close_price, open_price, high_price, low_price, volume}) {
        let cnt = await DB.cluster('master');
        try {
            await cnt.insertOnDuplicate('m_kline', {
                coin_exchange_id_range,
                timestamp,
                datestamp,
                close_price,
                open_price,
                high_price,
                low_price,
                volume
            });
        } catch (e) {
            throw e;
        } finally {
            cnt.close();
        }
    }

    async updatEntrustCache(entrust) {
        // res =0   entrust在数据库不存在，有可能是幻读
        // res= 1   entrust在数据库中存在，但状态不是，部分完成，未完成
        // res=2    entrust存在，数据库状态为可以交易，并且已经更新缓存
        let cache = await Cache.init(config.cacheDB.order);
        let cnt = await DB.cluster('master');
        try {
            let sql1 = `select * from m_entrust where entrust_id = ?`;
            let result = await cnt.execQuery(sql1, entrust.entrust_id);
            if (result.length < 1) {
                return {status: 0, data: {}}
            } else {
                let params = result.find(item => item.entrust_status == 0 || item.entrust_status == 1);
                let ckey = (entrust.entrust_type_id == 1 ? config.cacheKey.Buy_Entrust : config.cacheKey.Sell_Entrust) + entrust.coin_exchange_id;
                if (await cache.exists(ckey) && await cache.hexists(ckey, entrust.entrust_id)) {
                    await cache.hdel(ckey, entrust.entrust_id);
                }
                //entrust_ceid_userid
                let uckey = config.cacheKey.Entrust_UserId + entrust.user_id;
                if (await cache.exists(uckey) && await cache.hexists(uckey, entrust.entrust_id)) {
                    await cache.hdel(uckey, entrust.entrust_id);
                }
                if (params) {
                    if (await cache.exists(uckey)) {
                        await cache.hset(uckey, entrust.entrust_id, params);
                    }
                    if (await cache.exists(ckey)) {
                        await cache.hset(ckey, entrust.entrust_id, params);
                    }
                    return {status: 2, data: params}
                } else {
                    return {status: 1, data: {}}
                }
            }
        } catch (e) {
            console.error(e);
            throw e;
        } finally {
            cache.close();
            cnt.close();
        }
    }

    async processOrder(reqItem, resItem, trigger_type_id) {
        // asume reqItem -->BuyItem
        //  resItem -->SellItem
        if (reqItem.entrust_type_id == 0) {
            let res = await this.processOrder(resItem, reqItem, trigger_type_id);
            return res;
        }
        console.log("start process buyitem-->" + reqItem.entrust_id + "  sellitem-->" + resItem.entrust_id);
        let reqEntrustStatus = 0;
        let reqEntrustStatusName = '待成交';
        let resEntrustStatus = 0;
        let resEntrustStatusName = '待成交';
        let tradePrice = 0;
        let tradeVolume = 0;
        let NextOrder = null;
        if (reqItem.no_completed_volume > resItem.no_completed_volume) {
            tradeVolume = resItem.no_completed_volume;
            reqEntrustStatus = 1;
            reqEntrustStatusName = '部分成交';
            NextOrder = reqItem;
            resEntrustStatus = 2;
            resEntrustStatusName = '已完成';
        } else if (reqItem.no_completed_volume < resItem.no_completed_volume) {
            tradeVolume = reqItem.no_completed_volume;
            reqEntrustStatus = 2;
            reqEntrustStatusName = '已完成';
            resEntrustStatus = 1;
            resEntrustStatusName = '部分成交';
            NextOrder = resItem;
        } else {
            tradeVolume = reqItem.no_completed_volume;
            reqEntrustStatus = 2;
            reqEntrustStatusName = '已完成';
            resEntrustStatus = 2;
            resEntrustStatusName = '已完成';
            NextOrder = false;
        }

        if (trigger_type_id == 1) {
            tradePrice = resItem.entrust_price;
        } else {
            tradePrice = reqItem.entrust_price;
        }
        let coinExchangeList = await CoinModel.getCoinExchangeList();
        let coinEx = coinExchangeList.find(item => item.coin_exchange_id == reqItem.coin_exchange_id);
        let tradeAmount = Utils.checkDecimal(Utils.mul(tradeVolume, tradePrice), coinEx.exchange_decimal_digits);
        let reqTotalAmount = Utils.checkDecimal(Utils.add(reqItem.completed_total_amount, tradeAmount), coinEx.exchange_decimal_digits);
        let reqAvgPrice = Utils.checkDecimal(Utils.div(reqTotalAmount, Utils.add(reqItem.completed_volume, tradeVolume)), coinEx.exchange_decimal_digits);
        let resTotalAmount = Utils.checkDecimal(Utils.add(resItem.completed_total_amount, tradeAmount), coinEx.exchange_decimal_digits);
        let resAvgPrice = Utils.checkDecimal(Utils.div(resTotalAmount, Utils.add(resItem.completed_volume, tradeVolume)), coinEx.exchange_decimal_digits);
        //buy order
        let cnt = await DB.cluster('master');
        let status = 0;
        try {
            cnt.transaction();
            console.log("start transaction");
            //buy entrust
            let reqTradeFees = Utils.checkDecimal(Utils.mul(tradeVolume, reqItem.trade_fees_rate), coinEx.decimal_digits);
            let sql = `update m_entrust set completed_volume = completed_volume + ?, 
                        no_completed_volume =no_completed_volume - ?,
                        completed_total_amount = completed_total_amount + ?,
                        average_price = ?,
                        trade_fees = trade_fees + ?,
                        entrust_status = ?,
                        entrust_status_name = ?
                        where entrust_id =? and no_completed_volume >=? and entrust_status in (1,0)`;
            let reqEntrustRes = await cnt.execQuery(sql,
                [tradeVolume, tradeVolume, tradeAmount, reqAvgPrice, reqTradeFees, reqEntrustStatus, reqEntrustStatusName, reqItem.entrust_id, tradeVolume]);
            if (reqEntrustRes.affectedRows) {
                console.log("修改买单成功" + reqItem.entrust_id + "， 完成单加 " + tradeVolume + " 状态为 " + reqEntrustStatus);
            } else {
                console.error("修改买单失败" + reqItem.entrust_id + "， 完成单加 " + tradeVolume + " 状态为 " + reqEntrustStatus);
            }
            //sell entrust
            let resTradeFees = Utils.checkDecimal(Utils.mul(tradeAmount, resItem.trade_fees_rate), coinEx.exchange_decimal_digits);
            let resEntrustRes = await cnt.execQuery(sql,
                [tradeVolume, tradeVolume, tradeAmount, resAvgPrice, resTradeFees, resEntrustStatus, resEntrustStatusName, resItem.entrust_id, tradeVolume]);

            if (resEntrustRes.affectedRows) {
                console.log("修改卖单成功" + resItem.entrust_id + "， 完成单加 " + tradeVolume + " 状态为 " + resEntrustStatusName);
            } else {
                console.error("修改卖单失败" + resItem.entrust_id + "， 完成单加 " + tradeVolume + " 状态为 " + resEntrustStatusName)
            }
            //买单用户
            // + 购买数量
            let reqBuyCoin = Utils.checkDecimal(Utils.mul(tradeVolume, Utils.sub(1, reqItem.trade_fees_rate)), coinEx.decimal_digits);
            let reqUpdCoinAssets = await cnt.execQuery(`update m_user_assets set available = available + ? , balance = balance + ?
                                                    where user_id = ? and coin_id = ?`, [reqBuyCoin, reqBuyCoin, reqItem.user_id, coinEx.coin_id]);
            if (reqUpdCoinAssets.affectedRows) {
                console.log("更新买家用户资产成功: user-" + reqItem.user_id + " entrustID-" + reqItem.entrust_id + "  币  " + coinEx.coin_id + " 余额增加" + reqBuyCoin);
            } else {
                console.log("更新买家用户资产失败: user-" + reqItem.user_id + " entrustID-" + reqItem.entrust_id + "  币  " + coinEx.coin_id + " 余额增加" + reqBuyCoin);
            }
            // - 冻结数量
            let reqAvailableCoin = Utils.checkDecimal(Utils.mul(tradeVolume, Utils.sub(reqItem.entrust_price, tradePrice)), coinEx.exchange_decimal_digits);
            let reqFrozenCoin = Utils.checkDecimal(Utils.mul(tradeVolume, reqItem.entrust_price), coinEx.exchange_decimal_digits);
            let reqUpdExchangeCoinAssets = await cnt.execQuery(`update m_user_assets set available = available + ? , frozen = frozen - ? , balance = balance - ?
                                                            where user_id = ? and coin_id = ? `, [reqAvailableCoin, reqFrozenCoin, tradeAmount, reqItem.user_id, coinEx.exchange_coin_id]);
            if (reqUpdExchangeCoinAssets.affectedRows) {
                console.log("更新买家用户资产成功 user-" + reqItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.exchange_coin_id + " 可用增加 " + reqAvailableCoin + " 冻结减少 " + reqFrozenCoin + " 余额减少 " + tradeAmount);
            } else {
                console.log("更新买家用户资产失败: user-" + reqItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.exchange_coin_id + " 可用增加 " + reqAvailableCoin + " 冻结减少 " + reqFrozenCoin + " 余额减少 " + tradeAmount);
            }
            //卖单用户
            //- 冻结数量
            let resBuyCoin = Utils.checkDecimal(Utils.mul(tradeAmount, Utils.sub(1, resItem.trade_fees_rate)), coinEx.exchange_decimal_digits);
            let resUpdCoinAssets = await cnt.execQuery(`update m_user_assets set frozen = frozen - ? , balance = balance - ?
                                                    where user_id = ? and coin_id = ? `, [tradeVolume, tradeVolume, resItem.user_id, coinEx.coin_id]);
            if (resUpdCoinAssets.affectedRows) {
                console.log("更新卖家用户资产成功 user-" + resItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.coin_id + " 余额减少" + tradeVolume + "冻结减少" + tradeVolume);
            } else {
                console.log("更新卖家用户资产失败 user-" + resItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.coin_id + " 余额减少" + tradeVolume + "冻结减少" + tradeVolume);
            }
            // + 卖出金额
            let resUpdExchangeCoinAssets = await cnt.execQuery(`update m_user_assets set available = available + ? , balance = balance + ?
                                                            where user_id = ? and coin_id = ?`, [resBuyCoin, resBuyCoin, resItem.user_id, coinEx.exchange_coin_id]);
            if (resUpdExchangeCoinAssets.affectedRows) {
                console.log("更新卖家用户资产成功 user-" + resItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.exchange_coin_id + " 余额增加" + reqBuyCoin);
            } else {
                console.log("更新卖家用户资失败 user-" + resItem.user_id + " entrustID-" + resItem.entrust_id + "  币  " + coinEx.exchange_coin_id + " 余额增加" + reqBuyCoin);
            }
            //更新用户资产缓存
            let reqCoinAssetsList = await AssetsModel.getUserAssetsByUserId(reqItem.user_id, true);
            let resCoinAssetsList = await AssetsModel.getUserAssetsByUserId(resItem.user_id, true);
            if (reqCoinAssetsList && resCoinAssetsList) {
                console.log("更新用户资产缓存成功 buy " + reqItem.entrust_id + " sell " + resItem.entrust_id);
            }
            //买单用户资产变更日志
            let reqCoinAssets = reqCoinAssetsList.find(item => item.coin_id == coinEx.coin_id);
            let reqCoinExchangeAssets = reqCoinAssetsList.find(item => item.coin_id == coinEx.exchange_coin_id);
            let reqBuyCoinLog = await AssetsLogModel.addUserAssetsLog(reqItem.serial_num, reqItem.user_id, coinEx.coin_id, coinEx.coin_unit, reqBuyCoin, reqCoinAssets.balance, 1, 3, '买入');
            let reqSellCoinLog = await AssetsLogModel.addUserAssetsLog(reqItem.serial_num, reqItem.user_id, coinEx.exchange_coin_id, coinEx.exchange_coin_unit, tradeAmount, reqCoinExchangeAssets.balance, 2, 4, '卖出');
            //卖单用户资产变更日志
            let resCoinAssets = resCoinAssetsList.find(item => item.coin_id == coinEx.coin_id);
            let resCoinExchangeAssets = resCoinAssetsList.find(item => item.coin_id == coinEx.exchange_coin_id);
            let resBuyCoinLog = await AssetsLogModel.addUserAssetsLog(resItem.serial_num, resItem.user_id, coinEx.coin_id, coinEx.coin_unit, tradeVolume, resCoinAssets.balance, 2, 4, '卖出');
            let resSellCoinLog = await AssetsLogModel.addUserAssetsLog(resItem.serial_num, resItem.user_id, coinEx.exchange_coin_id, coinEx.exchange_coin_unit, resBuyCoin, resCoinExchangeAssets.balance, 1, 3, '买入');
            //成交记录
            if (resBuyCoin && resSellCoinLog && reqCoinAssets && reqSellCoinLog) {
                console.log("增加买卖用户资产变更日志成功 buy " + reqItem.entrust_id + " sell " + resItem.entrust_id);
            }
            let orderParams = {
                serial_num: reqItem.serial_num,
                coin_exchange_id: reqItem.coin_exchange_id,
                buy_user_id: reqItem.user_id,
                sell_user_id: resItem.user_id,
                buy_entrust_id: reqItem.entrust_id,
                sell_entrust_id: resItem.entrust_id,
                trade_price: tradePrice,
                trade_volume: tradeVolume,
                trade_amount: tradeAmount,
                buy_fees: reqTradeFees,
                sell_fees: resTradeFees,
                trigger_type_id: trigger_type_id,
                proc_bonus_status: 1
            };
            let orderRes = await cnt.edit('m_order', orderParams);
            if (orderRes.affectedRows) {
                await this.addOrder({...orderParams, order_id: orderRes.insertId, create_time: Date.now()});
                console.log("增加新的order记录" + orderRes.insertId + " buy " + reqItem.entrust_id + " sell " + resItem.entrust_id);
            }
            if (reqEntrustRes.affectedRows && resEntrustRes.affectedRows &&
                reqUpdCoinAssets.affectedRows && reqUpdExchangeCoinAssets.affectedRows &&
                resUpdCoinAssets.affectedRows && resUpdExchangeCoinAssets.affectedRows) {
                cnt.commit();

                let req = {
                    entrust_id: reqItem.entrust_id,
                    coin_exchange_id: reqItem.coin_exchange_id,
                    user_id: reqItem.user_id,
                    serial_num: reqItem.serial_num,
                    trade_fees_rate: reqItem.trade_fees_rate,
                    entrust_volume: reqItem.entrust_volume,
                    entrust_price: reqItem.entrust_price,
                    entrust_type_id: reqItem.entrust_type_id,
                    completed_volume: Utils.add(reqItem.completed_volume, tradeVolume),
                    no_completed_volume: Utils.sub(reqItem.no_completed_volume, tradeVolume),
                    completed_total_amount: Utils.add(reqItem.completed_total_amount, tradeAmount),
                    average_price: reqAvgPrice,
                    trade_fees: Utils.add(reqItem.trade_fees, reqTradeFees),
                    entrust_status: reqEntrustStatus,
                    entrust_status_name: reqEntrustStatusName,
                    create_time: reqItem.create_time
                };
                let res = {
                    entrust_id: resItem.entrust_id,
                    coin_exchange_id: resItem.coin_exchange_id,
                    user_id: resItem.user_id,
                    serial_num: resItem.serial_num,
                    trade_fees_rate: resItem.trade_fees_rate,
                    entrust_volume: resItem.entrust_volume,
                    entrust_price: resItem.entrust_price,
                    entrust_type_id: resItem.entrust_type_id,
                    completed_volume: Utils.add(resItem.completed_volume, tradeVolume),
                    no_completed_volume: Utils.sub(resItem.no_completed_volume, tradeVolume),
                    completed_total_amount: Utils.add(resItem.completed_total_amount, tradeAmount),
                    average_price: resAvgPrice,
                    trade_fees: Utils.add(resItem.trade_fees, resTradeFees),
                    entrust_status: resEntrustStatus,
                    entrust_status_name: resEntrustStatusName,
                    create_time: resItem.create_time
                };

                if (reqEntrustStatus == 1) {
                    await this.updateEntrust(config.cacheKey.Buy_Entrust + reqItem.coin_exchange_id, req.entrust_id, req);
                    await this.updateEntrust(config.cacheKey.Entrust_UserId + reqItem.user_id, req.entrust_id, req);
                    // socket.emit('entrustList', {coin_exchange_id: reqItem.coin_exchange_id});
                    socket.emit('userEntrustList', {
                        user_id: reqItem.user_id,
                        coin_exchange_id: reqItem.coin_exchange_id
                    });

                } else if (reqEntrustStatus == 2) {
                    await this.deleteEntrust(config.cacheKey.Buy_Entrust + reqItem.coin_exchange_id, req.entrust_id);
                    await this.deleteEntrust(config.cacheKey.Entrust_UserId + reqItem.user_id, req.entrust_id);
                    // socket.emit('entrustList', {coin_exchange_id: reqItem.coin_exchange_id});
                    socket.emit('userEntrustList', {
                        user_id: reqItem.user_id,
                        coin_exchange_id: reqItem.coin_exchange_id
                    });
                    socket.emit('historyEntrustList', {
                        user_id: reqItem.user_id,
                        coin_exchange_id: reqItem.coin_exchange_id
                    });
                }
                if (resEntrustStatus == 1) {
                    await this.updateEntrust(config.cacheKey.Sell_Entrust + resItem.coin_exchange_id, res.entrust_id, res);
                    await this.updateEntrust(config.cacheKey.Entrust_UserId + resItem.user_id, res.entrust_id, res);
                    // socket.emit('entrustList', {coin_exchange_id: resItem.coin_exchange_id});
                    socket.emit('userEntrustList', {
                        user_id: resItem.user_id,
                        coin_exchange_id: resItem.coin_exchange_id
                    });
                } else if (resEntrustStatus == 2) {
                    await this.deleteEntrust(config.cacheKey.Sell_Entrust + resItem.coin_exchange_id, res.entrust_id);
                    await this.deleteEntrust(config.cacheKey.Entrust_UserId + resItem.user_id, res.entrust_id);
                    // socket.emit('entrustList', {coin_exchange_id: resItem.coin_exchange_id});
                    socket.emit('userEntrustList', {
                        user_id: resItem.user_id,
                        coin_exchange_id: resItem.coin_exchange_id
                    });
                    socket.emit('historyEntrustList', {
                        user_id: resItem.user_id,
                        coin_exchange_id: resItem.coin_exchange_id
                    });
                }
            } else {
                cnt.rollback();
                console.log("rollback, buy " + reqItem.entrust_id + " sell " + resItem.entrust_id);
                return false;
            }
            status = 1
        } catch (error) {
            console.error(error);
            console.log("trade volume" + tradeVolume);
            cnt.rollback();
            throw error;
        } finally {
            cnt.close();
        }
        if (status == 1) {
            return NextOrder;
        } else {
            return false
        }

    }
}

Date.prototype.Format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1, //Month
        "d+": this.getDate(), //Day
        "h+": this.getHours(), //Hour
        "m+": this.getMinutes(), //Minute
        "s+": this.getSeconds(), //Second
        "q+": Math.floor((this.getMonth() + 3) / 3), //Season
        "S": this.getMilliseconds() //millesecond
    };
    var o = {
        "M+": this.getMonth() + 1, //月份
        "d+": this.getDate(), //日
        "h+": this.getHours() % 12 == 0 ? 12 : this.getHours() % 12, //小时
        "H+": this.getHours(), //小时
        "m+": this.getMinutes(), //分
        "s+": this.getSeconds(), //秒
        "S": this.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
};
module.exports = new EntrustModel();