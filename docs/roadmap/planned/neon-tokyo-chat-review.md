# Review: Personal Claude workspace (neon-tokyo-chat)

Reviewed: docs/roadmap/planned/neon-tokyo-chat.md and docs/analysis/big-agi-remodel.md
Date: 2026-10-03
Base checked: main 80d366a (same commit the plan analyzed)
Method: plan read in full; every codebase claim was checked against source with file:line
evidence. No code changed, no dependencies installed, no live Bifrost calls.

## Verdict

The product decisions are clear and mostly well grounded. Most of the plan's claims about the
code are correct. The plan is not ready to implement as written, for four reasons:

1. **Too big for one iteration.** 13 acceptance criteria cover a shell remodel, a new persistence
   layer, a new tool protocol, a projects feature and a security hardening. Each is a project on
   its own. Split it into milestones (proposal at the end).
2. **The credential path is weaker than the plan assumes.** The current code can send the
   server's Bifrost key to any host the browser names, and the app listens on all network
   interfaces. Fix both before anything is built on top.
3. **"Small" disk persistence is not small.** No hydration gating exists, and DBlob dates and GC
   are not designed for a second store. Two sources of truth (IndexedDB and disk) need a clear
   rule. A simpler design is available (see section 4).
4. **Some behaviors the plan treats as reuse do not exist yet:** per-chat model, per-chat effort,
   a client tool loop, read state and a project tree. The plan should say outright that these
   are new work.

Below: blockers, then factual corrections, then remarks per plan section, then open questions.

## 1. Blockers

### B1. Server key can be sent to a host the browser chooses

`src/modules/llms/server/anthropic/anthropic.access.ts:124,131` resolves the key and the host
independently:

```ts
const anthropicKey = access.anthropicKey || env.ANTHROPIC_API_KEY || '';
const anthropicHost = llmsFixupHost(access.anthropicHost || env.ANTHROPIC_API_HOST || DEFAULT_ANTHROPIC_HOST, apiPath);
```

A request that sets `anthropicHost: "https://evil.example"` with an empty key gets the server's
`ANTHROPIC_API_KEY` in `X-API-Key`. The plan names this risk ("fix the destination server-side")
but leaves it in step 4, after the persistence work. Change:

- In the personal preset, when the server key is used, **ignore or reject** `access.anthropicHost`
  and `access.anthropicKey`. Prefer rejecting with a clear error over silently ignoring.
- Apply the same rule to every edge procedure that calls `anthropicAccess`, not only chat
  generation. That includes list models and `llmAnthropic.fileApiDownload`/metadata/delete,
  which run hosted-file downloads.
- Apply it to every other retained vendor that falls back to env keys (OpenAI for T2I,
  `OPENAI_API_HOST`), or confirm those env vars stay unset.
- Do this first, as part of milestone 1, with a unit test.

### B2. The app listens on all interfaces, and no endpoint checks origin

- `package.json:11,16`: `next dev` / `next start` without `-H`. Next 15 binds to all
  interfaces, so anyone on the LAN can reach the edge routes that use the server Bifrost key.
- `src/server/trpc/trpc.server.ts:29-38,98`: no middleware, `publicProcedure = t.procedure`.
- Once the disk persistence service exists, a malicious web page could POST to
  `http://localhost:3000/api/cloud/...` (CSRF) or use DNS rebinding to read the workspace.

Change: bind with `-H 127.0.0.1` in the documented launch scripts. Add one Next `middleware.ts`
that rejects requests whose `Host` is not `localhost`/`127.0.0.1:<port>` and whose `Origin`
(when present) does not match. It must cover `/api/edge` and `/api/cloud`. This is cheap.
State it as a concrete acceptance criterion, not "origin/host validation".

### B3. Model listing fails closed through the gateway, and the plan does not decide the fix

`src/modules/llms/server/listModels.dispatch.ts:120-160` calls `GET /v1/models?limit=1000`.
It throws if that fails, and it only defines models whose IDs the gateway returns. Unknown IDs
become placeholders. If Bifrost does not implement Anthropic-format `/v1/models`, no models
appear at all.

