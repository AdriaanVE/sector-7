# Workspace locking

Saves, assets, backups, recovery and cleanup now use one permanent kernel lock per data directory across server route bundles and Node processes. Same-revision competing saves yield one success and one stale-revision conflict. Concurrent attempts to create an asset ID with different bytes preserve the winning bytes and reject the other attempt. Process death releases lock ownership; there is no time-based live-owner takeover.

Lock acquisition is bounded to ten seconds and returns an actionable busy response. Restore and backup use internal helpers inside the lock to avoid nested acquisition. Existing atomic manifest writes and recovery references remain intact. The permanent lock file stays outside backup payloads and restore staging.

The native dependency requires existing macOS compiler tools and Python during installation. Clean installation passed with Node 22.22.2. Use that Node major for the current installed dependency. Local filesystems supporting file locks are supported; network mounts are not qualified. External programs do not participate in the advisory lock.

Verification: clean installation, root/tools TypeScript and full lint passed. Real child-process tests cover competing revision saves, immutable asset collisions, live-owner exclusion, killed-owner recovery, successor exclusion and independent data directories. Focused locking/persistence/configuration tests passed after a fresh simplify pass. The production build passed with the native dependency externalized. Independent review completed and approved the lock behavior; a search-default regression in background helper calls was fixed and independently reviewed again. Archive resource bounds and the client save-conflict recovery flow remain separate work.
