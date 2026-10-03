# Completed tool summaries

User requested compact completed tool summaries matching the Codex layout.

Assistant messages retain a muted icon and deduplicated line such as "Read files, ran commands, searched the web". Local tool responses, command receipt statuses and durable Claude native tool records supply the summary. No raw arguments, output or inferred answer claims are displayed. Failed, stopped and incomplete work use distinct labels. Pending work uses the existing animated activity line; enabling full tool details suppresses summaries.

Tool-only intermediate assistant rounds remain visible as summaries. Native search summaries survive clean parser/reassembler completion, which removes transient progress placeholders. The renderer reads saved provider history without changing it. Text wraps on narrow views.

Fresh Sol 6.1 implementation and scoped simplify complete. Initial Claude review /tmp/ask-claude-tool-summary-09myU5bCGf/answer.md requested changes for progress cleanup and native labels; these were corrected using native-history fallback, chat-list visibility and actual parser completion tests. Final /tmp/ask-claude-summary-final-bExzwkpokC/answer.md returned APPROVE. 17 summary tests pass, including actual SSE/JSON parsing and stopped native labels. Latest combined full suite:143 passes,22 credential-dependent skips. Final production build passed. Browser verified saved local listing/command and native web search summaries after restart; citations remained visible.

This is a display projection; encrypted/native history, tool execution, questions and detailed logs remain authoritative and unchanged. Future provider adapters without durable native tool records require their own summary integration.
