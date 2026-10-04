# Local command cancellation and native fetch lifecycle

Local command cancellation now has an independent five-second request timeout. If cancellation fails or the local server hangs, the saved tool error says cancellation could not be confirmed and asks the user to check the connected folder before retrying. Received output and the original failure remain available. This bounds the client's wait; it does not claim an unconfirmed command was killed.

Nine regressions exercise the production client dispatcher with the real disk coordinator and controlled HTTP: durable save ordering, failed save before execution, folder cancellation during saving, accumulated stdout/stderr, abort during the polling wait and in-flight poll, HTTP/transport failures, unresponsive cancellation, and recovered interrupted receipts without duplicate mutation. The interrupted fixture matches the actual initially reserved receipt with empty chunks. A real command side-effect marker proves the same invocation does not run twice. Scope-to-folder authorization remains covered separately by server tests.

## Native fetch evidence

Actual app-route calls through the existing Bifrost launcher completed on both `claude-opus-5-5` and `claude-sonnet-5-5`:

- Fetching the public FFVII site returned paired `url_not_allowed` errors; ordinary follow-ups succeeded without pretending content was fetched.
- Fetching Anthropic's public web-fetch documentation returned successful results, one/two citations and the page title in follow-ups.
- Fetch, explicit question, paired TypeScript answer and following ordinary message completed on both models. A further actual app-route follow-up on each model used production `ContentReassembler` and `aixCGR_ChatSequence_FromDMessagesOrThrow`, retained the title/choice and left the transcript unchanged.
- Successful and failed captured response particles passed through the production reassembler, produced distinct summaries, and retained exact fragments/native content through temporary real-disk ZIP restore and adapter replay.

Probe evidence remains in `/private/tmp/sector7-fetch-acceptance-L7BfyL`, `sector7-fetch-docs-F6GBdj`, `sector7-fetch-question-qioaia`, `sector7-fetch-lifecycle-iGL3Gn` and `sector7-native-client-followup-CQ7i0e`. No probe saved a chat or read credentials. These are protocol/reassembly/storage checks, not browser acceptance or a promise that every domain permits fetching.

## Review and limits

The first fresh Docker Claude review requested realistic interrupted-receipt output and a true asynchronous polling-wait abort; both were corrected. Its cancellation-hang observation led to the bounded request and explicit unconfirmed-cancellation error. The final full regression suite passed 180 tests with 22 credential-dependent skips. Root and tooling types, source-wide lint excluding unrelated worktrees, diff checks and isolated production build passed. The final fresh Docker Claude review approved the cancellation logic, corrected tests and scoped documentation; it did not independently run these checks or inspect raw gateway logs. The simplify pass retained explicit cancellation control flow and only changed the error path.

The existing stale browser tab displayed the revision-conflict modal during a tool-display setting change after restart; the complete disk workspace remained unchanged at revision 779. Browser reload/navigation is pending explicit user approval following an automatic-review rejection. Actual React Stop/restart, clean browser profiles, native chooser reconnect, historical artifact actions and dense/touch/unread navigation remain required. The final reviewed build started on port 3004, returned HTTP 200 and preserved the complete workspace at revision 779 and both exact asset hashes. The full plan stays in progress.
