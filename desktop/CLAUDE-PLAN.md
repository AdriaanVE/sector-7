# Sector 7 v0.1.0 Electron Mac app: implementation plan

## Recommendation

Wrap the existing Next.js production server rather than rewriting anything:

- **Server build:** build the app with the standalone output mode the config already supports (`BIG_AGI_BUILD=standalone`).
- **Runtime:** the packaged app runs that server as a child process using the app's own embedded Node (`ELECTRON_RUN_AS_NODE=1`). After installation, nothing needs a user-installed Node or npm.
- **`fs-ext`:** this native module is rebuilt only in the packaged copy, for Electron's Node version. The repo's `node_modules` stays built for your system Node, so `npm test`, `dev:local` and `start:local` keep working.
- **Window:** an Electron window loads `http://127.0.0.1:<fixed port>/`. All API calls must carry a per-launch token that the app adds to every request.
- **If the `fs-ext` rebuild fails:** bundle an official Node arm64 binary instead (fallback B below).

Static export is ruled out because the `app/api/local/*` routes (workspace, assets, folders, commands, skills, backup and restore) must run on the server.

## Evidence from the repo

| Fact | Source |
|---|---|
| Standalone build mode exists, output goes to `dist/` | `next.config.ts:32-57` |
| `fs-ext` is marked as an external server package | `next.config.ts:65` |
| `fs-ext` `flockSync` is the cross-process workspace lock | `src/server/local/workspace-lock.ts:5,24` |
| Data directory default is `~/Library/Application Support/AI GUI`, overridable with `AI_GUI_DATA_DIR` | `src/server/local/workspace.ts:14` |
| Keychain lookup uses `/usr/bin/security` with account `adriaan.van.erps` and service `telenet-bifrost-dev-virtual-key`, mapped to `ANTHROPIC_API_KEY` and `ANTHROPIC_API_HOST`; the launcher wraps the server in `caffeinate -i` | `tools/local/launch.mjs:5-17` |
| API protection is a loopback Host check plus Origin, `Sec-Fetch-Site` and `X-AI-GUI` checks. There is no token. | `middleware.ts`, `src/common/personal/local-access.ts:12-31` |
| Commands run `/bin/zsh -c` with the full server environment (minus 4 inference keys), in detached process groups killed on `process.exit` | `src/server/local/commands.ts:115,198,207-218` |
| The folder picker spawns `/usr/bin/osascript` and only works on darwin | `src/server/local/folder-picker.ts:23,53` |
| `.worktrees/` is already gitignored; `/node_modules` is anchored to the root, so `desktop/node_modules` would **not** be ignored | `.gitignore:11,67` |
| Server env schema leaves the Anthropic key and host optional | `src/server/env.server.ts:53-54` |
| Icon source is available | `public/icons/icon-1024x1024.png` |

## Runtime strategy and `fs-ext` ABI

**The problem.** `fs-ext` 2.x is a NAN addon, not N-API. Its compiled `fs-ext.node` only loads in the exact runtime it was built for (identified by `NODE_MODULE_VERSION`). Today `npm ci` builds it for your system Node. Electron embeds its own Node with a different version, so the repo's binary fails to load inside Electron with "was compiled against a different Node.js version". `sharp`, Prisma and `tiktoken` are N-API or wasm, so they don't have this problem.

**Primary approach (A): Electron as Node, with a separate rebuild for the packaged copy.**

1. Pin an exact Electron version whose embedded Node major is 22 or 24, matching `package.json` engines. Record `process.versions.node` and `process.versions.modules` in the build log.
2. Add `fs-ext` to `desktop/package.json` as a devDependency at the root lockfile's exact version. Run `@electron/rebuild -f -w fs-ext -t dev -a arm64` there.
   - This works because the standalone trace copies only the JS and `.node` files, not `binding.gyp` or the C++ sources. It needs the Xcode CLT, which the README already requires.
3. Copy `desktop/node_modules/fs-ext/build/Release/fs-ext.node` over the staged server's copy.
4. Fail the build unless this succeeds:
   `ELECTRON_RUN_AS_NODE=1 <Electron binary> -e "require('<stage>/node_modules/fs-ext').flockSync"`
5. Never touch the root `node_modules`.

**Why a child process.** Running the server in Electron's main process would couple crashes. It would also let Next's SIGTERM handling and `process.exit` kill the UI, and the command manager's `process.once('exit')` cleanup hook would fire at the wrong time. A child behaves exactly like `node server.js`.

