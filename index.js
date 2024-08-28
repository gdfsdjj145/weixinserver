const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const crypto = require('crypto');
const xml2js = require('xml2js');
const request = require('request')
const bodyParser = require('body-parser')

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

app.use(bodyParser.raw())
app.use(bodyParser.json({}))
app.use(bodyParser.urlencoded({ extended: true }))

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});


// 微信消息推送
app.all('/wx-text', async (req, res) => {
  console.log('消息推送', req.body)

  const appid = req.headers['x-wx-from-appid'] || ''
  const { ToUserName, FromUserName, MsgType, Content, CreateTime, Event, EventKey, Ticket } = req.body
  console.log('推送接收的账号', ToUserName, '创建时间', CreateTime)

  if (MsgType === 'event') {
    if (Event === 'subscribe' || Event === 'SCAN') {
      // 登录扫码
      if (EventKey === '666') {
        await request({
          method: 'POST',
          url: 'https://www.wefight.cn/api/wx/code',
          body: JSON.stringify({
            ticket: Ticket,
            openId: FromUserName,
            createTime: CreateTime
          })
        })
        await sendmess(appid, {
          touser: FromUserName,
          msgtype: 'text',
          text: {
            content: '登录成功'
          }
        })
        res.send('success')
      }
    }
  }

  res.send({
    code: 0,
    data: {},
  });
})

// 获取二维码
const getTicket = () => {
  return new Promise((resolve, reject) => {
    request({
      method: 'POST',
      url: 'http://api.weixin.qq.com/cgi-bin/qrcode/create',
      body: JSON.stringify({ "action_name": "QR_SCENE", "action_info": { "scene": { "scene_id": 666 } } })
    }, function (error, response) {
      if (error) {
        console.log('接口错误', error)
        reject(error)
      } else {
        resolve({
          ...JSON.parse(response.body)
        })
      }
    })
  })
}

// 获取二维码
const getQrCode = (ticket) => {
  return new Promise((resolve, reject) => {
    request({
      method: 'GET',
      url: `http://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${ticket}`,
      encoding: 'base64'
    }, function (error, response) {
      if (error) {
        console.log('接口错误', error)
        reject(error)
      } else {
        resolve(response.body)
      }
    })
  })
}

// 获取二维码
app.get('/api/getWxQrCode', async (req, res) => {
  const { ticket } = await getTicket()
  const qrcode = await getQrCode(ticket)
  res.send({
    code: 0,
    data: {
      ticket,
      qrcode: `data:image/jpeg;base64,${qrcode}`
    }
  })
})

// 获取用户信息
app.get('/api/getUserInfo', async (req, res) => {
  const { openId } = req.query
  request({
    method: 'GET',
    url: `http://api.weixin.qq.com/cgi-bin/user/info?openid=${openId}&lang=zh_CN`
  }, function (error, response) {
    if (error) {
      console.log('接口错误', error)
      res.send({
        code: 500,
        data: {},
        msg: '接口报错'
      })
    } else {
      res.send({
        code: 0,
        data: {
          ...JSON.parse(response.body)
        }
      })
    }
  })
})

// 微信支付回调
app.get('/api/wechat-pay-callback', async (req, res) => {
  try {
    const xmlData = await parseXML(req.body);
    const signature = req.headers['wechatpay-signature'];
    const timestamp = req.headers['wechatpay-timestamp'];
    const nonce = req.headers['wechatpay-nonce'];

    // 验证签名
    if (verifySignature(req.body, signature, timestamp, nonce)) {
      // 处理支付结果
      const result = await processPaymentResult(xmlData);

      // 返回成功响应
      res.set('Content-Type', 'text/xml');
      res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
    } else {
      res.status(400).send('签名验证失败');
    }
  } catch (error) {
    console.error('处理微信支付回调时出错:', error);
    res.status(500).send('内部服务器错误');
  }
})

// 解析XML
function parseXML (xmlData) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xmlData, { explicitArray: false }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result.xml);
      }
    });
  });
}

// 验证签名
function verifySignature (xmlData, signature, timestamp, nonce) {
  const apiKey = 'YOUR_API_KEY'; // 替换为您的微信支付API密钥
  const signStr = `${timestamp}\n${nonce}\n${xmlData}\n`;
  const sign = crypto.createHmac('sha256', apiKey).update(signStr).digest('hex');
  return sign === signature;
}

// 处理支付结果
async function processPaymentResult (xmlData) {
  const { out_trade_no, result_code, total_fee } = xmlData;

  if (result_code === 'SUCCESS') {
    // 支付成功，更新订单状态
    await updateOrderStatus(out_trade_no, 'PAID', total_fee);
    // 可以在这里添加其他逻辑，如发送通知等
  } else {
    // 支付失败，记录日志
    console.log(`支付失败: ${out_trade_no}, 原因: ${xmlData.err_code_des}`);
  }
}

// 更新订单状态（示例函数，需要根据实际情况实现）
async function updateOrderStatus (orderNumber, status, amount) {
  // 这里应该是更新数据库中订单状态的逻辑
  console.log(`更新订单 ${orderNumber} 状态为 ${status}, 金额: ${amount}`);
}

// 发送消息
function sendmess (appid, mess) {
  return new Promise((resolve, reject) => {
    request({
      method: 'POST',
      url: `http://api.weixin.qq.com/cgi-bin/message/custom/send?from_appid=${appid}`,
      body: JSON.stringify(mess)
    }, function (error, response) {
      if (error) {
        console.log('接口返回错误', error)
        reject(error.toString())
      } else {
        console.log('接口返回内容', response.body)
        resolve(response.body)
      }
    })
  })
}

const port = process.env.PORT || 80;

async function bootstrap () {
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
