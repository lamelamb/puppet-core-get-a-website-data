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
    slowMo: 50, //让每一步都放满250毫秒，可以更清楚观察我们的每一步操作，还有各种waitfor 时间用于等待异步加载的动态dom 内容
    // mac 操作系统下，你也可以改成自己的Chromium 的地址即可
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
    //   let urlObj = url.parse(interceptedRequest.url());
    //   if ( urlObj.hostname ==='googleads.g.doubleClick.net')
    //     interceptedRequest.abort();
    //   else
    //     interceptedRequest.continue();
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

  let pageNum = await getPageNum();

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
  let pageListArr = await pageList(1);
  console.log('pagelist', pageListArr);

  // getpageInfo，这里网页解构和验证码的出现让老师的代码变得不再适用，自己改写即可，手动输入验证码
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

  for (let i = 0; i < pageListArr.length; i++) {
    await getPageInfo(pageListArr[i]);
  }



})();
