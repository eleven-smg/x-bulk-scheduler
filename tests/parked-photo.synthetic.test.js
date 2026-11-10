'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {chromium}=require('playwright'); const path=require('node:path');
test('rebuild clears only parked queued photo times, including photo-only queue',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try {
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.addInitScript(()=>{const m=new Map();window.GM_getValue=(k,d)=>m.has(k)?m.get(k):d;window.GM_setValue=(k,v)=>{if(k==='xbs_queue'&&window.failSave)throw Error('fixture save failed');m.set(k,v);};window.GM_xmlhttpRequest=()=>{throw Error('Unexpected network');};window.module={exports:{}};});
  await page.goto('https://x.com/'); await page.addScriptTag({path:path.join(__dirname,'../src/x-bulk-scheduler.user.js')});
  const r=await page.evaluate(()=>{
   const x=window.module.exports; x.CONFIG.mixPictures=true;
   const rows=[{id:'1',media:'photo',state:'queued',scheduledAt:null,extra:'keep'}, {id:'2',media:'video',state:'queued',scheduledAt:null}, {id:'1',media:'photo',state:'scheduled',scheduledAt:'2031-01-01T00:00:00Z',extra:'history'}, {id:'1',media:'photo',state:'queued',scheduledAt:'2031-02-01T00:00:00Z',extra:'duplicate'}];
   x.store.setQueue(rows); x.buildSchedule(); const mixed=x.store.getQueue();
   x.CONFIG.mixPictures=false; x.buildSchedule(); const rebuilt=x.store.getQueue();
   const only=[{id:'3',media:'photo',state:'queued',scheduledAt:'2031-03-01T00:00:00Z',extra:'only'}];
   x.store.setQueue(only); x.buildSchedule(); const parked=x.store.getQueue();
   x.store.setQueue(only); window.failSave=true; let error=''; try{x.buildSchedule();}catch(e){error=e.message;} window.failSave=false;
   return {mixed,rebuilt,parked,afterFailure:x.store.getQueue(),only,error};
  });
  assert.ok(r.mixed[0].scheduledAt); assert.ok(r.mixed[3].scheduledAt);
  assert.equal(r.rebuilt.length,4); assert.equal(r.rebuilt[0].scheduledAt,null); assert.equal(r.rebuilt[3].scheduledAt,null);
  assert.equal(r.rebuilt[0].extra,'keep'); assert.equal(r.rebuilt[3].extra,'duplicate');
  assert.deepEqual(r.rebuilt[2],{id:'1',media:'photo',state:'scheduled',scheduledAt:'2031-01-01T00:00:00Z',extra:'history'});
  assert.deepEqual(r.parked,[{id:'3',media:'photo',state:'queued',scheduledAt:null,extra:'only'}]);
  assert.equal(r.error,'fixture save failed'); assert.deepEqual(r.afterFailure,r.only);
 } finally {await browser.close();}
});
