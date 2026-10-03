# Personal Claude workspace: implementation plan

Status: Planned
Approval: Pending user approval; three product details pending below
Date: 2026-10-03
Repository: /Users/adriaan.van.erps/Code/AI GUI
Analyzed base: 80d366a88cc8aa885a2d62ca9c60100eb72af40e, big-AGI Open 2.1.1
Review: [supplied review](neon-tokyo-chat-review.md)
Review analysis: [verified findings](../../analysis/neon-tokyo-chat-review-analysis.md)
Background: [original analysis](../../analysis/big-agi-remodel.md)

## Outcome

Remodel this big-AGI clone in place into Adriaan's local browser chat app. Keep its framework,
AIX adapters, message engine, attachment converters and renderers. Deliver a ChatGPT/Codex-style
sidebar and conversation area, Claude through Bifrost, projects with automatic instructions/files,
automatic disk saving, useful activity states and a compact navigator for long chats.

The work is delivered in five milestones. A milestone being usable does not mean the whole plan
is complete. Disk persistence, projects, attention and hosted tools remain required outcomes;
they are sequenced, not deferred out of scope. No application implementation has started.

## Settled product decisions

- Local browser app on the Mac, one user, no sign-in, SSO, accounts or cloud synchronization.
- Exactly `claude-opus-5-5` and `claude-sonnet-5-5` for chat through Bifrost.
- New chats default to Opus 5.5. Both models default to medium effort. Per-chat effort slider.
- Projects group chats and share instructions and files, included automatically in future requests.
- Automatic disk saving of chats, projects and files. Claude API requests do not create Claude
  Code logs; this application supplies its own durable storage.
- Keep image generation, attachments, search, Markdown/code, editing, retry, branching, archive
  and local backup. Image model/connection is selected later.
- Keep microphone input and transcription infrastructure. Voice model/connection is selected
  later. Remove voice calls, spoken replies and automatic voice-turn conversations.
- Include Claude hosted web search, fetching and code execution. Code runs in a remote sandbox,
  not in Adriaan's terminal or Claude Code session. Bifrost capability verification is required.
- Working indicates an active query. Waiting means finished but unread or a question requiring
  the user's answer, not a prompt queue. Claude must explicitly signal decision questions.
- Long chats get a slim tick navigator like the supplied Codex screenshot.
- Start with dark midnight/indigo, pink/cyan neon and restrained gradients. Refine the stronger
  Tokyo visual identity after a first usable version.

## Reuse and new work

| Reuse existing infrastructure | Add or change behavior |
| --- | --- |
| Next.js 15, React 18, Joy UI, Emotion, Zustand, tRPC | Remodel shell, sidebar, composer and theme |
| Anthropic request adapter/parser, AIX/reassembly | Bifrost personal preset, access policy and static two-model list |
| Existing parameter types/overrides | Per-chat model/effort fields and slider |
| Existing generation/stop/edit/retry/branch handlers | Neutral instructions and request-time project context |
| Folder store IDs, membership/actions | Versioned single-project membership, expandable tree, project view |
| Attachment extraction, image conversion and Dexie assets | Shared file lifecycle, originals/provenance, isolated project asset scope |
| Zustand persist/migrations and existing batching pattern | Disk storage adapter, startup gate, raw asset service and consistent recovery |
| Tool invocation/result wire types and renderers | Bounded ask-user dispatcher, answer UI and continuation lifecycle |
| AbortController/pending message lifecycle | Unified operation phases, unread and needs-answer metadata |
| ScrollToBottom and message list | Stable turn anchors, tick navigator and active-turn observer |
| T2I and ASRx modules | Retained unconfigured controls, with their connections chosen later |

Do not replace these engines, introduce a generic agent framework, or migrate the stack to Deno.

## Scope boundaries

Remove personas and preset-driven generation, Call/TTS/read-aloud, Beam/multicast/comparison,
split conversations, legacy ReAct, standalone text comparison/tokenizer tools, news/promotions,
public sharing and Google Drive picker. Remove their routes, commands, shortcuts and settings as
well as buttons. Keep local backup separate from public sharing.

Keep `generate-content` and `generate-image` execute modes. Retain `append-user` internally if a
remaining handler needs it; it should not add an expert mode selector to the main composer.
Remove `beam-content` and `react-content` entry points. Beam's deeply shared controller/store can
remain unused initially if deleting it would require broad unrelated changes. Delete feature-only
code/dependencies only once remaining callers make that mechanical. Leave unrelated Prisma/build
cleanup alone. Preserve licenses and third-party notices.

