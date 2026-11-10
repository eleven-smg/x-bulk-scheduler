# Storage notification model

Run `node --test tests/storage-notifications.model.test.js` with Node.js 18 or
newer. It uses fictional values and does not connect to X or alter userscript
storage. The manually controlled scheduler explores delayed/reordered events,
missed or coalesced A→B→A, and a non-cooperating write between a revision check
and a write. The expected lost update is an illustration of the unsafe model,
not a passing guarantee for the application.

This model does **not** establish what a real browser, userscript manager or GM
storage API does. It cannot prove event delivery, atomicity, durability, or
conflict detection in any supported environment. Public main uses `GM_getValue`
and `GM_setValue`; a modeled notification is not evidence that this build
subscribes to notifications. Real supported-manager/browser tests, including
cross-tab writers and independently captured ordering, remain necessary.
Do not run those tests on personal queues: use disposable synthetic records,
record manager/browser versions, and preserve existing data.
