# Big-AGI personal chat remodel: analysis

Date: 2026-10-03
Status: Analysis complete; product interview pending; implementation not authorized
Base: enricoros/big-AGI main, 80d366a88cc8aa885a2d62ca9c60100eb72af40e, Open 2.1.1
Planning branch: feat/neon-tokyo-chat-plan

## Confirmed intent

Remodel the cloned big-AGI application in place. Do not replace its stack or build a new
chat application. Tailor it to Adriaan as the sole user, run locally, and show no sign-in,
Google SSO, accounts or subscription flows. Start with Bifrost and only
claude-opus-5-5 and claude-sonnet-5-5. Keep speech input infrastructure; remove voice calls
and spoken replies. Choose a transcription model later. Remove personas and unnecessary
product features. Use ChatGPT/Codex-style conversation and project navigation. Begin with
midnight, neon and gradient styling; refine the Tokyo visual identity after the first iteration.

The earlier incomplete yoru prototype under claude-opus-docker is superseded. Do not use it
as the implementation base or delete it without an explicit cleanup request.

## Evidence and limits

Read README.md, AGENTS.md, CLAUDE.md, installation/customization docs, CI, and the relevant
source. A read-only architecture subagent independently mapped the Claude, voice and storage
paths. No dependencies were installed, app servers started, inference performed or secrets
read. Gateway capabilities, model availability and microphone behavior remain unverified live.
There are no submodules: the complete AIX code is ordinary tracked source.

The customization guide's persona advice is explicitly for v1.x and cannot be applied directly
to this v2.1.1 checkout. Current source, not old guide filenames, must determine the edits.

## What to reuse

| Area | Existing capability | Remodel boundary |
| --- | --- | --- |
| UI | React 18, Next.js 15, Joy UI, Emotion, responsive Optima shell | Change composition, existing components and theme; retain stack |
| Chat | ConversationHandler, per-chat overlays, stop, retries, editing, branching, titles | Simplify visible actions; preserve generation and persistence |
| Provider layer | AIX request/event protocol, Anthropic and OpenAI adapters | Narrow UI/configuration to Bifrost Claude; retain later provider integration |
| Streaming | Text, reasoning, tool arguments, tool results, annotations, citations, usage/errors | Preserve fragment rendering; simplify presentation |
| Attachments | Images, PDF extraction/OCR, DOCX/text conversion, clipboard/drag-drop | Keep existing local-file pipeline; remove unwanted source selectors |
| Storage | IndexedDB chats, localStorage settings/folders, Dexie binary assets | Extend existing stores/migrations when project semantics are decided |
| Dictation | Browser Web Speech hook in Composer, separate ASRx transcription module | Keep input path and future engine seam; do not rebuild voice |
| Export/import | Existing Trade tooling and stored conversation formats | Keep local backup path if selected; migrate new project fields |

## Claude and Bifrost

The current request path is:

_handleExecute -> runPersonaOnConversationHead -> AIX client -> /api/edge -> dispatch ->
aixToAnthropicMessageCreate -> /v1/messages -> anthropic parser -> ContentReassembler ->
DMessage fragments -> existing stores/UI.

Relevant source:

- src/apps/chat/editors/_handleExecute.ts
- src/apps/chat/editors/chat-persona.ts
- src/common/chat-overlay/ConversationHandler.ts
- src/modules/aix/server/dispatch/chatGenerate/chatGenerate.dispatch.ts
- src/modules/aix/server/dispatch/chatGenerate/adapters/anthropic.messageCreate.ts
- src/modules/aix/server/dispatch/chatGenerate/parsers/anthropic.parser.ts
- src/modules/aix/client/ContentReassembler.ts
- src/modules/llms/server/anthropic/anthropic.access.ts
- src/modules/llms/server/anthropic/anthropic.models.ts
- src/modules/llms/server/listModels.dispatch.ts
- src/modules/llms/models-modal/ModelsWizard.tsx
- src/modules/llms/vendors/anthropic/anthropic.vendor.ts
- src/common/stores/llms/store-llms.ts

Both requested Claude IDs already have curated definitions, including their different thinking
rules. Opus is defined as always adaptive; Sonnet has a thinking switch with effort restrictions.
Use this metadata and the adapter's guards rather than a common hardcoded parameter set. These
are source definitions, not a fresh claim about gateway support. Listing currently fetches models
from the provider and merges metadata. A Bifrost connection needs a deliberate two-model policy
and clear errors if listing or a permitted model is unavailable, not a silent fallback.

The existing Docker launcher uses an Anthropic-compatible Bifrost base ending in /anthropic and
obtains its virtual key from macOS Keychain. big-AGI uses ANTHROPIC_API_HOST and ANTHROPIC_API_KEY;
it appends /v1/messages or /v1/models. Verify host normalization and headers with this gateway.
Keep key material on the local server and out of browser storage, exports and logs.

