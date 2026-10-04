# Sector 7: implementation plan

Status: In progress
Approval: Implementation authorized 2026-10-03; all three product calls resolved (see Human calls)
Date: 2026-10-03; reconciled 2026-10-04
Repository: /Users/adriaan.van.erps/Code/sector-7, main
Current source: fb8e0be019ac38d414f4a42d59967c42d5d11e35; current follow-up evidence below
Original analyzed base: 80d366a88cc8aa885a2d62ca9c60100eb72af40e, big-AGI Open 2.1.1
Supersedes: [neon-tokyo-chat.md](neon-tokyo-chat.md) (revised plan) as the implementation reference
Inputs: [review](neon-tokyo-chat-review.md), [review analysis](../../analysis/neon-tokyo-chat-review-analysis.md),
[original analysis](../../analysis/big-agi-remodel.md)

This plan incorporates the second-pass review corrections (marked **[R2]**) and later user
decisions in its active sections. Original **[R2]** source references describe the original
analyzed base, not current line numbers. Appended checkpoints preserve implementation history;
these active sections govern where later decisions supersede that history.

## Outcome

Remodel this big-AGI clone into Sector 7, Adriaan's local Mac browser chat and coding app. Keep
the framework, AIX adapters, message engine, attachment converters and renderers. Deliver:

- A ChatGPT/Codex-style sidebar and conversation area.
- Claude through Bifrost.
- Projects with shared instructions and live local folder connections.
- Automatic disk saving.
- Activity and attention states.
- A compact turn navigator for long chats.

Delivery remains in five milestones. A working 0.1.0 source preview and reviewed follow-up
changes exist. Disk persistence, projects, attention, native search/fetch and local coding tools
remain required outcomes. Publishing the preview does not close milestone acceptance. Hosted
code execution is unsupported on this gateway and is not a required enabled capability.

## Settled product decisions

- Local browser app on the Mac, one user. No sign-in, SSO, accounts or cloud sync.
- Chat models: exactly `claude-opus-5-5` and `claude-sonnet-5-5`, through Bifrost.
- New chats default to Opus 5.5. Both models default to medium effort, with a per-chat effort
  slider (low, medium, high, xhigh, max).
- Both models always use adaptive thinking. Hide the Sonnet Thinking switch and Opus `fast_2x`.
- Projects group chats and share instructions. Add folder opens the native Mac folder browser;
  connected folders provide current files through on-demand model tools. New requests do not
  bulk import project snapshots. Historical project files and message attachments remain owned
  and recoverable.
- Chats, projects and files save to disk automatically. Disk is the only durable store.
- Keep image generation, attachments, search, Markdown/code, editing, retry, branching, archive
  and local backup. The image model connection is chosen later.
- Keep microphone input and the ASRx infrastructure; the voice model is chosen later. Remove
  calls, spoken replies and read-aloud.
- Include Claude native web search and fetch through Bifrost. Search defaults on for new chats;
  explicit opt-out is respected. Hosted code execution is unsupported on this deployment.
- Connected projects authorize local file read/search/list, edit/create/move/recoverable delete,
  shell/CLI, tests and Git. Commands use Sector 7's local process permissions; a working
  directory is not a sandbox. Bifrost supplies model transport, not filesystem access.
- Existing local slash skills are filtered to the selected provider's Claude/Codex folder and
  snapshotted on Send. Skill selection itself grants no additional tools or permissions.
- Keep automatic AI extras with Settings controls, using Sonnet 5.5 medium. Background utility
  requests remain tool-free.
- Working means an active query. Waiting means unread, or a question that needs an answer; it is
  not a prompt queue. Claude signals questions explicitly through a tool.
- Use the supplied Sector 7 brand board: deep-night surfaces, Mako green, violet accents, Inter
  and JetBrains Mono. Supplied ChatGPT/Codex rail geometry governs the layout. Further daily-use
  visual refinement is deferred.
