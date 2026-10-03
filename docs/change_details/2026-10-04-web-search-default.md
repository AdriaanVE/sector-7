# Default web search

New chats and recovered settings without a web search preference enable Claude's native web search. Explicitly disabling search remains respected. Web fetch and hosted code execution retain their existing disabled defaults. Search uses the basic native tool through Bifrost; dynamic web tooling remains unset.

Verification: all eight chat-configuration tests pass, scoped ESLint passes, and the diff has no whitespace errors. Regression coverage includes missing/null settings, explicit search opt-out, all effort levels and basic native search parameters.
