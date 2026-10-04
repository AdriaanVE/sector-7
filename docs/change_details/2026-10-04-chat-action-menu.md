# Chat action menu

The active chat row uses one three-dot menu instead of a separate action-icon row. The trigger
appears on hover, keyboard focus or while its menu is open, and remains visible on touch
screens. Folder assignment, rename, automatic title, duplicate and export keep their actions.
Delete retains confirmation and Shift-click deletion. The bottom chat-data menu uses spacing
instead of the old horizontal separator.

Rename and folder assignment wait for the menu to restore focus before opening their editors.
Folder assignment anchors to the persistent menu button. Delete confirmation keeps the same
focused menu item mounted; closing the menu or deactivating the chat clears confirmation.

The menu uses 13px text, 17px icons, inset rounded rows, a contrasting hover fill with brighter
text and icons, and an inset mako keyboard focus ring. Touch keeps 44px targets; reduced
motion removes transitions. These defaults now live in the app theme and are shared by
Joy menus and controlled menu popups, including project, model/effort and chat data actions.
Project titles and paths use smaller metadata typography. Rich menu descriptions and
embedded panel lists keep their layouts. Destructive menu actions use the composer contour's
purple family, with brighter text and a tinted hover fill; error messages retain the standard
danger palette. Disabled actions keep their subdued state, and forced colors use system text
and highlight colors. Menu item styles are scoped to popup surfaces, so embedded panel lists
retain content scaling. Plain menus under a scrim retain their borderless treatment.

Verification: browser checks cover hover/focus visibility, rename focus/save, folder popup,
export, and delete cancel/confirm including keyboard focus retention. Test fixtures intercept
workspace writes. The full pre-commit quality gate passed with 228 tests and 22 network skips.
Claude approved the menu behavior and shared styles after correcting panel-list scoping
and borderless scrim treatment. A focused follow-up approved the explicit 44px touch height.
