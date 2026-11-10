# X Bulk Scheduler (userscript)

A Tampermonkey userscript that harvests video links from X bookmarks/likes,
resolves re-shares to the original poster, prunes dead links, and hands posts to
X's native scheduler. Mobile-friendly (Firefox Android + Tampermonkey).

## Install / auto-update

Open this raw link in a browser that has Tampermonkey installed — Tampermonkey
will offer to install it, and will auto-update from the same URL afterwards:

**[Install / update](src/x-bulk-scheduler.user.js)**

Once installed, new versions are picked up automatically (Tampermonkey checks
periodically, or use its "Check for userscript updates").

## Synthetic Search regression test

The Search form has a local browser test with fictional input. All requests
are intercepted; it does not connect to X or use an account.

```sh
npm ci
npx playwright install chromium
npm run test:search
```

To use an existing compatible Chromium, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path instead of running
`playwright install`. This test does not verify the installed userscript, X's
live interface or screen-reader behavior.
