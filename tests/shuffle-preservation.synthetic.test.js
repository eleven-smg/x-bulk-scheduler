'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {chromium}=require('playwright'); const path=require('node:path');
test('shuffle preserves duplicates, fixed slots and plans on no-op or save failure',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try {
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.addInitScript(()=>{const m=new Map();window.GM_getValue=(k,d)=>m.has(k)?m.get(k):d;window.GM_setValue=(k,v)=>{if(k==='xbs_queue'&&window.failQueue)throw Error('fixture write failed');m.set(k,v);};window.GM_xmlhttpRequest=()=>{throw Error('Unexpected network');};window.module={exports:{}};});
  await page.goto('https://x.com/');await page.addScriptTag({path:path.join(__dirname,'../src/x-bulk-scheduler.user.js')});
  const r=await page.evaluate(()=>{
   const x=window.module.exports; x.CONFIG.mixPictures=false;
   const mk=(marker,id,author)=>({marker,id,url:`https://x.com/${author}/status/${id}`,media:'video',state:'queued',scheduledAt:'2031-01-01T00:00:00Z',day:1,session:2,slot:3,extra:{n:marker}});
   const a=[mk('a','111','alice'),{id:'9',state:'scheduled',scheduledAt:'2028-01-01T00:00:00Z',extra:'legacy'}, {id:'8',state:'queued',media:'photo',scheduledAt:'2031-02-01T00:00:00Z'},mk('b','222','bob'),null,mk('duplicate','111','carol')];
   const strip=y=>{const z=JSON.parse(JSON.stringify(y));for(const k of ['scheduledAt','day','session','slot'])delete z[k];return z;};
   let tested=0,changed=0;
   for(const kind of ['free','spread']) for(let seed=1;seed<=50;seed++){
    x.store.setQueue(a);let state=seed;Math.random=()=>{state=(state*16807)%2147483647;return (state-1)/2147483646;};
    if(kind==='free')x.shuffleQueue();else x.spreadShuffleQueue(2);
    const out=x.store.getQueue();const original=[a[0],a[3],a[5]], shuffled=[out[0],out[3],out[5]];
    if(JSON.stringify([out[1],out[2],out[4]])!==JSON.stringify([a[1],a[2],a[4]]))throw Error('fixed records moved or changed');
    const norm=items=>items.map(strip).sort((u,v)=>u.marker.localeCompare(v.marker));
    if(JSON.stringify(norm(shuffled))!==JSON.stringify(norm(original)))throw Error('lost record or metadata');
    const didChange=shuffled.some((y,i)=>y.marker!==original[i].marker);
    if(didChange){changed++;if(shuffled.some(y=>y.scheduledAt!==null||y.day!==0||y.session!==0||y.slot!==0))throw Error('changed plan not invalidated');}
    else if(shuffled.some(y=>y.scheduledAt!=='2031-01-01T00:00:00Z'))throw Error('unchanged plan lost');
    tested++;
   }
   x.store.setQueue(a);Math.random=()=>0.999999;x.shuffleQueue();const noChange=x.store.getQueue();
   x.store.setQueue(a);Math.random=()=>0;window.failQueue=true;let err='';try{x.shuffleQueue();}catch(e){err=e.message;}window.failQueue=false;
   return {tested,changed,noChange,initial:a,afterFailure:x.store.getQueue(),err};
  });
  assert.equal(r.tested,100);assert.ok(r.changed>0);assert.deepEqual(r.noChange,r.initial);
  assert.equal(r.err,'fixture write failed');assert.deepEqual(r.afterFailure,r.initial);
 } finally{await browser.close();}
});
