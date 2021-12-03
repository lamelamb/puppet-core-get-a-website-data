

const puppeteer = require('puppeteer-core');
const path = require('path');
let url = require("url");
const fs = require('fs');
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
  // 电子书的总数
  async function getPageNum() {

    let page = await browser.newPage();
    // 拦截请求，请求拦截器一旦开启会对所有的请求进行拦截，搭配page 监听request 时间使用
    // await page.setRequestInterception(true);
    // page.on('request', interceptedRequest => {
    // if ( urlObj.hostname ==='googleads.g.doubleClick.net'){
    //   interceptedRequest.abort();
    //   }else{
    //     interceptedRequest.continue();
    //   }
    // });
    await page.goto(httpUrl);
    let pageNum = await page.$eval(".pagination li:last-child span", (element) => {
      let text = element.innerHTML;
      text = text.substring(1, text.length - 2).trim()
      return text;
    });
    page.close();
    return pageNum;
  }

  //  let pageNum =  await getPageNum();

  // 获取pageList
  async function pageList(num) {
    let pageListUrl = 'https://sobooks.cc/page/' + num;
    let page = await browser.newPage();
    await page.goto(pageListUrl);

    let arrPage = await page.$$eval(".card .card-item .thumb-img>a", (elements) => {
      let arr = [];
      elements.forEach(function (element, i) {
        var obj = {};
        obj.href = element.getAttribute("href");
        obj.text = element.getAttribute("title");
        arr.push(obj);
      })
      return arr;
    });
    page.close();
    return arrPage;
  }
  // let pageListArr = await pageList(1);
  // console.log('pagelist', pageListArr);


  async function getPageInfo(pageObj) {
    let page = await browser.newPage();


    // 我click 之后会导航，破坏了页面解构，所以必须等新页面加载好之后page 选择器才可以用
    // page.waitForNavigation() 等待新页面加载完成才行
    await page.goto(pageObj.href);
    let inputV = await page.$("form input[name='e_secret_key']");
    await inputV.focus();
    await page.keyboard.type("985158");
    let inputSubmit = await page.$("form .euc-y-s");
    await inputSubmit.click();
    await page.waitForNavigation();

    let eleA = await page.$(".e-secret b a");
    let hrefA = await eleA.getProperty("href");
    hrefA = hrefA._remoteObject.value;
    hrefA = hrefA.split("?url=")[1];
    // $eval 第二个参数回调可以获得dom 对象，而直接选择器选择的则是js 对象ElementHandle 类的的实例
    let bValue = await page.$eval(".e-secret b", ele => ele.innerHTML);
    let certificationCode = bValue.split("密码:")[1].substring(0, 6);


    // console.log(bValue, certificationCode);
    // // 将书本信息写入文件
    let content = `{ 
               "title":"${pageObj.text}", 
               "href":"${hrefA}" ,
               "certificationCode":"${certificationCode}"}`;
    fs.writeFile('book.text', content, { flag: "a" }, function () {
      console.log('已经将书籍的下载路径写入', pageObj.text);
    });
    page.close(); // 节约资源啊
  }

  //  for(let i = 0; i<pageListArr.length; i++){
  //   await getPageInfo(pageListArr[i]);
  //  }

  // 工具函数将readFile 用promise 包装一下,方便使用await
  function readFile(url) {
    return new Promise(function (resolve) {
      fs.readFile(url, 'utf8', (err, data) => {
        if (err) return console.log('读写' + url, '出现错误', err);
        resolve(data);
      })
    })
  }

  // 工具函数sleep, 利用await 模拟sleep 阻塞运行
  async function waitForTime(time) {
    time = time || 2000;
    return new Promise(function (resolve) {
      resolve(time);
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
    // 阻塞运行，由于前后地址一样，所以waitForNavgation 不触发, 但是我的page 上下文却被破坏了
    // 所以要替换page 上下文 或者等待page 重新加载完毕
    // await waitForTime();
    await page.waitForSelector("#table_files tbody a", { visible: true });
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
  async function downloadBook(pageUrl, bookObj) {

    let page = await browser.newPage();
    // 拦截请求，请求拦截器一旦开启会对所有的请求进行拦截，激活interceptedRequest.abort与interceptedRequest.continue方法
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      let urlObj = url.parse(interceptedRequest.url());
      if (urlObj.hostname === 'ch1-cmcc-dd.tv002.com') {
        // console.log('拦截地址',urlObj);
        interceptedRequest.abort();
        // 这里就用axios 来请求电子书的真实file 路径了
        let bookName = bookObj.title + urlObj.href.split('?')[0].substr(-4);
        let ws = fs.createWriteStream('./books/' + bookName);
        axios.get(urlObj.href, { responseType: "stream" }).then(function (res) {
          res.data.pipe(ws);
          ws.on('close', function () {
            console.log('下载已经完成', bookName);
            page.close();
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

  let pageUrl = await downBookPage(bookArr[0]);
  await downloadBook(pageUrl, bookArr[0]);




})();