- Show the model in the top selector; hide repeated model names in message headers. Hide detailed
  tool calls by default with Settings > Conversation > Show all tool calls to reveal saved
  details. Keep a compact neon live activity line and muted completed tool summaries. This
  display choice must preserve execution, provider history, questions, errors and citations.
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
- MCP, cloud services, a native Mac wrapper, RAG and cross-chat memory.
- Hosted code execution enablement on the current unsupported Bifrost deployment.
- Live jobs that survive a browser reload.

Image and transcription credentials must be server-side when configured later.

## Cross-cutting decisions

### Request settings

- Add a serializable per-chat config: `{ llmId, effort, tools: { webSearch, webFetch, codeSandbox } }`.
  New chats and missing imported preferences default to Opus/medium/search on, fetch and hosted
  code off, unless a valid allowed model can be recovered. Explicit search opt-out persists;
  hosted code remains unavailable. Utility requests explicitly use tool-free settings.
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
- An explicitly edited or imported chat system message is appended as the final instruction
  layer, after neutral, personal and project instructions (resolved 2026-10-03).
- **[R2] Date context must be date-only.** `bareBonesPromptMixer` sets `lowHourPrecision` from
  the `autoVndAntBreakpoints` setting (`pmix.ts:85-95`). A time-of-day in the system prompt
  changes the cached prefix on every request. The builder emits the current date at day
  precision and the model name, and nothing else that varies.
- The neutral base includes one sentence on when to call `ask_user_question`.

### Project context and caching

- Build shared project instructions at request time. Include connected folder IDs/names and
  expose on-demand local tools, rather than a leading block of uploaded project file text.
- Each tool reads the current file or directory when requested. Existing-file edits require a
  fresh content hash; file mutations retain recoverable original bytes. Record project identity,
  instruction revision and tool invocation/results without rewriting past replies.
- Preserve historical processed project records, originals and recorded versions for existing
  message provenance, migration, backup and GC ownership. Do not include them in new requests.
  Message attachments still use the attachment conversion pipeline.
- Local commands have cancellation, bounded runtime/output and durable invocation receipts to
  prevent duplicate mutations after interruption. Reload never automatically reruns a command.
- Keep the final wire within Anthropic's four cache breakpoints. The original uploaded-project
  block rule is historical: current live folder connections add no synthetic file prefix.
  Test actual instruction, selected-skill, attachment and history breakpoint placement.
- Instruction edits change the next request prefix. Never promise cache hits; keep actual usage
  metrics visible in the cost popover.

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
| M2 | Projects with shared instructions and live Mac file/terminal tools | M1 |
| M3 | Disk persistence, startup gate, recovery and backup | M1; absorb M2 fields before closing |
| M4 | Attention states, ask_user, turn navigator | M1; final persistence needs M3 |
| M5 | Native search/fetch, history and generated-file ownership | probe right after M1; complete with M2/M4 |

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
   - Optima becomes Rail | Sidebar | Conversation on desktop, Sidebar | Conversation on mobile.
   - Retain the compact functional rail from the supplied ChatGPT/Codex reference. Settings lives
     in the desktop rail; mobile keeps Settings in the sidebar. No dummy navigation.
   - Move the retained `ChatPane` actions (export, archive, delete, cost) into a conversation menu.
   - One pane only: remove the split openers and shortcuts.
   - Center the list and composer at 760-820px.
   - Content-width user bubbles and open, left-aligned assistant text. Show the model only in the
     top selector. Keep space below the toolbar and consistent conversation/composer alignment.
   - Floating composer with attach, mic and send/stop. Retained toggles go in a compact menu.
8. **Theme.**
   - Force dark (`ProviderTheming`).
   - Use Sector 7 brand-board colors: deep night `#060F14`, Mako `#00FFB3`, violet `#A855F7`,
     quiet slate surfaces and light text, on Inter and JetBrains Mono.
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

- Opens straight into a dark Sector 7 chat with its compact rail. No login, personas, Call, Beam
  or permanent right panel.
