# Personal Claude workspace: final implementation plan

Status: In progress
Approval: Implementation authorized 2026-10-03; all three product calls resolved (see Human calls)
Date: 2026-10-03
Repository: /Users/adriaan.van.erps/Code/AI GUI
Analyzed base: 80d366a88cc8aa885a2d62ca9c60100eb72af40e, big-AGI Open 2.1.1
Supersedes: [neon-tokyo-chat.md](neon-tokyo-chat.md) (revised plan) as the implementation reference
Inputs: [review](neon-tokyo-chat-review.md), [review analysis](../../analysis/neon-tokyo-chat-review-analysis.md),
[original analysis](../../analysis/big-agi-remodel.md)

This plan is the revised plan plus the second-pass review corrections (marked **[R2]**). Each
**[R2]** item was checked against source at the analyzed base.

## Outcome

Remodel this big-AGI clone in place into Adriaan's local browser chat app. Keep the framework,
AIX adapters, message engine, attachment converters and renderers. Deliver:

- A ChatGPT/Codex-style sidebar and conversation area.
- Claude through Bifrost.
- Projects with automatic instructions and files.
- Automatic disk saving.
- Activity and attention states.
- A compact turn navigator for long chats.

Delivery is in five milestones. Disk persistence, projects, attention and hosted tools are
required outcomes; the milestones sequence them, they do not defer them. No application code has
been written.

## Settled product decisions

- Local browser app on the Mac, one user. No sign-in, SSO, accounts or cloud sync.
- Chat models: exactly `claude-opus-5-5` and `claude-sonnet-5-5`, through Bifrost.
- New chats default to Opus 5.5. Both models default to medium effort, with a per-chat effort
  slider (low, medium, high, xhigh, max).
- Both models always use adaptive thinking. Hide the Sonnet Thinking switch and Opus `fast_2x`.
- Projects group chats and share instructions and files. These are included automatically in
  future requests.
- Chats, projects and files save to disk automatically. Disk is the only durable store.
- Keep image generation, attachments, search, Markdown/code, editing, retry, branching, archive
  and local backup. The image model connection is chosen later.
- Keep microphone input and the ASRx infrastructure; the voice model is chosen later. Remove
  calls, spoken replies and read-aloud.
- Include Claude hosted web search, fetch and code execution through Bifrost. Code runs in the
  remote sandbox, never on the Mac.
- Working means an active query. Waiting means unread, or a question that needs an answer; it is
  not a prompt queue. Claude signals questions explicitly through a tool.
- Dark-only first theme: midnight/indigo, pink/cyan neon and restrained gradients. Richer Tokyo
  styling comes later.
- Hard fork of chat/layout; keep diffs in `src/modules/aix/**` and `src/modules/llms/**` small.
  No feature-flag framework.

## Scope boundaries

**Remove** personas and preset-driven generation, Call/TTS/read-aloud, Beam/multicast/comparison,
split panes, legacy ReAct, the Diff and Tokens apps, News and promotions, public link sharing and
the Google Drive picker. Remove their routes (`pages/call`, `pages/personas`, `pages/diff`,
`pages/tokens`, `pages/news`, `pages/link/chat/*`, `pages/beam`, `pages/draw`, `pages/workspace`),
commands, shortcuts, settings and buttons. `pages/dev/*` may stay.

**Execute modes:**

- Keep `generate-content` and `generate-image`.
- Keep `append-user` only as internal plumbing.
- Remove the `beam-content` and `react-content` entry points.

The Beam controller/store may stay constructed but unused. Delete feature-only code only when the
remaining callers make it mechanical. Leave Prisma/build cleanup alone. Preserve licenses and
notices.

**Out of scope:**

- OpenAI chat models, the broad provider wizard and browser API-key fields.
- Local shell tools, MCP, cloud services, a native Mac wrapper, RAG and cross-chat memory.
- Live jobs that survive a browser reload.

Image and transcription credentials must be server-side when configured later.

## Cross-cutting decisions

### Request settings

- Add a serializable per-chat config: `{ llmId, effort, tools: { webSearch, webFetch, codeSandbox } }`.
  Import and new-chat defaults are Opus/medium/all tools off, unless a valid allowed model can be
  recovered from the chat.
- **[R2] Use `llmUserParametersReplacement`, not `llmOptionsOverride`, as the main path.**
  - Replacement substitutes the whole global `llm.userParameters` (`aix.client.ts:418,610`).
    `initialParameters` still apply.
  - Build the replacement only from the per-chat config, so stale global values persisted in
    `app-models` (`llmVndAntInfSpeed`, Skills, old tool toggles, thinking budget) can never leak
    into a request.
  - Pass it at every chat call site: `chat-persona.ts` and the ask-user continuation.
