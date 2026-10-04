# Minimal composer

Implemented on `feat/gpt-6-1-sol-subagents` from the composer-minimal plan, with the user's
layout revisions on 2026-10-04.

The top bar contains the chat title and conversation menu. A plain model-and-effort dropdown
beside send replaces its model selector and effort slider. Sol uses the compact label
`6.1 Sol`. The dropdown retains all three models and five effort levels, including Max, plus
Chat and Draw. Draw keeps the unconfigured-provider notice. Ctrl+L opens this picker.

Tokens and minimum cost appear on one smaller line below the action row. The full request
estimate, send validation and cost calculation are unchanged. Warning begins at 80%; danger
and the action-required error appear above the limit. Pending estimates show `...`. The
existing tooltip retains the detailed breakdown. Costs below $0.01 and mobile costs stay
hidden. Draw has no token line.

The send circle uses a play triangle and a mako glow on hover and keyboard focus. Append and
Draw keep their icons. Reduced motion removes the transition. Text and dictation use 15px;
the placeholder names the selected model and keeps the slash-skills hint.

Shortcuts are off by default. UX Labs migration version 3 turns them off once for existing
users while preserving the older adaptive-rendering migration. Labs can restore the row.
Its former X now collapses and expands the composer; the draft stays mounted and preserved.
The shortcut-removal dialog and obsolete mode menu/progress bars were removed.

## Verification

- `npm run precommit`: both TypeScript projects, full lint, whitespace checks and 222 passing
  offline tests; 22 network tests skipped. Four new tests cover fresh defaults, v1/v2 settings
  migration, unrelated preferences and a re-enabled shortcut row surviving reload.
- Playwright against the existing server: empty/typed, warning/over-limit, tooltip, keyboard
  send focus/glow, reduced motion, Draw, stop, optional shortcuts/collapse, retained draft,
  Shift+Enter, Alt+Enter append, model/effort changes, Max, Ctrl+L and 360px layout/menu fit.
- Real React controls disable during abort, active turn, question save and unanswered
  questions. Model changes set the fresh-container flag. Browser fixtures intercept workspace
  writes and do not persist test chats or configuration edits to user data.
- Final scope has an independent Claude review with an APPROVE verdict and no blocking
  defects. No live provider generation was needed for the presentation changes.

## Review

Claude's frontend-skill advice supplied the combined picker and subordinate status layout.
The initial product review approved the composer; its storage-test concern was disproved by
installed Zustand source and passing tests. The expanded-scope review requested restoring
Draw capability feedback. The old menu allowed Draw but labeled it unconfigured; the new menu
now retains that notice rather than adding a new capability restriction.

Final correction review: APPROVE, no blocking defects. Claude read the actual scoped diff
and previous mode menu, confirmed the Draw notice, and withdrew the earlier gating finding.
The review used seven focused reads; it did not run checks or inspect TokenTooltip internals.
Parent verification covers the actual tooltip and browser controls. The combined picker also
locks mode changes during active replies, and Ctrl+L toggles its menu.
