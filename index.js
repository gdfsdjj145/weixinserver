const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const request = require('request')
const bodyParser = require('body-parser')
const { init: initDB, Counter } = require("./db");

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

// 更新计数
app.post("/api/count", async (req, res) => {
  const { action } = req.body;
  if (action === "inc") {
    await Counter.create();
  } else if (action === "clear") {
    await Counter.destroy({
      truncate: true,
    });
  }
  res.send({
    code: 0,
    data: await Counter.count(),
  });
});

// 获取计数
app.get("/api/count", async (req, res) => {
  const result = await Counter.count();
  res.send({
    code: 0,
    data: result,
  });
});

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});


app.all('/wx-text', async (req, res) => {
  console.log('消息推送', req.body)

  const appid = req.headers['x-wx-from-appid'] || ''
  const { ToUserName, FromUserName, MsgType, Content, CreateTime, Event, EventKey } = req.body
  console.log('推送接收的账号', ToUserName, '创建时间', CreateTime)

  if (MsgType === 'event') {
    if (Event === 'subscribe' || Event === 'SCAN') {
      // 登录扫码
      if (EventKey === '666') {

      }
    }
  }

  res.send({
    code: 0,
    data: {},
  });

})

app.get('/api/getWxQrCode', async (req, res) => {
  request({
    method: 'POST',
    url: 'http://api.weixin.qq.com/cgi-bin/qrcode/create',
    body: JSON.stringify({ "action_name": "QR_LIMIT_SCENE", "action_info": { "scene": { "scene_id": 666, "scene_str": "登录" } } })
  }, function (error, response) {
    if (error) {
      console.log('接口错误', error)
    } else {
      console.log('接口内容', response.body)
    }
  })
})

const port = process.env.PORT || 80;

async function bootstrap () {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
