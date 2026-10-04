# Sector 7 Mac app

Sector 7 Desktop 0.1.0 packages the existing S7 application, Next.js backend and Electron runtime. It supports Apple silicon Macs. After installation, no Node, npm or separately started server is required.

## Build and install

Run from the repository root on your Mac. Use Node 22, 24 or 26 with npm, Python and Xcode Command Line Tools. These are build requirements only.

```sh
npm ci
npm run desktop:setup
npm run desktop:check
npm run desktop:build
npm run desktop:install
open "desktop/local/Sector 7.app"
```

Build output:

- `desktop/out/mac-arm64/Sector 7.app`
- `desktop/out/Sector-7-0.1.0-arm64.dmg`

The installer copies to the gitignored `desktop/local/Sector 7.app`. It refuses to overwrite an existing app or install while the app is running. To use a different destination:

```sh
npm run desktop:install -- "$HOME/Applications/Sector 7.app"
```

You can also copy the app from the DMG in Finder. The build uses ad-hoc signing for local use. Downloads from another machine may require macOS Open Anyway; there is no Developer ID signature or notarization. Do not disable Gatekeeper globally. Quit the app before replacing an installed copy.

## Configuration and data

The first launch creates `~/Library/Application Support/Sector 7/config.json`. It contains no credentials:

```json
{
  "port": 47100,
  "preventSleep": true,
  "bifrost": {
    "baseUrl": "https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/anthropic",
    "keychainAccount": "adriaan.van.erps",
    "keychainService": "telenet-bifrost-dev-virtual-key"
  }
}
```

Optional `dataDir` selects an absolute workspace directory. Without it, the app preserves S7's existing `~/Library/Application Support/AI GUI` directory, including chats, projects, assets, command receipts and edit recovery copies. Electron's disposable profile lives under `Sector 7`; it does not import another browser's caches. Use S7 Settings for validated ZIP backups and recovery. App installation never deletes workspace data.

`BIFROST_API_KEY` overrides Keychain when launching from a shell. `BIFROST_ANTHROPIC_BASE_URL`, `BIFROST_KEYCHAIN_ACCOUNT`, `BIFROST_KEYCHAIN_SERVICE` and `AI_GUI_DATA_DIR` override their config equivalents. `SECTOR7_DESKTOP_PORT` overrides `port`; the generic `PORT` variable does not affect desktop launch. Finder-launched apps use config and Keychain. Do not add keys to config.json or environment files included in a build.

Port 47100 binds only to 127.0.0.1. The port stays fixed because browser caches use the origin. If it is occupied, startup reports a conflict and exits; change the port explicitly or close the conflicting app. The app never silently connects to another server or changes its browser origin. A per-launch token protects every HTTP request before Next receives it. Electron injects it into local requests; page scripts and model-run terminal commands do not receive the token.

Help opens the configuration, data and log folders. Logs live in `~/Library/Logs/Sector 7` and rotate after 5 MB. Backend logs redact the current gateway key and launch token. As in the browser app, local tool output may contain personal project content; treat logs and backups as private.

## Behavior

Closing the window stops active chat work, waits for it to settle, and flushes pending workspace saves before closing. A failed save keeps the window open unless you explicitly choose Close without saving. On macOS, the app remains in the Dock and reopens its window when activated. Cmd+Q performs the same save step and then shuts down the backend; terminal process groups are cleaned up by the existing command manager. A pipe watchdog shuts down the backend if its Electron parent dies. An OS crash can still interrupt writes and leave detached descendants; existing receipt/recovery handling applies.

Connected-folder selection uses S7's existing native macOS picker. Files and commands retain S7's local process permissions. They are not sandboxed to the connected repository. The Finder launch resolves the login shell PATH so development tools remain available. External HTTP(S) and mail links open in your default app; navigation and remote Electron windows are blocked. The renderer has no Node access. A narrow preload only coordinates saving before close.

Chrome's Google-backed Web Speech dictation is unavailable in Electron. Dedicated voice/image providers, screen capture, automatic updates, notarization and Intel/universal packaging are outside v0.1. Microphone permission supports audio requests from the app origin only. Normal export/attachment dialogs use Chromium; backups and restore use the existing S7 flows.

## Implementation and checks

[Claude's implementation plan](../desktop/CLAUDE-PLAN.md) is saved with the source. The implementation adds save-on-close coordination because the existing instance-lock flusher does not run on window close. Authentication gates the HTTP listener before Next, avoiding dependency on edge middleware environment behavior. The original loopback/origin middleware remains active.

`fs-ext` uses the Electron Node ABI. `desktop:build` rebuilds only `desktop/node_modules/fs-ext`, copies its binary into the staged server, and verifies it with Electron's embedded Node before packaging. Root `node_modules` remains compatible with the usual browser launcher. Electron builder never rebuilds the root dependencies. The package is generated from explicit desktop files and a staged standalone server, excluding environment files and build caches.

```sh
npm run tscheck
npm run lint
npm test
npm run desktop:check
```

For an isolated launch without touching your daily workspace:

```sh
AI_GUI_DATA_DIR=/private/tmp/sector7-desktop-qa SECTOR7_DESKTOP_PORT=47101 \
  "desktop/local/Sector 7.app/Contents/MacOS/Sector 7"
```
