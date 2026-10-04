# Test quality and CI

The existing suite needed stronger folder result assertions, cache invalidation coverage and route-level save/restore checks. The shared quality gate now runs whitespace validation, both TypeScript projects, source lint and offline tests through the local Git hook and GitHub CI.

## Scope

The user approved workspace HTTP, folder/token APIs and npm/precommit boundaries after an independent Docker Claude plan review using the TDD skill. Keep Node's runner and tsx, the supported Mac runner and existing substantive tests. No new framework, coverage target, merge queue or production feature was introduced.

Added seven HTTP tests and four token-preview tests. Folder list/search now assert exact public records, and safety checks require the expected error status/message. Token preview retains uncached equivalence and removes internal call-count coupling. Workspace temporary directories are removed through cleanup hooks.

CI checks every branch push and PR to main, plus manual dispatch, with a stable `Quality gate` job, read-only token permissions and a finite timeout. The hook uses the same command. Type checking no longer runs `npm install` after a locked install. ESLint excludes separate worktrees and local review output. Offline model tests stay offline even with exported credentials; the separate network command opts in.

## TDD evidence

One behavior was added or tightened per cycle. Characterization tests were proven sensitive by deliberate defects in an isolated temporary source copy, then rerun against the untouched real source. Defects included missing GET data, wrong conflict status, wrong recovery query, cacheable binary replies, accepting changed asset bytes, ignored restore headers, incorrect folder types/line numbers/safety errors and stale document/ref/role/glue results. All 14 deliberate defects failed their targeted tests; restored behavior passed.

The explicit-offline command initially failed with fake Anthropic/Z.ai credentials and a blocked fetch boundary: a live test ran despite offline mode. Adding explicit opt-in gates made the same check pass with no network attempt. The actual Git hook rejected a temporary failing test: 204 other tests passed and 22 vendor tests skipped. The fixture was removed.

## Baseline

Baseline types passed. Original lint traversed an ignored 3.7 GB worktree and generated bundles, producing 93 errors/2,892 warnings. Excluding worktrees restored a source-only pass. Original tests had 192 pass, 22 skip and one timing-sensitive child-marker cancellation failure; nine command tests passed alone. The same existing suite passed with two concurrent files: 193 pass and 22 skip. Concurrency bounds memory/process load rather than retrying failures.

## Enforcement and limits

The authorized GitHub branch-protection update for `main` requiring `Quality gate`, current branches and administrators returned HTTP 403: this private repository requires GitHub Pro or public visibility. CI cannot itself enforce merging. No visibility/subscription change was made.

Direct HTTP tests do not execute Next middleware or replace browser acceptance. Network skips do not certify vendors. Timing-sensitive command checks and small older fixture leaks remain documented in [testing guidance](../testing.md).

## Verification

After simplification, `npm run precommit` passed both TypeScript projects, full source lint and all 204 offline tests, with 22 explicit network skips. The hook failure probe ran through the same command and rejected the temporary bad test. YAML parsing, executable hook/shell syntax and stable required job naming were checked. Vendor opt-in was exercised with a blocked fetch boundary rather than real credentials.

The final implementation remains unchanged in production application files. No build was needed for tests and CI configuration. A fresh Docker Claude review loaded the TDD skill and found the tests sound. It approved with changes: handle an unavailable old push commit in the whitespace check and finish the verification record. Both were addressed. The unavailable-commit check failed before the fix and passed afterward, as did normal push, new-branch and PR paths. Claude did not run tests or inspect all underlying implementations; local verification supplies that evidence. Hosted CI is checked after pushing.
