
let DB = require('../Base/Data/DB');
let Cache = require('../Base/Data/Cache');
let config = require('../Base/config')

class CoinModel{

            
    constructor(){
        
    }
    
    async getCoinList(){
        try{

            let cacheCnt = await Cache.init(config.cacheDB.system);
            let cRes = await cacheCnt.hgetall(config.cacheKey.Sys_Coin);

            if(cRes){

                let data = [];
                for (let i in cRes) {
                    let item = cRes[i];
                    data.push(JSON.parse(item));
                }
                cacheCnt.close();
                return data;
            }

            let cnt =  await DB.cluster('slave');
            let res =  await cnt.execQuery("select * from m_coin where record_status=1 order by order_by_num asc");
            cnt.close();

            let chRes = await Promise.all(res.map((info)=>{
                return cacheCnt.hset(
                    config.cacheKey.Sys_Coin,
                    info.coin_id,
                    info
                )
            }));

            cacheCnt.close();

            return res;

        }catch(error){
            throw error;
        }
    }

    async getCoinExchangeAreaList(){
        try{

            let cacheCnt = await Cache.init(config.cacheDB.system);
            let cRes = await cacheCnt.hgetall(config.cacheKey.Sys_Coin_Exchange_Area);

            if(cRes){

                let data = [];
                for (let i in cRes) {
                    let item = cRes[i];
                    data.push(JSON.parse(item));
                }
                cacheCnt.close();
                return data;
            }

            let cnt =  await DB.cluster('slave');
            let res =  await cnt.execQuery("select * from m_coin_exchange_area where record_status=1 order by order_by_num asc");
            cnt.close();

            let chRes = await Promise.all(res.map((info)=>{
                return cacheCnt.hset(
                    config.cacheKey.Sys_Coin_Exchange_Area,
                    info.coin_exchange_area_id,
                    info
                )
            }));

            cacheCnt.close();

            return res;

        }catch(error){
            throw error;
        }
    }

    async getCoinExchangeList(){
        try{

            let cacheCnt = await Cache.init(config.cacheDB.system);
            let cRes = await cacheCnt.hgetall(config.cacheKey.Sys_Coin_Exchange);

            if(cRes){

                let data = [];
                for (let i in cRes) {
                    let item = cRes[i];
                    data.push(JSON.parse(item));
                }
                cacheCnt.close();
                return data;
            }

            let cnt =  await DB.cluster('slave');
            let sql = `SELECT
                            a.coin_exchange_id,
                            a.coin_exchange_area_id,
                            b.coin_exchange_area_name,
                            b.order_by_num as area_order_by_num ,
                            a.coin_id,
                            c.coin_name,
                            c.coin_unit,
                            c.coin_symbol,
                            c.decimal_digits,
                            a.exchange_coin_id,
                            d.coin_name as exchange_coin_name,
                            d.coin_unit as exchange_coin_unit,
                            d.coin_symbol as exchange_coin_symbol,
                            d.decimal_digits as exchange_decimal_digits,
                            a.sell_fees_rate,
                            a.buy_fees_rate,
                            a.entrust_min_amount,
                            a.entrust_min_price,
                            a.coin_exchange_status,
                            a.is_enable_trade,
                            a.open_trade_day,
                            a.trade_time_am_start,
                            a.trade_time_am_end,
                            a.trade_time_pm_start,
                            a.trade_time_pm_end,
                            a.change_range_high_rate,
                            a.change_range_low_rate,
                            a.order_by_num,
                            a.update_time,
                            a.base_amount,
                            a.create_time,
                            a.record_status
                            FROM m_coin_exchange as a 
                            LEFT JOIN m_coin_exchange_area as b ON a.coin_exchange_area_id = b.coin_exchange_area_id
                            LEFT JOIN m_coin as c ON a.coin_id = c.coin_id
                            LEFT JOIN m_coin as d ON a.exchange_coin_id = d.coin_id
                            WHERE a.record_status = 1 AND a.is_enable_trade = 1
                            ORDER BY a.order_by_num ASC`
            let res =  await cnt.execQuery(sql);
            cnt.close();

            let chRes = await Promise.all(res.map((info)=>{
                return cacheCnt.hset(
                    config.cacheKey.Sys_Coin_Exchange,
                    info.coin_exchange_id,
                    info
                )
            }));

            cacheCnt.close();

            return res;

        }catch(error){
            throw error;
        }
    }
}

module.exports = new CoinModel();