The provider access function currently combines caller-controlled host/key with server defaults.
For this personal preset, fix the destination server-side and prevent caller overrides from
redirecting the server credential. Local-only launch must bind loopback; upstream compose maps
3000 on all interfaces by default. No login is needed for the chosen local-only product. Check
origin/host handling for credential-bearing local endpoints rather than adding an account layer.

Native Claude web search/fetch, citations, hosted code execution and pause_turn continuation exist.
Bifrost may not forward all features or beta headers. Do not claim support until tested. Native
hosted tools are not a custom local tool executor. Ordinary chat has no generic MCP integration
or arbitrary function execution loop. Anthropic upstream disconnect/background resume is not
supported. Keep interrupted output and existing stop/error recovery; do not promise durable jobs.

Documents are currently flattened to text for Claude; images become native image blocks. PDF
text/image extraction is present, but native Anthropic document upload and page citations are
not equivalent to this path. Do not silently promise those capabilities.

## Personas and removal

Personas are coupled to execution, not just decorative avatars. DConversation.systemPurposeId is
required. _handleExecute refreshes persona instructions; generation depends on the purpose; empty
chats show PersonaSelector; toolbar, drawer, shortcuts and call contacts reference purposes.

Remodel these points to a neutral assistant and the agreed instruction model. A compatibility
identifier may remain internally if it is the smallest safe change, but persona selection,
branding, preset instructions and generation-dependent behavior must disappear from the product.
Preserve explicitly user-edited system instructions and imported chats. Avoid deleting the data
or controller layer wholesale before its remaining callers have been mapped.

Main paths:

- src/data.ts
- src/common/stores/chat/chat.conversation.ts
- src/common/stores/chat/store-chats.ts
- src/common/chat-overlay/ConversationHandler.ts
- src/apps/chat/editors/chat-persona.ts
- src/apps/chat/components/ChatMessageList.tsx
- src/apps/chat/components/persona-selector/
- src/apps/chat/components/layout-bar/usePersonaDropdown.tsx
- src/apps/chat/components/layout-bar/ChatBarChat.tsx
- src/apps/chat/components/layout-drawer/ChatDrawer.tsx
- src/apps/chat/components/layout-drawer/useChatDrawerRenderItems.tsx

Proposed product removals to confirm: Beam/multi-model comparison, split panes, persona studio,
voice Call, TTS/read-aloud, image generation, legacy ReAct search mode, text comparison/tokenizer
apps, news/promotions, sharing links, Google Drive picker and broad model-provider wizard. Remove
routes and entry points, not just sidebar icons. Retain shared infrastructure required by chat,
attachments, future adapters and dictation. Delete code/dependencies only when no retained caller
uses them; preserve license and third-party notices.

## Voice input

Composer uses useSpeechRecognition with WebSpeechApiEngine. Dictation does not require a Claude
speech model. ASRx has separate batch adapters/settings for OpenAI, Gemini and Deepgram, but the
current composer does not call asrxTranscribeBatch. Its presence is a reuse option, not a completed
model-based microphone integration. An older AudioRecorderEngine contains an unfinished path;
do not present that path as working.

Keep the composer microphone and speech-recognition hook. Remove call buttons/intents, call
contacts/routes and read-aloud controls. Preserve ASRx for the later transcription decision.
Defer engine selection and live speech integration checks that require it. Supported browser
Web Speech may remain if agreed; unsupported-browser states must be clear. The intended simple
interaction is record -> transcript in editable draft -> user sends. No automatic voice chat.

## ChatGPT feel: changes to existing components

Current Optima composition is Nav | Drawer | Page | Panel. It creates an expert-tool layout with
a narrow app rail, a chat list, a persistent action panel and dense composer options. Merely
changing colors would retain that interaction model.

Proposed remodel:

1. Fold relevant navigation into the existing chat drawer: app identity, new chat, search,
   projects with expandable chats, ungrouped recent chats, settings at the bottom.
2. Remove the separate multi-app rail. Keep the existing responsive drawer/portal plumbing.
3. Default to one conversation. Put secondary actions in contextual menus rather than a
   persistent action pane. Reuse the existing drawer search, rename/archive and selection logic.
4. Make the model picker a small top-left control; show current project context nearby.
5. Center the existing message list and composer to approximately 760-820px on desktop. User
   messages use quiet rounded bubbles; assistant content remains open and readable. Retain
   existing Markdown/code/math/citation/tool renderers and edit/retry/copy/stop behaviors.
6. Restyle Composer as a floating rounded surface with attach, microphone and send/stop.
   Put effort/search or other retained controls in a compact menu. Preserve draft/attachment
   enrichment logic and keyboard shortcuts that still make sense.