Keep provider adapters available for later expansion. Do not expose OpenAI chat models, a broad
provider wizard or browser API-key fields. Image/transcription configuration stays distinct from
chat model selection. When a later connection is chosen, its credentials must remain server-side.
No local shell tools, MCP registry, cloud service, native Mac wrapper, vector retrieval or automatic
memory across chats. Browser reload/close does not preserve live inference jobs.

## Cross-cutting decisions

### Shared modules and upstream updates

Accept a custom fork of chat/layout. Keep diffs in `src/modules/aix/**` and `src/modules/llms/**`
small, with focused pure helpers and narrow call-site changes. Pull future provider/model fixes
selectively after reviewing them; do not promise conflict-free upstream merges. Avoid a broad
feature-flag framework. Preserve upstream Git history/remotes; no push or GitHub fork is part of
this plan. Use `feat/neon-tokyo-chat` for implementation and repository `.worktrees/` when manually
creating a checkout; ignore that directory. Copy uncommitted planning docs into the checkout before
work so an upstream-only worktree does not lose the plan. Preserve other user work.

### Request settings and instructions

Add serializable per-chat configuration: selected model ID, effort and retained tool settings.
Initial/import defaults are Opus/medium unless a valid requested model can be recovered. Pin retained
utility domains (`fastUtil`, `codeApply`, `imageCaption`) to Sonnet/medium; never use a cheapest-model
heuristic outside the two-model list. Snapshot settings at Send and pass them via existing
`llmUserParametersReplacement`/`llmOptionsOverride`. Global model options must not leak into a
running chat. Effort changes apply to the next request.

Personal-edition thinking is adaptive for both models. Hide the Sonnet Thinking switch and Opus
`fast_2x` preview option. Use the curated five effort values: low, medium, high, xhigh, max, with
slider labels and keyboard support. Validate requests against model rules server-side as well.
On outbound cross-model requests, remove incompatible signed/redacted reasoning from the request
copy, preserving stored transcript. Same-model unresolved tool turns retain their reasoning.

Compute neutral + personal + project instructions at request time. Keep useful current-date/model
context from prompt mixing. Do not store a generated system prompt in history on every send.
Retain an explicit user-edited/imported chat instruction; its append/replace rule is the pending
product call below. Do not erase historical content or let persona refresh run again on retry.

Put project files in a leading synthetic user context block, with source delimiters. They are
content, not system instructions. Compose a stable deterministic prefix and mark an existing
Anthropic cache breakpoint at its end. Context edits change that prefix/cache identity and may
invalidate preserved thinking; use the existing adaptive `drop_block` path. Do not promise cache
hits: retain actual usage metrics and verify Bifrost forwarding.

### Local data and access

Use the Mac host launcher and the existing Keychain lookup convention for Bifrost. Map
`BIFROST_API_KEY` or Keychain output to `ANTHROPIC_API_KEY`, and the Bifrost `/anthropic` base to
`ANTHROPIC_API_HOST`. Do not print or persist the key. Keychain is unavailable inside Docker;
document explicit environment injection if container execution is used later. Never mount or
write a credential file as ordinary workspace data.

Default durable data directory: `~/Library/Application Support/AI GUI`, configurable with
`AI_GUI_DATA_DIR`. The local service owns this path; clients cannot choose file-system paths.
Data and backups contain no provider credentials, session tokens or transient recording.

## Milestones and dependencies

| Milestone | Deliverable | Dependencies |
| --- | --- | --- |
| M1 | Local Claude shell, access boundary and per-chat controls | None |
| M2 | Projects with shared instructions and files | M1 |
| M3 | Disk persistence, startup recovery and backup | M1; integrate M2 fields before completing |
| M4 | Attention states, explicit questions and turn navigator | M1; final persistence integration needs M3 |
| M5 | Hosted-tool validation, sandbox and artifact handling | Begin gateway evidence after M1; complete with M2/M4 |

Do not postpone all provider evidence until the end. Probe exact hosted tools after M1 so a
workspace restriction is known while other milestones proceed. No OS notifications or sound
alerts are required.

### M1: Local Claude shell

Implement in this order:

1. Add a local launcher/documented scripts binding `next dev` and `next start` with
   `-H 127.0.0.1`. Respect the repository rule that the user starts/stops development servers.
   Preserve existing webpack hooks and build identity requirements.
2. Add active Next middleware for every `/api/**` route, including edge/cloud and future assets.
   Parse Host strictly; allow only localhost or 127.0.0.1 with the configured local port. Reject
   conflicting forwarded hosts and foreign/malformed/`null` Origins. When Origin is present it
   must match the request's allowed origin. Reject cross-site fetch metadata and non-JSON
   requests to JSON mutations; do not enable permissive CORS. No-Origin same-origin GETs and
   command-line smoke checks can work; test foreign HTML form/fetch and DNS-rebinding cases.
   Binary/backup mutations must carry an explicit application header checked by their routes.
3. Centralize personal-mode Anthropic access: reject nonempty client key, client host or CSF
   overrides and use only the server preset. Apply at `anthropicAccess`, covering generation,
   model/skill/file procedures. Reject disallowed dialect/model generation before dispatch.
   Disable unsupported retained credential-backed routes in personal mode; no other vendor env
   keys may be reachable just because a hidden route remains. The OpenAI access path already
   avoids server-key fallback when a client host is supplied; preserve that behavior and apply
   the server-only preset rule when image generation is configured later.
4. Return a static two-model list from existing hardcoded definitions through the usual listing
   interface in personal mode. Skip upstream `/v1/models`; do not reimplement metadata conversion.
   No boot refresh may introduce extra models. Use first real request or explicit bounded Check
   connection for live availability. Show unavailable credentials/model clearly, no fallback.
5. Add versioned per-chat settings and utility-domain defaults. Use request-local override paths,
   adaptive thinking and cross-model reasoning filter. Add an accessible discrete effort control.
6. Replace persona instruction construction/guard with the neutral instruction builder, keeping
   explicit historical instructions. Replace empty-chat PersonaSelector with a simple greeting
   and composer. Remove persona identifiers from visible navigation/avatars/settings.
7. Remodel existing Optima as Sidebar | Conversation. Fold required rail controls into ChatDrawer;
   move retained right-panel actions into contextual menus. Limit to one pane and disable split
   openers/shortcuts. Center existing message list/composer at roughly 760-820px on desktop; use
   quieter user bubbles, open assistant text and a floating composer with attach/mic/send-stop.
   Preserve copy/edit/retry/branch/archive, attachments, code/math and local export.
8. Apply dark-first theme and force dark mode for this edition. Retain Inter/JetBrains Mono.
   Palette: #141421, #1c1b30, #efeaf7, #f47bb8, #79dce8, #a891ee. Use one gentle shell gradient,
   selection/focus neon and quiet reading surfaces. Scan retained dialogs/code/tool/attachment
   surfaces for hardcoded light colors; do not sweep unrelated hidden apps.
9. Remove decided product entry points. Keep image mode/settings visible with an unconfigured
   state. Remove Call/TTS while retaining dictation/ASRx. Disable automatic news redirects and
   unnecessary boot/maintenance calls. No analytics connection is configured for this local app.

Affected existing files: `package.json`, `src/server/env.server.ts`,
`src/modules/llms/server/anthropic/{anthropic.access.ts,anthropic.models.ts}`,
`src/modules/llms/server/listModels.dispatch.ts`, `src/modules/aix/server/api/aix.router.ts`,
`src/modules/aix/server/dispatch/chatGenerate/chatGenerate.dispatch.ts`,
`src/modules/aix/client/{aix.client.ts,aix.client.chatGenerateRequest.ts}`,
`src/common/stores/chat/{chat.conversation.ts,store-chats.ts,chats.converters.ts}`,
`src/common/stores/llms/`, `src/common/chat-overlay/ConversationHandler.ts`,
`src/apps/chat/editors/{_handleExecute.ts,chat-persona.ts}`, `src/common/app.{nav,config,theme}.ts`,
`src/common/providers/{ProviderTheming,ProviderBootstrapLogic}.tsx`,
`src/common/layout/optima/{OptimaLayout,PageWrapper,PageCore}.tsx`,
`src/apps/chat/AppChat.tsx`, drawer/toolbar/composer/message components, settings and removed pages.
New focused helpers: local access policy, personal model preset, instruction builder and effort UI.

M1 acceptance:

- Opens directly in a dark chat workspace, no login/personas/Call/Beam/expert rail/panel.
- Both curated models stream through Bifrost; medium and all five slider stops serialize correctly.
- Two chats remember different model/effort; switching selection does not alter an in-flight request.
- Changing model preserves transcript and excludes incompatible reasoning from the next wire request.
- Credential destination cannot be changed through chat, file or listing calls. Foreign local API
  requests are rejected. No secret appears in browser storage, bootstrap payload or export.
- Image feature is retained and honestly unconfigured; typed input works without voice setup.
- Existing editing/retry/branch/archive/search/attachment/rendering remain functional.

### M2: Projects

1. Extend `DFolder` in place with versioned instructions/file records and explicit single-membership
   actions. First folder in legacy display order owns a multiply-grouped chat; remove duplicate
   memberships and report a migration summary, never delete the chat. Enable projects by default.
2. Add expandable nested chat rows and project view using the existing drawer/folder actions.
   Show project name, instructions, files and its chats. Move/unfile changes future requests only.
3. Reuse the attachment pipeline for supported local text/Markdown/JSON/CSV/code/PDF/DOCX/images.
   Persist original bytes separately from processed context. DBlob currently supports images/audio
   only: add the minimal project-file record/type instead of pretending arbitrary files already
   fit it. Add scope `app-projects`; chat-scope GC must never delete project-only assets.
4. File records contain stable ID, content version/hash, MIME/name/size, extraction status/warnings,
   processed fragments and cached token estimates keyed by model/method/version. Initial limits:
   20 files per project, 10 MB per original, with stricter converter limits honored. Show extraction
   failures and scanned-PDF limits; do not claim native Anthropic PDF upload/page citations.
5. Build project prefix at request time; do not append duplicate hidden messages to stored history.
   Record project/instruction revision and file IDs/versions in assistant request metadata, updating
   its duplication/serialization helpers. Preserve exactly the content versions already sent.
6. Before Send, estimate full input including prefix/history/new attachments/tools/reasoning and
   reserve selected output plus a safety margin (10% of context). Existing Claude token previews
   use fallback tokenizer/heuristics; label them estimates, include a method field, and keep an
   actionable server context-limit error. Stop locally on known over-budget input; do not truncate,
   auto-summary or add RAG silently. Recount changed history while reusing cached file estimates.
7. Cache the stable project prefix via existing cache-control machinery; retain actual cache/usage
   reporting. File/instruction edits invalidate context identity for the next request.
8. Removing a file stops future inclusion. Deleting a project unfiles chats. Originals/context
   referenced by retained requests remain recoverable until no project/chat/provenance refers to
   them. Project-specific GC handles this separately from existing chat GC.

Affected files: folder store, drawer/folders and project components, neutral/request context builder,
attachment pipeline adapters, `dblobs.types.ts`/asset portability, chat request metadata and converters.

M2 acceptance:

- Create/rename/reorder project, edit instructions, add/remove supported files and create/move chats.
- Every project chat automatically uses current shared context; plain chats use no project content.
- Changing instructions/files affects the next request and leaves old replies/source versions intact.
- Original/extracted file state survives normal reload in this milestone's current storage; M3 supplies
  clean-browser/server restart durability. GC cannot erase project-only or historical assets.
- Conversion and context errors identify the source; no missing content is silently ignored.
- Legacy multi-folder migration is deterministic and content-preserving.

### M3: Disk as durable storage

Use the review's storage-adapter design, not IndexedDB plus a synchronization mirror.

1. Add a local Node persistence service and `PersistStorage` implementation matching Zustand's
   storage interface. Switch chats, projects and an explicit allowlist of personal/UI settings
   to it. Keep existing partialization/migration concepts; exclude functions, controllers,
   incognito content, provider stores/secrets and transient recording explicitly.
2. Use a versioned `workspace.json` with known store keys and their `{version,state}` values,
   workspace revision and asset manifest. Save named stores through a shared batching coordinator
   so each update preserves other stores. Follow the existing 321 ms merge/1234 ms deadline
   pattern; serialize writes, flush terminal replies/edits and register `addFlusher` for handover.
   Whole-chat-array updates are adequate initially; no per-conversation database redesign.
3. Server mutations validate schemas, expected revision and safe store/asset IDs. Use configured
   paths, a serialized commit and atomic temp-write/rename. Keep last-known-good data and its
   assets. Reject stale profile writes and surface recovery/reload; retain same-origin single-tab
   leader/handover. A write is confirmed only after the durable commit, with visible error/retry.