**Fallback (B), used only if step 4 fails.** Common causes would be NAN versus Electron's V8, or Next standalone misbehaving under Electron's Node.
- Bundle the official `node-v22.x-darwin-arm64` binary, checked against `SHASUMS256`, at `Contents/Resources/node/bin/node`.
- Ship the `fs-ext.node` built for that Node version.
- Cost: about 110 MB and a second binary to sign. Everything else in this plan stays the same.

## Worktree setup (Codex)

From the repo root:

```
git worktree add .worktrees/electron-mac-v0.1 -b feat/electron-mac-v0.1 main
```

- Base it on committed `main` (HEAD `5cf8e46`). The working tree has uncommitted edits from the other chat, so it must not be the base.
- Hooks: compare `git rev-parse --git-path hooks/pre-commit` in both checkouts. Worktrees normally share them. Carry over `.pre-commit-config.*` if one exists.
- **Run the build on the Mac host.** The darwin arm64 `fs-ext` rebuild, `codesign` and DMG creation can't run in the Linux container.
- Commit subjects follow `Area: terse imperative`, for example `Desktop: Add Electron Mac shell`.
- **Push conflict:** the repo `CLAUDE.md` says "NEVER PUSH" (inherited from upstream), but you explicitly asked for a pushed branch. Your request takes precedence. Codex should still confirm with `git remote -v` which remote is `AdriaanVE/sector-7` before running `git push -u <remote> feat/electron-mac-v0.1`.

## File layout

```
desktop/
  package.json            name sector-7-desktop, version 0.1.0, private, "type":"module", main "main/main.mjs"
                          devDependencies (exact pins): electron, electron-builder, @electron/rebuild, fs-ext
  package-lock.json
  electron-builder.yml
  server-entry.cjs        watchdog wrapper, staged next to server.js
  loading.html            static S7-colored "Starting..." page, no scripts
  main/
    main.mjs              lifecycle, single instance, window, menu, quit sequence
    server.mjs            env assembly, Keychain, port, spawn, health, logs, stop
    config.mjs            read/validate config.json
    security.mjs          header injection, navigation, permissions
    shell-env.mjs         login-shell PATH
  scripts/
    build-mac.mjs         orchestration
    after-pack.cjs        copies .stage/server into Resources/server
    scan-secrets.mjs
    install-mac.mjs       optional copy to ~/Applications
app/api/local/health/route.ts   new
```

The main-process code is plain `.mjs`, following the precedent of `tools/local/launch.mjs`. That keeps it out of `tsc` and avoids a compile step.

**Changes to existing files (all small):**

- `next.config.ts`: when `buildType === 'standalone'`, set `outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url))`. Inside `.worktrees/`, Next 15 can otherwise pick up the parent repo's lockfile and nest `server.js` under `.worktrees/...`.
- `src/common/personal/local-access.ts` and `middleware.ts`: when `process.env.SECTOR7_DESKTOP_TOKEN` is set, require a matching `X-Sector7-Token` header, using a constant-time comparison. With the variable unset, behavior is unchanged, so `dev:local` and `start:local` are unaffected.
- `src/server/local/commands.ts:210`: add `SECTOR7_DESKTOP_TOKEN` and `ELECTRON_RUN_AS_NODE` to the stripped keys. Otherwise every model-run command inherits the token, and `ELECTRON_RUN_AS_NODE=1` breaks Electron CLIs such as `code`.
- `app/api/local/health/route.ts`: `runtime='nodejs'`, returns `{ ok, version, buildHash }`. The middleware token check covers it.
- Root `package.json` scripts: `"desktop:build": "node desktop/scripts/build-mac.mjs"`, `"desktop:install": "node desktop/scripts/install-mac.mjs"`.
- `.gitignore`: add `/desktop/node_modules/`, `/desktop/.stage/`, `/desktop/out/`.
- `eslint.config.mjs`: ignore `desktop/out/**` and `desktop/.stage/**`.
- Tests: `local-access` token cases (missing, wrong, correct, unset) and a `commandEnvironment` stripping case. They live in `src/**` so `npm test` runs them.
- Docs: README "Mac app" section, `docs/configuration.md` (config.json, ports, logs), `docs/releases/0.1.0.md`, and a new `docs/change_details/2026-10-0X-electron-mac.md`.

## Build orchestration (`desktop/scripts/build-mac.mjs`)

