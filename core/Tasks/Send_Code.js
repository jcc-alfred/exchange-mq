let amqp = require('amqplib');
let SystemModel = require('../Model/SystemModel');
let CodeUtils = require('../Base/Utils/CodeUtils');
let MailUtils = require('../Base/Utils/MailUtils');
let config = require('../Base/config');
let Cache = require('../Base/Data/Cache');
let Utils = require('../Base/Utils/Utils');
let SMSUtils = require('../Base/Utils/SMSUtils');

(async () => {
    try {

        let conn = await amqp.connect(config.MQ);
        let ch = await conn.createChannel();

        //1基本配置 2 客服配置 3邮件接口配置 4 短信接口配置 5 注册挖矿配置 6 交易挖矿配置
        let mailConfig = await SystemModel.getSysConfigByTypeId(3);
        let host = mailConfig.find((item) => {
            return item.config_key == 'host'
        }).config_value;
        let port = mailConfig.find((item) => {
            return item.config_key == 'port'
        }).config_value;
        let secure = mailConfig.find((item) => {
            return item.config_key == 'secure'
        }).config_value == '1' ? true : false;
        let secureConnection = mailConfig.find((item) => {
            return item.config_key == 'secureConnection'
        }).config_value == '1' ? true : false;
        let user = mailConfig.find((item) => {
            return item.config_key == 'user'
        }).config_value;
        let pass = mailConfig.find((item) => {
            return item.config_key == 'pass'
        }).config_value;
        let mailFrom = mailConfig.find((item) => {
            return item.config_key == 'mailFrom'
        }).config_value;

        MailUtils.init(host, port, secure, secureConnection, user, pass, mailFrom);
        SMSUtils.init();

        //不处理完不接新消息
        ch.prefetch(10);
        //消费队列
        ch.assertQueue(config.MQKey.Send_Code, {durable: true});
        ch.consume(config.MQKey.Send_Code, async (msg) => {

            try {
                console.log('Code:', msg.content.toString());
                let params = JSON.parse(msg.content.toString());

                let tpl = await SystemModel.getMsgTpl(params.lang, params.msg_type_id);
                let code = CodeUtils.makeCode(6);
                let text = Utils.formatString(tpl.msg_tmpl, [code]);
                let ckey = config.cacheKey.User_Code + (params.type == 'phone' ? params.area_code.toString() + params.phone_number.toString() : params.email.toLocaleLowerCase());
                console.log(code+ "--- " +ckey )

                let cache = await Cache.init(config.cacheDB.users);
                await cache.set(ckey, {
                    sendTime: Date.now() / 1000,
                    code: code
                }, 60 * config.sys.codeExpired);
                cache.close();
                //发送验证码
                let sendResult = null;
                if (params.type == "email") {
                    try {
                        sendResult = await MailUtils.sendMail({
                            to: params.email,
                            title: tpl.msg_subject,
                            text: text
                        });
                        console.log("send email to " + params.email + " successfully");
                    }
                    catch (error) {
                        console.error(error);
                        sendResult = false;
                    }
                }
                else if (params.type == "phone") {
                    try {
                        let {ResultCode} = await SMSUtils.sendSMS(params.area_code, params.phone_number, code);
                        if (ResultCode === 'OK') {
                            sendResult = true;
                            console.log("send sms to " + params.area_code + "-" + params.phone_number + " successfully")
                        } else if (ResultCode === "isv.DAY_LIMIT_CONTROL") {
                            sendResult = true;
                            console.log("Limit reached for phone number " + params.area_code + "-" + params.phone_number);
                        } else {
                            sendResult = true;
                            console.error("failed to send sms to " + params.area_code + "-" + params.phone_number + " errorcode:" + ResultCode);
                        }
                    } catch (e) {
                        console.error("failed to send sms to " + params.area_code + "-" + params.phone_number + " err:" + e);
                        sendResult = false;
                    }
                }

                if (!sendResult) {
                    ch.nack(msg);
                    return;
                }


                ch.ack(msg);
            } catch (error) {
                ch.nack(msg);
                throw error;
            }

        }, {noAck: false})

    } catch (error) {
        throw error;
    }
})();


// if(msg.fields.deliveryTag > config.sys.sendMsgRetryNum){
//     console.log("failed:",queue,msg.content.toString());
//     ch.ack(msg);
//     return
// }