- Both models stream through Bifrost. All five effort stops serialize correctly on the wire.
- Two chats keep different model/effort. Changing selection does not affect an in-flight
  request. Stale global parameters never reach the wire.
- A model switch keeps the transcript and drops cross-model signed reasoning from the request.
- The credential destination cannot be changed via chat, list, Skills or file calls. Foreign
  requests to local APIs are rejected. No secret appears in browser storage, bootstrap payloads
  or exports.
- Image mode is honestly unconfigured. Typing works without voice setup.
- Edit, retry, branch, archive, search, attachments and rendering still work.

### M2: Projects and local coding tools

1. **Store and migration.** Extend project metadata with shared instructions, revision and local
   folder registrations. Keep deterministic legacy multi-folder migration: first folder in
   display order owns the chat, other memberships are removed with a summary, and no chat is
   deleted. Retain historical uploaded-file records and assets for provenance and recovery.
2. **Durability.** M3 stores project metadata, connected paths and historical assets on disk.
   Browser storage is a disposable cache. Connected repositories stay on the Mac and require
   their own backups/Git; workspace backups contain app-owned records and assets.
3. **UI.** Expandable project rows contain nested chats. Clicking the closed/open folder icon
   expands/collapses; ellipsis actions appear on hover/focus and remain usable on touch. The
   project editor saves name, instructions and connections together. Cancel creates nothing.
   Add folder opens the native Mac chooser; remove Add files and bulk snapshot controls.
   Saving a new project opens its first chat and expands the project; editing creates no chat.
   Retain new-chat-in-project and move/unfile actions. Project titles show no attention count.
4. **Live file tools.** Register folders persistently and use confined IDs for list/read/search,
   write/edit/move/recoverable delete. Read current UTF-8 files on demand, with named limits and
   actionable failures. Existing-file changes require fresh hashes and preserve original bytes
   and permissions. Keep credentials/Git internals excluded from file tools. Directory operations
   use terminal tools. The current file-tool limit is 256 KiB; it is not a legacy-asset limit.
5. **Local terminal.** Run CLI tools, tests and Git on the Mac with process permissions, not a
   filesystem sandbox. Default timeout is 60 seconds, maximum 300; two jobs and 256 KiB output.
   Cancel the process group on Stop. Persist invocation identities and recoverable mutation
   receipts; restarted jobs are interrupted and never automatically replayed. External file
   changes and abrupt OS-crash descendants remain explicit limits.
6. **Requests and skills.** Include current project instructions and folder IDs/names on Send.
   Select existing slash skills from the chosen provider's local folder; snapshot their source,
   revision and instructions on the user turn. Retry/branch use that snapshot. Referenced skill
   files use explicit confined package IDs. Selection grants no extra permissions.
7. **Context and caching.** Estimate instructions, history, new attachments and tool overhead,
   reserve output plus a 10% safety margin, and label it an estimate. No silent truncation or RAG.
   Name context/file errors and keep final wire cache-breakpoint coverage. Files are fetched only
   when requested, not bulk added to the prefix.
8. **Lifecycle.** Removing a connection stops future access; deleting a project unfiles its chats.
   Preserve all live/historical project assets through migration, cleanup, backup and recovery.
   Settle local and question tool invocations before native continuation without changing opaque
   provider history. Validate abort, revision conflict, restart and duplicate invocation paths.

**M2 acceptance:**

- Create, rename and reorder projects; edit instructions; connect/remove Mac folders; create and
  move chats. Actual chooser selection, cancellation and durable reconnect work.
- Project chats use current shared instructions and on-demand files; plain chats use none.
- Both models complete list/read/hash-checked edit/local CLI and subsequent native continuation.
  Existing replies, historical versions and saved skill snapshots stay intact.
- Projects and connections survive disk reload/restart. Live/historical GC ownership holds;
  backup does not imply backup of connected repositories.
