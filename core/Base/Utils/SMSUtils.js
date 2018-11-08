let SMSClient = require('@alicloud/international-sms-sdk');
let config = require('../config');
let Utils = require('../Utils/Utils');
let SMSUtils = {

    init(){
        this.smsClient = new SMSClient(config.SMS_Alicloud);

    },
    options(area_code,phoneNumbers,code){
        let option={
            PhoneNumbers: area_code+phoneNumbers,
            ExternalId: 'E001203311',
            ContentCode: area_code==='86'?config.SMS_Content_Code.OTP_CHINA :config.SMS_Content_Code.OTP,
            ContentParam: Utils.formatString('{"code":"{0}"}',[code])
        };
        if(area_code==="86"){
            option['SignName']=config.SMS_Content_Code.OPT_CHINA_SIG;
        }
        return option
    },
    sendSMS(area_code,phoneNumbers,code){
            let option= this.options(area_code,phoneNumbers,code);
            return this.smsClient.sendSMS(option)
    },
    sendSMS1(phoneNumbers,code){
        this.smsClient.sendSMS({
            PhoneNumbers: phoneNumbers,
            ExternalId: 'E001203311',
            ContentCode: config.SMS_Content_Code.OTP,
            ContentParam: Utils.formatString('{"code":"{0}"}',[code])
        }).then(function (res) {
            let {ResultCode} = res;
            if (ResultCode === 'OK') {
                // parse res
                console.log('send sms sucessfully:', phoneNumbers);
                return true;
            }
        }, function (err) {
            console.log('send sms failed:', phoneNumbers,'err:', err);
            return false;
        });
    }
};


module.exports = SMSUtils;
// SMSUtils.init();
// SMSUtils.sendSMS1(6587140718,1234);