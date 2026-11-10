# Synthetic community-settings tests

Run with Node.js 20+, Playwright 1.65.0 and compatible Chromium:

```sh
mkdir -p /tmp/xbs-browser-test
npm install --prefix /tmp/xbs-browser-test --no-save playwright@1.65.0
/tmp/xbs-browser-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-browser-test/node_modules node --test tests/community-settings.browser.test.js
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a compatible system Chromium.
Both tests intercept requests and use fictional storage. They check inline settings,
listing, review and cancellation, invalid data, synchronous write failures, stale
review detection, and guarded deletion. Planning doesn't mark links posted;
legacy plans without an account or plans from a different account are blocked
from posting until rebuilt. A referenced collection cannot be deleted; there is
no inline control to clear a saved plan. Existing plans can be replaced only
following review and confirmation.

Writes are not cross-tab transactions; asynchronous or ambiguous manager failures
are unverified. Installed userscript, real X and screen-reader behavior were not
tested. No community post or real account action was performed.
