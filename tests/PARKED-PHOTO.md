# Parked photo plan regression

Rebuilding with Mix Pics off clears `scheduledAt` on queued photos, including a photo-only queue. Other fields, duplicate records and non-queued history are preserved in the synthetic fixture. Day/session/slot metadata are not cleared. The build now writes the queue once instead of per item.

Cross-tab writes remain non-atomic, and asynchronous or ambiguous storage failures are unverified. Host-local timezone calculations, future-only planning and daily caps are outside this change. Real installed runtime/device behavior has not been verified; do not treat this as a complete scheduling fix.

With Node, Playwright and Chromium installed, run `node --test tests/parked-photo.synthetic.test.js` (set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed). The test intercepts requests and uses fictional in-memory data, including a synchronous save-failure fixture; it performs no live X actions.
