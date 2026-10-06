# Sector 7 Mac app

Sector 7 Desktop 0.1.4 packages the existing S7 application, Next.js backend and Electron runtime. It supports Apple silicon Macs. After installation, no Node, npm or separately started server is required.

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
- `desktop/out/Sector-7-0.1.4-arm64.dmg`

Merging a change to `desktop/package.json` on `main` starts a version check. A higher version automatically runs the quality gate and desktop checks, builds the Apple silicon app/DMG, and uploads them for 14 days. Package edits with the same version skip the release; version decreases fail. Manual builds and retries remain available through GitHub Actions > Build Mac app > Run workflow on `main`. The app is zipped with `ditto` to preserve its bundle permissions and uses the same ad-hoc signing as local builds. Other branches are skipped. Hosted execution of the automatic trigger must be verified after it reaches `main`.

Every successful release build publishes a `desktop-v<version>` release and automatically updates `Casks/sector-7.rb` on the `main` branch of `AdriaanVE/homebrew-tap`. The app repository stays protected; there is no cask PR. Configure the `release` environment for `main` only. Use separate fine-grained tokens: `SECTOR7_RELEASE_TOKEN` with Contents write permission for `AdriaanVE/sector-7`, and `SECTOR7_HOMEBREW_TOKEN` with Contents write permission only for `AdriaanVE/homebrew-tap`. No Pull requests permission is needed. The tap must already contain its initial cask; preflight checks that and repository access before the build.

Run `npm version patch --prefix desktop --no-git-tag-version` for each subsequent release and commit both desktop package files. Existing releases cannot be republished. If publishing fails before a release is complete, inspect any draft before retrying. If only the separate Homebrew job fails after publication, rerun failed jobs; the completed release job is reused. The tap update uses the current file SHA to reject concurrent changes and skips identical content. Do not replace published assets. For manual recovery, `node desktop/scripts/homebrew-cask.mjs <downloaded-app.zip> <output.rb>` generates the cask without changing the app checkout.

Install and update through the dedicated tap:

```sh
brew tap AdriaanVE/tap
brew install --cask adriaanve/tap/sector-7
# Quit Sector 7 before updating:
brew update
brew upgrade --cask sector-7
```

The cask supports Apple silicon on macOS 13 or later. Homebrew installs into Applications and leaves user data intact on uninstall. Upgrades may prompt again for folder, microphone or Keychain permissions because builds use ad-hoc signing. Downloaded apps may need macOS approval because they are ad-hoc signed. The dedicated-tap publisher still needs its first hosted run. Existing installs from `adriaanve/sector-7` follow the `tap_migrations.json` mapping when the old tap updates.

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
  "phonon": { "command": "fermion", "port": 8010 },
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

Chrome keeps its Google-backed Web Speech dictation. Electron uses local Phonon-2 dictation, described below. Dedicated image providers, screen capture, automatic updates, notarization and Intel/universal packaging are outside v0.1. Microphone permission supports audio requests from the app origin only. Normal export/attachment dialogs use Chromium; backups and restore use the existing S7 flows.

## Voice input

Install Phonon separately on an Apple silicon Mac:

```sh
pip install fermion-research mlx mlx-audio mlx-lm soundfile scipy zstandard
```

The Composer mic and Ctrl+M stream microphone audio directly to a local Phonon-2 server. Finished segments stay visible while the current phrase updates; stopping the mic or reaching Pause before stopping waits for the final transcript. English is the only supported input language, even when Language selects another language. Chrome continues to use Web Speech.

Voice input settings expose Noise threshold (0-10%), Speech lead-in (0-300 ms), Speech tail (0-1000 ms) and Automatic mic gain. Defaults are 1.5% (0.015 RMS), 100 ms lead-in, 600 ms tail and gain off. Increase Noise threshold if silence produces words; lower it if quiet speech is missed. Speech tail protects quiet word endings. Pause before stopping controls the separate delay after the last transcript update.

Changes apply during dictation: the gate reads the settings on each frame, and automatic gain updates the active microphone track. If the device rejects a gain update, the mic reports an error and recommends restarting capture. Settings save with the workspace and backups. Reset input defaults restores the four input controls. Louder background audio can still cross the energy threshold; this is not a speech classifier.

Warm up now loads Phonon and runs the initial Metal decode before dictation, without microphone access. It shifts the first-start wait earlier; subsequent dictations reuse the process until toggle off or app quit. Stop an active dictation before warming up. Automatic background startup is not enabled by default.

Settings > Voice input shows the Phonon toggle and its status before the language and timeout controls. Phonon is enabled by default but starts only on the first mic press. Turning it off hides the desktop mic and stops the server; turning it back on starts nothing. Once started, it stays up until toggle off or app quit. The first run downloads the model separately (about 164 MB), and startup/Metal warm-up can take seconds. Audio captured during startup is buffered for up to three minutes and sent when ready. Missing installation, busy streams, crashes and startup failures show an error while preserving finalized text. The next mic press retries a stopped server.

Phonon keeps its model and MLX allocation cache in memory after dictation for faster reuse. Fermion 0.2.9 does not cap this cache: live partial decodes with changing audio lengths can consume several GB. Turning Phonon off releases the owned process and its memory; turning it on keeps startup lazy. A cache limit in Fermion is the preferred fix for sustained dictation.

`phonon.command` is a single executable name or absolute path, without shell arguments. Finder launches resolve the login shell PATH. `phonon.port` defaults to 8010, must be between 1024 and 65535, and must differ from the desktop backend port. `SECTOR7_PHONON_COMMAND` and `SECTOR7_PHONON_PORT` override these values. There is no `enabled` config field; the toggle is saved with workspace settings and included in backups.

The server binds to 127.0.0.1 with a random per-launch key. The renderer sends 16 kHz mono Float32 PCM over the authenticated WebSocket. Phonon output goes to `phonon.log` in Help > Open Logs Folder, with the launch key redacted. Phonon, Python and model weights are not bundled in the DMG. Intel, CUDA, other models and browser Phonon integration are deferred.

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
