'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('community settings validate and preserve saved values on failure', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [];
    await page.route('**/*', route => { requests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }); });
    await page.addInitScript(() => {
      window.__values = new Map([
        ['xbs_communities', JSON.stringify([{ name: 'existing', communities: [], unknown: 'keep' }])],
        ['xbs_settings', JSON.stringify({ communityDryRun: true, sessionCollections: { '2': 'existing' }, unknownField: 'keep' })]
      ]);
      window.__failKey = '';
      window.GM_getValue = (key, fallback) => window.__values.has(key) ? window.__values.get(key) : fallback;
      window.GM_setValue = (key, val) => { if (key === window.__failKey) throw Error('synthetic storage failure'); window.__values.set(key, val); };
      window.GM_xmlhttpRequest = () => { throw Error('Unexpected network request'); };
      window.prompt = () => { throw Error('Native prompt used by settings'); };
      window.module = { exports: {} };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    const read = key => page.evaluate(k => JSON.parse(window.__values.get(k)), key);
    const trigger = page.locator('button[data-a="communities"]');
    const form = page.getByRole('region', { name: 'Community settings' });
    const message = page.locator('#xbs-community-message');
    const collectionName = page.getByLabel('New collection name');
    const select = page.getByLabel('Collection', { exact: true });
    await trigger.focus(); await trigger.press('Enter');
    assert.equal(await form.isVisible(), true);
    assert.equal(await select.evaluate(el => document.activeElement === el), true);
    await collectionName.fill('unsaved'); await collectionName.press('Escape');
    assert.equal(await form.isHidden(), true);
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    assert.equal((await read('xbs_communities')).length, 1);

    await trigger.click();
    await page.getByRole('button', { name: 'Create collection' }).click();
    assert.match(await message.textContent(), /Enter a collection name/);
    await collectionName.fill('new collection');
    await page.evaluate(() => { window.__failKey = 'xbs_communities'; });
    await page.getByRole('button', { name: 'Create collection' }).click();
    assert.match(await message.textContent(), /Could not confirm the save/);
    assert.equal(await collectionName.inputValue(), 'new collection');
    assert.deepEqual(await read('xbs_communities'), [{ name: 'existing', communities: [], unknown: 'keep' }]);
    await page.evaluate(() => { window.__failKey = ''; });
    await page.getByRole('button', { name: 'Create collection' }).click();
    await select.selectOption('new collection');
    await page.getByLabel('Community name').fill('fictional group');
    await page.getByLabel('Community URL').fill('https://example.org/not-x');
    await page.getByRole('button', { name: 'Add community', exact: true }).click();
    assert.match(await message.textContent(), /X community URL/);
    assert.deepEqual((await read('xbs_communities'))[1].communities, []);
    await page.getByLabel('Community URL').fill('https://x.com/i/communities/123456');
    await page.getByRole('button', { name: 'Add community', exact: true }).click();
    assert.equal((await read('xbs_communities'))[1].communities.length, 1);
    assert.equal((await read('xbs_communities'))[0].unknown, 'keep');

    await page.getByLabel('Session number').fill('1');
    await page.evaluate(() => { window.__failKey = 'xbs_settings'; });
    await page.getByRole('button', { name: 'Assign collection' }).click();
    assert.match(await message.textContent(), /Could not confirm the save/);
    assert.deepEqual((await read('xbs_settings')).sessionCollections, { '2': 'existing' });
    assert.deepEqual(await page.evaluate(() => window.module.exports.CONFIG.sessionCollections), { '2': 'existing' });
    await page.evaluate(() => { window.__failKey = ''; });
    await page.getByRole('button', { name: 'Assign collection' }).click();
    const settings = await read('xbs_settings');
    assert.deepEqual(settings.sessionCollections, { '1': 'new collection', '2': 'existing' });
    assert.equal(settings.unknownField, 'keep');
    assert.equal(settings.communityDryRun, true);
    assert.equal(await page.evaluate(() => window.__values.has('xbs_community_plan')), false);
    assert.equal(requests.length, 1, 'no real requests or account actions');
  } finally { await browser.close(); }
});

