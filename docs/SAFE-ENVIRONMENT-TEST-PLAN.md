# Safe environment and installation test plan

This is a plan, not a record of a completed installation or a claim that a
particular browser, phone or extension is supported by this project. Actual
environments, installed builds and current permissions must be verified and
recorded separately. Do not publish credentials, account identifiers, private
queues or post data. Never send, schedule, like, follow or delete anything as
part of these checks.

## Prerequisites

- Use an isolated browser profile with disposable synthetic storage and an
  explicitly authorized environment. Record OS, device, browser and userscript
  manager/extension versions. Avoid touching a real user's drafts or queue.
- Identify the exact reviewed source revision and independently compare the
  installed artifact. A local source checkout is not an installed build.
- For an extension preview, obtain the **actual reviewed preview-only
  extension artifact**, inspect its manifest and granted host/API permissions,
  and verify that live posting, Likes, community posting and removal are locked
  throughout the intended workflow. If the artifact or safety evidence is
  missing, stop and mark the check blocked. Public main's userscript is not
  established to be this preview-only extension.
- Before running any built-in self-test, review its implementation. Public
  main's self-test snapshots and restores storage, so it must not be run on a
  valuable queue or concurrently with another writer. Use disposable synthetic
  data only. Do not assume a restore proves no data loss.

## Tampermonkey installation checks

1. Install the manager only from its official browser store and confirm its
   version and browser compatibility. Tampermonkey lists Firefox and Firefox
   Android among its versions; that is not evidence that this project has been
   tested on either device. See [official browser/version list](https://www.tampermonkey.net/faq.php?locale=en&q=Q406).
2. Review the exact `.user.js` source and metadata before installing. The
   [official installation FAQ](https://www.tampermonkey.net/faq.php?q=Q102)
   describes installing a raw userscript or using the manager editor. Public
   main's update/download URLs point at a moving `main`; record and recheck
   provenance after an update. Do not install an unreviewed build.
3. In Chrome-based browsers, Tampermonkey's [permission FAQ](https://www.tampermonkey.net/faq.php?locale=en&q=Q209)
   says version 5.3+ requires permission to execute userscripts; Chrome 138+
   offers an **Allow User Scripts** toggle. The exact setting is browser and
   version dependent. Do not change security settings without the device
   owner's agreement; record an unavailable setting as a blocker.
4. Verify that the reviewed script is enabled for the intended host and that
   its code actually loads, using an approved safe, synthetic environment.
   Distinguish manager installation failure, userscript permission/host-match
   failure, and application errors. Do not count a manager listing alone as a
   successful application test.

## Preview extension and device checks

Use the reviewed preview-only artifact and synthetic records. On each actually
available desktop and mobile device, separately check:

- Installation, enabled permissions and exact artifact identity; no extra
  permissions granted without review.
- Layout at the device's actual viewport and orientation, readable controls,
  keyboard/touch operation and status/error messages. Emulation is not a
  substitute for a physical phone.
- Synthetic storage persists across reload and errors preserve existing data;
  no live account data or concurrent personal writer is involved.
- Preview actions remain locked from live side effects; check cancellation and
  delayed callbacks using a controlled request. Record observed timing, not a
  promised maximum. Do not use production services to simulate failure.
- At every step, stop on an unexpected live-action prompt or uncertain outcome.
  Do not repeat a potentially completed action.

## Evidence record

For each environment record: date, exact revision/hash, artifact source,
OS/device/browser/manager versions, permissions, synthetic procedure,
expected and observed results, pass/fail/blocked/not run, and remaining risks.
Include only sanitized evidence. A single device result does not establish
support elsewhere. Manual screen-reader results and independently authorized
real-X checks remain separate.

## Current status of this plan

No preview extension was supplied or installed, and no Tampermonkey, physical
phone or installed-device check was performed while writing this document.
Treat all actual environment results as **not run** until supported by evidence.