- Stop/reload/restart never silently repeats mutations. Failures name their source and limits.
- Legacy multi-folder/upload migration is deterministic and retains all content.

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
   - Reject stale revisions and pause editing/new requests. Keep the live tab, offer a manual
     recovery copy of unsaved records/originals and an explicit saved-workspace reload after
     active work settles. Retry only temporary failures; never silently overwrite or auto-merge.
   - Confirm saves only after commit. Last saved advances only on acknowledgement.
   - Serialize route bundles and Node processes with the permanent per-directory kernel lock;
     process death releases it. Keep bounded acquisition and actionable busy errors.
4. **Assets.**
   - Add raw binary routes at `app/api/local/assets/[id]/route.ts` with `runtime='nodejs'`.
   - IDs are validated against a fixed charset and never contain a path.
   - Write-through on DBlob put/delete. Dexie becomes a disposable read cache.
   - Revive `Date` fields explicitly.
   - Assets commit before any manifest refers to them. Stream asset downloads and bound actual
     upload bytes; preserve legitimate legacy assets above 10 MiB.
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
   - Bound actual streamed requests and decompression before full allocation. Export/import
     share a 250 MiB archive bound, including ZIP headers; enforce 10,000 entries, checksums,
     actual decoded sizes and unique expected paths. Existing implementation uses `fflate`.
   - Keep the manual unsaved-recovery JSON distinct from normal ZIP restore; do not promise an
     automatic merge or that this copy can be restored through the ZIP control.
8. **Exports.** Keep per-chat Markdown/JSON export and legacy big-AGI import. DataAtRestV1 and
   Flash Backup are not used for durable data. Import never restores model credentials.
9. **Settings.** Show the last confirmed save, errors, the data location and backup/restore. On
   reload, recovered partial replies show as Interrupted. Nothing replays automatically.

**M3 acceptance:**

- Projects, chats, files, images, archive and attention data survive a server restart and a
  clean browser profile.
- Empty startup, network errors or corrupt primary data never overwrite a valid workspace.
- Asset-first restore, Date revival and GC protection hold, with no dangling references.
- Stale revisions pause new work and offer recovery/reload; temporary save failures allow retry.
  "Last saved" advances only after acknowledgement. Competing processes preserve the winning
  revision/asset, and killed owners release locks. Oversized inputs fail before full allocation.
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
   - Keep indicators on individual chats; project title attention counts were removed by user
     request. Hide the purple unread dot for the selected chat while keeping other states visible.
3. **Read detection.** A reply counts as seen only when its end is in view and the document is
   visible and focused. Use a reply-end sentinel within the actual scroll/clipping viewport,
   excluding composer overlap and covering dialogs. Add Mark read. Retry, edit, branch and import
   normalize attention.
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
   - After a reload with a saved answer, offer Continue; never auto-run. Hide Dismiss when every
     answer is saved. Preserve Composer attachments/skills/references for the later message and
     clear answer text only after acknowledged saving if it still matches the submitted answer.
   - Export/import and hydration reconstruct validated invocation/result identities. Reject
     ambiguous imports before interrupting the existing chat; terminal results stay terminal.
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
   - On touch, show a tap-to-open turn list. Keep first/latest inclusion and exact all-turn access
     when buckets group turns. Scope observers/anchors to the conversation, restore menu focus
     before jumping, and rebuild anchors after Cleanup mode.

**M4 acceptance:**

- Several chats show their true phase while you navigate. Text and image completion, error and
  stop all clear it.
- A background completion stays Unread until its reply end is actually visible or marked read.
  Other chats retain purple unread dots; the selected chat suppresses its dot.
- Questions persist across viewing and reload, and clear only through a paired answer or dismiss.
- Both models complete a question/answer round trip and a following ordinary message with no
  orphan tool calls.
- The navigator jumps top/middle/latest without being pulled down while streaming.
- Keyboard and touch targets are usable and do not cover text. Dense history, streaming jumps,
  compact views, Cleanup toggles and stored unread geometry require direct browser evidence.

### M5: Native tools and generated files

