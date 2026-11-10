# Synthetic caption form test

The test runs with a fake X page and fictional userscript storage; all network
requests are intercepted. It does not post or alter real X drafts. It needs
Node.js 20+ and Playwright 1.65.0 with a compatible Chromium. For example, with
Playwright installed outside the checkout:

```sh
mkdir -p /tmp/xbs-browser-test
npm install --prefix /tmp/xbs-browser-test --no-save playwright@1.65.0
/tmp/xbs-browser-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-browser-test/node_modules node --test tests/captions.browser.test.js
```

Alternatively set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible system
Chromium. This synthetic test is not installed-userscript, real-X or manual
screen-reader validation; those checks remain separate.

Queueing captions does not rebuild or restamp the existing queue; use Build separately. The test checks a fictional existing schedule remains unchanged. Caption-pool and queue writes are still separate and may partially succeed; cross-tab and asynchronous failures remain unresolved.
