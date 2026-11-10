# Synthetic composer insertion test

Run with Node.js 20+, Playwright 1.65.0 and a compatible Chromium:

```sh
mkdir -p /tmp/xbs-browser-test
npm install --prefix /tmp/xbs-browser-test --no-save playwright@1.65.0
/tmp/xbs-browser-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-browser-test/node_modules node --test tests/composer-insertion.browser.test.js
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a compatible system Chromium.
The test uses a fictional contenteditable and intercepted page requests; it
never opens a real X composer or alters a real draft. It checks a nonempty text
draft, an uncertain insertion result, a stable rerender and duplicate text
appearing inside a 500 ms observation window.

This is a partial safeguard, not proof that X's editor is safe. A host might
rerender after 500 ms, replace the element or have non-text draft attachments.
No real X editor, existing live draft or supported userscript manager was
verified. Obtain separate authorization and use an isolated test draft for any
live verification; do not submit a post. A failed or uncertain insertion may
leave text in the draft and must not be automatically retried.