4. Add raw binary asset routes under `app/api/local/assets/[id]/route.ts` with `runtime='nodejs'`.
   Metadata uses validated IDs/version references; filenames cannot contain traversal and are
   never paths from the client. Write-through asset put/update/delete through existing portability
   helpers; convert existing base64 at the boundary, not through large tRPC JSON strings. Keep
   Dexie as a disposable read cache. Preserve IDs and explicitly revive Date fields.
5. Assets commit before a manifest references them. Unreferenced deletion runs only after a
   consistent commit and must protect current, last-known-good and retained historical references.
   Cache-only drafts remain transient; bytes enter durable storage when a project/chat retains them.
6. Add a new startup gate under ProviderSingleTab, ahead of bootstrap/inference/GC. Use
   `skipHydration` plus explicit rehydrate where necessary; wait for successful hydration, not
   merely an attempted load. Read manifest/asset metadata before enabling stores/GC. Make chat
   merge idempotent so repeated recovery cannot duplicate conversations. State transitions are
   Loading -> Ready or Recovery required; failed loading cannot save a blank default workspace.
7. On first run only, read legacy IndexedDB/localStorage and referenced Dexie assets, validate,
   commit together and mark migration complete. Leave originals intact until success. When disk
   exists it wins; old browser state must never auto-import again. Missing data, corrupt data and
   transport failure are distinct. Do not apply defaults over unreadable disk data.
8. Provide consistent directory backup/download and restore: flush/pause writes/GC, snapshot the
   manifest plus referenced bytes and verify the copy. Restore into staging, validate versions,
   asset IDs and references, preserve a recovery copy, then atomically activate and rehydrate.
   No `localStorage.clear()` or active-directory erase before validation. A zipped directory may
   use an existing runtime capability or a narrow dependency if needed; keep this out of AI tools.
9. Keep per-chat Markdown/JSON export and legacy big-AGI import, but never use current
   DataAtRestV1/Flash Backup unchanged for durable snapshots: they omit data/include credentials
   or tolerate errors. Preserve archive/project/attention fields, empty projects and asset bytes.
10. Surface last confirmed save/recovery errors/data location in Settings. Browser close can lose
    latest unacknowledged bytes; recovered partial replies are Interrupted, never Running. No
    automatic inference replay. Restart/clean profile restores the last confirmed durable state.

Affected files: new `src/modules/local-workspace/{storage.client,storage.server,storage.types}.ts`
(or equivalent focused modules), new startup provider and local asset/backup Node routes,
`src/server/trpc/trpc.router-cloud.ts`, `pages/_app.tsx`, persist store options and merge/rehydration,
`src/common/util/idbUtils.ts` batching pattern, `src/modules/dblobs/`, portability/GC,
`src/common/providers/single-tab/instanceLock.ts`, `src/modules/trade/`, Settings and setup docs.

M3 acceptance:

- Project/chat/file/image/archive/attention data restore after server restart and in a clean profile.
- Empty startup, network errors or corrupt primary data never overwrite a valid workspace.
- Asset-first restore, Date revival and GC protection work without dangling references.
- Stale revisions/save failures are visible; last saved state is accurate.
- Portable backup/restore includes empty projects and binary assets without keys or session data.
- Existing browser migration occurs once and retains data if the first disk write fails.

### M4: Attention and long-chat navigation

1. Add transient operation phase/ID to the per-chat overlay. Set known Connecting/Thinking/
   Searching/Running code/Responding phases from existing generation/reassembly callbacks.
   Track image generation separately; its handler lacks abort support. Do not expose an image
   Stop action that claims cancellation without an actual underlying abort path.
2. Persist completion/read revision or latest-completed/seen message IDs and unresolved question
   records. Derive precedence: Working > Needs your answer > Failed/Interrupted > Unread > idle.
   Keep metadata independent; viewing a question does not answer it. Failure attention clears on
   view/acknowledgment, but the transcript retains the error. Aggregate project counts.
3. Mark a completed reply seen only when its end is in view and the document is focused/visible;
   selecting a chat while scrolled above it is insufficient. Add Mark read. Retry/edit/branch and
   imports normalize attention without duplicating or prematurely clearing it.
