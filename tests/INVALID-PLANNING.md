# Draft: browser-local planning safety

This proposal validates timing inputs, then builds browser-local future slots at picker-minute precision. It enforces the lower of the preset and configured per-day caps, does not spill a day's slots into another local day, clears stale times from queued items including parked photos, and reserves the local day and minute of existing `scheduled` markers. A marker is not proof of delivery. Unparseable marker times leave the queue unchanged. Earlier queued records are rebuilt, and excess records wait without a time. A start time that has passed or equals the current instant moves to the next local day.

For each local wall minute, candidate timezone offsets are gathered at minute intervals across the nearby days and round-tripped. A missing or ambiguous minute, including tested DST gaps/folds, leaves the existing queue unchanged. This is conservative and may stop an entire build instead of skipping an ambiguous slot. Browser-local planning is a proposed policy, not verification of X's picker or saved instant. The existing picker is not fixed by this PR.

Bounds: gap 0–1440 minutes, days 1–366 and cap 1–1000; these are implementation choices, not verified X limits. Burst gaps round up to whole minutes because the picker cannot select seconds.

## Offline checks

- `for z in UTC Africa/Lagos America/New_York Asia/Tokyo America/Los_Angeles Australia/Lord_Howe; do TZ="$z" node tests/local-planner.node.js; done` — six timezone runs, each with 100 seeded invariant cases and targeted cases; New York and Lord Howe cases include gaps and folds. Uses fictional in-memory data, no network.
- `node --test tests/invalid-planning.synthetic.test.js` — one intercepted browser test, invalid inputs preserve plan and settings.
- Synthetic built-in self-test: 43/43 in UTC using an off-device Node harness. `node --check` and `git diff --check` passed.

## Not complete

This draft modifies the public-baseline implementation only, not the separately supplied preview build. It has not been tested in an installed userscript, X's real picker, or a live scheduling run; it does not establish actual saved times. Cross-tab/async storage races, ambiguous writes, account changes, stale plans after settings or timezone changes, and interaction with other draft PRs remain unresolved. The original source is not hardened against every malformed or unsupported timezone/history record. Older markers can be conservative false reservations. The full suite and device/accessibility checks have not been completed. Do not merge or deploy until integration and safety review.
