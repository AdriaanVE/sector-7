import { TRPCError } from '@trpc/server';
import { CLAUDE_CHAT_MODELS, CHAT_EFFORTS } from '~/common/personal/chat-config';

export function assertServerAnthropicAccess(access: { anthropicKey: string; anthropicHost?: string | null; clientSideFetch?: boolean }, _serverKeyPresent: boolean) {
  if (access.anthropicKey || access.anthropicHost || access.clientSideFetch)
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This local app uses server-managed Bifrost credentials. Client keys, hosts and direct requests are disabled.' });
}

export function assertPersonalModel(access: { dialect: string }, model: {
  id: string; reasoningEffort?: string; vndAntThinkingBudget?: number | string | null;
  vndAntSkills?: string; vndAntInfSpeed?: string; vndAntToolSearch?: string; vndOaiResponsesAPI?: boolean;
}) {
  if (access.dialect === 'openai' && model.id === 'gpt-6.1-sol') {
    if (!CHAT_EFFORTS.some(effort => effort === model.reasoningEffort) || !model.vndOaiResponsesAPI)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'GPT-6.1 Sol requires the Responses API and a supported reasoning effort.' });
    if (model.vndAntThinkingBudget != null || model.vndAntSkills || model.vndAntInfSpeed || model.vndAntToolSearch)
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Claude parameters cannot be used with GPT-6.1 Sol.' });
    return;
  }
  if (access.dialect !== 'anthropic' || !CLAUDE_CHAT_MODELS.some(id => id === model.id))
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose Claude Opus 5.5, Sonnet 5.5 or GPT-6.1 Sol through Bifrost.' });
  if (!CHAT_EFFORTS.some(effort => effort === model.reasoningEffort) || model.vndAntThinkingBudget !== 'adaptive')
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Claude requires adaptive thinking and one of the five supported effort levels.' });
  if (model.vndAntSkills || model.vndAntInfSpeed || model.vndAntToolSearch)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Skills, fast mode and tool search are disabled in this app.' });
}


export const PERSONAL_ANTHROPIC_USER_AGENT = 'AI-GUI/0.1 (claude-code-compatible)';
export const PERSONAL_NATIVE_CAPABILITIES = { webSearch: 'web_search_20250305', webFetch: 'web_fetch_20250910', codeSandbox: false, thinkingBinding: false } as const;
export function assertPersonalHostedTools(features: { enableCodeExecution?: boolean }) {
  if (features.enableCodeExecution) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Remote code execution is unsupported by this Bifrost deployment. Web search and web fetch are available.' });
}