4. Declare one optional `ask_user_question` function via existing AIX tools. Bound to at most three
   validated questions per call, stable IDs, optional suggested choices and free text. Neutral
   instructions say to use it for a user decision needed to proceed. Use auto tool choice; these
   models reject forced choices. No punctuation heuristic/classifier and no guarantee every semantic
   question triggers the tool. Ordinary completion is valid.
5. New bounded dispatcher accepts complete validated calls, stores invocation/message/model IDs and
   pending state, then ends current Working. Handle multiple invocations without losing IDs; unknown
   tools get an explicit failure/cancelled result, not fabricated execution. Preserve invoking
   same-model thinking until resolution; skip ordinary reasoning cleanup for unresolved tool turns.
6. The answer card and next Composer Send both answer pending questions. Store a JSON object result
   in a `tool_response` fragment on the assistant message holding its `tool_use`. The existing
   request builder includes assistant-side results and Anthropic yields them as user `tool_result`;
   user-message results are currently skipped. Test this final wire sequence explicitly.
   Persist/validate the answer before continuing; append a new assistant reply using the existing
   generation function. Prevent duplicate answer/resume clicks. If saving fails, show retry and
   do not erase the pending question. Reload after saving an answer does not auto-start inference;
   offer Continue to the user instead.
7. Dismiss writes a matching cancelled/error result and closes the pending UI without automatically
   generating; future Send is valid. Block model changes while a question is unresolved. Branch/
   retry/edit of a pending interaction requires cancellation first, preserving paired history.
   Same-model answer continuation reuses that request's context/settings rather than silently
   modifying the signed prefix. Apply later project edits on the next ordinary user turn.
8. Add `data-message-id` anchors to current message rows and a navigator beside the conversation.
   Each visible tick represents a user turn; hover/focus shows a prompt excerpt. Clicking or keyboard
   activation jumps there; IntersectionObserver follows the current turn. Use stable IDs and refresh
   after edit/delete/branch/import. Clear `setStickToBottom(false)` before jumps; retain Jump to latest.
   When density exceeds available height, bucket ticks but expose exact turns in the preview/list.
   On touch, a compact tap-to-open turn list replaces hover. No message virtualization is required.

Affected files: generation/image handlers, per-chat overlays, chat metadata/converters, drawer item/data,
new ask-user UI/helper, `aix.client.ts` options/caller, request builder/fragments/Anthropic adapter,
`ChatMessageList.tsx`, `message/ChatMessage.tsx`, `src/common/scroll-to-bottom/`.

M4 acceptance:

- Multiple chats show true active phase while navigating; normal/image completion/error/stop clear it.
- Background completion stays Unread until the reply is actually viewed or marked read.
- Explicit questions persist after reading/reload and clear only with a paired answer/dismissal.
- Both models accept a question/answer round-trip and ordinary next message without orphan tool calls.
- Navigator jumps top/middle/latest in a long history without being pulled down during streaming.
- Keyboard/touch controls have usable targets and do not cover message text.

### M5: Hosted tools and generated files

1. After M1, make bounded live calls through the exact app Anthropic Messages route for both models.
   Record results without credentials. Plain chat first, then native search/fetch/code separately,
   then a custom question tool alongside hosted tools. No direct Anthropic fallback.
2. Verify actual app versions: `web_search_20260318` and `web_fetch_20260318` for dynamic mode;
   `web_search_20250305` / `web_fetch_20250910` for the existing non-dynamic option;
   `code_execution_20260120`. Verify beta headers selected by current code, including
   `code-execution-2025-08-25`, `files-api-2025-04-14` and
   `thinking-binding-controls-2026-08-01` where applicable. Also verify cache controls/usage.
   Do not enable unrelated Skills/tool-search/fast-mode features merely because metadata has them.
3. Reuse existing native tool toggles/parsers/results/citations in compact UI. Leave tool toggles off
   until requested/enabled. Unsupported configuration is an actionable gateway error, not a fake
   empty response or another provider request. Initial connection check uses no hosted tools.
4. Add explicit container reuse/reset policy to the existing resolver. Unset `antContainerId` is
   not a reset: it currently triggers a history scan. Reuse only for linear head continuation in
   the same chat/session chain, including its answer-tool continuation. Branch, edit-regenerate,
   retry and incompatible model change suppress discovery and start fresh. Historical handles/
   artifact links stay in the transcript; do not claim fresh sandbox contains prior files.
