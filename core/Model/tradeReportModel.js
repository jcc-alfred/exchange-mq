let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config');
let Utils = require('../Base/Utils/Utils');
let moment = require('moment');

class tradeReportModel {

    constructor() {

    }

    /**
     * 新增充值记录
     */
    async addTradeRecord(coinExchangeId, coinName, coinExchangeName, buyFee, sellFee, tradeAmount, tradeVolume) {
        try {
            let day = moment().format('YYYYMMDD');
            // let newObj = {
            //     day: day,
            //     coin_exchange_id: coinExchangeId,
            //     coin_name: coinName,
            //     coin_exchange_name: coinExchangeName,
            // };

            // let obj = await this.getTradeReportbyDay(day, coinExchangeId);
            // if (obj) {
            //     newObj.trade_amount = obj.trade_amount + tradeAmount;
            //     newObj.trade_volume = obj.trade_volume + tradeVolume;
            //     newObj.buy_fees = obj.buy_fees + buyFee;
            //     newObj.sell_fees = obj.sell_fees + sellFee;
            //     newObj.order_count = obj.order_count + 1
            // } else {
            //     newObj.trade_amount = tradeAmount;
            //     newObj.trade_volume = tradeVolume;
            //     newObj.buy_fees = buyFee;
            //     newObj.sell_fees = sellFee;
            //     newObj.order_count = 1
            // }
            // let cnt = await DB.cluster('master');
            // let res = await cnt.insertOnDuplicate('m_trade_report', newObj);
            let sql = `insert into m_trade_report 
            (day,coin_exchange_id, coin_name,coin_exchange_name,trade_amount,trade_volume,buy_fees,sell_fees,order_count)
            VALUES 
            (${day} , ${coinExchangeId} , '${coinName}', '${coinExchangeName}',${tradeAmount},${tradeVolume}, ${buyFee},${sellFee},1)
            ON DUPLICATE KEY UPDATE
                trade_amount = trade_amount + ${tradeAmount} ,
                trade_volume = trade_volume + ${tradeVolume} ,
                buy_fees = buy_fees + ${buyFee},
                sell_fees = sell_fees + ${sellFee},
                order_count = order_count +1
            `;
            let cnt = await DB.cluster('master');
            let res = await cnt.execQuery(sql);
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }

    async getTradeReportbyDay(day, coinExchangeId) {
        try {
            let cnt = await DB.cluster('slave');
            let res = await cnt.execReader(`select * from m_trade_report where day =${day} and coin_exchange_id = ${coinExchangeId}`);
            cnt.close();
            return res;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new tradeReportModel();
