'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('composer insertion is single-attempt and fails closed for uncertain text', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route('**/*', route => { requests.push(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }); });
    await page.addInitScript(() => {
      const values = new Map(); window.GM_getValue = (k, fallback) => values.has(k) ? values.get(k) : fallback;
      window.GM_setValue = (k, value) => values.set(k, value);
      window.GM_xmlhttpRequest = () => { throw new Error('Unexpected request'); };
      window.module = { exports: {} };
    });
    await page.goto('https://x.com/');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    const result = await page.evaluate(async () => {
      const insert = window.module.exports.insertIntoComposer;
      function boxWith(text) { const el = document.createElement('div'); el.contentEditable = 'true'; el.innerText = text; document.body.append(el); return el; }
      let calls = 0, fallbackEvents = 0;
      let box = boxWith('existing draft');
      document.execCommand = () => { calls++; return true; };
      const existing = await insert(box, 'new');
      const existingText = box.innerText; box.remove();
      box = boxWith('');
      box.addEventListener('beforeinput', () => { fallbackEvents++; box.innerText += 'new'; });
      document.execCommand = () => { calls++; box.innerText = 'new'; return false; };
      const uncertain = await insert(box, 'new');
      const uncertainText = box.innerText; box.remove();
      box = boxWith('');
      document.execCommand = () => { calls++; box.innerText = 'new'; setTimeout(() => { box.innerHTML = '<span>new</span>'; }, 100); return true; };
      const stable = await insert(box, 'new');
      const stableText = box.innerText; box.remove();
      box = boxWith('');
      document.execCommand = () => { calls++; box.innerText = 'new'; setTimeout(() => { box.innerText = 'newnew'; }, 100); return true; };
      const duplicate = await insert(box, 'new');
      const duplicateText = box.innerText; box.remove();
      return { existing, existingText, calls, fallbackEvents, uncertain, uncertainText, stable, stableText, duplicate, duplicateText };
    });
    assert.deepEqual(result, { existing: false, existingText: 'existing draft', calls: 3, fallbackEvents: 0,
      uncertain: false, uncertainText: 'new', stable: true, stableText: 'new', duplicate: false, duplicateText: 'newnew' });
    assert.equal(requests.length, 1);
  } finally { await browser.close(); }
});
