# Reply visibility and turn navigation

Source baseline: c1eb35c3370deb9f816c68dcc4df05a001e5303f.

Unread detection observes a one-pixel marker at the end of finished assistant content. It requires the end to fit inside the conversation's scroll viewport, browser viewport and clipping ancestors, excludes composer overlap, and requires a visible focused document. A hit test excludes ordinary covering modals. Completion identity is rechecked before saving seen state; question state remains unchanged. The observer follows the completed reply rather than every streaming chunk.

The navigator uses conversation-local anchors and height-derived contiguous buckets. First, middle and latest turns remain reachable through exact-turn and full-history menus. Desktop tick targets support Arrow Up/Down, Home/End and Enter. Touch uses the all-turn menu. Jumps run after Joy menu focus restoration and turn off auto-stick before an immediate scroll. Cleanup mode unmounts the navigator so fresh rows provide fresh anchors when it returns.

Fresh Sol 6.1 implementation and scoped simplify completed. Viewport review /tmp/ask-claude-reply-end-pQEbxLimhV/answer.md returned APPROVE. Navigator review /tmp/ask-claude-navigation-OuPvYJK3L4/answer.md requested fixes for smooth-scroll re-sticking and stale Cleanup anchors. Both were fixed; /tmp/ask-claude-navigation-fixes-F1nmH75fA3/answer.md returned APPROVE.

Checks: 148 offline tests passed,22 credential-dependent skips; five focused viewport/bucket/keyboard tests passed; root/tools types, source lint and production build passed. Full lint's default traversal included another worktree's generated assets and failed there; the same full source check passed with .worktrees/** excluded. A pre-existing impossible type comparison in the parser summary test was removed. Evidence logs: /private/tmp/sector7-navigation-final-tests.log, /private/tmp/sector7-navigation-root-lint.log, /private/tmp/sector7-navigation-tools-fixed.log, /private/tmp/sector7-navigation-fixed-build.log.

Browser checked the existing five-turn chat: rail stayed in a reserved column, first direct jump landed correctly, middle menu jump landed on turn3 at scrollTop920 after the focus fix, End+Enter reached turn5 at scrollTop2187 and stayed there. Actual dense120-turn, streaming-jump, compact/touch, Cleanup-toggle and stored unread geometry acceptance still require browser evidence. The temporary fixture and compact viewport actions were not executed because automatic approval review failed with disconnected streams. The fixture request is awaiting user approval. Pure tests do not substitute for those open runtime checks.

Full M4 and the overall plan remain active. Generated artifact ownership, remaining lifecycle/profile/restart checks and plan reconciliation remain separate work.
