'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

// Fictional DOM and fake requests only; all browser requests are intercepted.
test('authored unavailable wording and oEmbed errors never prove deletion', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
    await page.addInitScript(() => {
      const values = new Map();
      window.GM_getValue = (k, d) => values.has(k) ? values.get(k) : d;
      window.GM_setValue = (k, v) => values.set(k, v);
      window.GM_xmlhttpRequest = opts => {
        const x = window.fixtureResponse;
        if (x === 'throw') throw new Error('fixture request failure');
        if (x === 'timeout') return opts.ontimeout();
        if (x === 'network') return opts.onerror();
        opts.onload({ status: x });
      };
      window.module = { exports: {} };
    });
    await page.goto('https://x.com/i/history');
    await page.addScriptTag({ path: path.join(__dirname, '../src/x-bulk-scheduler.user.js') });
    const results = await page.evaluate(async () => {
      const x = window.module.exports;
      x.CONFIG.harvestPhotos = true;
      const article = document.createElement('article');
      article.dataset.testid = 'tweet';
      article.innerHTML = '<a href="/fictional/status/123"><time>now</time></a><p>This post is unavailable as an example; here is a photo.</p><div data-testid="tweetPhoto"></div>';
      document.body.appendChild(article);
      const out = [], stats = {domArticles:0, scanned:0, noId:0, noMedia:0, photoSkip:0, resolved:0, queued:0, alreadyHad:0, cap:10};
      x.collectFromView('bookmarks', new Set(), out, stats);
      article.remove();
      const cases = [
        ['photo-text', '<p>This post is unavailable in this story.</p><div data-testid="tweetPhoto"></div>'],
        ['video-quote', '<p>Example</p><div data-testid="videoPlayer"></div><div>This post was deleted</div>'],
        ['no-media-unavailable', '<p>This post is unavailable</p>'],
        ['no-media-neutral', '<p>Ordinary text</p>'],
      ];
      const casesOut = {};
      for (let i = 0; i < cases.length; i++) {
        const [label, html] = cases[i];
        const fixture = document.createElement('article'); fixture.dataset.testid = 'tweet';
        fixture.innerHTML = `<a href="/fictional/status/${200+i}"><time>now</time></a>${html}`;
        document.body.append(fixture);
        const items = [], result = {domArticles:0, scanned:0, noId:0, noMedia:0, photoSkip:0, resolved:0, queued:0, alreadyHad:0, tombstone:0, cap:10};
        x.collectFromView('bookmarks', new Set(), items, result);
        casesOut[label] = { media: items.map(v => v.media), noMedia: result.noMedia, tombstone: result.tombstone };
        fixture.remove();
      }
      x.CONFIG.useOembedCheck = true;
      const statuses = {};
      for (const response of [200, 402, 404, 403, 429, 500, 'timeout', 'network', 'throw']) {
        window.fixtureResponse = response;
        statuses[response] = await x.oembedCheck('123', 'fictional');
      }
      const record = {id:'123', url:'https://x.com/fictional/status/123/video/1', kind:'link', state:'queued', scheduledAt:'2030-01-01T10:00:00.000Z', errors:[]};
      x.store.setQueue([record]);
      window.fixtureResponse = 404;
      await x.runSchedule();
      const queue = x.store.getQueue();
      x.CONFIG.useOembedCheck = false;
      const disabled = await x.oembedCheck('123', 'fictional');
      return {out, stats, statuses, queue, record, disabled, casesOut};
    });
    assert.equal(results.out.length, 1, 'authored text must not suppress a valid photo');
    assert.equal(results.out[0].media, 'photo');
    assert.deepEqual(results.casesOut['photo-text'], {media:['photo'], noMedia:0, tombstone:0});
    assert.deepEqual(results.casesOut['video-quote'], {media:['video'], noMedia:0, tombstone:0});
    assert.deepEqual(results.casesOut['no-media-unavailable'], {media:[], noMedia:1, tombstone:0});
    assert.deepEqual(results.casesOut['no-media-neutral'], {media:[], noMedia:1, tombstone:0});
    assert.equal(results.statuses['200'], 'response_ok');
    for (const s of ['402','404','403','429','500','timeout','network','throw']) assert.equal(results.statuses[s], 'unknown', s);
    assert.deepEqual(results.queue, [results.record], 'inconclusive check must preserve the queued record');
    assert.equal(results.disabled, 'not_checked');
  } finally { await browser.close(); }
});
