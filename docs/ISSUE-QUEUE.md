# X Bulk Scheduler — issue queue

This file is the public project issue queue. It follows the four-section format requested: A unfinished, B added, C semi-completed, D completed. Each issue keeps its stable P ID when moved; section row numbers are for readability. The GitHub issue links are individual contribution threads. Personal account, device and login details are intentionally not published here.

## Status and session workflow

- ❌ Open; ❎ blocked by a stated dependency; ✔️ partly complete; ✅ complete only for the exact stated scope and evidence.
- At the start of each session, compare this file with open and closed GitHub issues and relevant project evidence. The file and GitHub issues do not sync automatically. Do not repeat finished implementation merely to fill a batch.
- Aim for 6–10 individual issues when feasible. Record the actual fixes, failed tests, blockers and partial progress. Do not claim closure or move a row to D until its stated acceptance and tests pass.
- Keep every issue and its stable ID in this file; add new issues to B. Move completed items to D with evidence; append session history, preserve prior edits and update section counts.
- Some outcomes overlap. In particular, P64 records an experimental source fix, while P66 tracks integrating it into public main; they are linked, not two independent fixes.
- Treat local source/mock, synthetic browser, installed extension, real X and deployed verification separately. Never publish credentials, private queue records or private post details.
- Public main was last observed at `09462e216a7936d1b7d84e0e77505aca8425bcc7` before this documentation-only change. Experimental userscript `0.13.1-test.10` is separate, preview-only and uninstalled; its fixes are not assumed to exist on main. Personal deployment is unknown.

## Suggested next batch (not a promise to close all)

