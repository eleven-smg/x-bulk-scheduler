# Review patch: preview 0.13.1-test.10 false dead-post classification

This is a proposed **offline preview patch**, not a change to the production userscript, an installed build, or a release. It addresses part of issue #59 and complements PR #75; do not merge as a substitute for an integrated fix. The preview source package is not in this repository.

## Scope and limits

Article text can be authored text or quoted content, so it cannot reliably prove the parent post is deleted. The patch disables that classifier rather than guessing. It retains the existing media filter: posts without supported media are still excluded, not saved for review. There is no confirmed-dead classifier or unknown-item review. Optional oEmbed 404 still skips the current preview item without deleting it; it is not proof of deletion. No account actions or live-provider verification were performed. Other preview issues, browser-local scheduling, storage races and release readiness are outside this patch.

The existing built-in self-test previously asserted that bare text established deletion. That expectation is intentionally changed to require an inconclusive result; the original supplied F14 regression remains unchanged and was run separately. New synthetic cases check photo, video, no-media and photo-disabled behavior. The extension's embedded source is kept identical to the patched source; the preview lock remains enabled.

## Applying to the supplied package for offline review

First preserve the original package. Check that its `src/x-bulk-scheduler.user.js` SHA-256 is `305401aceb681fc4d19bb6edbfa2548d09ebae723941049d28e628aafb1f4b44`. From a copy of the supplied `XBS-ISSUE-BATCH-CONTINUATION` contents, run `git apply --check /path/to/preview-0.13.1-test.10-f14.patch`, then `git apply /path/to/preview-0.13.1-test.10-f14.patch`. The expected patched source SHA-256 is `b7932a74ff5f48bfe63fe1d7e03be725a003b06e71f32a009c45e8f9b4e3c7c4`. The original `SHA256SUMS.txt` describes the unmodified package and will no longer match changed files; do not present it as validating the patched copy.

Run `XBS_SKIP_BROWSER=1 bash test/run-all.sh` offline. In this environment the available suite passed, including the new synthetic regression and four timezone runs; private replay fixtures and the synthetic browser suite were explicitly skipped. The original F14 test, supplied separately, also passed against the patched source. Test fixtures contain only fictional data. No X login, real account or network calls are needed for these checks.

**Do not install or deploy this patch as a production release.** It retains a preview-only execution lock and still requires integration, browser/device verification and scheduling work.
