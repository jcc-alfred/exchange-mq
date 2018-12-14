let AWS = require('aws-sdk');
let config = require('../../Base/config');
class SMS_AWS {
    constructor(){
        this.client=new AWS.SNS({
                        apiVersion: '2010-03-31',
                        accessKeyId: config.aws.accessKeyId,
                        secretAccessKey:config.aws.secretAccessKey,
                        region:"ap-southeast-1"
                        })
    }

    async SendMsg(msg,phone_number,area_code) {
        let params = {
            Message: msg, /* required */
            PhoneNumber: "+" + area_code + phone_number,
            Subject:"Admin AsiaEDX"
        };
        let res = await this.client.publish(params).promise();
        // console.log(res);
        return res
    }
    async publish(params){
        let async =  promisify(this.client.publish).bind(this.client);
        return async(params)
    }
}
module.exports = new SMS_AWS();
