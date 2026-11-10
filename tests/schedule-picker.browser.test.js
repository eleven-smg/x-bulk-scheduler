'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

test('browser-local instant mapping and ambiguous picker controls fail safely', async t => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    for (const timezoneId of ['Pacific/Honolulu', 'Asia/Tokyo']) {
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();
      await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
      await page.addInitScript(() => {
        const values = new Map(); window.__values = values; window.GM_getValue = (k, d) => values.has(k) ? values.get(k) : d;
        window.GM_setValue = (k, v) => values.set(k, v); window.GM_xmlhttpRequest = () => { throw Error('Unexpected network'); };
        window.module = { exports: {} };
      });
      await page.goto('https://x.com/');
      await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
      const originalQueue = JSON.stringify([{ id: '1', state: 'queued', scheduledAt: '2030-01-01T00:00:00Z' }]);
      await page.evaluate((queue) => { window.__values.set('xbs_queue', queue); window.module.exports.CONFIG.dryRun = false; }, originalQueue);
      await page.locator('button[data-a="run"]').click();
      assert.match(await page.locator('#xbs-log').textContent(), /Live run blocked: picker timezone has not been verified/);
      assert.equal(await page.evaluate(() => window.__values.get('xbs_queue')), originalQueue);
      assert.equal(page.url(), 'https://x.com/');
      await page.evaluate(() => { window.module.exports.CONFIG.dryRun = true; });
      await page.evaluate(() => {
        const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog);
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const options = [months, Array.from({length:31}, (_, i) => String(i + 1)), ['2029','2030'], Array.from({length:12}, (_, i) => String(i + 1)), Array.from({length:60}, (_, i) => String(i).padStart(2, '0')), ['AM','PM']];
        options.forEach((list, i) => { let s = document.createElement('select'); s.id = `SELECTOR_${i + 1}`; list.forEach(x => s.add(new Option(x, x))); dialog.append(s); });
        const confirm = document.createElement('button'); confirm.textContent = 'Confirm'; confirm.addEventListener('click', () => { window.__confirmed++; }); dialog.append(confirm); window.__confirmed = 0;
      });
      const blocked = await page.evaluate(async () => {
        try { await window.module.exports.setSchedulePicker('2029-12-31T23:30:00.000Z'); return 'unexpected success'; }
        catch (e) { return e.message; }
      });
      assert.match(blocked, /timezone has not been verified/);
      assert.equal(await page.evaluate(() => window.__confirmed), 0);
      await page.evaluate(() => window.module.exports.setSchedulePicker('2029-12-31T23:30:00.000Z', true));
      const got = await page.evaluate(() => ({ values: Array.from(document.querySelectorAll('[role=dialog] select')).map(s => s.selectedOptions[0].textContent), count: window.__confirmed }));
      assert.deepEqual(got, { values: timezoneId === 'Pacific/Honolulu' ? ['December','31','2029','1','30','PM'] : ['January','1','2030','8','30','AM'], count: 1 });
      const duplicateId = await page.evaluate(async () => {
        const original = document.querySelector('#SELECTOR_4'); const duplicate = original.cloneNode(true); original.after(duplicate); window.__confirmed = 0;
        try { await window.module.exports.setSchedulePicker('2029-12-31T23:30:00.000Z', true); return 'unexpected success'; }
        catch (e) { return e.message; } finally { duplicate.remove(); }
      });
      assert.match(duplicateId, /missing/);
      assert.equal(await page.evaluate(() => window.__confirmed), 0);
      const duplicateConfirm = await page.evaluate(async () => {
        const button = document.querySelector('[role=dialog] button'); const duplicate = button.cloneNode(true); button.after(duplicate); window.__confirmed = 0;
        try { await window.module.exports.setSchedulePicker('2029-12-31T23:30:00.000Z', true); return 'unexpected success'; }
        catch (e) { return e.message; } finally { duplicate.remove(); }
      });
      assert.match(duplicateConfirm, /ambiguous/);
      assert.equal(await page.evaluate(() => window.__confirmed), 0);
      const invalid = await page.evaluate(async () => {
        try { await window.module.exports.setSchedulePicker('not a date', true); return 'unexpected success'; } catch (e) { return e.message; }
      });
      assert.match(invalid, /Invalid scheduled instant/);
      t.diagnostic(`Synthetic picker verified with host timezone ${timezoneId}`);
      await context.close();
    }
  } finally { await browser.close(); }
});
