# Workspace startup and storage lifecycle

Startup initialization now runs through a small testable module while retaining the provider's Loading, Ready and Recovery states. Disk data wins over legacy browser data. A missing referenced legacy original now fails before installation, asset upload or hydration, rather than permitting a later cache fallback.

The startup module keeps the real local request, installation, asset-first saving, flush and Zustand rehydration paths. Only the legacy reads are supplied by the provider. Migration preserves browser originals, excludes incognito records and unlisted settings, and saves once before becoming ready. Failed loads, transfers, first saves and hydration remain recovery failures.

## Verification

- Ten startup regressions exercise real disk coordinator and Zustand hydration with controlled HTTP responses: disk precedence, exact-byte once-only migration, allowlists, incognito exclusion, failed first save/retry, missing originals, failed transfer, corrupt primary, transport/server errors, failed hydration, legacy v3 conversion and empty startup.
- Two real-filesystem lifecycle tests verify reload and ZIP restore over existing data, exact binary bytes, empty projects, connected-folder metadata, archived chats, pending questions and native history. Last-good ownership protects originals; an unreadable recovery manifest suspends garbage collection. Positive controls verify that collection runs and resumes. Rejected size/credential saves preserve the primary file and bytes.
- Full suite: 171 passed, 22 credential-dependent skips, no failures. Root and tooling type checks, source-wide lint excluding other worktrees, diff checks and the isolated webpack production build passed on Node 22.
- A fresh Docker Claude review approved the final startup and lifecycle changes after stronger lifecycle assertions addressed its first review. The review was read-only and did not independently run tests or browser checks. Logs and verdict remain in `/tmp/ask-claude-startup-final-hVzNzCq7qV`.
- The simplify pass retained the small initialization boundary and explicit asset-first ordering; no speculative refactor was added. No pre-commit hook is configured.

## Live evidence and limits

Before the reviewed-build swap, the actual port 3004 workspace contained 12 chats, 2 projects and 2 owned assets. The live backup route produced `/private/tmp/sector7-storage-current-backup.zip`; its manifest matched the live workspace and every owned byte matched its asset endpoint. SHA-256: `af10394599bbaa7d147e7c1f6b06243b9174810144229e7cbd0b74e2fe4ce535`.

An actual restart of the preceding build preserved all stores and both asset hashes, with the expected hydration-save revision advance. The reviewed `.next-startup-reviewed` build then started on port 3004, returned HTTP 200 and preserved the complete saved workspace at revision 779 and both exact asset hashes. A server-unavailable check left the primary bytes unchanged. A separate localhost-origin browser recovered the same records and citations; that is a separate origin, not proof of a clean browser profile.

Clean-profile recovery, actual browser legacy migration/failed-first-write, isolated corrupt-primary recovery UI and complete UI ZIP restore remain unverified. The local browser retry is pending user authorization after automatic approval review rejected reloading a policy-blocked error page. Port 3005 remains unstarted pending its separate permission. These tests and bounded live checks do not close M3 or the full plan.