7. Replace the empty-chat persona catalog with a simple greeting and composer. Do not add a
   marketing dashboard or permanent decorative background behind messages.
8. Reduce settings to actual personal use: connection status, behavior/appearance, dictation,
   storage/backup and any consciously retained advanced controls.
9. Keep desktop/mobile layouts and focus/accessibility/reduced-motion behavior in the existing
   system. Recheck removal of rail/panel margins in PageWrapper and PageCore.

Likely layout paths:

- src/common/app.nav.ts
- src/common/app.config.ts and src/common/app.release.ts
- src/common/app.theme.ts
- src/common/layout/optima/OptimaLayout.tsx
- src/common/layout/optima/PageWrapper.tsx and PageCore.tsx
- src/common/layout/optima/drawer/ and panel/
- src/apps/chat/AppChat.tsx
- src/apps/chat/components/layout-drawer/ChatDrawer.tsx and folders/
- src/apps/chat/components/layout-bar/ChatBarChat.tsx and useLLMDropdown.tsx
- src/apps/chat/components/composer/Composer.tsx and buttons/
- src/apps/chat/components/message/ChatMessage.styles.ts and ChatMessage.tsx
- src/apps/settings-modal/
- src/common/stores/store-ui.ts and src/apps/chat/store-app-chat.ts

## Projects: material gap

Native folders are flat id/title/color/conversationIds objects, disabled by default. They have
no shared instructions, files or project landing page. The existing workspace is conversation
identity plus LiveFile assignments, not a project containing chats. Reuse and extend folders
rather than introducing a parallel store.

The product interview must decide whether iteration one needs grouping only, grouping with
shared instructions, or instructions plus shared files. If files are included, settle whether
all content is attached on each request or selected per chat; define size/context limits,
source visibility, delete/move behavior and persistence/import/export. Do not call grouping
ChatGPT-equivalent project context. Cross-chat memory and retrieval are separate work.

## Local storage

Browser-local storage is native and avoids a new persistence backend. It is scoped to a browser
profile and origin and is lost if storage is cleared. New origin/port does not automatically
import previous data. Server disk storage would add a new layer and scope. Clarify this before
planning server-backed Projects. Use existing backup/import/export if browser storage is chosen.

Stored persona fields, model choices and removed modes may appear in imports or migrations;
normalize product settings without deleting content. Project fields need versioned migrations
and export support. Existing per-chat LiveFile handles require re-pairing after reload and are
not a substitute for persisted shared project files.

## Visual direction for iteration one

Frontend-design skill applied. Visual research is complete; user explicitly deferred further
Tokyo exploration until after the first iteration.

Primary reference: Liam Wong's neon Tokyo photography, with rain, vertical signage, dark
silhouettes and concentrated cyan/magenta light. His photography is modern, with cinematic
influences from Blade Runner and AKIRA; it is not archival 1980s photography. A second research
thread examined Hiroshi Nagai's city-pop cover artwork for simpler shapes and period color.
Use references for composition/color, not copied unlicensed artwork.

- https://www.fusedmagazine.co.uk/liam-wong-tokyo-nights-and-neon-dreamscapes/
- https://www.liamwong.com/
- https://www.thevinylfactory.com/features/japanese-illustrator-hiroshi-nagai-cover-art

Provisional palette: midnight #141421, indigo #1c1b30, paper #efeaf7, pink #f47bb8,
electric cyan #79dce8, violet #a891ee. Retain big-AGI's Inter and JetBrains Mono initially.
Use a subtle indigo/purple gradient in the shell/empty state, concentrated pink-to-violet-to-cyan
on identity/focus or one expressive surface, and quieter translucent message/composer surfaces.
Avoid glow on reading text, heavy blur across the viewport, animated gradients throughout,
retro grid wallpaper, fake Japanese labels or a skyline as a required first-iteration feature.
Neon should indicate current selection, focus and live activity. Contrast and long-session
readability take precedence. Refine from rendered screenshots and user feedback later.

## Verification during implementation

Follow existing npm/Node tooling, Joy UI and webpack. Do not migrate to Deno or replace the
adapter stack. next.config.ts contains Joy aliases and server/client substitutions that depend
on webpack; Turbopack is explicitly unsupported by local guidance.

After dependencies are installed through the repository workflow:

- npm run tscheck (app/tools/tests; pretscheck runs npm install)
- npm run lint
- npm test (offline lane; network tests are key-gated)
- Production build when remodel/pruning causes bundle/runtime concerns
- Focused behavior tests for neutral instructions, model allowlist, project inheritance/migration
  and credential destination binding, according to decided scope
- Visual/manual QA for new chat, existing chat, long content/code, attachments, search, projects,
  dictation states, stop/retry, menus, narrow screens and keyboard focus
- Live Bifrost smoke checks for both chosen models and each enabled hosted capability; never
  turn unverified upstream metadata into success claims

