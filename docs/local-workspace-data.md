# Local workspace data

The Node service writes `workspace.json` atomically with a revision check. `workspace.last-good.json` keeps the previous commit. Draft and incognito bytes stay in the disposable browser cache. Referenced durable assets are promoted before their manifest entry commits. Browser IndexedDB and Dexie data are read caches after the one-time migration.

Startup waits for disk before hydrating durable stores. A missing first workspace permits importing legacy browser chats and project metadata; corrupt or unreachable storage enters recovery. Defaults never replace an unreadable workspace. Stale revisions require reloading the newer workspace. Failed saves remain visible with Retry.

Settings shows the data directory and last confirmed save. Download backup flushes writes and creates a validated zip with assets. Restore validates detached records, references and staged asset bytes before committing, preserving the primary byte-for-byte even when corrupt. Readable primary revision and epoch are checked. Recovery and restore rotate the epoch, rejecting every previously issued save token, including corrupt first-save data without last-good metadata. Recovery uses the last good commit. Provider settings, credentials, transient recordings and incognito chats are excluded. Legacy chat JSON and Markdown exports remain available.

Do not edit a running workspace file manually. Stop the user-started server before filesystem maintenance. Remote sandbox files remain remote-only until downloaded; downloaded artifacts save locally before the browser download is offered.

Unowned disk bytes are collected after a consistent commit, with a 24-hour upload grace period. Current, last-good, historical project-file and preserved recovery references retain their bytes. An unreadable recovery copy suspends collection. Project originals and remote artifact downloads keep their 10 MB limits; legacy chat assets can exceed 10 MB. Backup and expanded restore archives retain the 250 MB limit and report it explicitly.


Native Claude web search and web fetch use the existing Bifrost connection. Remote code execution is unsupported by the current gateway deployment. Search activity shows source links; answer citations remain in the answer. Complete ordered provider results, including encrypted content, remain in chat JSON and backups. Edited output or a different model/deployment cannot replay the original signed provider blocks.

Type `/` to select a local skill from the active model's instruction folder. Claude shows `~/.claude/skills`; future OpenAI/Codex models use `~/.codex/skills`. Model changes refresh the catalog and cancel unfinished selections. Selected instructions and explicitly loaded package references save on the user turn with their origin and revision. Later source changes do not rewrite old chat context. Skills are read-only instructions; selection does not grant shell, MCP, connectors, image generation or delegation.

Projects open from the sidebar into a view of their name, instructions, files and chats. Project chats appear under their project; search and the archive include all chats. Moving a chat to its current project keeps its membership. Delete a project to unfile its chats.

File extraction shows processing, ready or failed status with the source name and warnings. Interrupted extraction reloads as a visible failure. Remove and add the original again to retry. Removing a file excludes it from future requests; replies retain their recorded original version. Cleanup removes project records only after both current project and historical reply ownership end.

The composer estimates the assembled request, including instruction layers, project content, selected skill snapshots, attachments, tool overhead, prior reasoning, output and thinking reserves, plus a 10% context margin. This is a tiktoken fallback estimate, not Claude's tokenizer. An estimated overflow stops Send without truncating content; remove project files or start a shorter chat.

## Connected local coding folders

Project folder uploads are superseded by local folder connections. A connected path is local metadata; model requests receive a capability ID and folder name. Sector 7 reads current file content when a model calls a file tool, then records only that tool output in the conversation. Historical uploaded originals remain owned by old replies for backup compatibility.

Local file changes keep recoverable copies in the app data directory. Local terminal jobs run in the connected directory with the app's process permissions, not in a filesystem sandbox. The terminal can access locations beyond that directory. Model tool invocations must save before execution; a failed workspace save blocks execution. File/command receipts record side effects to prevent blind replay after a chat retry or process restart. Exact implementation limits and recovery behavior are recorded in the release notes after live verification.
