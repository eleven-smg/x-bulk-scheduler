'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('DOM source links require literal supported status paths', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.addInitScript(() => {
      window.module = {exports:{}};
      window.GM_getValue = (_, d) => d;
      window.GM_setValue = () => {};
      window.GM_xmlhttpRequest = () => { throw new Error('Unexpected request'); };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({path:path.join(__dirname, '../src/x-bulk-scheduler.user.js')});
    const results = await page.evaluate(() => {
      const resolve = window.module.exports.resolveEmbeddedStatus;
      const urls = ['/alice/status/234','/alice/status/234/video/1','/i/status/234',
        '/alice/status/234/../999','/alice/status/234/other','/alice/status/234?foo=1',
        '/alice/status/234#frag','/alice/status/234 ','/alice/status/234\n',' /alice/status/234',
        '/alice/status/234\\\\evil','/ali%63e/status/234','/alice/status/234%2Fvideo%2F1',
        'https://x.com/alice/status/234','//x.com/alice/status/234','/alice/status/234/video/0'];
      return urls.map(href => {
        const a=document.createElement('article');
        const link=document.createElement('a'); link.setAttribute('href',href); a.appendChild(link);
        return {href, result:resolve(a,'123')};
      });
    });
    assert.deepEqual(results.slice(0,3).map(x => x.result), [
      {id:'234',author:'alice'},{id:'234',author:'alice'},{id:'234',author:null}]);
    for (const {href,result} of results.slice(3)) assert.equal(result,null, href);
  } finally { await browser.close(); }
});
