// Local (off-device) test harness for x-bulk-scheduler.
//
// It stubs the Tampermonkey + DOM globals the userscript expects, loads the
// script (whose end-of-file test hook exports the pure logic), and runs the same
// selfTest() the panel's "Self-Test" button runs. This catches logic bugs on this
// PC — no X account, no browser, nothing posted.
//
//   node test/selftest.node.js
//
// Exit code 0 = all green, 1 = a failure (or the export hook didn't fire).

const fs = require('fs');
const path = require('path');

// --- in-memory GM storage ---
const mem = {};
global.GM_getValue = (k, d) => (k in mem ? mem[k] : d);
global.GM_setValue = (k, v) => { mem[k] = v; };
global.GM_xmlhttpRequest = () => {};

// --- lenient DOM element stub: any chained call/prop is safe ---
function stubEl() {
  const el = { style: {}, dataset: {}, options: [] };
  el.querySelector = () => stubEl();
  el.querySelectorAll = () => [];
  el.addEventListener = () => {};
  el.appendChild = () => {};
  el.setAttribute = () => {};
  el.getAttribute = () => null;
  el.closest = () => null;
  el.click = () => {};
  el.focus = () => {};
  el.remove = () => {};
  el.dispatchEvent = () => true;
  return el;
}

global.document = {
  getElementById: () => null,      // panel not present -> buildPanel proceeds
  querySelector: () => stubEl(),
  querySelectorAll: () => [],
  createElement: () => stubEl(),
  body: stubEl(),
  documentElement: stubEl(),
  addEventListener: () => {},
  execCommand: () => true,
};
global.window = global;
global.location = { pathname: '/home', href: 'https://x.com/home', assign: () => {} };
global.MutationObserver = class { observe() {} disconnect() {} };
global.confirm = () => true;
global.prompt = () => '';
global.InputEvent = class {};
global.Event = class {};

const srcPath = path.join(__dirname, '..', 'src', 'x-bulk-scheduler.user.js');
const src = fs.readFileSync(srcPath, 'utf8');

const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', src)(mod, mod.exports);
const api = mod.exports;

if (!api || typeof api.selfTest !== 'function') {
  console.error('FAIL: selfTest was not exported (the test hook did not fire).');
  process.exit(1);
}

const assert=require('node:assert/strict');const {CONFIG,store,buildSchedule}=api;
const make=i=>({id:String(i),state:'queued',kind:'link',media:'video',scheduledAt:null,extra:'keep'});
const setup=(n,conf={})=>{Object.assign(CONFIG,{active:'12x4',gapMinutes:0,startTime:'09:00',daysAhead:2,dailyCap:3,mixPictures:false},conf);store.setQueue(Array.from({length:n},(_,i)=>make(i+1)))};
const results=()=>store.getQueue().filter(x=>x.state==='queued'&&x.scheduledAt);
const local=(y,m,d,h,min=0)=>new Date(y,m-1,d,h,min,0,0).getTime();
setup(7); buildSchedule(local(2030,1,1,10)); let q=store.getQueue(), planned=results();
assert.equal(planned.length,6,'daily limit across two days');
assert.deepEqual(planned.map(x=>new Date(x.scheduledAt).getDate()),[2,2,2,3,3,3]);
assert.ok(planned.every(x=>Date.parse(x.scheduledAt)>local(2030,1,1,10)));
assert.equal(new Date(planned[0].scheduledAt).getHours(),9,'browser-local start');
assert.equal(new Set(planned.map(x=>x.scheduledAt)).size,6,'picker minutes unique');
assert.equal(q[6].scheduledAt,null,'excess left waiting');
setup(1);buildSchedule(local(2030,1,1,9));assert.equal(new Date(results()[0].scheduledAt).getDate(),2,'start equal to now rolls to next local day');
setup(4,{startTime:'23:30',gapMinutes:60});buildSchedule(local(2030,1,1,22));planned=results();assert.equal(planned.length,2,'drip does not spill into next day');assert.deepEqual(planned.map(x=>new Date(x.scheduledAt).getHours()),[23,23]);
setup(4);let h={id:'history',state:'scheduled',scheduledAt:new Date(local(2030,1,2,9)).toISOString(),extra:'unchanged'};q=store.getQueue();q.push(h);store.setQueue(q);buildSchedule(local(2030,1,1,10));planned=results();assert.equal(planned.filter(x=>new Date(x.scheduledAt).getDate()===2).length,2,'historical marker reserves daily capacity');assert.ok(planned.every(x=>x.scheduledAt!==h.scheduledAt),'historical minute reserved');assert.deepEqual(store.getQueue().find(x=>x.id==='history'),h);
setup(1);q=store.getQueue();q.push({id:'bad',state:'scheduled',scheduledAt:'2030-02-30T12:00:00Z'});store.setQueue(q);const before=JSON.stringify(store.getQueue());buildSchedule(local(2030,1,1,10));assert.equal(JSON.stringify(store.getQueue()),before,'invalid history preserves queue');
setup(2);q=store.getQueue();q[1].media='photo';q[1].scheduledAt='2030-01-10T12:00:00Z';store.setQueue(q);buildSchedule(local(2030,1,1,10));assert.equal(store.getQueue()[1].scheduledAt,null,'parked stale time cleared');
if(process.env.TZ==='America/New_York') {for(const [when,start] of [[local(2026,3,8,0),'02:30'],[local(2026,11,1,0),'01:30']]) {setup(1,{startTime:start});q=store.getQueue();q[0].scheduledAt='2031-01-01T00:00:00Z';store.setQueue(q);let old=JSON.stringify(store.getQueue());buildSchedule(when);assert.equal(JSON.stringify(store.getQueue()),old,'DST gap or fold preserves existing plan');}}
if(process.env.TZ==='America/New_York') {setup(3,{startTime:'01:30',gapMinutes:60});q=store.getQueue();q[0].scheduledAt='2031-01-01T00:00:00Z';store.setQueue(q);let old=JSON.stringify(store.getQueue());buildSchedule(local(2026,3,8,0));assert.equal(JSON.stringify(store.getQueue()),old,'DST gap later in a plan leaves all records intact');}
if(process.env.TZ==='Australia/Lord_Howe') {for(const [when,start] of [[local(2026,10,4,0),'02:15'],[local(2026,4,5,0),'01:45']]) {setup(1,{startTime:start});const old=JSON.stringify(store.getQueue());buildSchedule(when);assert.equal(JSON.stringify(store.getQueue()),old,'half-hour DST gap or fold preserves plan');}}
let seed=98765;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
for(let trial=0;trial<100;trial++){
 const cap=1+rnd(12), days=1+rnd(4), hour=rnd(24), gap=[0,1,30,60,180][rnd(5)];
 setup(1+rnd(40),{startTime:String(hour).padStart(2,'0')+':30',gapMinutes:gap,daysAhead:days,dailyCap:cap});
 const now=local(2030,1,7,12);buildSchedule(now);const rows=results();const byDay={};let prev=now;
 for(const x of rows){const t=Date.parse(x.scheduledAt),d=new Date(t),key=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;assert.ok(t>prev,'strictly increasing and future, case '+trial);assert.equal(t%60000,0);prev=t;byDay[key]=(byDay[key]||0)+1;assert.ok(byDay[key]<=cap,'daily cap case '+trial);}
}
console.log('PASS: 100 seeded planner invariant cases');
console.log('PASS: browser-local future planning, caps, no spill, reserved history and DST checks in '+process.env.TZ);