The plan says the curated picker "may use known IDs". Decide it: **build the two-model list
from the hardcoded definitions (`anthropic.models.ts:290-329`) and skip upstream listing** in
the personal preset. Use one cheap request (or the first real request) as the connection
health check. That also removes the "listing could make more models visible" concern
altogether.

## 2. Factual corrections and missing facts

| Plan statement | Code reality | Impact |
| --- | --- | --- |
| "Model/effort are remembered per chat" (AC3); "snapshot model/effort at send time" | `DConversation` has no model field. The chat model is the global `primaryChat` domain, read at send time (`_handleExecute.ts:25`). Effort lives in global per-model `llm.userParameters` (`aix.client.ts:418,610`). | New schema field plus an override path. `llmUserParametersReplacement` exists in `aix.client.ts` but has no callers; use it for per-chat effort. |
| "Start new chats with Opus 5.5, medium effort" | Opus metadata default is medium; Sonnet 5.5 default is **high** (`anthropic.models.ts:290-329`). | Decide whether medium applies to Sonnet too (Q2). |
| "Five effort stops ... do not invent a thinking-off mode" | Sonnet 5.5 has a **visible Thinking switch**. Off sends `{type:'between_tools'}` and clamps xhigh/max to high (`anthropic.messageCreate.ts:271-290`). | With the switch kept, two of the five slider stops are fake when thinking is off. Either hide the switch (thinking always on) or show the clamp (Q3). |
| "Incompatible preserved-thinking blocks do not break a cross-model continuation" (AC4) | `block_binding: drop_block` is only set for adaptive/enabled thinking (`anthropic.messageCreate.ts:278-283`). The code comment says the `between_tools` path "can still 400". Signed thinking from model A is replayed to model B unfiltered (`aix.client.chatGenerateRequest.ts:426-444`). | Sonnet with thinking off after an Opus turn is a known 400 risk. Add a client-side rule: drop signed thinking parts whose generator model differs from the target model. `chat-persona.ts:131-135` already has a strip-thinking policy to build on. |
| Plan cites `web_search_20260209` as the failing tool | The app sends `web_search_20260318`/`_20250305`, `web_fetch_20260318`/`_20250910` and `code_execution_20260120` (`anthropic.messageCreate.ts:331,344,370`). | The critique failure says little about the app's tool versions. The verification list should name these exact versions plus the beta headers Bifrost must forward (`anthropic.access.ts:201-203`, block binding). |
| "Auxiliary title operations" use the allowlist | Auxiliary calls use the domains `fastUtil`, `codeApply` and `imageCaption` (`model.domains.registry.ts:23-60`). Users: auto-title, auto follow-ups (diagrams, HTML UI, questions), code fixup, image caption, attachment prompts, imagine prompt, diagrams/flattener modals. `fastUtil` picks the cheapest model with function calling. | List each auxiliary feature and decide keep or remove (Q6). Pin `fastUtil`/`codeApply` to Sonnet 5.5 explicitly rather than relying on the cost heuristic. |
| "Use existing folder identities/memberships" | `DFolder = {id,title,conversationIds[],color?}`. Membership allows a chat in **several** folders. Persisted to localStorage `app-folders` with **no version and no migrate** (`store-chat-folders.ts:8-13,96-107,123-125`). The UI is a filter (`activeFolderId`), not an expandable tree. Drag-and-drop only reorders folders. | The migration must add a version and resolve multi-membership (which folder wins). The tree UI and project view are new components. |
| "Retain existing ProviderSingleTab/instanceLock" | Correct. A second tab is blocked with "Transfer Here" handover (`ProviderSingleTab.tsx:59-128`). `addFlusher` exists for flushing writes before handover (`instanceLock.ts:129-137`) and has no users. | Register the disk flusher there. Revision checks are still needed for a second browser profile, as the plan says. |
| "Hydrate before subscribing autosave or permitting inference" | No hydration gating exists anywhere (`zustandUtils.ts:41` is only a comment). Chat rehydration from IndexedDB is async and not awaited. | Gating is new app-wide startup work, not a hook into existing logic. |
| DBlob assets | Dexie `largeAssets`, `createdAt`/`updatedAt` are `Date` objects (`dblobs.types.ts:49-50`). `gcDBAssetsByScope` deletes everything in the scope outside `keepIds`. `gcChatImageAssets` runs on rehydrate, `ConversationHandler.ts:169,209` and `AppChat.tsx:462`. | Project files stored in scope `app-chat` **will be deleted by GC**. Use a new scope (for example `app-projects`) with its own collector rather than extending reachability inside the chat scope. |
| Image generation as an "existing operation" to track | Draw is the chat execute mode `generate-image` (`_handleExecute.ts:82-95`). `image-generate.ts` takes no abort signal. The OpenAI T2I engine reuses the OpenAI **chat** service key `oaiKey`, stored in the browser (`app-models`, `store-llms.ts:481,492`). | (a) The image "Working" state needs a new tracking hook. (b) Once image generation is configured, its key will be in the browser unless `OPENAI_API_KEY` goes server-side. That conflicts with AC12's secrets rule and the "never put keys in the browser" stance. (c) Hiding the OpenAI chat service UI hides T2I's only configuration path. |
| ask_user "via existing AIX tooling" | Plumbing exists: tool invocation/response fragments, `tools`/`toolsPolicy` on the AIX call, adapter emits `tool_use`/`tool_result`. But chat sends no tools (`chat-persona.ts:74`). Nothing in chat creates a `tool_response` or re-sends. `tool_response` in a **user** message is skipped with a warning (`chatGenerateRequest.ts:381-383`). The only round-trip is the capability probe (`probe.runner.ts:150-170`). | This is a new client tool loop, small but real. See section 5. |
| Persona coupling | Confirmed. `inlineUpdatePurposeInHistory` (`ConversationHandler.ts:54-79`) rewrites the first system message on every send unless `updated` is set. `_handleExecute.ts:64-67` returns `err-no-persona` without a purpose. 11 .ts/.tsx files reference `systemPurposeId`. | As the plan says. Note that `bareBonesPromptMixer` also injects date/model variables. Decide whether the neutral base keeps them (it should; Claude benefits from the current date). |
| Turn navigator "inside existing scrolling/list plumbing" | `ChatMessageList.tsx:432` renders every message with no virtualization, so anchors are always in the DOM. The `<li>` at `ChatMessage.tsx:883` has no `id`/`data-` attribute. `ScrollToBottom` re-sticks through a ResizeObserver when `stickToBottom` is set (`ScrollToBottom.tsx:164-186`). | Straightforward: add `data-message-id`, use an IntersectionObserver for the active turn, and clear `stickToBottom` on a jump. Lower risk than the plan suggests. |
| Effort slider location | On main, effort exists only in the model options dialog (`LLMParametersEditor.tsx`). `ChatPanelModelParameters.tsx`, referenced by the `align-params-uis` command, is dev-branch only. | The slider is a new component. Reuse the parameter spec types, not a panel. |

