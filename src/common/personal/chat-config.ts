import type { DModelParameterValues } from '~/common/stores/llms/llms.parameters';

export const CHAT_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ChatModel = typeof CHAT_MODELS[number];
export type ChatEffort = typeof CHAT_EFFORTS[number];
export interface ChatConfig {
  llmId: ChatModel;
  effort: ChatEffort;
  tools: { webSearch: boolean; webFetch: boolean; codeSandbox: boolean };
}

export function normalizeChatConfig(value?: Partial<ChatConfig> | null, recoveredModel?: string): ChatConfig {
  const llmId = CHAT_MODELS.find(id => id === value?.llmId || (!value?.llmId && id === recoveredModel)) ?? CHAT_MODELS[0];
  return {
    llmId,
    effort: CHAT_EFFORTS.find(effort => effort === value?.effort) ?? 'medium',
    tools: {
      webSearch: value?.tools?.webSearch !== false,
      webFetch: value?.tools?.webFetch === true,
      codeSandbox: value?.tools?.codeSandbox === true,
    },
  };
}

/** Replace the complete global parameter bag on every request. */
export function chatParameters(config: ChatConfig): DModelParameterValues {
  return {
    llmRef: config.llmId,
    llmResponseTokens: 16384,
    llmVndAntThinkingBudget: -1,
    llmVndAntEffort: config.effort,
    ...(config.tools.webSearch && { llmVndAntWebSearch: 'auto' }),
    ...(config.tools.webFetch && { llmVndAntWebFetch: 'auto' }),
    ...(config.tools.codeSandbox && { llmVndAntCodeSandbox: 'auto' }),
  };
}