- Snapshot the per-chat config at Send. Changing effort or the model affects only the next request.
- Pin the utility domains `fastUtil`, `codeApply` and `imageCaption` to Sonnet 5.5 with a curated
  medium-effort replacement. No cheapest-model heuristic.
- Validate model rules server-side too: allowed model IDs only, effort in the curated set, and
  thinking adaptive.

### Reasoning across models

- Filter outbound: in the request copy, drop signed and redacted reasoning parts whose generator
  model (`generator.aix.mId`) differs from the target model. The stored transcript is untouched.
- **[R2]** The existing default `chatThinkingPolicy: 'last-only'` (`store-app-chat.ts:128`)
  already strips thinking permanently from all but the latest assistant message after each
  reply (`chat-persona.ts:131-135`). So the cross-model filter mostly affects one message. Keep
  that policy. Exempt an assistant message with an unresolved `ask_user` tool call from
  stripping. The strip action needs a "skip message IDs" parameter.

### Instructions

- Compute at request time: neutral base, then personal instructions, then project instructions.
  Never store a generated system prompt in history on each send.
- Replace `ConversationHandler.inlineUpdatePurposeInHistory` and the `err-no-persona` guard
  (`_handleExecute.ts:64-67`) with the instruction builder. Retry must not re-run any persona
  refresh.
- An explicitly edited or imported chat system message is kept. Its append/replace rule is open
  (Human call 1).
- **[R2] Date context must be date-only.** `bareBonesPromptMixer` sets `lowHourPrecision` from
  the `autoVndAntBreakpoints` setting (`pmix.ts:85-95`). A time-of-day in the system prompt
  changes the cached prefix on every request. The builder emits the current date at day
  precision and the model name, and nothing else that varies.
- The neutral base includes one sentence on when to call `ask_user_question`.

### Project context and caching

- Project files go in one leading synthetic user content block with source delimiters. They are
  content, not system instructions. The block is assembled from the processed file records at
  request time and is never stored in history.
- **[R2] Cache breakpoints.** The existing auto-caching
  (`ConversationHandler.inlineUpdateAutoPromptCaching`) flags the system message plus the last
  two user messages. The adapter caps at 4 breakpoints by **removing the earliest**
  (`anthropic.messageCreate.ts:488-499`). The budget is: system (1) + project block (1) + last
  two user turns (2) = 4. One user-pinned breakpoint would then evict the system breakpoint.
  Rule: in personal mode, place the project-block breakpoint and reduce auto-flagging to the
  last **one** user message when a project block exists. Add a unit test on the final wire.
- File or instruction edits change the prefix. The next request misses the cache once and may
  drop preserved thinking through the existing `drop_block` path. That is acceptable.
- Never promise cache hits. Keep the actual usage metrics visible in the cost popover.

### Local access and credentials

- A host launcher script (in `tools/` or `scripts/`) reads the Bifrost virtual key from
  `BIFROST_API_KEY` or the macOS Keychain. It exports `ANTHROPIC_API_KEY` and
  `ANTHROPIC_API_HOST=<bifrost>/anthropic`, then runs `next dev -H 127.0.0.1` or
  `next start -H 127.0.0.1`. It never prints the key. Keychain is unavailable in Docker; there,
  document explicit env injection.
- **[R2]** Port: other projects may hold 3000-3003. The launcher respects `PORT`, and the
  middleware checks the **hostname only** (port-agnostic), which is enough against DNS rebinding.
- Data directory: `~/Library/Application Support/AI GUI`, overridable with `AI_GUI_DATA_DIR`. The
  server owns all paths; clients send only validated IDs.
- Data and backups never contain provider credentials, session tokens or transient recordings.

## Milestones

| Milestone | Deliverable | Depends on |
| --- | --- | --- |
| M1 | Local Claude shell, access boundary, per-chat controls, removals, theme | none |
| M2 | Projects with shared instructions and files | M1 |
| M3 | Disk persistence, startup gate, recovery and backup | M1; absorb M2 fields before closing |
| M4 | Attention states, ask_user, turn navigator | M1; final persistence needs M3 |
| M5 | Hosted tools, sandbox policy and generated files | probe right after M1; complete with M2/M4 |

Run the M5 step 1 probe right after M1, so gateway restrictions are known early.

