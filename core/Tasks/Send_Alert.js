let amqp = require('amqplib');
let SystemModel = require('../Model/SystemModel');
let Utils = require('../Base/Utils/Utils');
let MailUtils = require('../Base/Utils/MailUtils');
let config = require('../Base/config');
let Cache = require('../Base/Data/Cache');
let moment = require('moment');
let SMS_AWS = require('../Base/Utils/SMS_AWS');

(async () => {
    try {

        let conn = await amqp.connect(config.MQ);
        let ch = await conn.createChannel();
        console.log()
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

        //不处理完不接新消息
        ch.prefetch(10);
        //消费队列
        ch.assertQueue(config.MQKey.Send_Alert, {durable: true});
        ch.consume(config.MQKey.Send_Alert, async (msg) => {
            try {
                let message = "";
                let subject = "AsiaEDX Support";
                console.log('Alert:', msg.content.toString());

                let params = JSON.parse(msg.content.toString());
                if (params.msg) {
                    message = params.msg;
                }else {
                    let tpl = await SystemModel.getMsgTpl(params.lang, params.msg_type_id);
                    subject = tpl.msg_subject;
                    let text = '';
                    if (params.msg_type_id == 5 || params.msg_type_id == 6) {
                        message = Utils.formatString(tpl.msg_tmpl, [moment().format('YYYY-MM-DD HH:mm:ss'), params.amount, params.unit]);
                    } else if (params.msg_type_id == 1 || params.msg_type_id == 2) {
                        message = Utils.formatString(tpl.msg_tmpl, [moment().format('YYYY-MM-DD HH:mm:ss'), params.ip]);
                    }
                    else if (params.msg_type_id == 7) {
                        message = Utils.formatString(tpl.msg_tmpl, [params.serial_num, params.total_amount]);
                    }
                    else if (params.msg_type_id == 8) {
                        message = Utils.formatString(tpl.msg_tmpl, [params.serial_num, params.total_amount]);
                    }
                    else if (params.msg_type_id == 9) {
                        message = Utils.formatString(tpl.msg_tmpl, [params.serial_num, params.total_amount]);
                    }
                    else {
                        message = Utils.formatString(tpl.msg_tmpl, [moment().format('YYYY-MM-DD HH:mm:ss')]);
                    }
                }
                let sendResult = null;
                if (params.type == "email") {
                    try {
                        sendResult = await MailUtils.sendMail({
                            to: params.email,
                            title: subject,
                            text: message
                        })
                    }
                    catch (error) {
                        console.log(error);
                        sendResult = false;
                    }
                }
                else if (params.type == "phone") {
                    try {
                        sendResult = await SMS_AWS.SendMsg(
                            message,
                            params.phone_number,
                            params.area_code
                        )
                    }
                    catch (error) {
                        console.log(error);
                        sendResult = false;
                    }
                }
                // if (!sendResult) {
                //     ch.nack(msg);
                //     return;
                // }
                ch.ack(msg);
            } catch (error) {
                throw error;
                ch.nack();
            }

        }, {noAck: false})

    } catch (error) {
        throw error;
    }
})();
