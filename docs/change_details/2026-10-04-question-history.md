# Question history and composer recovery

Status: reviewed, verified source milestone. Full M4 acceptance remains open. Source baseline: 5cf8e465dd09794c1d3a515d98b44dde7c481092.

Chat JSON export/import and disk hydration reconstruct question cards from validated invocation/result pairs. Original question/model/message identities are preserved. A saved answer offers explicit Continue after reload; a later assistant attempt consumes it. Dismissed/error results remain terminal. Ambiguous question identities reject import before interrupting an existing chat. Signed/native history is retained unchanged.

The answer card hides Dismiss once every answer is saved. The Composer accepts plain-text Chat answers only while unanswered, keeps attachments, skills and references for a later message, and directs saved-answer sends to Continue without consuming the draft. Save/continuation failures appear in a snackbar. Text clears only after acknowledged saving and only when it still matches the submitted answer.

The project title attention count was removed at the user's request. Individual chat indicators remain.

Checks: 143 offline tests passed, 22 credential-dependent skips; root/tools TypeScript, full lint, scoped composer lint and diff checks passed. Production build .next-question-summary-reviewed-final passed. Evidence: /private/tmp/sector7-question-final-tests.log, /private/tmp/sector7-question-final-types.log, /private/tmp/sector7-question-tools-types.log, /private/tmp/sector7-question-full-lint.log, /private/tmp/sector7-question-fixes-lint.log, /private/tmp/sector7-question-final-build.log.

Initial read-only Claude review /tmp/ask-claude-question-actions-FzwRHzcVHM/answer.md requested changes for composer draft loss, wrong send modes, ignored context and missing error handling. These were implemented and regression-tested. Follow-up /tmp/ask-claude-question-fixes-gWx0iKFhzy/answer.md returned APPROVE. History review /tmp/ask-claude-question-final-h6AI9XquPm requested corrections for consumed duplicate responses and pre-hydration validation. These were fixed and tested; /tmp/ask-claude-history-fixes-L5hTprt3xZ/answer.md returned APPROVE. Runtime and hydration share terminal question rules; legacy model identity remains metadata. Reviews are retained at the user's request.

This batch does not establish full M4 acceptance. Live both-model questions, actual browser reload/import and mixed-tool/Stop paths, reply-end visibility and long-chat navigation still require evidence. Tool summaries requested during this batch are tracked separately.

Actual browser restart loaded the existing workspace normally; local command and native search summaries are visible, with the existing four citations retained. Project titles have no attention count. Saved chat metadata remained available after the restart. Direct both-model question browser round trips remain open.
