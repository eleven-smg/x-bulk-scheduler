# X Bulk Scheduler (userscript)

A Tampermonkey userscript intended to collect video links from X bookmarks and
Likes, identify sources and use X's scheduler. Source attribution and safe
dead-link handling are not fully verified. See the [test matrix](docs/FUNCTIONALITY-TESTS.md)
and [issue queue](docs/ISSUE-QUEUE.md) before use.

**Safety:** Earlier tests of the same public userscript source found past
scheduled times and duplicate composer insertion. Do not rely on it for live
posting or automatic cleanup until those issues and installed behavior are
verified. `main` is the auto-update source; merging code can affect installed
users. Preview/test builds are separate and are not assumed deployed.

## Install / auto-update

Open this raw link in a browser that has Tampermonkey installed — Tampermonkey
will offer to install it, and will auto-update from the same URL afterwards:

**[Install / update](src/x-bulk-scheduler.user.js)**

Once installed, new versions are picked up automatically (Tampermonkey checks
periodically, or use its "Check for userscript updates").