### M1: Local Claude shell

1. **Launcher and binding.** Add the launcher above and loopback scripts. The user still starts
   and stops servers. Preserve the webpack hooks and the `predev`/`prebuild` generators.
2. **API middleware.** Add root `middleware.ts`, with a matcher for `/api/:path*`.
   `middleware_BASIC_AUTH.ts` stays unused; Next allows only one middleware.
   - Allow a hostname only if it is `localhost`, `127.0.0.1` or `[::1]`.
   - Reject a conflicting `X-Forwarded-Host`.
   - Reject a present `Origin` that is `null`, malformed or a different origin.
   - Reject `Sec-Fetch-Site: cross-site`.
   - Mutations must be `application/json` or carry an `X-AI-GUI: 1` header (binary/backup routes).
   - No CORS headers.
   - Test matrix: same-origin fetch, curl without Origin, foreign Origin, `null` Origin, a
     rebinding Host, a cross-site form POST.
3. **Anthropic access guard.** In `anthropicAccess`, when personal mode is on (server key
   present), reject a nonempty client `anthropicKey`, `anthropicHost` or `clientSideFetch`. That
   one point covers generation, listing, Skills and the Files API procedures.
   - In the AIX router, reject before dispatch any dialect other than `anthropic` and any model
     ID outside the allowlist.
   - Disable the remaining credential-backed vendor routes in personal mode. Keep OpenAI's
     existing rule: a client host means client credentials only (`openai.access.ts:342-356`).
   - **[R2] Client cleanup.** A browser that used big-AGI before may already have an Anthropic
     service in `app-models` with a key or host set. That client would now be rejected on every
     request. In personal mode, the Anthropic vendor ignores stored client key/host/CSF and
     relies on the server-configured service (`hasServerConfigKey: 'hasLlmAnthropic'`). A
     one-time client migration blanks those fields. No keys are copied anywhere.
4. **Static model list.** In personal mode, `listModels` returns the two hardcoded definitions
   without calling `/v1/models`. Skip the boot-time refresh of other vendors. Live availability
   comes from the first real request, or from an explicit Check connection that sends one
   minimal message without tools. Missing credentials or model show a clear error, with no
   fallback.
5. **Per-chat controls.**
   - Add `chatConfig` to `DConversation` with a `store-chats` version bump and migration. Also
     cover `chats.converters.ts` import/export and duplication.
   - Pass the replacement params at send.
   - Add the cross-model reasoning filter.
   - Pin the utility domains.
   - Toolbar: a two-option model picker plus an accessible discrete effort slider. Use a Joy
     Slider with marks, labels, arrow-key support and `aria-valuetext`.
6. **Neutral instructions.**
   - Add the instruction builder.
   - Remove the persona refresh and its guard.
   - Replace the empty-chat `PersonaSelector` with a greeting plus the composer.
   - Remove persona avatars and symbols from `dMessageUtils.tsx`, the drawer items and the toolbar.
   - `systemPurposeId` may remain as an inert compatibility field.
7. **Layout.**
   - Optima becomes Sidebar | Conversation.
   - Hide `DesktopNav`. Fold the needed rail items (Settings) into `ChatDrawer`.
   - Move the retained `ChatPane` actions (export, archive, delete, cost) into a conversation menu.
   - One pane only: remove the split openers and shortcuts.
   - Center the list and composer at 760-820px.
   - Quiet user bubbles and open assistant text.
   - Floating composer with attach, mic and send/stop. Retained toggles go in a compact menu.
8. **Theme.**
   - Force dark (`ProviderTheming`).
   - Palette: `#141421`, `#1c1b30`, `#efeaf7`, `#f47bb8`, `#79dce8`, `#a891ee`, on Inter and
     JetBrains Mono.
   - One shell gradient; neon only on selection, focus and activity.
   - Fix hardcoded light colors only on retained surfaces: dialogs, code, tool output,
     attachments, menus.
9. **Removals.**
   - Remove the entry points listed in Scope boundaries.
   - Keep the image mode visible with an honest unconfigured state.
   - Remove Call/TTS while keeping dictation and ASRx.
   - Remove the News redirect (`ProviderBootstrapLogic.tsx:32`) and unneeded boot calls.
   - **[R2]** PostHog and GA4 activate only with `NEXT_PUBLIC_POSTHOG_KEY` /
     `NEXT_PUBLIC_GA4_MEASUREMENT_ID` set at build time. Document that they stay unset; no code
     removal is needed.

**M1 acceptance:**

