# Synthetic schedule-picker test

Run with Node.js 20+, Playwright 1.65.0 and a compatible Chromium:

```sh
mkdir -p /tmp/xbs-browser-test
npm install --prefix /tmp/xbs-browser-test --no-save playwright@1.65.0
/tmp/xbs-browser-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-browser-test/node_modules node --test tests/schedule-picker.browser.test.js
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a compatible system Chromium.
The test intercepts all requests and uses an entirely fictional picker. It
checks browser-local year/day mapping in Honolulu and Tokyo, missing/duplicate
controls, ambiguous confirmation and invalid dates. No real post is submitted.

A correct synthetic mapping is not proof that X's current picker always uses browser local time or
has these controls. The actual picker, its displayed timezone, selected instant,
userscript manager and DOM rerenders remain unverified. The strict shape and
single-dialog checks deliberately stop if the site differs; they may prevent
scheduling in an unsupported environment. Any actual X check requires a
separately authorized isolated draft and must stop before submitting a post.

Live scheduling is intentionally blocked by default before opening the
composer, because actual picker timezone verification is absent. Synthetic
fixtures opt in explicitly to exercise the pure mapping and control checks;
they do not enable the production caller. Removing that block requires review
and independently verified evidence from the real supported X environment.

The empty real X picker displayed different zone labels after a browser timezone override on the same connection, but no selected instant was verified. Ambiguous DST transitions and the baseline WAT-formatted display remain unresolved. Live scheduling stays blocked.