1. **Preflight:** require darwin, arm64, a Node version that matches engines, and Xcode CLT. Warn if the git tree is dirty.
2. **Install:** `npm ci` at the worktree root, then `npm ci --prefix desktop`.
3. **Build with a sanitized environment:**
   - Delete `BIFROST_*`, `ANTHROPIC_*`, `OPENAI_*` and `POSTHOG_API_KEY` from the build environment.
   - Set `BIG_AGI_BUILD=standalone NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DEPLOYMENT_TYPE=desktop`.
   - Run `npm run build`. The `prebuild` step generates the LLM model definitions.
4. **Stage into `desktop/.stage/server/`:**
   - `dist/standalone/*` (assert `server.js` is at the top level)
   - `dist/static` → `dist/static`
   - `public` → `public`
   - `desktop/server-entry.cjs`
   - Exclude `dist/cache`.
5. **Rebuild and verify `fs-ext`** as in strategy A, steps 2-4.
6. **Scan for secrets** (`scan-secrets.mjs`); any hit fails the build:
   - any `.env*`, `*.pem` or `.env.api-keys` file
   - `sk-ant-` strings
   - optionally, the exact Keychain value read in memory. Never print it.
7. **Package:** `electron-builder --mac dir dmg --arm64 --config electron-builder.yml`.
   - `files: [main/**, loading.html, package.json]` and `asar: true`
   - `afterPack: scripts/after-pack.cjs` copies the stage to `Contents/Resources/server` with `fs.cp`. This is more reliable than relying on `extraResources` to filter `node_modules`, and afterPack runs before signing, so the copied files get signed.
   - `extraResources: LICENSE`
   - `appId: com.adriaanve.sector7`, `productName: Sector 7`, `mac.target: [dir, dmg]`, `mac.icon: ../public/icons/icon-1024x1024.png`
   - `mac.identity: "-"` (ad-hoc). If that isn't supported, run `codesign --force --deep --sign - "Sector 7.app"` afterwards.
   - `hardenedRuntime: false`, `npmRebuild: false`
   - `mac.extendInfo`: `NSMicrophoneUsageDescription`, `NSDesktopFolderUsageDescription`, `NSDocumentsFolderUsageDescription`, `NSDownloadsFolderUsageDescription`, `NSRemovableVolumesUsageDescription`, `NSAppleEventsUsageDescription`.
8. **Post-build checks:**
   - `codesign --verify --deep --strict`
   - `Resources/server/node_modules/next/package.json` exists
   - Print the output paths: `desktop/out/mac-arm64/Sector 7.app` and `desktop/out/Sector 7-0.1.0-arm64.dmg`.

**Install.** The default output is the gitignored `desktop/out/`. `npm run desktop:install` refuses to run if Sector 7 is running, then copies the app to `~/Applications/Sector 7.app`. A locally built app has no quarantine attribute, so Gatekeeper doesn't block it. The DMG is for manual drag-install.

## Server startup (`main/server.mjs`)

1. **Config:** read `~/Library/Application Support/Sector 7/config.json` (Electron `userData`), validated, with no secrets:
   `{ port: 47100, dataDir?, bifrost: { baseUrl?, keychainAccount?, keychainService? }, preventSleep: true }`
   Environment variables override config, matching the launcher.
2. **Key:** use `BIFROST_API_KEY`, else `/usr/bin/security find-generic-password -a … -s … -w`.
   - Reuse `launch.mjs`'s defaults, URL validation and its "no credentials in URL" rule.
   - Using the same `security` CLI keeps the existing Keychain ACL and prompt behavior; a native `keytar` module would change both.
   - If the key is missing, show a dialog naming the account and service, then quit.
3. **PATH:** apps launched from Finder get `/usr/bin:/bin:/usr/sbin:/sbin`, so model-run commands couldn't find `git` or `brew`.
   - Resolve PATH once with `/bin/zsh -ilc 'printf %s "$PATH"'`, with a 5 s timeout.
   - Fallback: the default PATH plus `/opt/homebrew/bin:/usr/local/bin`.
4. **Child environment, built from scratch** (don't pass Electron's environment through):
   - `HOME USER LOGNAME SHELL TMPDIR LANG` and the resolved `PATH`
   - `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `HOSTNAME=127.0.0.1`, `PORT`
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_API_HOST`
   - `SECTOR7_DESKTOP_TOKEN`: 32 random bytes, base64url, new each launch
   - `AI_GUI_DATA_DIR` only if configured. Otherwise the default AI GUI directory applies unchanged.
   - `ELECTRON_RUN_AS_NODE=1`