1. P20 — investigate safe concurrent queue writes ([#1](https://github.com/eleven-smg/x-bulk-scheduler/issues/1)).
2. P21 — examine storage notifications and change ordering ([#8](https://github.com/eleven-smg/x-bulk-scheduler/issues/8)).
3. P45 — replace the Search prompt safely ([#13](https://github.com/eleven-smg/x-bulk-scheduler/issues/13)).
4. P46 — replace the caption prompt safely ([#14](https://github.com/eleven-smg/x-bulk-scheduler/issues/14)).
5. P47 — review community-settings prompts ([#15](https://github.com/eleven-smg/x-bulk-scheduler/issues/15)).
6. P49 — inspect accessibility ([#16](https://github.com/eleven-smg/x-bulk-scheduler/issues/16)).
7. P58 — design safe selected-Like cleanup ([#19](https://github.com/eleven-smg/x-bulk-scheduler/issues/19)).
8. P59 — design safe selected-bookmark cleanup ([#20](https://github.com/eleven-smg/x-bulk-scheduler/issues/20)).

## All individual issues

Counts below cover public project work only. A completed experimental result is not a claim that the public main branch or a deployment contains it.

### A. Unfinished (14)

| # | ID | Status | Outcome / next action | Evidence or remaining work |
|---|---|---|---|---|
| 1 | P20 | ❌ | Prevent saved queue updates from being lost across concurrent writers ([#1](https://github.com/eleven-smg/x-bulk-scheduler/issues/1)). | A direct writer overwrote an update in a synthetic model; revision checks are not atomic. |
| 2 | P21 | ❌ | Detect missed, delayed and reordered storage changes ([#8](https://github.com/eleven-smg/x-bulk-scheduler/issues/8)). | Real event delivery, batching and A→B→A changes remain unproven. |
| 3 | P38 | ❌ | Measure Stop responsiveness during a delayed request ([#10](https://github.com/eleven-smg/x-bulk-scheduler/issues/10)). | Measure real delayed-request response; no timing guarantee established. |
| 4 | P40 | ❌ | Prevent duplicated text in the X composer ([#11](https://github.com/eleven-smg/x-bulk-scheduler/issues/11)). | Earlier live test duplicated inserted text; real editor verification remains. |
| 5 | P43 | ❌ | Verify X schedule picker timezone and selected instant ([#12](https://github.com/eleven-smg/x-bulk-scheduler/issues/12)). | Verify the intended instant in the actual browser-local X picker without submitting a post; DST and selected-instant behavior remain open. |
| 6 | P45 | ❌ | Replace the unavailable Search prompt with accessible controls ([#13](https://github.com/eleven-smg/x-bulk-scheduler/issues/13)). | Search prompt remains unavailable in the preview build. |
| 7 | P46 | ❌ | Replace the unavailable caption prompt with accessible controls ([#14](https://github.com/eleven-smg/x-bulk-scheduler/issues/14)). | Caption prompt remains unavailable in the preview build. |
| 8 | P47 | ❌ | Replace unavailable community-settings prompts safely ([#15](https://github.com/eleven-smg/x-bulk-scheduler/issues/15)). | Settings prompt remains unavailable; do not enable community posting in tests. |
| 9 | P49 | ❌ | Verify keyboard and screen-reader accessibility ([#16](https://github.com/eleven-smg/x-bulk-scheduler/issues/16)). | Full keyboard and screen-reader acceptance remains open. |
| 10 | P51 | ❌ | Verify the latest test extension in a supported browser ([#17](https://github.com/eleven-smg/x-bulk-scheduler/issues/17)). | Latest preview extension is uninstalled and not verified. |
| 11 | P52 | ❎ | Verify userscript installation and operation in Tampermonkey ([#18](https://github.com/eleven-smg/x-bulk-scheduler/issues/18)). | Earlier host blocked user scripts; compatible test environment needed. |
| 12 | P53 | ❌ | Verify supported desktop and phone environments ([#54](https://github.com/eleven-smg/x-bulk-scheduler/issues/54)). | Verify suitable devices without assuming unsupported installation paths. |
| 13 | P54 | ❌ | Define and verify a release deployment checklist ([#55](https://github.com/eleven-smg/x-bulk-scheduler/issues/55)). | Current deployed revision is unknown; establish release verification. |
| 14 | P57 | ❎ | Verify video attribution with independently established saved examples ([#57](https://github.com/eleven-smg/x-bulk-scheduler/issues/57)). | Requires independently established example and a safely authorized test account. |

### B. Added issues (10)

| # | ID | Status | Outcome / next action | Evidence or remaining work |
|---|---|---|---|---|
| 1 | P58 | ❌ | Support safely removing selected Likes after collecting links ([#19](https://github.com/eleven-smg/x-bulk-scheduler/issues/19)). | Selected Like removal only after verified save; no real removal tests without authorization. |
| 2 | P59 | ❌ | Support safely removing selected bookmarks after collecting links ([#20](https://github.com/eleven-smg/x-bulk-scheduler/issues/20)). | Selected bookmark removal only after verified save; no real removal tests without authorization. |
| 3 | P60 | ❌ | Verify saved links before allowing Like cleanup ([#21](https://github.com/eleven-smg/x-bulk-scheduler/issues/21)). | Verify durable save before Like cleanup, including failures and interruptions. |
| 4 | P61 | ❌ | Verify saved links before allowing bookmark cleanup ([#22](https://github.com/eleven-smg/x-bulk-scheduler/issues/22)). | Verify durable save before bookmark cleanup, including failures and interruptions. |
| 5 | P62 | ❌ | Preserve deduplication after partial cleanup ([#23](https://github.com/eleven-smg/x-bulk-scheduler/issues/23)). | Test deduplication after partial cleanup without discarding records. |
| 6 | P66 | ❌ | Integrate the experimental malformed-video-URL fix into public main ([#58](https://github.com/eleven-smg/x-bulk-scheduler/issues/58)). | Source-only P64 is complete; review, integrate and test the fix on main. |
| 7 | P67 | ❌ | Distinguish confirmed dead originals from unknown availability ([#59](https://github.com/eleven-smg/x-bulk-scheduler/issues/59)). | Synthetic classification and evidence needed; a failed lookup alone is not proof. |
| 8 | P68 | ❌ | Skip confirmed dead originals during collection ([#60](https://github.com/eleven-smg/x-bulk-scheduler/issues/60)). | Depends on P67; keep uncertain items safe and preserve the queue. |
| 9 | P69 | ❌ | Recheck queued originals before planning ([#61](https://github.com/eleven-smg/x-bulk-scheduler/issues/61)). | Exclude confirmed dead; preserve records pending clarity on queue removal. |
| 10 | P70 | ❌ | Safely remove selected Likes or bookmarks for confirmed dead posts ([#62](https://github.com/eleven-smg/x-bulk-scheduler/issues/62)). | Depends on P67 and existing selected-cleanup safeguards; not implemented. |

### C. Semi-completed (36)

| # | ID | Status | Outcome / next action | Evidence or remaining work |
|---|---|---|---|---|
| 1 | P05 | ✔️ | Provide a simple three-section interface ([#24](https://github.com/eleven-smg/x-bulk-scheduler/issues/24)). | Prototype interface exists; latest build needs browser and accessibility verification. |
| 2 | P06 | ✔️ | Verify collection of bookmarked links ([#25](https://github.com/eleven-smg/x-bulk-scheduler/issues/25)). | Earlier collection worked; latest build still needs real-environment verification. |
| 3 | P07 | ✔️ | Verify collection of liked-post links ([#26](https://github.com/eleven-smg/x-bulk-scheduler/issues/26)). | Earlier collection worked; latest build still needs real-environment verification. |
| 4 | P08 | ✔️ | Avoid duplicate collected links ([#27](https://github.com/eleven-smg/x-bulk-scheduler/issues/27)). | Deduplication has been checked; latest build and concurrency remain unverified. |
| 5 | P09 | ✔️ | Preserve saved links after reload ([#28](https://github.com/eleven-smg/x-bulk-scheduler/issues/28)). | Earlier reload persistence was checked; latest build needs verification. |
| 6 | P10 | ✔️ | Mix waiting posts without losing links ([#29](https://github.com/eleven-smg/x-bulk-scheduler/issues/29)). | Earlier ordering preserved records; latest build needs runtime verification. |
| 7 | P11 | ✔️ | Spread similar queued posts apart safely ([#30](https://github.com/eleven-smg/x-bulk-scheduler/issues/30)). | Earlier and seeded synthetic checks passed; current runtime needs verification. |
| 8 | P12 | ✔️ | Verify the collect-photos toggle ([#31](https://github.com/eleven-smg/x-bulk-scheduler/issues/31)). | Earlier toggle checked; latest build needs runtime verification. |
| 9 | P13 | ✔️ | Include or park photos correctly in a preview plan ([#32](https://github.com/eleven-smg/x-bulk-scheduler/issues/32)). | Source/mock checks passed; latest build needs runtime verification. |
| 10 | P14 | ✔️ | Resolve original video posts from shared or quoted posts ([#2](https://github.com/eleven-smg/x-bulk-scheduler/issues/2)). | One independently documented public example resolved in experimental source; broader verification remains. |
| 11 | P15 | ✔️ | Leave ambiguous video attribution unconfirmed ([#3](https://github.com/eleven-smg/x-bulk-scheduler/issues/3)). | Conflicting inputs are source/mock tested; real presentation needs verification. |
| 12 | P16 | ✔️ | Stop queue actions when account identity is unknown ([#4](https://github.com/eleven-smg/x-bulk-scheduler/issues/4)). | Source/mock safeguards exist; actual account switches remain unverified. |
| 13 | P17 | ✔️ | Isolate saved queues and settings between accounts ([#5](https://github.com/eleven-smg/x-bulk-scheduler/issues/5)). | Source/mock isolation tested; real multi-account behavior remains unverified. |
| 14 | P18 | ✔️ | Preserve malformed or duplicate saved records ([#6](https://github.com/eleven-smg/x-bulk-scheduler/issues/6)). | Source/mock preservation tested; real storage needs verification. |
| 15 | P19 | ✔️ | Prevent stale video-source results overwriting queue edits ([#7](https://github.com/eleven-smg/x-bulk-scheduler/issues/7)). | Synthetic resolver concurrency tests passed; real cross-tab behavior remains open. |
| 16 | P22 | ✔️ | Preserve unknown settings when saving a known setting ([#33](https://github.com/eleven-smg/x-bulk-scheduler/issues/33)). | Targeted saves tested in mocks; actual storage needs verification. |
| 17 | P23 | ✔️ | Handle pending and failed saves without losing data ([#34](https://github.com/eleven-smg/x-bulk-scheduler/issues/34)). | Source/mock guards exist; actual async extension behavior remains unverified. |
| 18 | P24 | ✔️ | Preserve legacy scheduled records during planning ([#35](https://github.com/eleven-smg/x-bulk-scheduler/issues/35)). | Source/mock planning preserves old markers; delivery is not assumed. |
| 19 | P26 | ✔️ | Build future-only preview times in West Africa Time ([#36](https://github.com/eleven-smg/x-bulk-scheduler/issues/36)). | WAT planning tested under four host timezones; actual X picker unverified. |
| 20 | P27 | ✔️ | Respect daily caps across multi-day plans ([#37](https://github.com/eleven-smg/x-bulk-scheduler/issues/37)). | Synthetic boundaries and caps tested; real X scheduling unverified. |
| 21 | P28 | ✔️ | Reject invalid planning times instead of normalizing them ([#38](https://github.com/eleven-smg/x-bulk-scheduler/issues/38)). | Invalid time rejection source/mock tested; runtime unverified. |
| 22 | P29 | ✔️ | Clear stale photo times when rebuilding without photos ([#39](https://github.com/eleven-smg/x-bulk-scheduler/issues/39)). | Source fix and earlier temporary-record fixture tested; latest build uninstalled. |
| 23 | P30 | ✔️ | Revalidate plans after queue or settings changes ([#40](https://github.com/eleven-smg/x-bulk-scheduler/issues/40)). | Whole-plan synthetic checks pass; independent tab changes unproven. |
| 24 | P31 | ✔️ | Hide unreliable preview counts for conflicting plans ([#41](https://github.com/eleven-smg/x-bulk-scheduler/issues/41)). | Source/interface mocks hide unreliable counts; browser verification remains. |
| 25 | P32 | ✔️ | Exclude expired previews from current counts ([#42](https://github.com/eleven-smg/x-bulk-scheduler/issues/42)). | Source/mock regression passed; actual runtime unverified. |
| 26 | P33 | ✔️ | Exclude parked photos from preview counts ([#43](https://github.com/eleven-smg/x-bulk-scheduler/issues/43)). | Source/mock regression passed; actual runtime unverified. |
| 27 | P34 | ✔️ | Show the next eligible future preview time ([#44](https://github.com/eleven-smg/x-bulk-scheduler/issues/44)). | Source/mock regression covers eligible future times and WAT boundaries. |
| 28 | P35 | ✔️ | Separate preview accounting from actual delivery ([#45](https://github.com/eleven-smg/x-bulk-scheduler/issues/45)). | Preview ledger source/mock tested; does not prove actual delivery. |
| 29 | P36 | ✔️ | Invalidate generated plan proof after shuffling ([#46](https://github.com/eleven-smg/x-bulk-scheduler/issues/46)). | Synthetic shuffle cleanup tested; actual runtime unverified. |
| 30 | P37 | ✔️ | Stop preview work safely when requested ([#47](https://github.com/eleven-smg/x-bulk-scheduler/issues/47)). | Mock cancellation tested; earlier runtime stopped eventually, no one-second guarantee. |
| 31 | P39 | ✔️ | Ignore callbacks arriving after a preview is stopped ([#48](https://github.com/eleven-smg/x-bulk-scheduler/issues/48)). | Synthetic delayed-callback tests pass; actual runtime unverified. |
| 32 | P41 | ✔️ | Preserve existing drafts when using the composer ([#49](https://github.com/eleven-smg/x-bulk-scheduler/issues/49)). | Source/mock draft-preservation checks exist; real X editor unverified. |
| 33 | P42 | ✔️ | Target schedule-picker controls unambiguously ([#50](https://github.com/eleven-smg/x-bulk-scheduler/issues/50)). | Source/mock picker targeting checks exist; actual picker unverified. |
| 34 | P44 | ✔️ | Replace native timing prompts with an accessible form ([#51](https://github.com/eleven-smg/x-bulk-scheduler/issues/51)). | In-page timing form exists experimentally; browser/accessibility verification remains. |
| 35 | P48 | ✔️ | Enforce preview-only safety locks in test builds ([#52](https://github.com/eleven-smg/x-bulk-scheduler/issues/52)). | Source locks tested; latest installed extension not verified. |
| 36 | P50 | ✔️ | Verify responsive interface at narrow and wide sizes ([#53](https://github.com/eleven-smg/x-bulk-scheduler/issues/53)). | Earlier wide/narrow screenshots checked; latest build and devices unverified. |

### D. Completed (7)

| # | ID | Status | Outcome | Evidence and scope |
|---|---|---|---|---|
| 1 | P01 | ✅ | Keep this project separate and preserve scope. | Project scope retained. |
| 2 | P02 | ✅ | Recheck the public repository baseline. | Main observed at 09462e216a7936d1b7d84e0e77505aca8425bcc7 before this documentation update. |
| 3 | P04 | ✅ | Preserve earlier source and history. | Earlier experimental history retained separately; not a published release. |
| 4 | P56 | ✅ | Compare one public shared-video example independently. | One public example matched in anonymous metadata; not universal correctness. |
| 5 | P64 | ✅ | Reject malformed video-source URLs in experimental source. | Eight malformed synthetic cases rejected and valid controls passed in test.10. Not yet integrated into main; see P66 and #58. |
| 6 | P25 | ✅ | Design a non-destructive review of legacy markers ([#9](https://github.com/eleven-smg/x-bulk-scheduler/issues/9)). | [PR #69](https://github.com/eleven-smg/x-bulk-scheduler/pull/69) merged; two synthetic model tests passed. No real delivery is asserted or records migrated. |
| 7 | P55 | ✅ | Define a safe real-post scheduling acceptance test ([#56](https://github.com/eleven-smg/x-bulk-scheduler/issues/56)). | [PR #65](https://github.com/eleven-smg/x-bulk-scheduler/pull/65) merged; checklist only. No live scheduling test or delivery is claimed. |

## Session updates — append, never replace

| Session | Outcomes | Remaining and repeat check | Evidence |
|---|---|---|---|
| Issue queue setup | Created this public four-section queue and linked individual GitHub issues. No application feature was implemented in this documentation update. | Main integration, real-runtime testing and open issues remain. This is an organization update, not a repeat implementation. | Public main before the file: `09462e216a7936d1b7d84e0e77505aca8425bcc7`; GitHub issues #1–#58 verified open at creation. |

## Functionality testing and dead-link requests

A separate [feature-by-feature functionality test matrix](FUNCTIONALITY-TESTS.md) records historical tests and outstanding checks. Added P67–P70 for availability evidence, collection, queued plans and selected cleanup. These are open and depend on safe classification; no automatic deletion or cleanup has been implemented. Existing Like/bookmark cleanup issues remain linked, not duplicated. Contributor testing is welcome via the individual `help wanted` issues. No application source was changed.

A new synthetic regression failed: ordinary post text with unavailable wording caused a fictional photo post to be marked as a tombstone in experimental test.10. The issue remains open; see [#59](https://github.com/eleven-smg/x-bulk-scheduler/issues/59#issuecomment-6592825450). The existing worker-free suite was intentionally rerun and passed; browser and real-X testing were skipped.

### Project review follow-up

Current public main before this documentation update was `35f46ceec3e45e1b182373f09444e88a65875b9f`; its userscript is byte-identical to the source at `09462e216a7936d1b7d84e0e77505aca8425bcc7` from the historical report. The report and its screenshots are historical evidence, not a current installed or deployed test. It references an experimental `0.13.1-test.10` package and private replay fixtures, neither present in this repository or supplied as source in the report. Do not publish private fixtures or account data.

[PR #64](https://github.com/eleven-smg/x-bulk-scheduler/pull/64) merged a release provenance checklist; [#55](https://github.com/eleven-smg/x-bulk-scheduler/issues/55) remains open because no installed release was verified. PR #69 completed the manual-review design in #9, not real delivery verification. PR #65 completed the written plan in #56, not a live post.

Code changes remain unmerged drafts: [#63](https://github.com/eleven-smg/x-bulk-scheduler/pull/63), [#66](https://github.com/eleven-smg/x-bulk-scheduler/pull/66), [#67–#68](https://github.com/eleven-smg/x-bulk-scheduler/pulls), and [#70–#80](https://github.com/eleven-smg/x-bulk-scheduler/pulls). Test current integration and installed behavior before release; multiple branches edit the same userscript. The latest [contribution tracker](https://github.com/dhillic/x-bulk-scheduler/blob/docs/contribution-tracker/CONTRIBUTION-STATUS.md) records individual PRs, exact test commands and caveats.