1. **Gateway evidence.** Make bounded live calls through the app's Bifrost Messages route for
   both models: ordinary chat, native search/fetch and questions alongside enabled tools. Record
   results without credentials. No direct Anthropic fallback. Recorded both-model search and
   local tool loops establish bounded protocol evidence, not every browser lifecycle path.
2. **Capabilities and versions.** Supported basic native tools are `web_search_20250305` and
   `web_fetch_20250910`. Dynamic 20260318 versions remain unset. Hosted
   `code_execution_20260120` is unsupported on this gateway; record its restriction honestly
   without requiring enabled hosted execution. Any later gateway/container support needs fresh
   live qualification, including its beta headers, cache controls and usage reporting.
3. **Tool UI and history.** Search defaults on; fetch remains off unless selected. Existing local
   slash skills remain available separately from hosted Skills/tool search. Preserve complete
   ordered native content, citations, encrypted/unknown fields and appended client answers.
   Replay only compatible provider/deployment/model history. Hide detailed calls by default;
   Settings > Conversation > Show all tool calls reveals saved inputs/results without rerunning.
   Keep one contextual neon activity line and muted completed summaries, with distinct
   failed/stopped/incomplete labels. Questions, errors, citations and resources remain visible.
4. **Historical container safety.** Retain fresh-versus-linear policy for legacy histories and
   future qualified hosted execution: retry/edit/branch/model change never reuse mutated
   containers; ordinary head turns and question continuation may reuse compatible linear state.
   Existing handles stay in transcripts. No current enabled-container success is claimed.
5. **Original files.** Metadata/content/delete use the M1 access guard. Keep the named 10 MiB
   hosted-download cap, distinct from legitimate larger legacy local assets. Persist original
   bytes with explicit provider/deployment identity and durable ownership before transforming,
   inlining, replacing a remote reference or deleting the upstream original. Keep previews
   separate and protect live/historical/recovery owners through GC and backup/restore.
   Remote-only or expired files get actionable messages. Do not claim this acceptance complete
   merely because unavailable hosted execution limits current exposure.
6. **Lifecycle.** Verify stop, error, bounded `pause_turn` follow-ups, following ordinary messages,
   reload/history and compatible question/local-tool settlement. No reattach or automatic
   replay after disconnect. Record unsupported routes separately from enabled capabilities.

**M5 acceptance:**

- Live evidence for each enabled capability on both models, including questions plus native and
  local tools. Offline fixtures alone do not prove gateway or browser acceptance.
- Citations/native tool history render and persist unchanged. Tool-display settings affect only
  projection. Completed summaries survive restart and retain citations/resources.
- Downloaded original artifacts retain source identity and ownership through inline replacement,
  remote expiry, deletion, disk reload and backup/restore; transformed previews are separate.
- Legacy/future container retry/branch safety remains covered without claiming current hosted
  execution support. Gateway restrictions and capped/expired files produce actionable errors.

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
  - **M2:** instruction layering/date stability; legacy folder/upload migration and historical
    file ownership; Mac chooser; current file/hash edits and recoverable mutations; local command
    cancellation/restart/duplicate receipts; provider-filtered skill snapshots; context estimate
    and final-wire breakpoint cap.
  - **M3:** envelope/Date round trips; atomic disk/last-good recovery; actual child-process locks
    and immutable asset conflicts; classified stale-save recovery; bounded chunked routes, asset
    streaming and ZIP integrity/limits; idempotent merge/migration; backup without secrets or
    incognito data.
  - **M4:** attention/reply-end geometry; question schema and actual dispatcher; invocation/result
    export/import/hydration; duplicate answers, save rollback and Composer drafts; pending-turn
    strip exemption; conversation-scoped navigator buckets/keyboard.
  - **M5:** native history/citation/replay, original artifact source/ownership and transformation;
    tool-display projection and persisted summaries; legacy container fresh-versus-reuse policy.