- Opens straight into a dark chat. No login, personas, Call, Beam, rail or permanent panel.
- Both models stream through Bifrost. All five effort stops serialize correctly on the wire.
- Two chats keep different model/effort. Changing selection does not affect an in-flight
  request. Stale global parameters never reach the wire.
- A model switch keeps the transcript and drops cross-model signed reasoning from the request.
- The credential destination cannot be changed via chat, list, Skills or file calls. Foreign
  requests to local APIs are rejected. No secret appears in browser storage, bootstrap payloads
  or exports.
- Image mode is honestly unconfigured. Typing works without voice setup.
- Edit, retry, branch, archive, search, attachments and rendering still work.

### M2: Projects

1. **Store migration.** Extend `DFolder` in place with `instructions`, `fileIds[]` and
   `revision`. Add a `version` and a `migrate` to the `app-folders` persist config; it has none
   today.
   - A chat in several folders belongs to the first folder in display order. Remove the other
     memberships and show a one-time migration summary. Never delete chats.
   - Turn projects on by default (`enableFolders` is false today).
2. **[R2] Storage split.** `app-folders` lives in localStorage, which has a ~5 MB quota. Keep
   only small metadata there: name, color, instructions, file IDs and revision.
   - Store file records (processed text, warnings, token estimates) in IndexedDB. Store
     originals in Dexie under scope `app-projects`, with a new asset type.
   - DBlob supports only `image`/`audio` today (`dblobs.types.ts:61-63`); add the minimal
     document type.
   - M3 later moves all of this to disk.
3. **UI.** Expandable project rows with nested chats in `ChatDrawer`, replacing the
   `activeFolderId` filter. A project view shows name, instructions, files and chats.
   New-chat-in-project. Move/unfile from the chat menu. Changes apply to future requests only.
4. **Files.** Reuse the attachment pipeline for text, Markdown, JSON, CSV, code, PDF, DOCX and
   images.
   - Each record holds a stable ID, a content hash/version, MIME, name, size, extraction
     status/warnings, processed fragments, and token estimates keyed by `{model, method, version}`.
   - Limits: 20 files per project and 10 MB per original, or stricter converter limits where
     they apply.
   - Show extraction failures and scanned-PDF limits. Do not claim native Anthropic PDF
     citations.
5. **Request assembly.** Build the project block at request time, as in Cross-cutting decisions.
   Record the project ID, instruction revision and file `{id, version}` list in the assistant
   message generator metadata. Update the duplicate/serialize helpers.
6. **Context budget.** Before Send, estimate the full input: prefix, history, new attachments,
   tool overhead and thinking. Reserve the output tokens plus a 10% safety margin of the context
   window.
   - Label the result as an estimate. The tokenizer is a tiktoken fallback
     (`chat.tokens.ts:12-30`), not Claude's.
   - If the estimate is over budget, stop with an actionable message: no truncation, summary or
     RAG.
   - A server context-limit error remains possible and is shown actionably.
7. **Caching.** Apply the breakpoint rule from Cross-cutting decisions.
8. **Lifecycle.**
   - Removing a file stops future inclusion.
   - Deleting a project unfiles its chats.
   - A project-scope GC keeps every asset referenced by a live project or by any message's
     recorded file list. Chat-scope GC never touches `app-projects`.

**M2 acceptance:**

- Create, rename and reorder projects; edit instructions; add and remove files; create and move
  chats.
- Project chats always use the current shared context. Plain chats use none.
- Edits affect the next request; old replies and their recorded versions stay intact.
- Project files survive a reload in browser storage (disk comes in M3). GC cannot erase project
  or historically referenced assets.
- Conversion and context errors name the source file. Nothing is silently dropped.
- The legacy multi-folder migration is deterministic and keeps all content.

### M3: Disk as the durable store

1. **Storage adapter.** Implement a Zustand `PersistStorage` backed by a local Node service. Use
   it for `app-chats`, `app-folders`, project file records and an explicit allowlist of UI and
   personal settings.
   - Exclude provider/LLM stores, functions, abort controllers, incognito chats and transient
     recordings, using an explicit allowlist partialize.
2. **Workspace file.** One `workspace.json` holds `{ formatVersion, revision, stores: { [key]:
   {version, state} }, assets: manifest }`.
   - A shared client coordinator batches named-store writes, using the `idbUtils.ts` pattern:
     321 ms merge window, 1234 ms deadline, serialized, latest state wins.
   - Flush immediately on terminal replies and edits. Register an `addFlusher` for tab handover.
