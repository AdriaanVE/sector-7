# Conversation rail

Implemented in `.worktrees/conversation-rail` on `feat/conversation-rail`, based on the latest
local `feat/composer-minimal` commit at creation, `43d6d28` (later rebased as `a860ecd`).

The conversation navigator now sits on the left of the transcript. Two-pixel stripes replace
the large right-side tick buttons and desktop menu icon. Each user turn adds a stripe and
12 pixels of rail height. The rail stays centered in the visible chat viewport and caps at
half its height. Longer histories group contiguous turns; clicking a group opens its exact
turns. Every turn stays reachable, including the first and latest.

The highlighted stripe widens to 28 pixels with a Mako-green LED glow. Its neighbors taper
through 20, 14 and 8 pixels. Width, brightness and glow transition in 180 milliseconds when
scrolling, hovering or using keyboard focus. Rail growth takes 220 milliseconds. Reduced
motion removes transitions and preview entrance motion; forced colors retain visible stripes
without glow.

Hover and keyboard focus open a compact card with the prompt and the first text answer from
that turn. Attachment-only prompts show attachment names. Previews omit raw tools and
reasoning, and compute answer excerpts only while open. Group menus hide the preview.
Escape dismisses previews; arrow keys, Home and End keep keyboard navigation within the rail.
Narrow and touch layouts retain a 44-pixel turn-menu target.

Turn jumps align the prompt with the clipped chat viewport and disable sticking to the
latest reply. Composer resize updates the rail's available space. Switching chats remounts
the navigator so hover/menu state cannot carry over. Selection mode does not reserve a rail
gutter.

## Verification

- Navigation regression: compact rails keep one stripe per turn until the viewport cap;
  grouped rails retain complete coverage and keyboard movement.
- TypeScript projects, full lint and whitespace checks pass.
- Node 22 quality gate: 229 tests pass, 22 network tests skip. The shell's default Node 25
  cannot load the shared Node 22 `fs-ext` binary; verification uses installed Node 22 without
  rebuilding shared dependencies.
- An isolated React browser fixture uses the actual navigator and scroll provider, synthetic
  messages and Sector 7 colors. Checked 3, 8, 18, 80 and 1,000 turns, 36/96/216-pixel growth,
  viewport capping, stripe transitions, green LED styling, keyboard previews/dismissal,
  direct/group jumps, additional reply content and 360-pixel menu fit with no horizontal
  overflow. It does not save chats or call a provider.
- The running app serves another checkout. Full-app browser acceptance in this worktree and
  OS reduced-motion/forced-color rendering remain unverified. Source rules cover those
  preferences. No dev server was started or stopped.

## Simplification

The stripe button and group-menu trigger share accessibility props and one preview wrapper.
Rail height and grouping use the same stripe-spacing value. The simplified controls retain
keyboard previews and exact-turn jumps in the browser fixture. The Node 22 quality gate
passes with 229 tests and 22 vendor skips.

## Review corrections

Claude's first review identified two defects. The stripe target now matches the app theme's
hover-selector specificity, preserving the inner green LED animation without the theme's
button lift or purple ring. Group dropdowns are controlled, and regrouping or changed turn
ids close them and reset preview state. An open menu cannot leave all previews suppressed
after its trigger unmounts. Menus only render their exact-turn items while open.

The browser fixture now uses `createAppTheme` with font loading stubbed. Checked shared
controls, opening a grouped menu, resizing to change the bucket count, menu closure and
keyboard previews after regrouping. Full-app acceptance remains separate.

The PR contains only the rail changes on current `main`, after the composer PR was merged.

## Pane-edge placement

The desktop stripe rail now sits 12 pixels from the visible chat pane's left edge, next to the sidebar
divider. Its offset accounts for the centered transcript and list padding, so wider windows
leave the rail near the divider instead of pulling it toward the chat. Existing viewport
and resize observation updates its position. The preview follows the rail.

The simplify pass names the list content edge explicitly. In the running demo, the pane's
left edge was 312 pixels and the rail's left edge 324 pixels; the centered list began at
458.5 pixels. The user confirmed the new placement in the full app.

Claude approved the positioning calculation and identified two minor issues. The rail now
stays hidden until its first position measurement, avoiding a misplaced frame on chat open.
The inset caps at the list padding minus the 36-pixel target width, keeping mobile tap targets
inside the reserved gutter (4-pixel inset with 40-pixel padding).

The read-only Claude follow-up approved both corrections with no concrete introduced
regressions. Live desktop measurement retains 312/324-pixel pane/rail edges. At 360 pixels,
the rail starts at 4 pixels, its target ends at the 40-pixel content edge, and horizontal
overflow is zero. The final Node 22 quality gate passes: 229 tests, 22 vendor skips, plus
types, full lint and whitespace. Claude did not run browser tests. Pinch-zoom panning,
RTL and OS accessibility rendering remain outside this placement verification.

## Compact preview adjustment

The hover card is 272 pixels wide with 12-pixel padding, 13/12-pixel prompt/reply text and
two reply lines. Its Popper offset is 2 pixels instead of 10, keeping it beside the stripes.
The browser fixture confirms the width, text sizes and approximately 2-pixel gap. The live
server on port 3005 compiled the adjustment; an unresponsive app tab prevented another
full-app interaction check. Focus and rail navigation are unchanged.