- **Browser QA** on a user-started server: desktop and narrow layouts, focus and reduced motion,
  long text/code/citations, menus, attachments, search, edit/retry/branch/archive, projects, mic
  states, the image unconfigured state, scrolling while streaming, two running chats, a pending
  question across reload, clean-profile recovery, and a stale second profile.
- **Bifrost smoke checks** for every enabled capability. Offline tests do not prove gateway
  support.

## Repository workflow

- The authoritative checkout is `/Users/adriaan.van.erps/Code/sector-7` on `main`, private
  `AdriaanVE/sector-7`. Original planning/implementation branches and the AI GUI checkout are
  historical context, not the current source or publication destination.
- Current user authorization covers in-scope commits and pushes on main, with no PR required.
  It supersedes obsolete no-push wording in the original plan/repository guidance. Do not move
  the existing `v0.1.0` tag or merge. Stage explicit changed paths and preserve unrelated work.
- When a worktree is needed, place it under `.worktrees/` and ensure it is gitignored.
- Update README/setup, release/data/backup docs and `docs/change_details/<date>-<scope>.md` for
  verified changes. The 0.1.0 source preview is already published; later work is additive on main.
- Keep this plan in progress. Move planned items only after all acceptance is directly verified
  or the user explicitly revises scope. Commit/push/build/review evidence is not broad acceptance.

## Human calls (resolved)

Approved 2026-10-03:

1. Append explicitly edited/imported chat instructions after neutral, personal and project layers.
2. Keep Chrome Web Speech dictation with the Settings notice that audio goes to Google. Dedicated
   voice-model selection remains deferred.
3. Keep automatic AI extras with Settings controls, using Sonnet 5.5 medium and tool-free utility
   requests.

Later decisions add live Mac folder/file/terminal tools, native search defaults, local slash
skills, Sector 7 branding and ChatGPT/Codex rail geometry, compact tool display and main
publication. OpenAI adapters, image/voice model connections and further daily-use visuals remain
in [sector-7-later.md](sector-7-later.md), outside current implementation acceptance.

## Current evidence and remaining acceptance

Current published source is main `fb8e0be`. The [change records](../../change_details/) report
reviewed startup/storage, original-file ownership, live question controls, completed summaries
and reply-end/navigator fixes. The startup milestone passed 171 tests with 22 credential-dependent
skips, root/tooling types, source lint and production build. These are bounded evidence, not full
milestone acceptance. The older `.ship` audit is historical.

Actual restart checks preserved 12 chats, 2 projects and both exact owned asset hashes; live ZIP
backup matched the workspace and asset endpoints. A separate localhost origin recovered records,
but this is not a clean browser profile. Real startup/coordinator/Zustand and filesystem tests
cover migration failures, disk precedence, original preservation, restore and recovery GC.
Clean-profile, actual browser migration/failed-first-write and isolated corrupt-primary recovery
UI remain open.

Opus and Sonnet completed real browser question/answer and following ordinary messages; Opus
also completed native search/question/answer. A Sonnet browser mixed-search turn received missing
native results from upstream; the app rejects this incomplete history without fabricating blocks.
Both models completed native fetch and paired question/answer/ordinary follow-ups through the
actual app route, including production reassembly and client conversion. Successful and failed
fetch summaries, fragments and native content survived real disk/ZIP restore and exact replay.
This strengthens protocol/storage evidence, not full browser tool lifecycle acceptance.

M2/M3/M4/M5 remain open. Required evidence includes clean/stale multiple-profile and migration/UI
backup recovery; question Stop/reload/import and mixed local-tool paths; native chooser selection,
cancellation and durable reconnect; actual React command Stop/reload/restart without duplicate
mutation; dense/streaming/compact/touch/Cleanup navigation and stored unread geometry. Generated
original source identity/ownership is implemented and exact-byte branch/reload/ZIP regressions
pass, but direct browser artifact-action acceptance remains open. Track remaining checks against
current source rather than reopening defects addressed by newer change records.

The following checkpoints preserve the original development sequence. Their old pending-review,
source-path and feature-default wording is historical where these active sections supersede it.

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
