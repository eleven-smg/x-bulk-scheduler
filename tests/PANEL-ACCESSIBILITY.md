# Synthetic accessibility checks

Run with Node.js 20+, Playwright 1.65.0, axe-core 4.10.3 and a compatible
Chromium. All X requests are intercepted and the panel uses fictional storage:

```sh
mkdir -p /tmp/xbs-a11y-test
npm install --prefix /tmp/xbs-a11y-test --no-save playwright@1.65.0 axe-core@4.10.3
/tmp/xbs-a11y-test/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/xbs-a11y-test/node_modules node --test tests/panel-accessibility.browser.test.js
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a compatible system Chromium.
The test checks the minimize/expand control by keyboard, focusable log and labels,
plus selected axe WCAG 2/2.1 A/AA rules at narrow and wide synthetic sizes.
It is not a complete accessibility audit and must not be treated as one.

At upstream `df0f2570100748b7cc6c13836f201d163e57d70f`, a synthetic narrow
fixture found 14 color-contrast failures and one non-focusable scrollable log;
the minimize control was a non-keyboard-focusable span. The updated fixture
passed the selected automated checks locally. Screen-reader announcements,
complete focus order, every control state, actual X, installed userscript and
physical devices were not tested. Manual screen-reader and keyboard testing in
supported environments remains required before closing the accessibility issue.

An initial test run timed out when the test tried to find the toggle by its old
accessible name after it had changed to “Expand panel.” The test now uses the
stable control ID after checking the initial accessible name; the rerun passed.
This was a test-locator error, not an observed application failure.
