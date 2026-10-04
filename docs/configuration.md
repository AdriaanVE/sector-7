# Configuration

All commands run from the repository root. Version 0.1 supports a local Mac browser server with Node 22, 24 or 26 and npm, and an Electron app for Apple silicon with its runtime bundled.

| Variable | Purpose |
| --- | --- |
| `PORT` | Local HTTP port; use 3004 for this project. |
| `BIFROST_API_KEY` | Server-only Bifrost virtual key; takes precedence over Keychain. |
| `BIFROST_ANTHROPIC_BASE_URL` | Anthropic-compatible Bifrost endpoint. Defaults to the existing personal development endpoint. |
| `BIFROST_KEYCHAIN_ACCOUNT` | Keychain account; default `adriaan.van.erps`. |
| `BIFROST_KEYCHAIN_SERVICE` | Keychain service; default `telenet-bifrost-dev-virtual-key`. |
| `AI_GUI_DATA_DIR` | Durable workspace directory. Default `~/Library/Application Support/AI GUI`. |
| `NEXT_PUBLIC_BUILD_HASH` | Build identity for source archives without Git; use `v0.1.0`. |

Use macOS Keychain Access to store the existing gateway key, or inject it through your shell environment. The local launcher maps these values to the existing Anthropic adapter on the server. Do not put keys in the browser or commit environment files.

Leave analytics settings `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_GA4_MEASUREMENT_ID` unset for the personal local app. No login, Google SSO or cloud sync is required. Browser dictation remains Chrome Web Speech, which sends audio to Google. Dedicated voice and image model connections are deferred.

One server and one browser profile are recommended during this preview. Cross-process workspace locking and clearer stale-profile recovery remain acceptance work. Back up from Settings before changing data directories or testing migration. Keep the legacy directory after the Sector 7 rename to retain existing chats.

## Electron desktop

The Mac app reads `~/Library/Application Support/Sector 7/config.json` and uses the same Bifrost Keychain defaults and durable `AI GUI` data directory. Default loopback port is 47100; `SECTOR7_DESKTOP_PORT` overrides it. Install output defaults to `desktop/local`. See [Mac app setup](electron-mac.md) for the complete config, packaging and lifecycle details.

## Folder picker

The local launcher compiles the macOS AppKit helper into `build/native/` once and reuses it until its source changes. This uses the same Xcode Command Line Tools required by installation. Compilation happens before the HTTP server starts. `SECTOR7_FOLDER_PICKER` is a server-only absolute executable path set by the browser launcher. If starting Next directly, first build the helper with `node --input-type=module -e "import('./tools/local/build-folder-picker.mjs').then(m => m.buildFolderPicker())"`.

Electron uses a native directory sheet attached to the app window through the preload bridge. Both paths validate the selected directory on the server and keep project changes in the editor draft until Save.
