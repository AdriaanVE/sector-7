# Lost command-start response recovery

Stop previously depended on receiving the command job ID. If the server reserved and spawned the job but its start response was lost, the client could not send cancellation. The server's request-abort fallback alone does not establish cancellation for every disconnected response.

The client now sends a bounded cancellation using the saved invocation identity when the start outcome is unknown. A definite HTTP 4xx start rejection creates no cancellation record, preserving retryable concurrency failures. The cancellation request uses the same saved project/chat/folder authorization and command/timeout matching as start. Known jobs retain their existing cancellation path.

Start and cancellation share the command manager's exclusive queue. Cancellation that arrives first records a durable terminal cancelled reservation without spawning anything. A late start returns that reservation; changed arguments are rejected. If start arrives first, cancellation stops the existing process group by invocation identity. Completed outcomes are preserved. Cancellation failures retain the original error/output and say cancellation could not be confirmed.

A small receipt constructor keeps job identity, normalized defaults and initial receipt fields consistent. The simplify pass stayed within these changed paths. This is not a new command scheduler or a promise that detached jobs survive reload.

## Verification

Independent Claude design review confirmed the lost-response race and required preserving definite start errors, existing identity cancellation and cleanup after a saved response. Those corrections are implemented. Regression tests cover cancellation before/after start, both race orders, durable reload, unchanged terminal outcomes, command identity, saved-call authorization, lost transport/body/aborted responses and bounded cleanup. The full regression suite passed 193 tests with 22 credential-dependent skips. Application types and source-wide lint passed. The route test fixture now uses typed message/fragment builders. Tooling types, its focused route regression and scoped lint passed after that correction. The isolated webpack production build passed; generated TypeScript configuration changes were restored. The reviewed build then returned HTTP 200 on port 3004, with the complete workspace unchanged at revision 779 and both exact owned asset hashes retained. The fresh independent Docker Claude source review approved the queue ordering, authorization, retryable-error distinction and bounded client cleanup. A second fresh Claude review approved the final tests and bounded record. Neither review ran the checks. Its two test notes led to explicit queue-order assertions and a longer cancellation target to avoid a timing flake; the corrected tooling check is confirmed green.

Separate actual Bifrost app-route checks stopped both model streams after real text arrived: Sonnet settled in 4 ms and Opus in 1 ms after cancellation. Their captured particles retained partial text and stopped state through the production reassembler and temporary disk reload. Evidence is in `/private/tmp/sector7-native-stop-nWuvHk`, `/private/tmp/sector7-stop-reassembly-BgZNln` and the stop-reassembly log. This verifies transport/reassembly/storage, not React Stop or full browser lifecycle acceptance.

## Limits

If the folder connection or saved invocation disappears before cleanup authorization, cancellation may be rejected and remains explicitly unconfirmed. Commands that already completed cannot have their side effects undone. Abrupt server/OS crashes may leave detached descendants; restart reports interruption and does not blindly kill reused PIDs or replay mutations. Live jobs across reload remain outside the plan.

The full plan remains in progress. Browser retry, isolated port 3005 and dense fixture permissions are still pending; no blocked browser navigation or unapproved server launch was attempted. Clean-profile recovery, native chooser reconnect, historical artifact actions, dense/touch/streaming/unread geometry and actual React command Stop/restart remain open.
