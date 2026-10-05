# Composer token helper

Moved token and cost information into the model-and-effort dropdown. The former line below
the composer actions reset on every keystroke and streaming update, making the helper flicker
and the composer shift. The composer no longer allocates a row for these estimates.

The dropdown shows the estimated context total and limit, input tokens, output and thinking
reserve, and estimated input cost. Costs remain visible on mobile and below $0.01. The last
completed estimate stays visible while an update is pending, scoped to the current chat and
model. The dropdown remains readable during a reply; model, effort and mode edits stay locked.

Request estimation, context-limit warnings, send validation and message cost details remain
available. The unused composer status component was removed.

Verified on current `main` with `npm run precommit` under Node 22: whitespace checks, both
TypeScript projects, full lint and 239 passing offline tests. The 22 vendor network tests were
skipped. The first Node 26 run failed because the existing native dependency was built for
Node 22; rerunning with its matching runtime passed. Desktop verification was not performed
at the user's request.