test('community plan and deletion require review and preserve saved data on failure', async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  try {
    const page = await browser.newPage(); let requests = 0;
    await page.route('**/*', route => {requests++;return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><a data-testid="AppTabBar_Profile_Link" href="/fixtureaccount"></a></body></html>'});});
    await page.addInitScript(() => {
      window.__values = new Map([
        ['xbs_communities',JSON.stringify([{name:'test',communities:[{name:'Group',url:'https://x.com/i/communities/123'}],unknown:'keep'},{name:'other',communities:[]}])],
        ['xbs_settings',JSON.stringify({communityDryRun:true,sessionCollections:{'1':'test'},unknownField:'keep'})],
        ['xbs_queue::fixtureaccount',JSON.stringify([{id:'100',kind:'link',state:'queued',url:'https://x.com/fixture/status/100'},{id:'101',kind:'caption',state:'queued',text:'fictional'}])],
        ['xbs_community_done',JSON.stringify({Group:['old']})]
      ]);
      window.__failKey='';
      window.GM_getValue=(k,d)=>window.__values.has(k)?window.__values.get(k):d;
      window.GM_setValue=(k,v)=>{if(k===window.__failKey)throw Error('synthetic storage failure');window.__values.set(k,v);};
      window.GM_xmlhttpRequest=()=>{throw Error('Unexpected network request');};
      window.prompt=()=>{throw Error('Unexpected native prompt');};
      window.module={exports:{}};
    });
    await page.goto('https://x.com/'); await page.addScriptTag({path:path.join(__dirname,'../src/x-bulk-scheduler.user.js')});
    const read=key=>page.evaluate(k=>window.__values.has(k)?JSON.parse(window.__values.get(k)):null,key);
    const select=page.getByLabel('Collection',{exact:true}), msg=page.locator('#xbs-community-message');
    await page.getByRole('button',{name:'Communities',exact:true}).click();
    assert.match(await page.locator('#xbs-community-list').textContent(),/test: Group/);
    await select.selectOption('test');
    await page.getByLabel('Links per community (1–100)').fill('0');
    await page.getByRole('button',{name:'Review community plan'}).click();
    assert.match(await msg.textContent(),/whole number/);
    await page.getByLabel('Links per community (1–100)').fill('2');
    await page.evaluate(() => { const c=JSON.parse(window.__values.get('xbs_communities')); c[0].communities[0].url='https://example.org/unsafe'; window.__values.set('xbs_communities',JSON.stringify(c)); });
    await page.getByRole('button',{name:'Review community plan'}).click();
    assert.match(await msg.textContent(),/Community records need review/);
    await page.evaluate(() => { const c=JSON.parse(window.__values.get('xbs_communities')); c[0].communities[0].url='https://x.com/i/communities/123'; window.__values.set('xbs_communities',JSON.stringify(c)); });
    await page.getByRole('button',{name:'Review community plan'}).click();
    assert.match(await page.locator('#xbs-community-plan-review-text').textContent(),/1 planned link/);
    await page.getByRole('button',{name:'Cancel plan review'}).click();
    assert.equal(await read('xbs_community_plan'),null);
    await page.getByRole('button',{name:'Review community plan'}).click();
    await page.evaluate(()=>window.__values.set('xbs_community_done',JSON.stringify({Group:['old','changed']})));
    await page.getByRole('button',{name:'Save reviewed plan'}).click();
    assert.match(await msg.textContent(),/changed since review/);
    assert.equal(await read('xbs_community_plan'),null);
    await page.getByRole('button',{name:'Review community plan'}).click();
    await page.evaluate(()=>window.__failKey='xbs_community_plan');
    await page.getByRole('button',{name:'Save reviewed plan'}).click();
    assert.match(await msg.textContent(),/Could not confirm the save/);
    assert.equal(await read('xbs_community_plan'),null);
    await page.evaluate(()=>window.__failKey='');
    await page.getByRole('button',{name:'Review community plan'}).click();
    await page.getByRole('button',{name:'Save reviewed plan'}).click();
    const plan=await read('xbs_community_plan');
    assert.equal(plan.account,'fixtureaccount');assert.equal(plan.collection,'test');assert.equal(plan.plan.length,1);
    assert.deepEqual(await read('xbs_community_done'),{Group:['old','changed']},'planning must not mark items as posted');
    assert.equal((await read('xbs_settings')).communityDryRun,true);
    await page.getByRole('button',{name:'Review community plan'}).click();
    assert.match(await page.locator('#xbs-community-plan-review-text').textContent(),/replac/i);
    await page.getByRole('button',{name:'Cancel plan review'}).click();
    assert.deepEqual(await read('xbs_community_plan'),plan);
    await page.getByRole('button',{name:'Review collection deletion'}).click();
    await page.getByRole('button',{name:'Cancel deletion'}).click();
    assert.equal((await read('xbs_communities')).length,2);
    await page.getByRole('button',{name:'Review collection deletion'}).click();
    await page.getByRole('button',{name:'Confirm collection deletion'}).click();
    assert.match(await msg.textContent(),/Clear session assignments/);
    assert.equal((await read('xbs_communities')).length,2);
    await page.getByLabel('Session number').fill('1');
    await page.getByRole('button',{name:'Clear assignment'}).click();
    await page.getByRole('button',{name:'Review collection deletion'}).click();
    await page.getByRole('button',{name:'Confirm collection deletion'}).click();
    assert.match(await msg.textContent(),/existing community plan/);
    await select.selectOption('other');
    await page.getByRole('button',{name:'Review collection deletion'}).click();
    await page.evaluate(()=>window.__failKey='xbs_communities');
    await page.getByRole('button',{name:'Confirm collection deletion'}).click();
    assert.match(await msg.textContent(),/Could not confirm the save/);
    assert.equal((await read('xbs_communities')).length,2);
    await page.evaluate(()=>window.__failKey='');
    await page.getByRole('button',{name:'Review collection deletion'}).click();
    await page.getByRole('button',{name:'Confirm collection deletion'}).click();
    assert.deepEqual((await read('xbs_communities')).map(c=>c.name),['test']);
    assert.equal((await read('xbs_communities'))[0].unknown,'keep');
    const legacy={plan:plan.plan};
    await page.evaluate(p=>window.__values.set('xbs_community_plan',JSON.stringify(p)),legacy);
    await page.getByRole('button',{name:'Post Community',exact:true}).click();
    assert.match(await page.locator('#xbs-log').textContent(),/account is unknown or mismatched/);
    assert.deepEqual(await read('xbs_community_plan'),legacy);
    assert.equal(requests,1,'no external requests or community posting');
  } finally {await browser.close();}
});