3. **Server commit.** Validate the schema, the expected `revision` and safe IDs.
   - Write to a temp file, fsync, rename; keep `workspace.last-good.json` and its assets.
   - A stale revision gets rejected. The client shows reload/recover; there is no
     last-writer-wins.
   - A save is confirmed only after commit. Show errors with retry.
4. **Assets.**
   - Add raw binary routes at `app/api/local/assets/[id]/route.ts` with `runtime='nodejs'`.
   - IDs are validated against a fixed charset and never contain a path.
   - Write-through on DBlob put/delete. Dexie becomes a disposable read cache.
   - Revive `Date` fields explicitly.
   - Assets commit before any manifest refers to them.
   - Deletion of unreferenced assets runs only after a consistent commit, and protects current,
     last-good and historical references.
5. **Startup gate.** Add a provider under `ProviderSingleTab` and before `ProviderBootstrapLogic`
   (`pages/_app.tsx:49-61`).
   - Disk-backed stores use `skipHydration`; the gate calls `rehydrate()` and waits for success.
   - Load the asset manifest before GC is allowed.
   - States: Loading, Ready, or Recovery required. A failed load never saves defaults over disk.
   - Make the chat `merge` idempotent: it currently appends stored chats to in-memory ones
     (`store-chats.ts:484-505`).
6. **First-run import.** Only when no disk workspace exists: read the legacy IndexedDB,
   localStorage and referenced Dexie assets; validate; commit together; mark the migration done.
   Leave the browser originals untouched. After that, disk always wins. Keep missing, corrupt and
   transport-failure states distinct.
7. **Backup and restore.**
   - Backup: flush, pause writes and GC, snapshot the manifest plus referenced bytes, verify,
     download as a zip.
   - Restore: unpack into a staging directory, validate versions and references, keep a recovery
     copy, swap atomically, rehydrate.
   - Never `localStorage.clear()` and never erase the active directory first.
   - **[R2]** No zip library is in `package.json`. Add one narrow dependency (for example
     `fflate`) or stream a directory archive server-side. Decide during M3; it is a routine
     choice.
8. **Exports.** Keep per-chat Markdown/JSON export and legacy big-AGI import. DataAtRestV1 and
   Flash Backup are not used for durable data. Import never restores model credentials.
9. **Settings.** Show the last confirmed save, errors, the data location and backup/restore. On
   reload, recovered partial replies show as Interrupted. Nothing replays automatically.

**M3 acceptance:**

- Projects, chats, files, images, archive and attention data survive a server restart and a
  clean browser profile.
- Empty startup, network errors or corrupt primary data never overwrite a valid workspace.
- Asset-first restore, Date revival and GC protection hold, with no dangling references.
- Stale revisions and save failures are visible. "Last saved" is accurate.
- Backup/restore includes empty projects and binary assets, without keys or incognito data.
- Browser migration runs once and keeps browser data if the first disk write fails.

### M4: Attention, questions and navigation

1. **Phases.** Add a transient `{opId, phase}` to the per-chat overlay store. Phases are
   Connecting, Thinking, Searching, Running code and Responding, set from the reassembly
   callbacks. Image generation is tracked separately: `image-generate.ts` has no abort signal,
   so it shows no Stop that claims cancellation.
2. **Persisted attention.** On `DConversation`: `lastCompletedMessageId`, `lastSeenMessageId`,
   `lastOutcome` (`ok | error | stopped | interrupted`) and `pendingQuestion` records.
   - Precedence: Working > Needs your answer > Failed/Interrupted > Unread > idle.
   - Failed clears on view. A question clears only on answer or dismiss.
   - Projects aggregate counts.
3. **Read detection.** A reply counts as seen only when its end is in view and the document is
   visible and focused. Add Mark read. Retry, edit, branch and import normalize attention.
4. **`ask_user_question` tool.**
   - Declare one optional function through the existing `tools` option on the AIX call
     (`aix.client.ts:246-247`).
   - Schema: 1-3 questions, each with a stable ID, text, optional choices (up to 5) and free
     text allowed.
   - `tool_choice` stays auto; these models reject a forced choice.
   - No heuristics.
5. **Dispatcher.**
   - Accept only complete, validated calls. Store the invocation ID, message and model, set the
     question as pending and end Working.
   - Unknown function calls get an explicit error `tool_response`.
   - Several invocations in one turn keep their IDs.
