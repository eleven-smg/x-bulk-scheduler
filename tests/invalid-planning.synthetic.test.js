'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
test('invalid timing does not normalize dates or change an existing plan',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try {
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.addInitScript(()=>{const m=new Map();window.GM_getValue=(k,d)=>m.has(k)?m.get(k):d;window.GM_setValue=(k,v)=>m.set(k,v);window.GM_xmlhttpRequest=()=>{throw Error('Unexpected network');};window.module={exports:{}};});
  await page.goto('https://x.com/'); await page.addScriptTag({path:path.join(__dirname,'../src/x-bulk-scheduler.user.js')});
  const result=await page.evaluate(()=>{
   const x=window.module.exports, c=x.CONFIG;
   const original=[{id:'111',kind:'link',media:'video',state:'queued',scheduledAt:'2030-03-01T00:00:00Z',extra:'keep'}, {id:'222',kind:'link',state:'scheduled',scheduledAt:'2029-03-01T00:00:00Z'}];
   const cases=[{startTime:'24:00'},{startTime:'23:60'},{startTime:'9:5'},{startTime:'09:30\n'},{startTime:''},{gapMinutes:-1},{gapMinutes:1.5},{gapMinutes:1441},{daysAhead:0},{daysAhead:367},{dailyCap:0},{dailyCap:1001},{active:'missing'}];
   return cases.map(corrupt=>{
    Object.assign(c,{startTime:'09:30',gapMinutes:0,daysAhead:1,dailyCap:48,active:'12x4'},corrupt); x.store.setQueue(original);
    const before=JSON.stringify(x.store.getQueue()), settings=JSON.stringify({startTime:c.startTime,gapMinutes:c.gapMinutes,daysAhead:c.daysAhead,dailyCap:c.dailyCap,active:c.active});
    x.buildSchedule();
    return {before,after:JSON.stringify(x.store.getQueue()),settings,afterSettings:JSON.stringify({startTime:c.startTime,gapMinutes:c.gapMinutes,daysAhead:c.daysAhead,dailyCap:c.dailyCap,active:c.active})};
   });
  });
  for (const x of result){assert.equal(x.after,x.before);assert.equal(x.afterSettings,x.settings);}
  assert.match(await page.locator('#xbs-log').textContent(),/Invalid timing settings/);
  const valid=await page.evaluate(()=>{const x=window.module.exports; Object.assign(x.CONFIG,{startTime:'9:30',gapMinutes:0,daysAhead:1,dailyCap:48,active:'12x4'});x.buildSchedule();return x.store.getQueue();});
  assert.notEqual(valid[0].scheduledAt,'2030-03-01T00:00:00Z');
  assert.equal(valid[1].scheduledAt,'2029-03-01T00:00:00Z');
 } finally {await browser.close();}
});
