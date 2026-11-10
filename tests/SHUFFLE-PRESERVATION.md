# Shuffle preservation synthetic test

Free and spread shuffle operate only on queued schedulable record slots. Malformed, historical and parked entries stay in place; duplicate IDs and unknown fields remain distinct. When the shuffled order changes, generated `scheduledAt`, day, session and slot values for the movable pool are cleared; an unchanged shuffle leaves them alone. The test covers 100 seeded runs, both modes, duplicates, fixed entries, no-op order and synchronous queue-write failure.

This baseline has no separate experimental plan-proof field; such fields are not invalidated by this change. Cross-tab lost updates, asynchronous/ambiguous write failures, real storage managers and installed runtime are unverified. No live X behavior or account actions are tested.

With Node, Playwright and Chromium installed run `node --test tests/shuffle-preservation.synthetic.test.js`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` as needed. Browser requests are intercepted and storage is fictional/in-memory.