## 3. Remarks by plan section

### Goal and acceptance criteria

- AC1 "no Google Drive login/picker": the Drive button is wired into `AttachmentSources.tsx`,
  `Composer.tsx` and `ChatMessageEditAttachments.tsx`, gated by
  `NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID`. Removing the buttons is enough; the env var stays unset.
- AC3 "only Opus 5.5 and Sonnet 5.5" should say where it is enforced: the edge
  `aix.chatGenerateContent` request carries the model ID from the client. Add a server-side
  allowlist check in the dispatch path when the server key is in use (one condition).
- AC5 "enforces context/file limits before sending" needs a token source. Extracted PDF text
  can be far larger than its 10 MB original suggests in tokens. Store the token count with the
  extracted text when the file is added, not at send time.
- AC11 and the "Remove one unnecessary visual element after inspecting screenshots" line in
  the interface section are not testable. Drop that line or name the element.
- AC12 bundles autosave, recovery, secrets and stream checkpointing. Split it per milestone.
- AC13 "later providers remain possible through retained adapters": fine. Retained adapters
  that fall back to env keys must not be reachable without the B1 guard.

### Scope: removals

- **Beam is deeply wired in.** It has about 36 mentions in `AppChat.tsx`, 24 in `Composer.tsx`
  and 22 in `ConversationHandler.ts`, and its store is created in the `ConversationHandler`
  constructor. Recommend two passes:
  1. Remove all entry points: execute-mode item, Composer button, Ctrl+Enter shortcut, message
     menu `onMessageBeam`, drawer `hasBeamOpen`.
  2. Delete `modules/beam` only if it becomes mechanical.
  Leaving the vanilla `BeamStore` constructed but unused costs nothing. That matches the plan's
  own "focused remodel, not wholesale pruning".
