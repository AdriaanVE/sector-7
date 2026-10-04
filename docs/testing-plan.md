# Test and quality gate plan

Status: implemented after Claude approved the plan with changes using the TDD skill on 2026-10-04. The user confirmed all three test seams on 2026-10-04. Implementation uses `chore/test-quality-gate`; see [verification and outcome](change_details/2026-10-04-test-quality-gate.md).

## Scope

Retain Node's test runner and tsx. Improve concrete weak assertions and fill gaps at existing public boundaries. Avoid a new framework, coverage quotas, merge queue, platform matrix or broad application changes.

Approved test seams:

1. Local workspace HTTP handlers with real temporary storage: workspace PUT/GET and recovery query, asset PUT/GET, restore input/status mapping. Focus on route parsing, statuses and preserving the saved winner after rejected requests. Existing domain tests already cover ZIP contents, epochs, corruption recovery and full workspace round trips.
2. Existing public folder-tool and preview token-counter APIs: exact result records, stale text/document/ref invalidation, role changes and glue behavior. Retain the cached-versus-uncached comparison as a useful differential oracle. Avoid private cache structure assertions.
3. Developer commands: `npm test`, `npm run precommit` and the Git pre-commit hook. Verify exit-code propagation manually with a temporary failing fixture; do not build tests of YAML text or another orchestration framework.

Any new test seam, including a changed cancellation test, needs confirmation before test edits. The selected TDD skill requires: "Before writing any test, write down the seams under test and confirm them with the user."

## Existing tests

The repository has 33 `.test.ts` files. Source inventory found no source-text assertions. Existing disk locking, resource bounds, cancellation, questions, native history, storage startup and recovery tests protect real behavior and should remain.

Confirmed improvements:

- Folder list/search checks match serialized JSON too broadly. Assert exact public entries and matches.
- Preview token tests mix differential output checks with internal call-count expectations. Keep the differential oracle, strengthen observable invalidation, and remove reliance on internal cache mechanics.
- Workspace and some other temporary fixtures lack cleanup. Add test cleanup hooks to modified fixtures.
- Preserve network tests as explicit opt-in coverage with visible credential-dependent skips. Their absence is not vendor validation.

Claude's independent inspection was bounded to the critical workspace, folder and cache files; it did not certify all 33 files. Complete the local audit during implementation and document any remaining coverage limits. Direct route-handler tests do not execute Next.js middleware or prove browser wiring.

## Implementation

Work in one vertical slice at a time. For a newly found defect, write the failing regression first, then apply the smallest fix. For characterization of working behavior, demonstrate sensitivity with a temporary deliberate defect, verify failure, restore the original source and verify green. Record the red/green evidence. Never change application behavior merely to manufacture a passing test.

Use one `npm run precommit` command for staged/unstaged whitespace, both TypeScript projects, source lint and deterministic tests. Provide `.githooks/pre-commit` and explicit `npm run hooks:install`; avoid another hook dependency. Remove `pretscheck` installation side effects so checks follow the locked `npm ci` installation. Exclude separate worktrees and local review artifacts from ESLint.

Run CI on all branch pushes and PRs to `main`, with manual dispatch. Keep the existing pinned actions, macOS runner and `.nvmrc`. Install with `npm ci`, check committed whitespace and run the shared gate. Name the required check `Quality gate`, restrict token permissions to `contents: read`, and set a finite timeout.

Make network model-list tests require both `SECTOR7_TEST_NETWORK=1` and their existing credentials. `npm test` explicitly disables network tests; `npm run test:network` opts in. Keep the curated Z.ai offline case free of credentials so it cannot take its optional live path. Do not supply vendor secrets in CI.

After implementation, apply simplify only to changed code. Obtain a fresh read-only Docker Claude review that first reads the TDD skill and its supporting files. Validate findings, fix confirmed problems, run the complete gate and hook, commit explicit paths and push `chore/test-quality-gate`. Preserve the user's untracked `sector7-animation.html`. Leave merging to the user.

## Baseline and prepared checks

The baseline type check passed. The original suite had 192 passing tests, 22 skips and one command-cancellation failure: a delayed child marker existed before cancellation completed. All nine command tests passed in isolation.

The original full lint entered a separate ignored 3.7 GB worktree and generated bundles, producing 93 errors and 2,892 warnings. With `.worktrees` and `.ship` excluded, source lint passes.

The prepared test command uses `node --import tsx`, avoiding the tsx CLI IPC socket, and limits file concurrency to two because resource-bound tests use large allocations alongside real child processes. The existing suite passes with this setup. This bounds concurrency rather than retrying failures.

## Main enforcement

The initial private-repository account plan blocked protection with HTTP 403. The user subsequently authorized public visibility on 2026-10-04. The repository is now public and `main` protection requires the GitHub Actions `Quality gate` check, current branches and administrators. Force-pushes and deletion are disabled. The implementation CI run passed. No subscription change was needed.
