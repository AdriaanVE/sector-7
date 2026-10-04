# Sector 7 Mac app

Sector 7 Desktop 0.1.1 packages the existing S7 application, Next.js backend and Electron runtime. It supports Apple silicon Macs. After installation, no Node, npm or separately started server is required.

## Build and install

Run from the repository root on your Mac. Use Node 22, 24 or 26 with npm, Python and Xcode Command Line Tools. These are build requirements only. Stop any browser production server using this checkout before building; desktop packaging rebuilds the shared web output.

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
- `desktop/out/Sector-7-0.1.1-arm64.dmg`

After this workflow reaches `main`, open GitHub Actions > Build Mac app > Run workflow and choose `main`. The separate manual workflow runs the quality gate and desktop checks, builds the Apple silicon app/DMG, and uploads them for 14 days. The app is zipped with `ditto` to preserve its bundle permissions. It uses the same ad-hoc signing as local builds. Other branches are skipped. Hosted execution must be verified after the workflow is available on `main`.

Every successful manual build publishes a release and opens the Homebrew cask update PR. Configure the GitHub `release` environment with deployment branches restricted to `main`, and store `SECTOR7_RELEASE_TOKEN` there as a fine-grained token scoped to this repository with Contents and Pull requests write permissions; this allows the cask PR to trigger required CI. The action publishes a `desktop-v<version>` release that the workflow refuses to republish and opens a PR updating `Casks/sector-7.rb` with its app ZIP checksum. It never merges the cask PR. Run `npm version patch --prefix desktop --no-git-tag-version` for each subsequent release and commit both desktop package files. If asset upload fails and leaves an unpublished draft, delete that draft before retrying. If release publication succeeds and a `chore/homebrew-*` branch was pushed, open its PR manually. Otherwise, if a cask PR fails after release publication, generate it manually with `node desktop/scripts/homebrew-cask.mjs <downloaded-app.zip>` and submit the resulting cask; do not replace published assets.

After the first cask PR reaches main, install and update with:

```sh
brew tap AdriaanVE/sector-7 https://github.com/AdriaanVE/sector-7
brew install --cask sector-7
# Quit Sector 7 before updating:
brew update
brew upgrade --cask sector-7
```

The cask supports Apple silicon on macOS 13 or later. Homebrew installs into Applications and leaves user data intact on uninstall. Upgrades may prompt again for folder, microphone or Keychain permissions because builds use ad-hoc signing. Downloaded apps may need macOS approval because they are ad-hoc signed. The hosted release/cask path still needs its first live verification.

Builds preserve their staged server under `desktop/.stage-*`. To run the unpackaged Electron source, set `SECTOR7_DESKTOP_STAGE` to one of those absolute staging-directory paths before `npm start --prefix desktop`. Packaged apps use their bundled server and need no stage setting.

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
    "openaiBaseUrl": "https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/openai",
    "keychainAccount": "adriaan.van.erps",
    "keychainService": "telenet-bifrost-dev-virtual-key"
  }
}
```

Optional `dataDir` selects an absolute workspace directory. Without it, the app preserves S7's existing `~/Library/Application Support/AI GUI` directory, including chats, projects, assets, command receipts and edit recovery copies. Electron's disposable profile lives under `Sector 7`; it does not import another browser's caches. Use S7 Settings for validated ZIP backups and recovery. App installation never deletes workspace data.

`BIFROST_API_KEY` overrides Keychain when launching from a shell. `BIFROST_ANTHROPIC_BASE_URL`, `BIFROST_OPENAI_BASE_URL`, `BIFROST_KEYCHAIN_ACCOUNT`, `BIFROST_KEYCHAIN_SERVICE` and `AI_GUI_DATA_DIR` override their config equivalents. `SECTOR7_DESKTOP_PORT` overrides `port`; the generic `PORT` variable does not affect desktop launch. Finder-launched apps use config and Keychain. `bifrost.baseUrl` and `bifrost.openaiBaseUrl` configure Claude and Sol independently and use the same gateway key. Existing config files receive the default Sol endpoint when the new field is absent. Do not add keys to config.json or environment files included in a build.

Port 47100 binds only to 127.0.0.1. The port stays fixed because browser caches use the origin. If it is occupied, startup reports a conflict and exits; change the port explicitly or close the conflicting app. The app never silently connects to another server or changes its browser origin. A per-launch token protects every HTTP request before Next receives it. Electron injects it into local requests; page scripts and model-run terminal commands do not receive the token.

Help opens the configuration, data and log folders. Logs live in `~/Library/Logs/Sector 7` and rotate after 5 MB. Backend logs redact the current gateway key and launch token. As in the browser app, local tool output may contain personal project content; treat logs and backups as private.

## Behavior

The backend runs through Electron's background helper. Only Sector 7 appears in the Dock and app switcher; the helper stays alive until the app quits.

Closing the window stops active chat work, waits for it to settle, and flushes pending workspace saves before closing. A failed save keeps the window open unless you explicitly choose Close without saving. On macOS, the app remains in the Dock and reopens its window when activated. Cmd+Q performs the same save step and then shuts down the backend; terminal process groups are cleaned up by the existing command manager. A pipe watchdog shuts down the backend if its Electron parent dies. An OS crash can still interrupt writes and leave detached descendants; existing receipt/recovery handling applies.

Add folder opens Electron's native directory sheet attached to the Sector 7 window. The chosen path still passes through the server's folder validation. Cancellation discards the result; duplicate requests cannot open competing sheets. The browser launcher builds its AppKit helper separately. Files and commands retain S7's local process permissions. They are not sandboxed to the connected repository. The Finder launch resolves the login shell PATH so development tools remain available. External HTTP(S) and mail links open in your default app; navigation and remote Electron windows are blocked. The renderer has no Node access. A narrow preload coordinates saving before close and directory selection. Picker requests require the app window, main frame and exact local origin.

Chrome's Google-backed Web Speech dictation is unavailable in Electron. Dedicated voice/image providers, screen capture, automatic updates, notarization and Intel/universal packaging are outside v0.1. Microphone permission supports audio requests from the app origin only. Normal export/attachment dialogs use Chromium; backups and restore use the existing S7 flows.

## Implementation and checks

[Claude's implementation plan](../desktop/CLAUDE-PLAN.md) is saved with the source. The implementation adds save-on-close coordination because the existing instance-lock flusher does not run on window close. Authentication gates the HTTP listener before Next, avoiding dependency on edge middleware environment behavior. The original loopback/origin middleware remains active.

`fs-ext` uses the Electron Node ABI. `desktop:build` rebuilds only `desktop/node_modules/fs-ext`, copies its binary into the staged server, and verifies it with Electron's embedded Node before packaging. Root `node_modules` remains compatible with the usual browser launcher. Electron builder never rebuilds the root dependencies. The package is generated from explicit desktop files and a fresh staged standalone server, excluding environment files and build caches. Local staging directories remain under `desktop/.stage-*` for inspection. Set `SECTOR7_DESKTOP_OUTPUT` to an absolute build-output directory to avoid replacing an existing output; the default is `desktop/out`.

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
