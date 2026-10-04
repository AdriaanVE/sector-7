# Tests and quality gate

Run `npm run precommit` before committing. It checks staged and unstaged whitespace, both TypeScript projects, source lint and the offline suite. Install the Git hook once per clone:

```sh
npm ci
npm run hooks:install
npm run precommit
```

`hooks:install` sets this clone's `core.hooksPath` to `.githooks`. The hook runs the same command and rejects a commit when any check fails. Checks use the current working tree; partially staged commits are not tested in isolation. Git hooks are local and can be bypassed; GitHub branch protection is the server-side enforcement.

Individual commands remain available:

```sh
npm run tscheck
npm run lint
npm test
npm run test:network
```

`npm test` explicitly disables network model-list tests, even when vendor credentials are exported. `test:network` opts in; each vendor still requires its own credentials. The 22 skipped vendor tests are not evidence of vendor compatibility. Do not load credentials into CI.

The suite uses Node's test runner with tsx. It runs two test files at a time because the resource-limit tests allocate large buffers while command tests run real child processes. Test files run in separate processes; tests within each file are sequential. No retry hides a failing test. The required runner is macOS, matching the supported app and `/bin/zsh` command tests.

## Test seams

The user approved these boundaries on 2026-10-04:

| Boundary | Useful coverage |
| --- | --- |
| Workspace HTTP handlers | Save/read chat and project data, stale-save 409, malformed JSON/invalid revision 400, recovery query and corrupt-save 422 |
| Asset HTTP handlers | Original binary bytes, response headers and immutable asset 409 |
| Restore HTTP handler | Revision header mapping, rejected restore preserves saved data, current revision allows restore |
| Folder-tool API | Exact directory entry types and search path/line/text; expected safety errors |
| Preview token counter | Uncached equivalence, in-place text/document/ref changes, role-dependent output and combined-fragment glue |
| npm/Git command boundary | Offline opt-in behavior and pre-commit failure propagation |

HTTP tests invoke real handlers with real temporary directories and Request/Response objects. They do not start a dev server or execute Next.js middleware. Access-control helper tests remain useful, but this suite does not prove browser/middleware wiring.

## Existing-test audit

All 33 pre-existing files were inspected for public behavior, independent expectations, empty-array assertions, internal mocks, overlap and fixture ownership. No whole test file was useless, so none was removed. The suite now has 34 files.

| Area | Assessment |
| --- | --- |
| Workspace, locks, assets and resource bounds | Keep. Real disk, separate-process revision conflicts, immutable originals, corruption/epoch recovery and ZIP boundaries protect data loss. Cleanup added to workspace fixtures. |
| Commands and local dispatch | Keep. Real process-group cancellation, durable receipts, uncertain starts, failure output and cancellation timeouts protect actual execution. Some timing assertions remain load-sensitive. |
| Startup, disk storage, questions and chat leases | Keep. Cover migration failure, stale-tab saves, rollback, hydration, explicit continuation, draft preservation and blocked concurrent turns. Fetch is replaced at the HTTP boundary. |
| Native request/search, wire and reasoning | Keep. Preserve signed/opaque history across parser, persistence and replay; reject ineligible or incomplete history. |
| Projects, artifacts, folders and skills | Keep. Cover ownership, current file reads, recoverable mutations, import limits and capability confinement. Broad folder JSON matches were replaced with exact result records and expected errors. |
| Composer preview, slash/skill selection, activity and navigation | Keep. Public query/selection and observer behavior is useful. Remove token-cache call-count coupling while retaining differential output checks. |
| Model listing/access | Keep. Credential tests visibly skip; offline curated lists and access restrictions still run. Live listing now needs explicit opt-in. |

Overlap between minimal ZIP tests and full workspace lifecycle tests protects different properties. Differential cached-versus-uncached counts are a valid optimization oracle; they are not a second implementation of the expectation. Filesystem checks for backups and recovery copies verify those public recovery artifacts.

Remaining limitations: browser acceptance, React Stop/reload, actual native chooser interaction and live vendor calls remain separate checks. Some older skill, native-history and artifact fixtures still lack cleanup; this change fixes the substantial workspace fixture leaks without editing unapproved seams. Small schema/selection tests sometimes combine several related cases and can be split when the area changes. No coverage percentage is claimed.

## CI and main

`.github/workflows/ci.yml` runs on branch pushes, PRs to `main` and manual dispatch. It installs locked dependencies, checks committed whitespace and runs `npm run precommit` on the supported macOS runner. The job has read-only repository permissions and a 20-minute timeout.

`main` requires the exact check name **Quality gate**, issued by GitHub Actions, and an up-to-date branch. Protection applies to administrators. Force-pushes and branch deletion are disabled. The user made the repository public on 2026-10-04, resolving the earlier private-repository account-plan restriction. Protection was verified through the GitHub API. [The implementation CI run](https://github.com/AdriaanVE/sector-7/actions/runs/37198942304) passed types, lint and 204 tests with 22 network skips.

The [reviewed plan](testing-plan.md) records the scope. The [change record](change_details/2026-10-04-test-quality-gate.md) records verification and review results.
