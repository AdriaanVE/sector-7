# GPT-6.1 Sol and chat subagents

GPT-6.1 Sol is selectable alongside Opus 5.5 and Sonnet 5.5. The browser launcher and desktop app map the existing Bifrost virtual key to separate server-managed Anthropic and OpenAI endpoints. Sol defaults independently to `https://bifrost.customer-assist-dev.awsnprd.external.telenet.be/openai`; `BIFROST_OPENAI_BASE_URL` overrides it. Existing Claude defaults remain Opus at medium effort. Restart with `just up` to load the new server connection.

Chats expose `spawn_agent` for a self-contained delegated task. Children default to GPT-6.1 Sol at medium effort, inherit personal/project instructions and local file/terminal access, save their own transcript, and return their result and conversation ID to the parent. Child chats appear as `Subagent: ...` in the sidebar. Parent Stop cancels the child. Early Stop and context errors retain inspectable outcomes after disk reload. Replaying a saved invocation returns its previous child instead of launching again.

The first implementation waits for each child to finish and uses the parent turn's existing five-minute deadline. It shares project files, prevents nested delegation, and reports missing human decisions to the parent. It does not launch Codex or OpenCode subprocesses. Their child-session patterns informed the implementation; Sector 7 uses its own AIX runner and existing local tool authorization.

## Gateway verification

Live checks on 2026-10-04 used the existing Keychain credential without printing or saving it:

- `gpt-6.1-sol` on `/v1/responses`: HTTP 200.
- Current OpenAI `web_search` and `code_interpreter` with an auto container: both completed, returning the OpenAI homepage and `17 * 19 = 323`.
- Claude `web_search_20250305` and `web_fetch_20250910`, with Sector 7's request identity: HTTP 200, both completed.
- Claude `web_search_20260318`, `web_fetch_20260318` and `code_execution_20260120`: HTTP 400, workspace capability rejection. Those remain disabled.

Sol's Code execution toggle enables the current code interpreter. Its preference survives switching to Claude without sending unsupported Claude code parameters. Sol web search and code execution preferences carry into Sol children. Credentials, endpoints and browser-direct requests remain server-managed.

## Tests and review

The user approved provider-request and subagent lifecycle test boundaries and requested Claude critique before further implementation. Model/subagent scaffolding began before that TDD request. Subsequent slices followed test, red result, Claude critique, minimal fix, green verification. Claude found and helped tighten tool opt-outs, reload tests and model defaults, then identified model-switch and context-error regressions that were reproduced and fixed.

Eight focused tests cover current hosted tool requests, switching models, real project file reads, tool inheritance and opt-outs, saved child restore, duplicate reuse, parent/tool/child round trip, Stop propagation and pre-generation/follow-up context errors. The connection regression uses explicit separate server endpoints with the shared fixture key. It reproduces the old Opus-only middleware restriction, then verifies Sol listing, outgoing URL/authentication, rejected client overrides and other providers without network requests. Claude approved that test before the narrow listing fix. The tests use the actual chat runner, tRPC and local file/disk handlers; only the external model HTTP response is replaced. Live gateway checks supplement offline tests.

The feature quality gate passed types, lint and 218 tests with 22 explicit network skips before rebasing. Browser visual acceptance could not run because the browser-control authentication token was unavailable. Live gateway verification covers hosted search, code execution and compaction. A full Next.js bundle build remains unverified.

Sources: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [web search](https://developers.openai.com/api/docs/guides/tools-web-search), [code interpreter](https://developers.openai.com/api/docs/guides/tools-code-interpreter), [Codex subagents](https://developers.openai.com/codex/multi-agent), [Codex](https://github.com/openai/codex), [OpenCode task tool](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts).

## Context settings and project agent folders

Sector 7 owns `runtime-config.ts`: Sol working limit 400,000 tokens, automatic compaction threshold 360,000, experimental compaction enabled. The model's published 1,050,000-token capacity is retained separately. Both main chats and subagents send server-side Responses `context_management` with `store: false`.

Compaction checkpoints retain the latest canonical output suffix, save to disk, and replay in the next request or local tool continuation. The complete visible transcript remains saved. A SHA-256 context fingerprint invalidates covered edits and changed instructions; model switches receive original history. A changed endpoint or credential fingerprint rejects the old checkpoint before upstream transmission and retries once with raw original history, preserving edited system instructions and selected skills. Checkpoints use the requested model ID even when the response echoes a dated name. Live Bifrost compaction and replay returned HTTP 200 and retained the fixture fact.

Edit project detects `.codex` and `.claude` in each source folder and shows unchecked opt-ins only for existing directories. Saved selections provide project skills plus model-matching `.codex/AGENTS.md` and `.claude/CLAUDE.md` instructions to chats and subagents. Disabled folders contribute neither. Home skills keep their existing IDs; project skill IDs include their project/folder scope. Runtime settings and credentials are not imported from these directories.

Removed `.github/FUNDING.yml` at the user's request. Compaction, folder catalog and instruction-inheritance tests were reviewed by Claude before implementation. Final quality gate passed types, lint and 218 tests with 22 network skips. The app returned HTTP 200; visual browser acceptance could not run because the browser-control authentication token was unavailable.

Claude's final review identified raw-history retry, echoed model identity and credential-change checkpoint issues. Regression coverage was strengthened and the fixes verified: raw history preserves system edits and avoids duplicated skills, parser checkpoint identity uses the requested model, and the private deployment digest includes authentication/account headers. The final focused Claude verdict approved the fixes with no remaining findings in the reviewed snippets. `npm run precommit` passed again with 218 tests and 22 network skips.

## Integration with current main

Rebased onto the Mac desktop release, preserving native folder picking and draft project edits. Desktop config now accepts `bifrost.openaiBaseUrl` and its environment override, with the same independent Sol default and shared server key as the browser launcher. Existing config files remain compatible. The desktop regression reproduced the missing Sol connection; Claude approved the process-boundary and configuration tests before implementation. Desktop types and all eight tests passed.

Claude completed the focused rebase review with no actionable defects. Browser and desktop visual acceptance remain unverified.

The rebased quality gate passed types, lint and 224 tests with 22 explicit network skips using Node 22, matching the installed native dependency.
