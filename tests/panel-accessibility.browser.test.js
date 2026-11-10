'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const axePath = require.resolve('axe-core/axe.min.js');

test('synthetic panel keyboard controls and selected axe checks', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await browser.newPage({ viewport });
      const requests = [];
      await page.route('**/*', route => {
        requests.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="en"><title>fixture</title><body></body></html>' });
      });
      await page.addInitScript(() => {
        const values = new Map();
        window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
        window.GM_setValue = (key, value) => values.set(key, value);
        window.GM_xmlhttpRequest = () => { throw new Error('Unexpected network request'); };
      });
      await page.goto('https://x.com/');
      await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
      assert.equal(await page.getByRole('button', { name: 'Minimize panel' }).count(), 1);
      const toggle = page.locator('#xbs-min');
      await toggle.focus();
      await toggle.press('Enter');
      assert.equal(await page.locator('#xbs-body').isHidden(), true);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await toggle.getAttribute('aria-label'), 'Expand panel');
      await toggle.press('Space');
      assert.equal(await page.locator('#xbs-body').isVisible(), true);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.getByRole('log', { name: 'Scheduler activity' }).focus();
      assert.equal(await page.locator('#xbs-log').evaluate(el => document.activeElement === el), true);
      assert.equal(await page.getByLabel('Number of new posts to harvest').count(), 1);
      assert.equal(await page.getByLabel('Spread shuffle group size').count(), 1);
      assert.equal(await page.getByLabel('Number of search posts to like').count(), 1);
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(() => axe.run('#xbs-panel', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
      t.diagnostic(`${viewport.width}x${viewport.height}: ${result.violations.length} selected axe violations; ${result.incomplete.length} need manual review`);
      assert.deepEqual(result.violations.map(v => v.id), []);
      assert.equal(requests.length, 1, 'all requests are intercepted');
      await page.close();
    }
  } finally { await browser.close(); }
});
