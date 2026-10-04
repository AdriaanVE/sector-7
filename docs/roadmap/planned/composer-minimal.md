# Minimal composer

Status: Implemented
Approval: User requested implementation on 2026-10-04, then revised the picker and collapse behavior
Date: 2026-10-04
Reference: [Sector 7 brand board](../../stylesheet/Sector%207%20Cyberpunk%20Brand%20Board.png)

Outcome: [Implementation and verification](../../change_details/2026-10-04-composer-minimal.md).
The implementation record includes the user's later decisions: combine model and effort in
the composer, remove their top-bar controls, move token status below, name the selected model
in the placeholder, and replace the optional shortcut row's X with collapse/expand.

## Goal

Make the chat composer calmer and easier to scan. Remove the shortcut row, replace the two token
bars and the separate token line with one readable status line that names the model, use the
brand board's send button, and make the input text slightly smaller.

## Scope

- Composer only: `src/apps/chat/components/composer/` and the default for the shortcut bar.
- No change to token estimation, cost calculation, sending, modes or keyboard shortcuts.
- Shortcuts stay available through the Shortcuts modal (Ctrl+Shift+/) and the Labs setting.

## Current state

| Element | Source | Problem |
| --- | --- | --- |
| Top row: close button, five key chords with labels | `StatusBar.tsx`, gated by `labsShowShortcutBar` (default `true`) in `store-ux-labs.ts` | Takes a full row and has the most visual weight in the composer |
| Placeholder second line: "Shift + Enter to add a new line" | `Composer.tsx:738` | Adds a second line of hint text |
| Short green bar, bottom left of the textarea | `TokenProgressbar.tsx`, the `direct` (typed text) segment | Has no label and reads as decoration |
| Short grey bar, bottom right of the textarea | `TokenProgressbar.tsx`, the `responseMax` reserve segment | Has no label; the history segment is always 0 (`tokensHistory = 0`, `Composer.tsx:263`) |
| "> 5.64 ¢" badge | `TokenBadge.tsx`, `absoluteBottomRight` | Floats on its own, separate from the token count |
| "64,310 / 400,000 tokens estimated" | `Composer.tsx` preview budget row | A third, separate token readout on its own row |
| Send button: Telegram paper plane in a solid mako circle | `Composer.tsx:727-730, 938` | Off-brand; the brand board uses a mako circle with a play triangle |

## Decisions

1. **Shortcut bar off by default.** Set `labsShowShortcutBar` to `false` and add store migration
   version 3 that turns it off once for existing users. The Labs toggle can re-enable it.
   `StatusBar.tsx` stays unchanged.
2. **One status line replaces the bars, badge and token row.** Render it on the footer row,
   between the attachment/mic buttons and the mode chevron:

   ```
   [+] [cam] [mic]            Opus 5.5 · 64k / 400k · 5.6¢   [^] (>)
   ```

   - Model short name: `getLLMLabel(chatLLM)` without a leading `Claude ` (`Claude Opus 5.5` ->
     `Opus 5.5`). Uses `text.secondary` at `body-xs`, medium weight, as the line's anchor.
   - Context: compact numbers (`64k / 400k`) in `fontFamily: 'code'` with tabular numerals,
     `text.tertiary`. Contrast comes from color, not bars: `warning` at 80% of the limit,
     `danger` when over it.
   - Cost: the existing minimum cost (`costMin` via `formatModelsCost`), still hidden below
     $0.01, `text.tertiary`.
   - The existing `TokenTooltip` wraps the line, so hovering still shows the full breakdown.
     The "Estimated context..." text moves into that tooltip.
   - "Updating context estimate..." becomes the context segment showing `...` instead of a
     separate row.
   - The over-limit error message stays as its own line, since it requires action.
   - On mobile, show the model and context only; drop the cost.
3. **Remove `TokenProgressbar` and the composer `TokenBadge` usage.** Delete
   `TokenProgressbar.tsx`, which has no other user. Keep `TokenBadge.tsx`, which
   `CleanerMessage.tsx` still uses.
4. **Send button follows the brand board.** Keep the solid mako circle (36px desktop, 40px
   mobile). Replace `TelegramIcon` with `PlayArrowRounded`, already used in 11 files, so no new
   icon enters the bundle. Add a soft mako glow on hover and focus
   (`box-shadow: 0 0 12px rgba(0,255,179,.45)`). With `prefers-reduced-motion`, the glow
   appears without a transition. The append mode keeps its icon; draw mode keeps the paint brush. The mode
   chevron stays `plain neutral` so the send button remains the single accent.
5. **Shorter placeholder.** Drop the "Shift + Enter" second line. The placeholder becomes
   `Message Claude, or / for skills`. The shortcut stays listed in the Shortcuts modal.
6. **Smaller input text.** Set the composer textarea to `fontSize: '0.9375rem'` (15px, down from
   Joy's 16px `md`). Keep `lineHeightTextareaMd` (1.75). The mic overlay `Typography` uses the
   same size so dictated text does not jump.

## Approach

1. `store-ux-labs.ts`: default `labsShowShortcutBar: false`; migration `version: 3` sets it to
   `false` when `fromVersion < 3`.
2. Add `tokens/ComposerStatusLine.tsx`: props `llm`, `direct`, `responseMax`, `limit`,
   `chatPricing`, `pending`, `compact`. It reuses `tokenCountsMathAndMessage` and `TokenTooltip`.
3. `Composer.tsx`:
   - Remove the `TokenProgressbarMemo` and `TokenBadgeMemo` renders, the "tokens estimated" row
     and the "Updating context estimate" row; render `ComposerStatusLine` in the footer before
     the mode chevron.
   - Swap `TelegramIcon` for `PlayArrowRounded` in `sendButtonIcon`, and in the `Mic · Send`
     shortcut decorator; drop the unused import.
   - Add the hover/focus glow to the send `IconButton` `sx`.
   - Shorten the placeholder and remove the `explainShiftEnter` text branch. Keep
     `useUICounter('composer-shift-enter')` only if `touchShiftEnter` still has a caller;
     otherwise remove it.
   - Set the textarea and mic overlay font size.
4. Delete `tokens/TokenProgressbar.tsx` with `git rm`.

## Verification

- `npm run tscheck && npm run lint`.
- Screenshots of the running dev server (user starts it) via Playwright, for: empty composer,
  typed text under the limit, near the limit (warning color), over the limit (danger color and
  error line), draw mode, append mode, mobile width, assistant running (stop button).
- Hover the status line: the tooltip shows the full token and cost breakdown.
- Existing user with the shortcut bar on: after reload it is off; turning it on in Labs restores it.
- Keyboard: Tab reaches the send button and its focus ring and glow are visible.

## Human calls

1. **Model name: label or picker?** The plan shows it as a label. Making it a button that opens
   the existing model dropdown is a small addition, but it duplicates the toolbar picker.
2. **Shortcut bar: off by default, or removed?** The plan turns it off and keeps the Labs toggle.
   Removing `StatusBar` entirely is also possible but loses the option.
3. **Send icon: play triangle or up arrow?** The plan follows the brand board (play triangle).
   An up arrow (`ArrowUpwardRounded`) matches ChatGPT and Claude but adds a new icon.
