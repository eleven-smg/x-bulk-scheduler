# Release and installation provenance checklist

A source checkout, downloaded file, installed userscript and deployed extension
are different things. A local check alone does not show what is installed on a
particular device. Record evidence for each separately; do not publish account
identifiers, credentials, queues or post content.

## 1. Identify the reviewed source

- Record the upstream repository, full commit SHA, file path, review date and
  reviewer. For this repository the userscript is
  `src/x-bulk-scheduler.user.js`. Record its `@version`, `@updateURL` and
  `@downloadURL` as additional context, not as proof of the commit.
- From a clean checkout at the reviewed commit, create a file and a SHA-256
  digest without modifying the installed script:

  ```sh
  REV='<full-reviewed-commit-sha>'
  git cat-file -e "$REV:src/x-bulk-scheduler.user.js" || exit 1
  git show "$REV:src/x-bulk-scheduler.user.js" > reviewed.user.js
  sha256sum reviewed.user.js
  ```

- A raw URL containing the full commit SHA can be compared byte for byte with
  this reviewed file. A URL using `main` can change; a matching version number
  or a remembered installation URL alone cannot establish provenance.

## 2. Inspect the installed userscript

- On the actual device and browser profile, record browser, userscript manager
  and OS versions. In the manager, find **X Bulk Scheduler**, verify it is
  enabled for the intended `x.com`/`twitter.com` pages, and inspect its current
  source and metadata. Do not change settings or trigger account actions while
  collecting evidence.
- If the manager can export the exact installed source bytes, save them as
  `installed.user.js` and compare with the reviewed file:

  ```sh
  sha256sum reviewed.user.js installed.user.js
  cmp -s reviewed.user.js installed.user.js && echo 'exact byte match' || echo 'different or not byte-for-byte comparable'
  ```

  Only an exact byte match proves these two files match. If an export wraps,
  reformats or changes line endings, do not call it a match based on hashes;
  document the export method and investigate the difference. If source cannot
  be inspected or exported, report provenance as **unknown**.
- Check the installed update/download URLs and whether automatic updates could
  change the code after review. The public script currently points at `main`, a
  moving target. Repeat the comparison after any update or reinstall.
- Confirm the intended script actually loads in an approved safe environment
  using a reviewed, non-posting procedure and synthetic data. Merely seeing an
  entry in the manager does not demonstrate operation. Record failures and
  distinguish installation, site access and application errors. Do not assume
  the public main userscript is a preview-only build.

## 3. If an extension is used

Record its browser, extension name, version, installation source and package
hash or other independently verifiable artifact identifier. Compare the
installed package or its exact contents against the reviewed extension artifact
using a documented method. If packaging prevents an exact comparison or the
artifact is unavailable, mark it **unknown**; do not infer equivalence to the
userscript or claim deployment from a local test build.

## 4. Record the result

Record the date, device/environment versions, reviewed commit and file digest,
installed artifact identifier/digest, comparison method and result, and safe
load check result. Use **match**, **mismatch**, **unknown** or **not run** as
appropriate. A mismatch or missing evidence blocks a claim that the reviewed
release is deployed; resolve it separately before any live test.

## Example: pinned public source only

A contributor compared the Git object for commit
`df0f2570100748b7cc6c13836f201d163e57d70f` with that commit's raw userscript.
Both SHA-256 digests were
`f6785efc5469d9a57e3de3a7cf2c3129fdb1d3e76c6ea2bfadf49fa5d68fac08`, and `cmp`
reported an exact match. This checks those two source copies only. An installed
userscript, extension, automatic updates and deployment were **not checked**.
