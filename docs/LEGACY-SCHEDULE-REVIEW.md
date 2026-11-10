# Review legacy `scheduled` markers without changing records

A `scheduled` marker in an older queue can have been written by a preview. It
is not proof that X accepted or delivered a post. This is a **manual review
process**, not an automatic migration, repair, relabel or delivery check.
Leave the original queue, markers and backups unchanged throughout. Do not run
a scheduler, clear a queue, or click a post action to gather evidence.

## Before reviewing

- Use only an account the owner has explicitly authorized you to inspect.
  Agree on scope and privacy before opening any account or post. Never ask for
  credentials or copy private content, identifiers or queue data into a public
  issue or test fixture.
- Identify the reviewed and installed versions separately. Record the review
  date and method in a private, separate worksheet, not inside the queue. Do
  not create or restore a backup as a side effect of this procedure without
  the owner's agreement.
- Limit the review to records already marked `scheduled`. A malformed record,
  duplicate, unknown account, absent time or otherwise unclear match must stay
  **unconfirmed**; do not guess which post it represents.

## Review one record at a time

1. Inspect the existing marker and, independently, any authorized evidence in
   X's own scheduled-posts or published-post view. A script log, local marker,
   closed composer, a planned time or a preview is not independent evidence.
2. Compare the exact target, content and time privately, using the provider's
   displayed timezone and an independently checked UTC instant. If multiple
   candidates fit, the evidence is missing or inaccessible, the time cannot
   be mapped, or evidence conflicts, stop at **unconfirmed**.
3. Only when a reviewer establishes an unambiguous match with independent
   provider evidence, record separately:
   - **Confirmed scheduled:** X shows the matching item as scheduled. This is
     not evidence that it was later delivered.
   - **Confirmed delivered:** X shows the matching published post and the
     reviewer has checked the identity and timing of that match.
   - **Unconfirmed:** evidence is missing, ambiguous, conflicting or does not
     match. An absent item is not by itself proof of failure or deletion.
4. In the private worksheet, note the evidence type, observation date, reviewer
   and outcome. Restrict access and retention as agreed with the owner. Public
   reports should use counts or fictional examples, not account or post data.

The worksheet is an observation, not an update to the record. Any later change
to data, schedule, post or deletion requires a separately reviewed plan and
explicit approval. Do not retry a possible submission when its outcome is
uncertain.

## Synthetic design checks

`node --test tests/legacy-review.model.test.js` exercises missing, ambiguous,
mismatched, confirmed-scheduled and confirmed-delivered evidence with fictional
records. These checks model the decision rules above; they do not verify a
real account, change application behavior, or establish that actual evidence is
correct. An independently reviewed X workflow remains separate.
