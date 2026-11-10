# Safe real-post scheduling acceptance test

This is a **plan**, not authorization to post. No live test is part of the
repository's automated tests. Do not start until the account owner explicitly
approves the exact account, single post, destination, content, scheduled instant
and any later cleanup. Keep these details and all credentials out of public
reports. Use fictional data for rehearsal.

## Before approval

- Record the reviewed source revision and separately verify the installed
  build. A local checkout is not evidence of what is deployed.
- Use an authorized account and an isolated test environment. Review the
  exact text/link/media, visibility and one target. Agree on the date, time,
  IANA timezone and corresponding UTC instant, including day-boundary effects.
- Independently check that the displayed X picker timezone and selected instant
  match the approved instant. If the controls or timezone are ambiguous, stop.
  The existing picker mapping is not proof that every environment is correct.
- Review every side effect of the installed build and keep Likes, community
  posting, bookmark removal and other unrelated actions disabled. Do not touch
  existing drafts or private queues. Agree on what to do with a test post or
  scheduled item after the test; cleanup requires its own exact approval.
- Ensure exactly one intended item can be submitted. On public main,
  `runSchedule()` processes all eligible queued items; a single-target run is
  **not guaranteed** just by selecting a time. Do not use it for a live test
  until the operator has verified isolation and the reviewed build enforces
  the agreed scope.
- A dry run is not delivery evidence. In public main it can also change a
  queue item's state to `scheduled`; never run it against valuable records
  merely to rehearse. Use disposable synthetic records instead.

## Approval and execution

Obtain a fresh, explicit confirmation of the exact target, content and UTC
instant immediately before the one permitted action. Do not infer approval
from this checklist, a general testing request, or a dry run. If the account,
content, picker, target, timing, side effects or result differ from the
approval, stop and ask again. Never retry automatically after an uncertain
submission.

## Evidence and outcomes

- Immediately inspect X's own scheduled-posts view for the exact approved item
  and displayed time. A closed composer, a userscript log or a local
  `scheduled` marker alone does not establish acceptance by X.
- At the agreed time independently check whether the intended post was actually
  delivered. Distinguish **scheduled**, **delivered**, **failed**, **unknown**
  and **not run**. If evidence is missing or contradictory, record **unknown**;
  do not submit again or silently relabel existing records.
- Record date, reviewed and installed revisions, browser and manager versions,
  approved scope, expected versus observed instant, and pass/fail/unknown.
  Public evidence must omit private content, identifiers, credentials and
  account data.
- Only perform separately approved cleanup, with its exact target and effect
  confirmed. If approval is absent or the outcome is uncertain, leave the item
  untouched and report the remaining decision.
