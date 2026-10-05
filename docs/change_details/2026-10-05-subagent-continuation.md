# Chat execution and subagent continuation

Chats and child agents used the same 32-call, seven-round and five-minute total limits. Waiting for a child consumed the parent's deadline, and every rejected call displayed the same error. A model response that completed with rejected tools could still leave the child marked `ok`.

The execution loop now has no fixed call-count or total deadline. An optional local-tool round cap defaults to disabled. Three identical consecutive tool calls with unchanged returned content pause the run; changed polling content resets the guard. Receipt identities and timings do not count as progress. A separate five-minute response inactivity timer runs only during model requests and resets on raw AIX particles, including heartbeats.

Paused runs retain `incomplete` and a reason. Configured round caps and repeated calls receive one final summary request with local and hosted tools disabled. Every skipped invocation gets a saved protocol response; the compact UI shows one pause notice. Model inactivity retains its partial response and a pause notice. User Stop remains separate and cancels the active child.

`continue_agent` adds a follow-up to an existing child owned by the parent, preserving its transcript and completed tool results. A saved message reserves continuation identity before execution. Replaying that invocation returns the saved child without automatically repeating work. Active-run ownership prevents continuation during execution or cleanup. Missing, foreign and unsaved targets are rejected. Children cannot spawn or continue agents.

Delegation remains synchronous and sequential. Parallel execution and asynchronous spawn/wait are deferred. Tests use the established provider-request and subagent lifecycle boundaries with real local handlers and temporary files; vendor HTTP responses are fixtures.

The focused suite passed 50 tests. The full `npm run precommit` workflow passed types, lint and 239 tests, with 22 explicit network skips. No dev server was started. Browser and live vendor acceptance remain unverified.
