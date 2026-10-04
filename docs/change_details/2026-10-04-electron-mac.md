# Electron Mac preview

Sector 7 0.1.0 gains an Apple silicon Electron wrapper around its existing UI and Next standalone backend. The app carries its Node runtime and rebuilt native storage lock. Config, build/install scripts, Mac menus, S7 icon, per-launch local request authentication and save-on-close coordination support use from Finder without a separate server.

The workspace remains in `~/Library/Application Support/AI GUI`. Desktop config/profile lives under `Sector 7`; logs live in `~/Library/Logs/Sector 7`. Credentials remain in Keychain or runtime environment. External links leave Electron; renderer Node access is disabled. Native folders and local coding tools retain existing process permissions.

Plan deviations: use the existing neon S7 artwork; reject port collisions rather than creating temporary browser origins; gate HTTP requests before Next instead of putting the token in edge middleware; add a narrow close/save preload because instance-lock flushing does not cover window close.

Verification results are recorded after packaging and runtime checks. Existing root types, lint and 114 offline tests passed before implementation; 22 credential-gated tests skipped. Broader S7 product acceptance remains tracked separately.

The completed Claude review found two defects that were fixed: preserve framework symlinks during installation and verify the installed signature; keep autosave running after close timeouts. Follow-up Claude review returned PASS. Its filter finding was also fixed: exclude only Next's `dist/cache`, preserving runtime packages such as `@emotion/cache`.

Final verification: root/tools types, lint, production build, 115 offline tests and 2 desktop tests passed; 22 credential-gated tests skipped. Electron native ABI and ad-hoc signatures passed for both output and installed copies. Backend smoke verified UI/workspace/skills HTTP 200, unauthenticated HTTP 403 and stdin watchdog shutdown. The signed native app loaded the S7 UI, Settings showed the isolated data path, a setting survived Cmd+Q/restart, and normal quit released the backend port. Live inference, folder selection and crash-during-command were not repeated as part of desktop acceptance.