6. **Answer path.**
   - The answer card and the next Composer Send both answer.
   - Store a JSON-object `tool_response` on the assistant message that holds the `tool_use`.
     The Anthropic adapter emits it as a user `tool_result` (`anthropic.messageCreate.ts:~660`);
     results in user messages are skipped today (`aix.client.chatGenerateRequest.ts:381-383`).
   - Persist the answer first, then generate a **new** assistant message.
   - Debounce duplicate answers.
   - If a save fails, keep the question pending and offer retry.
   - After a reload with a saved answer, offer Continue; never auto-run.
7. **Dismiss and guards.**
   - Dismiss writes an error `tool_response` ("dismissed by user") and does not generate.
   - Block model changes while a question is pending.
   - Branch, retry or edit of a pending turn requires dismissing it first.
   - **[R2]** The adapter's anti-wedge (`_pairInteriorToolUseBlocks`, `anthropic.messageCreate.ts:501+`)
     already synthesizes stub results for orphaned interior `tool_use` blocks and skips the last
     assistant message. Rely on it as the safety net for legacy and imported histories. The app
     logic above still pairs every question explicitly, so the stub never stands in for a real
     answer.
8. **Navigator.**
   - Add `data-message-id` to the message `<li>` (`ChatMessage.tsx:883`). The list is not
     virtualized, so every anchor exists in the DOM.
   - One tick per user turn, with an excerpt on hover/focus. Click or Enter jumps.
   - An IntersectionObserver tracks the current turn.
   - Call `setStickToBottom(false)` before jumping. Jump to latest stays.
   - Bucket ticks when there are more turns than available height / 4 px.
   - On touch, show a tap-to-open turn list.

**M4 acceptance:**

- Several chats show their true phase while you navigate. Text and image completion, error and
  stop all clear it.
- A background completion stays Unread until actually viewed or marked read.
- Questions persist across viewing and reload, and clear only through a paired answer or dismiss.
- Both models complete a question/answer round trip and a following ordinary message with no
  orphan tool calls.
- The navigator jumps top/middle/latest without being pulled down while streaming.
- Keyboard and touch targets are usable and do not cover text.

### M5: Hosted tools and generated files

1. **Probe right after M1.** Make bounded live calls through the app's Messages route for both
   models, in this order: plain chat, then search, fetch and code each alone, then
   `ask_user_question` alongside hosted tools. Record results without credentials. No direct
   Anthropic fallback.
2. **Exact versions:**
   - Tools: `web_search_20260318` and `web_fetch_20260318` (dynamic); `web_search_20250305` and
     `web_fetch_20250910`; `code_execution_20260120`.
   - Beta headers: `code-execution-2025-08-25`, `files-api-2025-04-14`,
     `thinking-binding-controls-2026-08-01` (`anthropic.access.ts:174-204`).
   - Also check cache controls and usage reporting.
   - Leave Skills and tool search disabled.
3. **Tool UI.** Reuse the existing toggles, parsers, citations and result renderers as compact
   per-chat toggles, off by default. An unsupported capability gives an actionable gateway error.
4. **Container policy.** Add `antContainerPolicy: 'reuse-linear' | 'fresh'` next to
   `antContainerId` (`aix.client.ts:241,325-327`). A missing ID is not a reset, because it
   triggers the history scan.
   - Use `fresh` for retry, edit-regenerate, branch and model change.
   - Use `reuse-linear` for a new head turn and the ask-user continuation.
   - Historical handles and links stay in the transcript.
5. **Files.** Metadata, content and delete go through the M1 access guard.
   - Keep the 10 MB download cap and name it in errors.
   - Save downloaded artifacts as local assets. Mark not-yet-downloaded artifacts as remote-only.
   - Expired files get a clear message.
6. **Lifecycle.** Verify stop, error and `pause_turn` continuation. No reattach after a browser
   disconnect. Record any unsupported route or version, and which acceptance item it blocks.

**M5 acceptance:**

- Live evidence for each enabled capability on both models, including question plus hosted tools.
- Citations and tool results render and persist. Downloaded artifacts restore from disk.
- Retries and branches never rejoin a mutated container.
- Gateway restrictions and capped or expired downloads produce actionable errors, not false
  success.

## Verification

- **Setup.** Read repository instructions first. `.nvmrc` says Node 26; `engines` also allows
  22 and 24, and the claude-docker container runs 22.23.3. Run `npm ci` once in the container;
  `npm run tscheck` runs `npm install` via `pretscheck`.
