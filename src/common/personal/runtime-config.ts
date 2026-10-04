/** Sector 7 settings apply to both chats and subagents; Codex config.toml is independent. */
export const SECTOR7_OPENAI_CONTEXT = {
  workingLimit: 400000,
  compactThreshold: 360000,
  experimentalCompaction: true,
} as const;
