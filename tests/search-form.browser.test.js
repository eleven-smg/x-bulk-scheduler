'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

// Every request is intercepted and served locally. No X account or live
// actions are involved; the userscript sees a fictional empty page and store.
test('inline search validates, cancels, restores focus and navigates safely', async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [];
    await page.route('**/*', async route => {
      requests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    });
    await page.addInitScript(() => {
      const values = new Map();
      window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
      window.GM_setValue = (key, value) => values.set(key, value);
      window.GM_xmlhttpRequest = () => { throw new Error('Unexpected external request'); };
      window.prompt = () => { throw new Error('Native prompt must not be used'); };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    const trigger = page.locator('#xbs-panel button[data-a="search"]');
    const form = page.locator('#xbs-search-form');
    const input = page.getByLabel('Search keyword');
    await trigger.focus();
    await trigger.press('Enter');
    assert.equal(await form.isVisible(), true);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(await input.evaluate(el => document.activeElement === el), true);
    await input.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Open search' }).evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Cancel' }).evaluate(el => document.activeElement === el), true);

    await input.fill('   ');
    await page.getByRole('button', { name: 'Open search' }).click();
    assert.equal(await page.locator('#xbs-search-error').textContent(), 'Enter a search keyword.');
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.equal(requests.length, 1, 'invalid input must not navigate');
    await input.fill('fictional input');
    assert.equal(await page.locator('#xbs-search-error').textContent(), '');
    assert.equal(await input.getAttribute('aria-invalid'), null);
    await input.press('Escape');
    assert.equal(await form.isHidden(), true);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    assert.equal(requests.length, 1, 'cancellation must not navigate');

    await trigger.click();
    assert.equal(await input.inputValue(), '');
    await input.fill('another search');
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert.equal(await form.isHidden(), true);
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true);
    await trigger.click();
    await input.fill('fictional & sample');
    await Promise.all([page.waitForURL('**/search?*'), input.press('Enter')]);
    const url = new URL(page.url());
    assert.equal(url.origin, 'https://x.com');
    assert.equal(url.pathname, '/search');
    assert.equal(url.searchParams.get('q'), 'fictional & sample filter:native_video -filter:replies min_faves:1000');
    assert.equal(url.searchParams.get('f'), 'live');
    assert.equal(requests.length, 2, 'only synthetic page and search navigation are expected');
  } finally {
    await browser.close();
  }
});
