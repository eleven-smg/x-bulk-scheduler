# Availability safeguard: synthetic tests

This partial change removes the unsafe use of arbitrary article text as proof of deletion. When the optional oEmbed check is enabled, a non-200 response, timeout or error leaves the queued item unchanged and skips that scheduling attempt. A 200 is only an oEmbed response, not proof of original identity or availability. When disabled (the default), the check is bypassed entirely.

The existing video/photo media filter still excludes posts with no detected media and does not preserve these as review candidates. This change does not identify confirmed-dead originals, classify restricted accounts, review already-marked-dead records, guard concurrent queue changes, or implement selected cleanup. Real X/provider, installed userscript and shared-browser behavior are untested. This is not a complete implementation of #59 or dependent issues #60–#62.

Install Node.js, Playwright and a compatible Chromium in your own test environment, then run `node --test tests/availability.synthetic.test.js` (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed). The test intercepts browser requests, uses fictional DOM and fake oEmbed responses, and makes no X account changes. It does not verify real X behavior.

The supplied test.10 handoff contained a separate photo/wording regression. It failed against that experimental source; the same behavior is exercised here through actual collection rather than its removed `isTombstone` function. Additional fictional photo, video, quoted wording and no-media cases check that text does not establish deletion. No-media cases remain excluded rather than retained for review; this test does not prove the experimental build is fixed.