5. Validate Files API metadata/content/download through the same server access guard. Retain the
   existing 10 MB download cap and explain it in errors. Save downloaded artifacts through local
   asset storage; show that they are remote-only until downloaded. Expired/unavailable files are
   reported clearly; no claim that every remote artifact is automatically durable on the Mac.
6. Verify stop/error and `pause_turn` continuation. No browser-disconnect reattach promise for
   Anthropic. Record unsupported exact routes/versions and the blocked acceptance criterion.

Affected files: Anthropic adapter/access/router, existing container resolver and its callers,
retained parameter controls, hosted-file components and local asset integration.

M5 acceptance:

- Live evidence for each enabled capability, both chosen models and mixed question/hosted tools.
- Citation/tool results are rendered and saved; supported downloaded artifacts restore locally.
- Sandbox branches/retries cannot accidentally rejoin a later mutated container.
- Gateway restrictions and capped/expired downloads are actionable without false success.

## Verification and completion

Read repository instructions before setup. Follow its npm/Node and webpack workflow. The repository
currently specifies Node 26 in `.nvmrc`. Installation and tests are implementation work, not planning.
Run `npm run tscheck`, `npm run lint` and `npm test` after each milestone's relevant changes; repeat
only for new changes/failures. `tscheck` invokes `npm install` via `pretscheck`. Production build is
required after shell/route/runtime edits because aliases and client-server replacements may fail
only when bundled. No pre-commit configuration was found; check again before any authorized commit.

Add focused Node `node:test`/tsx tests beside pure helpers, following existing test discovery. No
IndexedDB shim exists; do not create one just to mirror UI plumbing. Meaningful cases include:

- Central Anthropic access guard for generation/list/files, model/dialect allowlist, API Host/Origin
  matrix, static catalog without network listing, correct per-chat wire overrides/reasoning filter.
- Instruction layering, folder migration, source/version inheritance, context limits and GC ownership.
- Disk envelope date/schema encoding, atomic temp-directory writes/recovery, stale revision, corruption,
  asset ordering, one-time migration and consistent backup/restore without credentials/incognito data.
- Attention reducer/visibility boundaries, complete question validation, matching wire tool_result,
  duplicate answer prevention, pending-reasoning retention and sandbox discovery suppression.

Use browser QA against a user-started local server, with desktop/narrow layouts, focus/reduced motion,
long text/code/citations, menus, attachments/search/edit/retry/branch/archive, projects, recording states,
image unconfigured state, scrolling during streaming, two running chats, pending question/reload,
clean-profile disk recovery and a stale writer. Run actual Bifrost smoke checks for enabled tools;
offline tests are not proof of gateway support.

On completion, update local README/setup/data/backup behavior, preserve upstream notices and write
`docs/change_details/<date>-neon-tokyo-chat.md` with actual implemented behavior and verification.
Replace this planned item only when all required milestones are complete or a user explicitly
revises scope. No merge/push/deployment is part of this request.

## Human calls

Three questions were presented during this revision; the rest are settled or routine defaults:

1. Explicit edited chat instructions: proposed append as final layer versus replace computed
   personal/project layers. Blocks final instruction builder semantics/tests in M1/M2.
2. Browser dictation until a model is chosen: existing Web Speech can use cloud transcription
   (Google in Chrome) versus keeping the microphone unconfigured. Blocks active dictation behavior
   only; preserve ASRx/input seam either way.
3. Automatic AI extras: proposed keep auto-title and explicit code/image helpers, remove automatic
   follow-up/diagram/UI/attachment prompt suggestions, versus retaining those extras. Blocks final
   pruning of those entry points/background calls. Proposed retained utility calls use Sonnet/medium.

If not answered, preserve these as pending product choices, not approvals inferred from elapsed time.
Image/speech model selection and richer Tokyo styling are intentionally later work and do not block
these milestones' honest unconfigured states.

## Review status

The supplied completed review was analyzed and its material claims checked against source. The
plan now adopts milestone delivery, static models, the disk persist adapter, explicit new-work
boundaries and the detailed question/sandbox lifecycle. The review analysis records corrections.
No claim is made about that document's author/provider. The earlier independent Claude invocation
failed before producing a critique; its HTTP 400 mentioned `web_search_20260209` and code execution
through `responses_stream`. This is not a live result for the app's exact Messages-route tools.
A new critique of this revised plan has not been performed. User approval is still pending.
