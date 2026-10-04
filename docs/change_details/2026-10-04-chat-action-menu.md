# Chat action menu

The active chat row uses one three-dot menu instead of a separate action-icon row. The trigger
appears on hover, keyboard focus or while its menu is open, and remains visible on touch
screens. Folder assignment, rename, automatic title, duplicate and export keep their actions.
Delete retains confirmation and Shift-click deletion.

Rename and folder assignment wait for the menu to restore focus before opening their editors.
Folder assignment anchors to the persistent menu button. Delete confirmation keeps the same
focused menu item mounted; closing the menu or deactivating the chat clears confirmation.

The menu uses 13px text, 17px icons, inset rounded rows, a soft hover wash and an inset mako
keyboard focus ring. Touch keeps 44px targets; reduced motion removes transitions. These
styles apply only to the chat action menu and follow Claude's frontend-skill recommendation.

Verification: browser checks cover hover/focus visibility, rename focus/save, folder popup,
export, and delete cancel/confirm including keyboard focus retention. Test fixtures intercept
workspace writes. The full pre-commit quality gate passed with 222 tests and 22 network skips.
Claude reviewed the final behavior fixes and returned APPROVE with no blocking defects.
