/*
  相对于downloadSoBooks.js 主要做了串行下载多个书籍
  因为服务器设置，同一时间只能下载一个，所以并行下载也就无从说起了
  本 js 严重依赖book.txt ,而book.txt 由 soBook.js 爬取生成
  三个文件结合在一块才是真正的一个复杂爬虫
*/


const puppeteer = require('puppeteer-core');
const path = require('path');
let url = require("url");
const  fs = require('fs');
let axios = require('axios');




// 获取soBooks.com 的所有电子书的下载链接，并下载
(async () => {
  let httpUrl = 'https://sobooks.cc/';
  let debugOptions = {
    headless: false,
    slowMo: 100,
    executablePath: path.resolve('../chrome/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    defaultView: {
      width: 1200,
      height: 800
    }
  }
  let options = { headless: true }

  const browser = await puppeteer.launch(debugOptions);

  // 工具函数将readFile 用promise 包装一下,方便使用await
  function readFile(url) {
    return new Promise(function (resolve) {
    fs.readFile(url, 'utf8', (err, data) => {
        if (err) return console.log('读写' + url, '出现错误', err);
        resolve(data);
      })
    })
  }




  // 我们已将下载地址都写入到了book.text了，下面就是解析并下载电子书资源了
  async function readText(url) {
    let arr = [];
    let fileData = await readFile(url);
    let stringFile = fileData.toString();
    let reg = /(\{.*?\})/igs;
    var temRes;
    while (temRes = reg.exec(stringFile)) {
      let jsonStr = temRes[1]; //第一个匹配组
      let jsonObj = JSON.parse(jsonStr);
      arr.push(jsonObj);
    }
    return arr;
  }

  let bookTextUrl = './book.text';
  let bookArr = await readText(bookTextUrl);
  let index = 0;


  async function downBookPage(bookObj) {
    let page = await browser.newPage();
    await page.goto(bookObj.href);
    let certificationCodeInput = await page.$(".form-control#passcode");
    await certificationCodeInput.focus();
    await page.keyboard.type(bookObj.certificationCode);
    let submitBtn = await page.$(".form-group .btn.btn-primary.btn-block.mt-3");
    submitBtn.click();
    await page.waitForSelector("#table_files tbody a", {visible:true});
    // console.log('当前页面地址', page.url());  
    let elementHref = await page.$eval("#table_files tbody a", (element) => {
      return element.getAttribute("href");
    });
    let pageUrl = page.url();
    // console.log("pageUrl", pageUrl);
    pageUrl = pageUrl.split("/d")[0] + elementHref;
    console.log("pageUrl", pageUrl);
     page.close();
    return pageUrl;
  }

  
  // 真正下载，因为不用点击跳转，因为page 上下文我们不好获取，所以选择直接打开新页面
  // 而且电子书的真实地址还是点击按钮之后异步返回的，所以就要用到了axios
  // 是通过点击按钮然后js 拼成的 file 地址，这个也就是不在页面之上，这个我file 地址怎么得到啊
  async function downloadBook() {
    let pageUrl = await downBookPage(bookArr[index]);
    let bookObj = bookArr[index];
    let page = await browser.newPage();
    // 拦截请求，请求拦截器一旦开启会对所有的请求进行拦截，激活interceptedRequest.abort与interceptedRequest.continue方法
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      let urlObj = url.parse(interceptedRequest.url());
      if (urlObj.hostname === 'ch1-cmcc-dd.tv002.com') {   
        // console.log('拦截地址',urlObj);
        interceptedRequest.abort();
       // 这里就用axios 来请求电子书的真实file 路径了
       let bookName = bookObj.title  + urlObj.href.split('?')[0].substr(-4);
       let ws = fs.createWriteStream('./books/'+ bookName);
        axios.get(urlObj.href, {responseType:"stream"}).then(function(res){
            res.data.pipe(ws);
            ws.on('close', function(){
               console.log('下载已经完成', bookName);
               page.close();
               index++;
               downloadBook();
            });
         })
        
      } else {
        interceptedRequest.continue();
      }
    });
    await page.goto(pageUrl);
    await page.waitForSelector('.btn.btn-outline-secondary.fs--1');
    let btn = await page.$('.btn.btn-outline-secondary.fs--1');
    btn.click();
    // 这里页面上有请求地址，所以通过监听页面的请求结束事件，然后通过响应体拿到地址
    // 但是这一步多此一举，因为你下载完成还要再转发下载吗，所以使用请求拦截,观察下载地址格式然后转发

  }
  
  downloadBook();
  // let pageUrl = await downBookPage(bookArr[0]);
  // await downloadBook(pageUrl, bookArr[0]);

 

  
})();