5. **Spawn:** `spawn(process.execPath, [Resources/server/server-entry.cjs], { cwd: Resources/server, env, stdio: ['pipe','pipe','pipe'] })`.
   - `server-entry.cjs` deletes `ELECTRON_RUN_AS_NODE` from its environment (it's only read at startup) and sets `process.title`.
   - It calls `process.exit(0)` on `process.stdin` `end`. This is the orphan watchdog: if the main process is force-killed, the server exits and its exit hook kills command process groups.
   - It then requires `./server.js`.
   - Keep Electron's `runAsNode` fuse enabled, which is the default.
6. **Port:** fixed default 47100, away from the 3000-3004 dev ports. A fixed port matters because browser storage (localStorage, IndexedDB) is tied to the origin `http://127.0.0.1:PORT`; a random port would reset UI settings every launch.
   - Before spawning, probe with `net.createServer().listen(port,'127.0.0.1')`.
   - If the port is busy, show a dialog: **Quit**, or **Use temporary port (settings this session won't persist)** using port 0.
   - Treat an `EADDRINUSE` message in the child's output the same way.
7. **Health:** poll `GET /api/local/health` with the token every 250 ms for up to 60 s.
   - A 200 response with the token proves the listener is this instance, not some other process on the port.
   - On timeout, show a dialog with an "Open Logs" button.
8. **Logs:** pipe the child's stdout and stderr to `~/Library/Logs/Sector 7/server.log` (`app.getPath('logs')`); the main log is `main.log`. Rotate at 5 MB, keeping one old file. Never log the environment or the token.
9. **Sleep:** if `preventSleep` is set, `powerSaveBlocker.start('prevent-app-suspension')`. This matches the launcher's `caffeinate -i` and avoids App Nap throttling.

## Window and security (`main/security.mjs`, `main/main.mjs`)

- **Single instance:** `app.requestSingleInstanceLock()`. A second launch focuses the existing window.
- **Startup:** `app.enableSandbox()`. The window starts on `loading.html`, then calls `loadURL('http://127.0.0.1:PORT/')` once healthy.
- **Window settings:** `BrowserWindow` with `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, `webSecurity:true`, no preload and no IPC. The UI already talks to the server over HTTP.
- **Token injection:** `session.webRequest.onBeforeSendHeaders({ urls: ['http://127.0.0.1:PORT/*'] })` adds `X-Sector7-Token`. Page JavaScript never sees the token. Other local processes and browsers get 403 from all `/api/*` routes, including the edge tRPC route that uses the Bifrost key.
- **Navigation:**
  - `will-navigate` allows only the exact server origin.
  - `setWindowOpenHandler` always denies; `http`, `https` and `mailto` targets go to `shell.openExternal`.
  - `will-attach-webview` is blocked.
- **Permissions:** both the request and check handlers allow `media` (audio only), `clipboard-sanitized-write` and `fullscreen` for the app origin, and deny everything else.
- **File selection:**
  - `<input type=file>` and `browser-fs-access` use Chromium's native dialogs.
  - Downloads (backup ZIP, exports) keep Electron's default save dialog.
  - The "Add folder" picker keeps the existing `osascript` route unchanged. Its dialog may open behind the window; that's acceptable for v0.1.
- **Menu:**
  - App menu: About (`setAboutPanelOptions` with 0.1.0, build hash and MIT credits for big-AGI), Hide, Quit.
  - Edit uses `role: 'editMenu'`. This is required; without it, Cmd+C and Cmd+V don't work on macOS.
  - View: reload, zoom, toggle DevTools. Window: standard.
  - Help: Open Logs Folder, Open Data Folder (AI GUI), Open Config.
- **Branding:** the window title, colors and UI come from the app as-is.

## Shutdown and child cleanup

**Order of operations:**
1. On `before-quit`, call `preventDefault()` once and close the windows first. The renderer can then finish any pending disk-storage saves while the server is still running.
2. Handle `will-prevent-unload`. Electron otherwise cancels the close silently when a page's `beforeunload` handler blocks unload. Show "Changes are still saving. Quit anyway?".
3. Send SIGTERM to the server. Next exits, `process.on('exit')` fires, and `LocalCommandManager.shutdown()` SIGKILLs the command process groups.
4. Wait up to 5 s, then SIGKILL the server and call `app.exit()`.

**If the main process crashes:** the stdin pipe closes, the watchdog in `server-entry.cjs` exits the server, and the same cleanup runs.

**After the window closes:** on macOS the app stays alive with the server running, and the Dock icon reopens the window. `window-all-closed` doesn't quit.

## Data locations

| Item | Location |
|---|---|
| Durable workspace (unchanged) | `~/Library/Application Support/AI GUI` or the configured `dataDir` |
| Desktop config, Chromium profile (UI localStorage, caches) | `~/Library/Application Support/Sector 7/` |
| Logs | `~/Library/Logs/Sector 7/` |
| App | `desktop/out/...` or `~/Applications/Sector 7.app` |

UI settings stored in your current Chrome profile at `127.0.0.1:3004` don't carry over; the disk workspace does. The flock lock and revision checks already handle running alongside a `dev:local` server on the same data, but the docs recommend running one server at a time.

## Acceptance criteria

1. **Clean build:** a clean worktree on Apple silicon runs `npm run desktop:build` and produces the `.app` and DMG. The secret scan and the `fs-ext` ABI check pass, and `codesign --verify --deep --strict` passes.
2. **No system Node:** `ps -o command` shows the server child as `Sector 7.app/Contents/MacOS/Sector 7 …server-entry.cjs`. The app works with system Node removed from PATH.
3. **Existing data:** existing chats and projects from AI GUI load, which exercises flock. A configured `dataDir` is respected.
4. **Keychain and chat:** first launch behaves like the launcher for Keychain prompts. A message to `claude-sonnet-5-5` streams a reply.
5. **API protection:** `curl http://127.0.0.1:47100/api/local/workspace` returns 403 with no token, and 403 with a spoofed Host.
6. **Folders and commands:** connect a folder with the picker, read a file, and run `which git`, which resolves through the login-shell PATH. `env` inside a command shows no token, no `ELECTRON_RUN_AS_NODE` and no inference keys.
7. **Quit cleanup:** quit during `sleep 600`. Afterwards `pgrep -f 'sleep 600'` is empty and the port is free.
8. **Crash cleanup:** `kill -9` the main process. The server exits within about 2 s.
9. **Second launch:** focuses the existing window.
10. **Port collision:** with the port held by `nc -l 47100`, the collision dialog appears.
11. **Links:** external links open in the default browser, and `window.open` creates no Electron window.
12. **Logs:** contain no key or token. Grep for the first 8 characters of the key, compared in memory only.
13. **Repo checks:** `npm run tscheck && npm run lint && npm test` pass, and `dev:local` and `start:local` behave as before.
14. **Install:** `desktop:install` copies to `~/Applications`, and the app opens by double-click.

## Unknowns to verify early

- **`fs-ext` vs Electron's V8.** If `fs-ext` 2.1.1 with NAN doesn't compile against the chosen Electron's V8, switch to fallback B instead of patching `fs-ext`.
- **Middleware runtime env.** Next 15.1 middleware runs in the edge sandbox. It should read the token from `process.env` at runtime, since the edge AIX route already reads `ANTHROPIC_API_KEY` that way under `next start`. Acceptance check 5 proves it.
- **Standalone tracing.** Confirm that `distDir: 'dist'` plus `outputFileTracingRoot` puts `server.js` at the top level of `dist/standalone`, and that tracing includes `fs-ext`, the Prisma client if it's imported, and `puppeteer-core`.
- **Ad-hoc signing.** Confirm that `electron-builder`'s `identity: "-"` works with the pinned version.
- **macOS privacy prompts.** An ad-hoc signature changes with every build, so macOS may ask again for Desktop, Documents or Downloads folder access, and for Keychain access, after each rebuild. This is acceptable for v0.1.
- **Dictation.** Chrome Web Speech fails in Electron because Electron lacks Chrome's Google speech service. Document it as a v0.1 limitation.
- **Unload handling.** Confirm whether `disk-storage.ts` flushes on `pagehide` or `beforeunload`, which decides whether the `will-prevent-unload` dialog ever appears.
- **Icon.** Confirm that `public/icons/icon-1024x1024.png` is Sector 7 artwork rather than the inherited big-AGI icon.
- **Licenses.** Third-party license files inside the traced `node_modules` aren't complete. Shipping the root MIT `LICENSE` and Electron's bundled notices is enough for personal use.
- **Intel (later):** add `--x64` targets, a second `fs-ext` rebuild per architecture (or fallback B with per-architecture Node), and a universal build or separate DMGs.