- Execute modes (`execute-mode.types.ts:6-10`): keep `generate-content`, `generate-image` and
  probably `append-user`; remove `beam-content` and `react-content`. Say this explicitly.
- Call: `pages/call.tsx`, `src/apps/call/*`, `ButtonCallMemo` and `launchAppCall` in the
  Composer.
- Personas: `/personas` and `src/apps/personas`. TTS: auto-speak (`store-app-chat.ts:22,107`,
  `chat-persona.ts:58-61,91`), read-aloud (`ChatMessageList.tsx:304`, `ChatMessageMenu.tsx`)
  and the Speex settings UI.
- Nav (`app.nav.ts`): Call, Personas, Diff, Tokens, Shared Chats, News. Also check the
  `pages/beam`, `pages/draw`, `pages/workspace` and `pages/dev/*` routes the nav does not list.
- Sharing uses the `trade` router with Prisma. Removing link sharing leaves `prisma generate`
  in `postinstall`. Keep it (harmless) unless you want the dependency gone; it is unrelated
  cleanup.
- Split panes: `store-panes-manager.ts` (`MAX_CONCURRENT_PANES=4`). Set the max to 1 or remove
  the openers.

### Upstream divergence (not addressed in the plan)

The repository tracks enricoros/big-AGI, and its model definitions and AIX change often. This
remodel rewrites the hottest upstream files: `AppChat.tsx`, `Composer.tsx`,
`ConversationHandler.ts`, `_handleExecute.ts`, Optima layout and theme. Future upstream syncs
will conflict heavily. Model definition updates (`anthropic.models.ts`) are exactly what you
will want to keep pulling. The plan should state a policy (Q1). Options:

- **(a) Accept a hard fork.** Pull model/AIX updates by hand. Simplest.
- **(b) Minimize the diff in shared files.** Hide rather than delete, add new files rather than
  edit, and gate removals behind one "personal edition" flag. More work now, cheap syncs later.

Recommend (b) for `src/modules/aix/**` and `src/modules/llms/**`, and (a) for `src/apps/chat/**`
and the layout.

### Claude through Bifrost

- Host handling works for a base ending in `/anthropic`. `llmsFixupHost` keeps the path and
  appends `/v1/messages` (`llm.isomorphic.ts:7-15`). No change needed.
- CSF (browser-direct) only activates with a key typed in the browser plus the `csf` toggle
  (`anthropic.vendor.ts:33,45-47`). In the personal preset, remove the key field and the CSF
  toggle so a key never ends up in `app-models` localStorage.
- Keychain lookup only works on the Mac host. If the app is ever started inside the
  claude-docker container, there is no Keychain. Document that the launcher runs on the host,
  or make `BIFROST_API_KEY` the documented path in Docker.
- Opus 5.5 has an `llmVndAntInfSpeed: ['fast_2x']` parameter. The plan does not mention it.
  Decide whether to hide it (recommended for iteration one) or expose it.
- The AIX chat route is Edge runtime (`app/api/edge/[trpc]/route.ts:19`). Self-hosted
  `next start` runs it in-process with normal env, so the Keychain-to-env handoff works. The
  persistence service must live on the Node cloud router, as the plan says.
- **Prompt caching is missing from the plan.** Project instructions and files are re-sent on
  every request. AIX supports cache control (`anthropic.messageCreate.ts:107-134`). Place
  project context in a stable prefix with a cache breakpoint. That cuts cost and latency for
  the plan's main new feature. Note that changing project files changes the prefix: preserved
  thinking blocks will be dropped (`drop_block`) and the cache misses once. Both are
  acceptable; state it.

### Projects and neutral instructions

