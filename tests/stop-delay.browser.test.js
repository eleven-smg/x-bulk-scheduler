'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('a delayed oEmbed callback cannot mutate a stopped or restarted run', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await page.addInitScript(() => {
      const item = { id: '12345', url: 'https://x.com/fictional/status/12345', state: 'queued', kind: 'link', scheduledAt: '2030-01-01T10:00:00.000Z', errors: [] };
      window.__values = new Map([['xbs_queue', JSON.stringify([item])]]);
      window.__pending = [];
      window.GM_getValue = (key, fallback) => window.__values.has(key) ? window.__values.get(key) : fallback;
      window.GM_setValue = (key, val) => window.__values.set(key, val);
      window.GM_xmlhttpRequest = opts => { window.__pending.push(opts); };
      window.module = { exports: {} };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    await page.evaluate(() => { window.module.exports.CONFIG.useOembedCheck = true; });
    const run = page.locator('button[data-a="run"]');
    const stop = page.locator('button[data-a="stop"]');
    const queue = () => page.evaluate(() => JSON.parse(window.__values.get('xbs_queue')));
    await run.click();
    await page.waitForFunction(() => window.__pending.length === 1);
    const start = Date.now();
    await stop.click();
    await page.waitForFunction(() => document.querySelector('#xbs-log').textContent.includes('PANIC: run halted'));
    t.diagnostic(`Synthetic Stop click to visible halt notice: ${Date.now() - start} ms; delayed request itself remains pending.`);
    assert.equal((await queue())[0].state, 'queued');
    // Restart before the old request resolves, then release the old 404.
    await run.click();
    await page.waitForFunction(() => window.__pending.length === 2);
    await page.evaluate(() => window.__pending[0].onload({ status: 404 }));
    await page.waitForTimeout(30);
    assert.equal((await queue())[0].state, 'queued', 'stale 404 must not mark the item dead');
    assert.ok(!(await page.locator('#xbs-log').textContent()).includes('dead, skipped'));
    // The new run must remain active and process its own successful callback.
    await page.evaluate(() => window.__pending[1].onload({ status: 200 }));
    await page.waitForFunction(() => JSON.parse(window.__values.get('xbs_queue'))[0].state === 'scheduled');
    assert.equal((await queue()).length, 1);
    assert.equal(await page.locator('#xbs-log').textContent().then(s => s.includes('[dryRun] scheduling')), true);
  } finally { await browser.close(); }
});
