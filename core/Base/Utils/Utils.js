let crypto = require('crypto');
let config = require('../config');




Utils =  {
    getIP(request){
        var ip = request.headers['x-forwarded-for'] ||
            request.connection.remoteAddress ||
            request.socket.remoteAddress ||
            request.connection.socket.remoteAddress;
        ip = ip.split(',')[0];
        ip = ip.split(':').slice(-1); //in case the ip returned in a format: "::ffff:146.xxx.xxx.xxx"
        return Array.isArray(ip) ? ip[0] : ip
    },
    isInt(num){
        return /^[\d]+$/.test(num)
    },
    isNum(num){
        // var regPos = /^\d+(\.\d+)?$/; //非负浮点数
        // var regNeg = /^(-(([0-9]+\.[0-9]*[1-9][0-9]*)|([0-9]*[1-9][0-9]*\.[0-9]+)|([0-9]*[1-9][0-9]*)))$/; //负浮点数
        // if(regPos.test(num) || regNeg.test(num)){
        //     return true;
        // }else{
        //     return false;
        // }
        return !isNaN(parseFloat(num)) && isFinite(num);
    },
    isEmail:(email)=>{ 
        return /^([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+@([a-zA-Z0-9]+[_|\_|\.]?)*[a-zA-Z0-9]+\.[a-zA-Z]{2,3}$/i.test(email);
    },
    isPhone(areaCode,phone){
        if(areaCode=='86'){
            return /^1\d{10}$/.test(phone);
        }else{
            return this.isInt(phone) && phone.length >=5 ;
        }
    },
    isChinaPhone(phone){
        return /^1\d{10}$/.test(phone)
    },
    md5(string){
        return crypto.createHash('md5').update(string).digest('hex').toUpperCase()
        // return md5.update(string).digest('hex').toUpperCase();
    },

    formatString(str,args) {
        for (var i in args) {
       
            let reg = new RegExp(`\\{${i}\\}`, "gi");
            str = str.replace(reg, args[i]);
        }
        return str;
    },

    getPassLevel(pass){
        let level = 0;

        if(pass.length>=6 && pass.length<=32){
            level +=10;
            if(/(?=[\x21-\x7e]+)[^A-Za-z0-9]/.test(pass)){
                level += 40;
            }
            if(/[a-z]/.test(pass)){
                level += 10;
            }
            if(/[A-Z]/.test(pass)){
                level +=20
            }
            if(/[0-9]/.test(pass)){
                level += 10
            }
        }
        return level;
    },

    getClientInfo(req){
        return {
            client_type:'Web',
        }
    },

    userInfoFormat(userInfo){

        let temp = {};

        temp.user_id = userInfo.user_id;
        temp.full_name = userInfo.full_name;
        temp.email = userInfo.email;
        temp.area_code = userInfo.area_code;
        temp.phone_number = userInfo.phone_number;
        temp.is_safe_pass = !userInfo.safe_pass ? 0 : 1;
        temp.is_enable_trade = userInfo.is_enable_trade;
        temp.is_enable_withdraw = userInfo.is_enable_withdraw;

        return temp
    },

    fixNumber(value, unit) {
        var value = isNaN(value) ? "0" : parseFloat(value).toFixed(8);
        var unit = unit || 0;
        var isInt = value.indexOf(".") == -1 ? true : false;
        var intNum = value.split(".")[0];
        var floatNum = !isInt ? value.split(".")[1] : "0";
        var floatArry = floatNum.split("");
        var newFloatNum = ".";
        for (var i = 0; i < unit; i++) {
            if (!floatArry[i]) {
                newFloatNum += "0"
            } else {
                newFloatNum += floatArry[i]
            }
        }
        return parseFloat(intNum + newFloatNum).toFixed(unit)
    },
    fixDecimal(value, unit) {
        var result = this.fixNumber(value, unit);
        if (unit > 0) {
            result = parseFloat(result)
        } else {
            result = parseInt(result)
        }
        if (result > 0 && result < 0.000001) {
            result = this.fixNumber(value, unit)
        }
        return result
    },
    checkDecimal(value, unit) {
        var result = value;
        if (value !== "") {
            if (this.isNum(value) && value >= 0) {
                var valueStr = value + "";
                if (valueStr.indexOf(".") !== -1) {
                    var newStr, intStr = valueStr.split(".")[0] + "",
                        floatStr = valueStr.split(".")[1] + "";
                    if (unit === 0) {
                        result = intStr;
                    } else {
                        if (floatStr.split("").length > unit) {
                            newStr = intStr + "." + floatStr.substr(0, unit);
                            result = newStr;
                        }
                    }
                }
            } else {
                result = ""
            }
        }
        return result;
    },
    add(a, b) {
        var c, d, e;
        try {
            c = a.toString().split(".")[1].length;
        } catch (f) {
            c = 0;
        }
        try {
            d = b.toString().split(".")[1].length;
        } catch (f) {
            d = 0;
        }
        return e = Math.pow(10, Math.max(c, d)), (this.mul(a, e) + this.mul(b, e)) / e;
    },
    sub(a, b) {
        var c, d, e;
        try {
            c = a.toString().split(".")[1].length;
        } catch (f) {
            c = 0;
        }
        try {
            d = b.toString().split(".")[1].length;
        } catch (f) {
            d = 0;
        }
        return e = Math.pow(10, Math.max(c, d)), (this.mul(a, e) - this.mul(b, e)) / e;
    },
    mul(a, b) {
        var c = 0, 
            d = a.toString(),
            e = b.toString();
        try {
            c += d.split(".")[1].length;
        } catch (f) {}
        try {
            c += e.split(".")[1].length;
        } catch (f) {}
        return Number(d.replace(".", "")) * Number(e.replace(".", "")) / Math.pow(10, c);
    },
    mymul(a,b){
        let res = this.mul(a,b);
        if(res<0.00000001){
            return 0;
        } else {return res}
    },
    div(a, b) {
        var c, d, e = 0,
            f = 0;
        try {
            e = a.toString().split(".")[1].length;
        } catch (g) {}
        try {
            f = b.toString().split(".")[1].length;
        } catch (g) {}
        return c = Number(a.toString().replace(".", "")), d = Number(b.toString().replace(".", "")), this.mul(c / d, Math.pow(10, f - e));
    }

}

module.exports = Utils;

