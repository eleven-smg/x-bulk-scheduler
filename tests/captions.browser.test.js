'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('caption controls validate, cancel and preserve text on storage failure', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [];
    await page.route('**/*', async route => {
      requests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    });
    await page.addInitScript(() => {
      window.__values = new Map([['xbs_captions', JSON.stringify({ pool: ['existing'], used: [] })]]);
      window.__failKey = '';
      window.GM_getValue = (key, fallback) => window.__values.has(key) ? window.__values.get(key) : fallback;
      window.GM_setValue = (key, value) => { if (key === window.__failKey) throw new Error('synthetic storage failure'); window.__values.set(key, value); };
      window.GM_xmlhttpRequest = () => { throw new Error('Unexpected network request'); };
      window.prompt = () => { throw new Error('Native prompt used'); };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    const trigger = page.locator('button[data-a="captions"]');
    const text = page.getByLabel('New captions, one per line');
    const count = page.getByLabel('Number of saved captions to queue');
    const message = page.locator('#xbs-caption-message');
    const readPool = () => page.evaluate(() => JSON.parse(window.__values.get('xbs_captions')));
    await trigger.focus(); await trigger.press('Enter');
    assert.equal(await text.evaluate(el => document.activeElement === el), true);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.getByRole('button', { name: 'Add captions' }).click();
    assert.equal(await text.getAttribute('aria-invalid'), 'true');
    await text.fill('do not save'); await text.press('Escape');
    assert.equal(await page.locator('#xbs-caption-form').isHidden(), true);
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    assert.deepEqual((await readPool()).pool, ['existing']);

    await trigger.click(); await text.fill('new caption');
    await page.evaluate(() => { window.__failKey = 'xbs_captions'; });
    await page.getByRole('button', { name: 'Add captions' }).click();
    assert.equal(await text.inputValue(), 'new caption');
    assert.match(await message.textContent(), /could not confirm/i);
    assert.deepEqual((await readPool()).pool, ['existing']);
    await page.evaluate(() => { window.__failKey = ''; });
    await page.getByRole('button', { name: 'Add captions' }).click();
    assert.deepEqual((await readPool()).pool, ['existing', 'new caption']);
    assert.equal(await text.inputValue(), '');

    await count.fill('0'); await page.getByRole('button', { name: 'Queue captions' }).click();
    assert.equal(await count.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => window.__values.has('xbs_queue')), false);
    await count.fill('2'); await text.fill('unsaved');
    await page.getByRole('button', { name: 'Queue captions' }).click();
    assert.match(await message.textContent(), /unsaved/i);
    assert.equal(await text.inputValue(), 'unsaved');
    const existing = {id:'fictional-link',kind:'link',state:'queued',url:'https://x.com/fiction/status/123',scheduledAt:'2035-01-01T10:00:00Z',day:1,session:2,slot:3,extra:'keep'};
    await page.evaluate(item => window.__values.set('xbs_queue',JSON.stringify([item])), existing);
    await text.fill(''); await page.getByRole('button', { name: 'Queue captions' }).click();
    assert.match(await message.textContent(), /nothing was posted/i);
    const queued = await page.evaluate(() => JSON.parse(window.__values.get('xbs_queue')));
    assert.equal(queued.length, 3);
    assert.deepEqual(queued[0], existing, 'queueing captions must not rebuild existing plans');
    assert.ok(queued.slice(1).every(x => x.kind === 'caption' && x.scheduledAt === null));
    assert.deepEqual((await readPool()).pool, ['existing', 'new caption']);
    await page.evaluate(() => { window.__failKey = 'xbs_queue'; });
    await page.getByRole('button', { name: 'Queue captions' }).click();
    assert.match(await message.textContent(), /some items may have been added/i);
    assert.deepEqual((await readPool()).pool, ['existing', 'new caption']);
    assert.equal(requests.length, 1, 'no external requests or navigations');
  } finally { await browser.close(); }
});
