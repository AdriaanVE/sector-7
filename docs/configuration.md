# Configuration

All commands run from the repository root. The supported 0.1 environment is a local Mac browser app with Node 22, 24 or 26 and npm.

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
