# Configuration

All commands run from the repository root. Version 0.1 supports a local Mac browser server with Node 22, 24 or 26 and npm, and an Electron app for Apple silicon with its runtime bundled.

| Variable | Purpose |
| --- | --- |
| `PORT` | Local HTTP port; use 3004 for this project. |
| `BIFROST_API_KEY` | Server-only Bifrost virtual key; takes precedence over Keychain. |
| `BIFROST_ANTHROPIC_BASE_URL` | Anthropic-compatible Bifrost endpoint. Defaults to the existing personal development endpoint. |
| `BIFROST_OPENAI_BASE_URL` | OpenAI-compatible Bifrost endpoint for GPT-6.1 Sol Responses. Defaults independently to `https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/openai`. |
| `BIFROST_KEYCHAIN_ACCOUNT` | Keychain account; default `adriaan.van.erps`. |
| `BIFROST_KEYCHAIN_SERVICE` | Keychain service; default `telenet-bifrost-dev-virtual-key`. |
| `AI_GUI_DATA_DIR` | Workspace directory override in any mode. Development defaults to `sector-7-dev` inside the OS temporary directory; production and installed Electron builds default to `~/Library/Application Support/AI GUI`. |
| `NEXT_PUBLIC_BUILD_HASH` | Build identity for source archives without Git; use `v0.1.0`. |

Use macOS Keychain Access to store the existing gateway key, or inject it through your shell environment. The local launcher maps the same virtual key to the Anthropic and OpenAI adapters on the server. Client credentials, client endpoints and browser-direct requests are disabled for both. Do not put keys in the browser or commit environment files. Restart the local app with the launcher after changing endpoint configuration.

GPT-6.1 Sol requires `/v1/responses` for function tools. Its five effort levels are low, medium, high, xhigh and max. Web search uses the current `web_search` tool; the Code execution toggle enables `code_interpreter` with an automatically managed container. Both tools completed live through this gateway on 2026-10-04. Claude basic `web_search_20250305` and `web_fetch_20250910` completed on the same date. Claude `web_search_20260318`, `web_fetch_20260318` and `code_execution_20260120` returned workspace capability errors, so those remain disabled. Provider capability changes require another live check.

`spawn_agent` defaults to GPT-6.1 Sol and medium effort. It runs an isolated saved chat, inherits project membership and instructions, and waits for a result within the parent turn's five-minute deadline. Child model and effort can be supplied explicitly. Parent web-search preference and Sol code-execution preference carry into the child. Child agents cannot delegate or ask the user questions; they report missing decisions in their result. Inspect the child in the sidebar after completion, failure or Stop. Reload does not restart interrupted work or repeat an invocation.

Leave analytics settings `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_GA4_MEASUREMENT_ID` unset for the personal local app. No login, Google SSO or cloud sync is required. Browser dictation remains Chrome Web Speech, which sends audio to Google. Dedicated voice and image model connections are deferred.

One server and one browser profile are recommended during this preview. Cross-process workspace locking and clearer stale-profile recovery remain acceptance work. Back up from Settings before changing data directories or testing migration. `next dev`, including `just up`, uses a separate temporary workspace. `next start` and installed Electron builds keep the legacy directory after the Sector 7 rename to retain existing chats. Development data survives ordinary restarts but can be removed by system temporary-file cleanup. Set `AI_GUI_DATA_DIR` to a persistent development folder when needed. Switching defaults does not move existing data; restore a backup into the new folder to copy it explicitly.

## Electron desktop

The Mac app reads `~/Library/Application Support/Sector 7/config.json` and uses the same Bifrost Keychain defaults and durable `AI GUI` data directory. `bifrost.baseUrl` configures Claude; `bifrost.openaiBaseUrl` configures Sol independently. `BIFROST_OPENAI_BASE_URL` overrides the latter. Default loopback port is 47100; `SECTOR7_DESKTOP_PORT` overrides it. Install output defaults to `desktop/local`. See [Mac app setup](electron-mac.md) for the complete config, packaging and lifecycle details.

## Folder picker

The local launcher compiles the macOS AppKit helper into `build/native/` once and reuses it until its source changes. This uses the same Xcode Command Line Tools required by installation. Compilation happens before the HTTP server starts. `SECTOR7_FOLDER_PICKER` is a server-only absolute executable path set by the browser launcher. If starting Next directly, first build the helper with `node --input-type=module -e "import('./tools/local/build-folder-picker.mjs').then(m => m.buildFolderPicker())"`.

Electron uses a native directory sheet attached to the app window through the preload bridge. Both paths validate the selected directory on the server and keep project changes in the editor draft until Save.

## Context and compaction

Sector 7 owns its runtime settings in `src/common/personal/runtime-config.ts`; it does not load Codex's `config.toml`. Sol chats and subagents use a 400,000-token working limit and experimental server-side compaction at 360,000 tokens. The actual model capacity stays in the model definition. The working limit reserves output and reasoning space. Large single additions can still exceed the working limit before compaction can run.

Responses requests send `context_management` with `store: false`. The latest encrypted checkpoint and subsequent output items save with the assistant message. Future requests replay that checkpoint and newer messages. The full transcript remains available locally. Covered edits, changed instructions, model switches or connection/credential changes require the original history again. The retry preserves edited system instructions and selected skills. Compaction is model-managed and may lose detail. Bifrost compaction and checkpoint replay completed live on 2026-10-04.

## Project agent folders

Edit project shows `Use .codex` and `Use .claude` only when those directories exist inside a connected source folder. They are unchecked by default and save independently per folder. Enabled folders provide selectable project skills and model-matching instructions from `.codex/AGENTS.md` or `.claude/CLAUDE.md`; subagents inherit the project. Home skills remain available. Missing directories are hidden. This does not import Codex runtime configuration, Claude settings or credentials.