- **Where instructions live.** Today the effective system prompt is stored as the first system
  message in history and is not rewritten once `updated` is set. The plan mixes two models:
  instructions "composed at request time" (files) and an edited chat instruction as a "final
  override". Recommend one model:
  - Compute neutral + personal + project instructions at request time and never store them.
  - Keep a stored system message only when the user explicitly edits it, or when it comes from
    an import.
  - Decide whether that stored message **replaces** or **appends to** the computed layers (Q4).
  - Then a project instruction edit reaches old chats on their next request, matching AC5.
- "Project file content remains data, not system directives": send it as a leading synthetic
  user content block with source delimiters. Keep it out of the system prompt. The plan implies
  this; make it explicit.
- "Record file versions used by each request": define where. Adding a field to the assistant
  message's generator metadata is the smallest option.
- Multi-membership migration: pick a rule, for example the first folder in display order wins,
  and record the decision in the plan.
- "Deleting a project leaves its chats ungrouped": also decide what happens to project-only
  assets (delete them, or keep them until no message references them).

### Activity and attention

- Working: `_abortController` per conversation plus `beingGenerated` in the drawer
  (`useChatDrawerRenderItems.tsx:199`) already work across chats. Parallel generation across
  chats works; a second run in the same chat aborts the first.
- "Show known phases such as Thinking, Searching, Running code": this needs a per-chat phase
  derived from the last streamed fragment. The drawer currently only sees the abort controller.
  The smallest route is a non-persisted field on the per-chat overlay store, set from the
  ContentReassembler callback.
- Unread: needs a persisted `lastSeenMessageId` (or a flag) on `DConversation`. Reading via
  "end of reply in view and document visible" is sound. Mark-read action: good.
- Precedence "Running > Needs your answer > Unread > idle" is clear. Errors and stops also need
  a slot. Recommend Running > Needs answer > Failed/Interrupted > Unread > idle, with Failed
  cleared on view like Unread.

### ask_user protocol

This is the riskiest new mechanism. Concrete design points the plan should fix before
implementation:

1. **Where the result lives.** `tool_response` in user messages is skipped. The answer has to be
   stored on the assistant message holding the `tool_use`, and AIX must serialize it as the
   `tool_result` in the next user turn. Confirm that the serializer does this
   (`chatGenerateRequest.ts:530-545` handles assistant-side responses) and add a test.
2. **Composer behavior while a question is pending.** If the user types a normal message
   instead of clicking an option, Anthropic requires a `tool_result` for the dangling
   `tool_use`, or the request returns 400. Rule: a pending question turns the next composer
   send into the answer. Dismiss sends a `tool_result` with "user dismissed".
3. **Continuation.** After the answer, does generation append to the same assistant message or
   start a new one? A new assistant message is simpler with the current fragment model and
   keeps retry semantics clean.
4. **Thinking.** The assistant turn with `tool_use` must be replayed with its signed thinking
   block unchanged. Today's preservation covers this, but switching model mid-question breaks
   it. Either block model switching while a question is pending, or treat a switch as dismiss.
5. **Prompting.** The tool only gets used if the neutral base instruction says when to call it.
   Add one sentence to the base prompt and test both models' propensity live.
6. **tool_choice.** Forced tool_choice returns 400 on these models and AIX downgrades it to
   auto. Fine for an optional tool, but note it.
7. **Mixing with hosted tools.** A client function tool next to server tools
   (web_search/code_execution) has to pass through Bifrost. Add it to the gateway verification
   list.

### Hosted tools and sandbox

- The container resolver (`aix.client.ts:252-275`) walks the history it is given, newest first.
  A retry passes truncated history that still contains the earlier container, so it rejoins a
  mutated sandbox. The code comment says so. Concrete policy proposal: reuse a container only
  when the request appends a new user turn at the head **and** the container comes from the
  current head assistant message's chain. Pass `null` for retry, edit-regenerate and branch.
  This is a parameter on the resolver call, not a new resolver.
- If the container is rejected upstream there is no fallback. The request fails, and the next
  turn recovers. With the policy above that is rare; leave it.
- Generated-file download is capped at 10 MB (`anthropic.router.ts` `fileApiDownload`). Mention
  the cap in the UI error.