No pre-commit configuration was found. Preserve upstream notices and documented build rules.
Repository guidance forbids starting development servers; the user starts them for browser QA
unless they explicitly authorize an exception.

## Remaining decisions

Resolve launch form, iteration-one project semantics, retained advanced features, model/effort
behavior, web search/tool scope and storage expectations. Voice engine selection and richer neon
art direction are explicitly deferred and do not block shell/removal work. After interviewing,
create a self-contained implementation plan, obtain the workflow's independent Claude critique,
and present the reviewed plan for approval. No application edits should precede that approval.

## Activity states and long-chat navigation

User explicitly requires visibility into which queries are running or waiting and a compact
vertical tick-mark navigator like the supplied Codex screenshot for long conversations.
This is part of iteration one, not deferred neon polish.

Existing ChatDrawerItem accepts beingGenerated, and useChatDrawerRenderItems derives activity
from conversation state. The per-chat AbortController plus pendingIncomplete messages already
support showing generation while another conversation is open. Reuse them. Existing streamed
message/tool fragments can distinguish thinking, responding and a known hosted operation.
Before first output, use an honest waiting-for-response state; do not infer upstream queue
position or a tool permission request from silence. Completion/error/interruption states must
clear active indicators and remain intelligible when navigating away and returning.

A local follow-up queue is different behavior. No established user-message scheduling queue
was found in ordinary chat. Interview must decide whether waiting means upstream response/tool
waiting only or also locally queued prompts. If queuing is included, define same-chat ordering,
across-chat concurrency, cancellation, model/settings snapshot and refresh interruption. Browser
navigation among chats can preserve in-flight work; browser reload/close cannot promise durable
Anthropic background resumability. Do not introduce a job engine without a product decision.

Existing ScrollToBottom provides scroll/stick-to-bottom behavior and a jump-to-latest button;
it does not provide the screenshot's turn overview. Add the navigator within that existing
scroll subsystem and ChatMessageList, rather than replacing the scroller. Proposed interaction:
one tick per user turn, highlighted current position, hover/focus prompt excerpt, click or
keyboard activation jumps to that turn. Keep navigation scoped to the active conversation,
update it during streaming/edit/delete/import, preserve manual scroll position, and prevent
sticky-bottom behavior from overriding a deliberate jump. Bound density for very long histories
and provide usable hit targets despite thin visible marks. On narrow screens it must not cover
text or require hover. Exact responsive presentation can be chosen during implementation.

Relevant paths: src/apps/chat/components/layout-drawer/ChatDrawerItem.tsx,
useChatDrawerRenderItems.tsx, src/apps/chat/components/ChatMessageList.tsx,
src/common/scroll-to-bottom/ScrollToBottom.tsx and useScrollToBottom.tsx,
src/common/stores/chat/store-chats.ts, src/apps/chat/editors/chat-persona.ts,
src/common/chat-overlay/store-perchat_vanilla.ts and AIX stream fragments.

Additional meaningful verification: two conversations running while switching between them;
waiting before first byte; thinking/tool activity; completion/error/stop; no false running after
reload; navigator jumps near top/middle/end of a long history; scroll position while streaming;
keyboard and touch behavior. If local queuing is selected, also cover ordering/cancel/reload.


## Settled interview decisions (supersede earlier proposals)

The user selected a local browser app, shared project instructions/files with automatic inclusion,
automatic disk saving, and medium default effort with an effort slider. Keep image generation,
attachments, search, Markdown/code, editing, retry, branching, archive and local backup. Image and
voice model connections are selected later. Keep speech input only. Include native Claude hosted
code execution, search and fetch through Bifrost; local Claude Code terminal tools are separate.

Waiting is attention state: finished but unread or an explicit question needing the user's decision.
It is not a follow-up scheduling queue. Claude explicitly signals needs-answer via a structured
interaction. Retain actual per-chat working indicators and the long-history tick navigator. The
implementation plan records status lifecycle and read visibility, safe disk recovery, sandbox reset
on branch/retry, and the existing subsystem extensions needed. No implementation has started.

Further persistence analysis found that DataAtRestV1 exports omit archive metadata and binary
assets and may include model credentials. Flash backups exclude DBlobs by default and tolerate
some restore errors. A versioned lossless workspace envelope is required for automatic disk
saving; existing exporters are not sufficient unchanged. Existing single-tab coordination can
be reused; server revisions must also cover another browser profile. Project-only assets must
be included in reachability/GC and recovered before message references.

The existing optional AIX function-tool path can support a bounded ask_user interaction without
a general local tool loop. Completion without that optional tool is a normal reply; do not claim
all semantic questions are automatically detected. Existing Anthropic containers are mutable;
linear reuse is valid, but history branching/edit/retry needs an explicit fresh-container policy.
