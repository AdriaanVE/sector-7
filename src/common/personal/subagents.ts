import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageTextContent, messageFragmentsReduceText } from '~/common/stores/chat/chat.message';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { findLLMOrThrow } from '~/common/stores/llms/store-llms';
import { flushDisk } from './disk-storage';
import { pendingFunctionCalls } from './folder-tools';
import { normalizeChatConfig } from './chat-config';
import { subagentInput } from './subagent-tool';

type AgentRunner = (model: string, conversationId: string, signal: AbortSignal) => Promise<boolean>;
const runAgent: AgentRunner = async (model, conversationId, signal) =>
  (await import('../../apps/chat/editors/chat-persona')).runPersonaOnConversationHead(model, conversationId, false, signal);

function resultFor(conversationId: string): Record<string, unknown> {
  const child = getConversation(conversationId);
  if (!child) return { conversationId, error: 'Subagent chat is unavailable.' };
  const message = child.messages.find(message => message.id === child.lastCompletedMessageId);
  const result = message ? messageFragmentsReduceText(message.fragments, '\n\n', true) : '';
  return {
    conversationId, model: child.chatConfig.llmId, status: child.lastOutcome ?? 'interrupted', result,
    ...(child.lastOutcome !== 'ok' ? { error: `Subagent ${child.lastOutcome ?? 'interrupted'}. Inspect its chat before retrying.`, stopped: child.lastOutcome === 'stopped' } : {}),
  };
}

/** Durable child chats use the same tool authorization and cancellation path as ordinary chats. */
export async function runSubagent(call: { id: string; args: string }, parentConversationId: string, signal: AbortSignal, runner: AgentRunner = runAgent): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const parent = getConversation(parentConversationId);
  if (!parent) throw new Error('Parent chat is unavailable.');
  if (parent.subagent) throw new Error('Subagents cannot spawn nested agents.');
  const input = subagentInput.parse(JSON.parse(call.args));
  const existing = useChatStore.getState().conversations.find(chat => chat.subagent?.parentConversationId === parentConversationId && chat.subagent.invocationId === call.id);
  if (existing) {
    if (existing._abortController) throw new Error('This subagent is already running.');
    return resultFor(existing.id);
  }
  if (!parent.messages.some(message => !message.pendingIncomplete && pendingFunctionCalls(message).some(invocation => invocation.id === call.id && invocation.name === 'spawn_agent' && invocation.args === call.args)))
    throw new Error('Subagent invocation was not saved in this chat.');
  findLLMOrThrow(input.model);
  await flushDisk();
  signal.throwIfAborted();
  const child = createDConversation(parent.systemPurposeId);
  child.chatConfig = normalizeChatConfig({ llmId: input.model, effort: input.effort, tools: { webSearch: parent.chatConfig.tools.webSearch, webFetch: input.model !== 'gpt-6.1-sol' && parent.chatConfig.tools.webFetch, codeSandbox: input.model === 'gpt-6.1-sol' && parent.chatConfig.tools.codeSandbox } });
  child.subagent = { parentConversationId, invocationId: call.id };
  child.userTitle = `Subagent: ${input.description}`;
  child.messages = [createDMessageTextContent('user', input.prompt)];
  child._isIncognito = parent._isIncognito;
  useChatStore.getState().importConversation(child, false);
  const project = useFolderStore.getState().folders.find(project => project.conversationIds.includes(parentConversationId));
  if (project) useFolderStore.getState().addConversationToFolder(project.id, child.id);
  try {
    await flushDisk();
    signal.throwIfAborted();
    await runner(input.model, child.id, signal);
    await flushDisk();
    return resultFor(child.id);
  } catch (error) {
    useChatStore.getState()._editConversation(child.id, { lastOutcome: signal.aborted ? 'stopped' : 'error' });
    await flushDisk();
    return { ...resultFor(child.id), error: error instanceof Error ? error.message : 'Subagent failed.' };
  }
}