### Disk-backed saving

The plan's requirements are right (atomic writes, last-known-good, revisions, assets before
references, no empty overwrite). The architecture, "keep IndexedDB/Dexie as working cache, add a
Node service, disk is durable source", is heavier than needed and leaves two sources of truth.

Recommend instead:

- **Chats:** replace the storage adapter. `app-chats` already goes through a pluggable zustand
  persist storage (`createIDBPersistStorage`, `idbUtils.ts`) with batched writes (321 ms window,
  1234 ms deadline; `idbUtils.ts:14-15`). A disk-backed storage with the same interface makes
  zustand's existing hydrate/partialize/migrate do the work. Incognito exclusion
  (`store-chats.ts:508-522`) and `_abortController` stripping come for free. That already gives
  the plan's ~1 s streaming checkpoint.
- **Folders/projects and selected settings:** the same adapter, per store.
- **Assets:** write-through on DBlob put/delete to a binary Node route (`app/api/...` with
  `runtime='nodejs'`). Do not send base64 through tRPC JSON. Keep Dexie as the read cache, or
  read from disk directly.
- **First-run import:** if no disk workspace exists, read the current IndexedDB/localStorage
  once and write it. That is the only moment both stores matter.
- **Hydration gate:** zustand persist exposes `persist.hasHydrated()` and `onFinishHydration`.
  Gate the app shell (and inference) on those for the disk-backed stores. That is new code, but
  small.
- **Write amplification:** today every change rewrites the full conversation array. On local
  disk with ~1 s batching that is fine for MBs. If the workspace grows large, split to one file
  per conversation later. Do not design for it now.
- **Path safety:** validate asset IDs and filenames server-side (no `..`, fixed charset) before
  joining with `AI_GUI_DATA_DIR`.
- DBlob `Date` fields need explicit (de)serialization in the envelope.
- Flash backup is unsafe as a restore base: it runs `localStorage.clear()` before restore,
  logs and continues on key failures, and its pre-restore backup is commented out
  (`BackupRestore.tsx:260,265,773-780`). The plan's conclusion is correct. With disk as the
  source, the "backup" can be a copy of the data directory (zip) plus restore from a copy. That
  is lossless by construction and simpler than a new envelope format.

This keeps every plan requirement and removes the "IndexedDB says X, disk says Y" class of bugs.

### Interface and theme

- Theme: `ProviderTheming.tsx:64` uses `defaultMode='light'`, and the theme defines light and
  dark schemes. There are about 300 hardcoded hex/rgba literals across about 80 files. A
  dark-only neon theme will need a sweep of those literals, or some surfaces will stay light.
  Decide whether light mode is dropped (Q8). Dropping it halves the theming work.
- Right panel: closed by default (`store-layout-optima.ts:77`), but chat always portals
  `ChatPane` into it (`AppChat.tsx:500,624`). Moving its retained actions into menus is the real
  work; hiding the panel is trivial.
- Composer centering on empty chat versus bottom anchoring: the empty state currently renders
  `PersonaSelector`. Replace it there.
- Navigator: low risk (see table). Bound the density by bucketing ticks when there are more
  user turns than pixel rows / 4. On touch, show it as a tap-to-open list, not hover.

### Dictation

- The Composer uses the browser Web Speech API. In Chrome that sends audio to Google's servers.
  For a "local, personal" app, state this in the plan or Settings. Safari support works
  differently, and Firefox has none (Q9).

## 4. Questions for Adriaan

1. **Upstream sync:** do you want to keep pulling big-AGI updates (model definitions, AIX fixes)?
   If yes, the remodel should minimize edits in `src/modules/aix` and `src/modules/llms`.
2. **Default effort for Sonnet:** medium like Opus, or its own default (high)?
3. **Sonnet thinking switch:** hide it (thinking always adaptive, all five effort stops valid,
   no cross-model 400 risk), or keep it and show that xhigh/max clamp to high when off?
   Recommend hiding.
4. **Edited chat instructions:** does an explicitly edited chat system prompt **replace** the
   personal and project layers, or **append** to them?