- **Per milestone.** `npm run tscheck`, `npm run lint`, `npm test`. Run `npm run build` (webpack)
  after shell, route, middleware or runtime changes. There is no pre-commit configuration;
  check again before any authorized commit.
- **Unit tests.** Use `node:test` via tsx, as `src/**/*.test.ts` beside pure helpers. There is no
  IndexedDB shim; do not add one.
  - **M1:** access guard (client host + server key rejected, for generation, list and files);
    model/dialect allowlist; middleware Host/Origin matrix; static catalog with no network call;
    per-chat replacement params on the wire; cross-model reasoning filter.
  - **M2:** instruction layering; date-only prompt stability; folder migration; file version
    recording; context budget; breakpoint placement and the cap; project GC ownership.
  - **M3:** envelope encode/decode including Dates; atomic write and last-good recovery on a temp
    directory; stale revision; corruption; asset ordering; idempotent merge; one-time migration;
    backup/restore without credentials or incognito data.
  - **M4:** attention reducer and visibility; question schema validation; the
    `tool_use`/`tool_result` wire sequence; duplicate-answer guard; strip exemption for pending
    turns.
  - **M5:** container policy, fresh versus reuse.
- **Browser QA** on a user-started server: desktop and narrow layouts, focus and reduced motion,
  long text/code/citations, menus, attachments, search, edit/retry/branch/archive, projects, mic
  states, the image unconfigured state, scrolling while streaming, two running chats, a pending
  question across reload, clean-profile recovery, and a stale second profile.
- **Bifrost smoke checks** for every enabled capability. Offline tests do not prove gateway
  support.

## Repository workflow

- Before implementation, commit the planning docs (this file, the revised plan, the review and
  both analysis docs) on `feat/neon-tokyo-chat-plan`, with approval. They are currently
  untracked on `main`.
- Implement on `feat/neon-tokyo-chat`. When creating a manual worktree, put it under
  `.worktrees/` and **[R2]** add `.worktrees/` to `.gitignore`; it is not there today.
- No push, fork, PR or merge is part of this plan.
- On completion: update the README/setup and the data/backup docs, and write
  `docs/change_details/<date>-neon-tokyo-chat.md`. Replace the planned items only when all
  milestones are complete or the scope is explicitly revised.

## Human calls (resolved)

Approved 2026-10-03: append edited/imported instructions, keep browser dictation with the Google notice, keep automatic extras with Settings controls using Sonnet 5.5 medium.

1. **Edited chat instructions:** an explicitly edited or imported chat system message is
   **appended** as the final layer (proposed) or **replaces** the personal and project layers.
   This blocks the final instruction-builder semantics and tests (M1/M2).
2. **Dictation until a voice model is chosen:** keep Chrome's Web Speech, which sends audio to
   Google (proposed: keep it, with a one-line notice in Settings), or leave the microphone
   unconfigured. This only blocks active dictation behavior.
3. **AI extras (resolved):** User chose to keep automatic extras with Settings controls, using Sonnet 5.5 medium. Original alternatives: keep auto-title plus the explicit code fixup and image helpers, and remove
   automatic follow-ups, diagram/HTML UI suggestions and attachment prompt suggestions
   (proposed), or keep those extras. This blocks the final pruning of those entry points.

Image and voice model selection and the richer Tokyo styling are later work. They do not block
these milestones.

## Storage/question correction checkpoint, 2026-10-03

H1-H9 corrections are implemented locally, pending fresh simplify and independent review. Hydration and durable writes detach snapshots; browser versions below 4 normalize text messages before asset scanning; canonical AIX model IDs recover model selection. Answer transactions share conversation-wide saving/continuing state across Composer and card; response keys include invocation ID and question ID. Save acknowledgment covers the submitted snapshot, and failure removes only owned response fragments.

Durable manifests contain live chat/project and historical project-file references. Draft/incognito assets remain cache-only until referenced by a durable record. Server validation checks message/fragment/project/file/question structures and referenced manifests; load verifies bytes. Restore stages and validates records/assets, preserves readable or corrupt primary data, checks readable revisions and uses an explicit corrupt recovery state. Disk collection runs after commit with a 24-hour upload grace period and preserves last-good/recovery ownership. Unreadable recovery copies stop collection. Legacy/chat assets have no universal 10 MB cap; project/download limits remain. Archives retain the explicit 250 MB limit.

Offline regression evidence covers H1-H9, including real-store deferred answer saving and concurrent mutation. Production build and fresh review evidence are recorded in `.ship/storage-question-fixes.md`. M3/M4 acceptance remains open for clean-profile/server-restart/browser/live question coverage, multi-process serialization, asset streaming/resource bounds, deep optional provider metadata and remaining question dispatcher/import/attention/navigation gaps. Native search and slash skills are subsequent implementation batches.


