# Synthetic delayed-request test

Run with Node.js 20+ and Playwright 1.65.0 with a compatible Chromium:

```sh
mkdir -p /tmp/xbs-browser-test
npm install --prefix /tmp/xbs-browser-test --no-save playwright@1.65.0
/tmp/xbs-browser-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-browser-test/node_modules node --test tests/stop-delay.browser.test.js
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a compatible system Chromium.
All page requests are intercepted, and the delayed oEmbed response and storage
are fictional. The reported time measures the Stop click to the visible notice;
it is not a claim that an in-flight request was aborted. The test covers the
oEmbed callback boundary only. Live composer/picker work already in progress,
other actions, installed managers, supported devices and real request timing
remain unverified.