5. **Opus fast mode (`fast_2x`):** hide for now?
6. **Auxiliary AI features:** keep or remove each: auto-title (keep), auto follow-ups
   (diagrams, HTML UI, question suggestions), code fixup, image captioning, attachment prompt
   suggestions, imagine-prompt. Each costs a request.
7. **Image generation in iteration one:** show the Draw mode with an "unconfigured" state, or
   hide it until a provider is chosen? And when chosen, must its key be server-side only
   (requires `OPENAI_API_KEY` env and B1-style guard)?
8. **Theme:** dark only, or keep a light mode?
9. **Dictation privacy:** is Chrome's cloud Web Speech acceptable until an ASR model is chosen?
10. **Cost visibility:** project files re-sent on every request can be expensive. Do you want the
    existing per-message cost/usage display kept visible, or a project-level context-size
    indicator?
11. **Folder multi-membership:** existing folder data may place a chat in several folders. Which
    one wins in migration?
12. **Persistence approach:** accept the storage-adapter design (disk as the only durable store,
    IndexedDB only for the one-time import) instead of IndexedDB-as-cache plus a sync service?

## 5. Proposed milestones

Each milestone is independently usable and verifiable. Acceptance criteria map in brackets.

| # | Milestone | Contents | ACs |
| --- | --- | --- | --- |
| M1 | Safe Claude shell | Loopback bind + origin middleware, Bifrost preset, fixed host guard (B1), static two-model list (B3), per-chat model/effort, effort slider, cross-model thinking filter, neutral instructions replacing personas, removals (entry points first), layout collapse to Sidebar \| Conversation, first-pass theme | 1, 2, 3, 4, 6, 9, 13 |
| M2 | Projects | Versioned folder migration, tree UI, project view, instructions, files in their own DBlob scope, context budget check, prompt caching | 5 |
| M3 | Disk persistence | Disk storage adapter, hydration gate, asset route, first-run import, revisions, last-known-good, Settings save status, directory backup/restore | 7 (backup), 12 |
| M4 | Attention and navigation | Phase tracking, unread/read visibility, failed state, image-op tracking, ask_user loop, turn navigator | 10, 11 |
| M5 | Hosted tools through Bifrost | Live verification of the exact tool versions and beta headers, container reuse policy, file download handling | 8 |

M5 can run in parallel with M2 once M1 lands, because it depends mostly on gateway evidence. If
Bifrost rejects a tool, only M5 is blocked, which matches the plan's own deferral rule.

## 6. Verification remarks

- The repository has exactly one test file (`src/modules/llms/server/listModels.test.ts`), run
  by `tsx --test`. There is no IndexedDB shim. Put new logic in pure functions to keep tests
  meaningful and cheap:
  - access guard (B1)
  - allowlist
  - instruction builder
  - folder migration
  - thinking filter
  - container policy
  - attention precedence reducer
  - persistence envelope encode/decode (including `Date` fields)
  - atomic write and last-known-good on a temp directory
- Add a test that `anthropicAccess` with a client host and the server key throws or ignores the
  host. This is the highest-value single test in the plan.
- `npm run tscheck` runs `npm install` first (`pretscheck`). In the claude-docker container that
  installs the Linux `node_modules`, which is expected. The plan notes it; keep the note.
- No pre-commit configuration exists in the repository; the plan's "check if present" stands.
- Live Bifrost checks: add `/v1/models` behavior (even if unused after B3), the beta headers,
  a client function tool alongside hosted tools, and the Files API content endpoint.

## 7. Minor and editorial

- The plan header still says "Approval: Pending independent Claude critique". This review can
  serve as that critique once the plan is updated, if you accept it as such.
- The plan text is dense and hard-wrapped mid-sentence in places (for example line 222). The
  decisions read better as short bullets per topic.
- "Five effort stops derive from supported model metadata": with listing skipped (B3), they
  derive from the hardcoded definitions only. Upstream-reported effort levels are no longer
  merged (`llmsAntFuseModelKnowledge`). That is acceptable; say it.
- `/tmp/ask-claude-GgagYmYpDB` diagnostics: `/tmp` is a shared host mount and gets cleaned.
  Copy anything worth keeping into the analysis doc rather than relying on the path.