## Native search and slash skills checkpoint, 2026-10-03

User steering authorizes native Claude tools on the existing Bifrost Messages endpoint with server-owned honest `AI-GUI/0.1 (claude-code-compatible)` identity. Basic search `web_search_20250305` and fetch `web_fetch_20250910` are supported; remote code execution is explicitly unsupported by this deployment. Future providers share UI concepts and selected skill instructions while retaining their own deployment capability, wire transport and opaque history policy. No OpenAI transport implementation is included.

H10/H11 corrections normalize the known legacy document `type` to `vdt` rename on detached records and rotate a persisted revision epoch on recovery/restore. Epoch plus numeric revision rejects all previously issued save tokens, including corrupt first-save workspaces without last-good metadata. Existing primary bytes remain preserved and staged validation failures do not replace data.

Native content is stored as ordered message-scoped Anthropic segments, retaining complete encrypted results, citations and unknown nested JSON. Parser snapshots replace repeated upstream IDs; pause responses append. Existing AIX/reassembler/disk paths carry the data. Replay matches provider, deployment and model, checks unchanged visible projection, and sends native assistant blocks once plus newly appended client answers. Cross-model/deployment signed history is withheld. Continuations stop after five follow-ups with completed content retained.

Slash autocomplete catalogs existing `~/.claude/skills` and `~/.codex/skills` read-only. Selection snapshots instructions, source and revision on the submitted user turn. Explicit package references can be loaded through confined server IDs; no source edits, shell, MCP, connector or delegation grants occur. Branch/retry/history use the saved snapshot.

Fixture checks and source implementation are a bounded checkpoint, not milestone acceptance. Parent-owned production build and actual app-route/browser search/fetch/follow-up/reload, selected-skill UI and remaining wider question/backup/recovery/navigation acceptance are required. Fresh simplify and independent Claude review remain required before declaring this batch reviewed. See `.ship/native-search-implementation.md` for exact SHA/checks/gaps.

## Sector 7 local coding-workspace amendment

User decision 2026-10-03 supersedes snapshot upload context: projects connect local folders instead of adding files or bulk importing folder contents. Models receive on-demand tools to inspect current project files. The user explicitly authorizes editing, creation, rename and recoverable deletion inside connected repositories, plus local shell execution and CLI tools, tests and Git. This runs on the Mac through Sector 7; Bifrost transports model requests and does not provide filesystem access. A working directory is not a sandbox; local commands have the app process permissions.

Implement persistent local folder registrations, scoped live file operations, bounded local command jobs with cancellation/output, invocation receipts to avoid duplicate mutations, and native-history-compatible tool settlement before continuation. Preserve historical attachments and backups, but remove project Add files and folder snapshot upload controls. Validate actual model list/read/edit/CLI flows, both-model replay, pending questions, abort, revision conflicts and restart. Publish a complete private sector-7 source preview tagged v0.1.0 with no PR, after this amended scope is implemented. Existing acceptance gaps remain separately recorded.

## Explicitly deferred follow-ups

User2026-10-03: keep OpenAI adapter/shared tools, dedicated image/voice connections, and further daily-use visual refinement for later. See `sector-7-later.md`. They are not part of current implementation or v0.1.0 acceptance.

## Required 0.1 frontend review

User2026-10-03 adds a dedicated frontend polishing review before upload, separate from later daily-use visual iteration. Apply frontend-design and the Sector 7 brand board. Obtain an independent deep Claude critique of the full frontend and UI/UX, then implement concrete improvements, simplify, review/fix and inspect actual desktop/narrow renders. Specific observed issues: no gap between toolbar and first user message; user messages look poor; duplicated/awkward Workspace and Sector7 identity; project border decoration, heavy controls and center alignment; search/new chat/empty state hierarchy. Also inspect composer, menus, settings, tool output, focus and reduced-motion. Existing runtime/model integration must remain intact.

Layout refinement2026-10-03: use supplied ChatGPT/Codex screenshot as current layout reference: compact functional left rail, dense folder/project/chat sidebar, spacious centered conversation column with left-aligned assistant prose, and floating composer sharing that column. Apply Sector7 palette/type/neon interactions. Do not copy native window controls or invent dummy navigation; reuse Optima layout and real actions. User-message styling retains preceding requested content-width bubble refinement.
