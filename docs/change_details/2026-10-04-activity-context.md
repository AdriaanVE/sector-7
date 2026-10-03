# Activity context

The single activity line identifies the current file by connected folder and relative path. Project search includes its query and folder. Terminal work includes its connected working folder and a fixed safe task name when recognized. Native web search shows its query; web fetch shows the URL origin and path, excluding credentials, query strings and fragments.

Long context stays on one line with visual ellipsis, a full concise accessible label and a hover title. Multiple tool calls retain the exact active invocation. Partial inputs fall back to the current activity. Shell scripts, environment values, arbitrary arguments and tool output remain out of the line. Saved tool history and the existing motion/accessibility preferences are unchanged.

Verification: all ten activity-display regression tests pass, scoped ESLint passes, the installed TypeScript checker passes, and the diff has no whitespace errors.

Desktop Settings stays in the navigation rail, with its duplicate sidebar button removed. The mobile sidebar retains Settings because mobile has no rail. The static one-pixel composer border and a Mako/violet travelling highlight share the same edge and rounded corners. Clicking or entering focus starts a single two-second pass; it fades out at the end and cancels on blur. No animation continues while idle; reduced-motion preferences use the existing static focus glow and forced colors preserve the focus border.

The full offline suite passed104tests with22credential-gated skips. Root/tools TypeScript and production build lint passed. Fresh simplify passes and independent Docker Claude reviews were completed; review fixes remove the redundant live-region label, sanitize directional controls and unify the border geometry. Desktop browser inspection shows one Settings entry, preserved native search citations and the updated composer. Mobile retains Settings at the same899pxboundary. Browser verification confirmed the highlight ends at opacity0and dashoffset-100 after its two-second pass. Creating UI preview opened its firstchat and expanded the project; cancel created nothing and editing kept the count atone. The final review also corrected modal focus restoration, localized border interaction state and uniform1pxcorner geometry; follow-up Claude approved.

Saving a newly created project opens and activates its first empty chat and expands the project in the sidebar. Editing an existing project does not create a chat. Cancelling the editor still creates nothing.
