import { createDConversation } from '~/common/stores/chat/chat.conversation';
import { createDMessageTextContent, messageFragmentsReduceText } from '~/common/stores/chat/chat.message';
import { getConversation, useChatStore } from '~/common/stores/chat/store-chats';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { findLLMOrThrow } from '~/common/stores/llms/store-llms';
import { flushDisk } from './disk-storage';
import { acquireChatRun, hasChatRun } from './chat-run';
import { assertQuestionGeneration } from './questions';
import { pendingFunctionCalls } from './folder-tools';
import { normalizeChatConfig } from './chat-config';
import { continueAgentInput, subagentInput } from './subagent-tool';

type AgentRunner = (model: string, conversationId: string, signal: AbortSignal) => Promise<boolean>;
const runAgent: AgentRunner = async (model, conversationId, signal) =>
  (await import('../../apps/chat/editors/chat-persona')).runPersonaOnConversationHead(model, conversationId, false, signal);
const continuing = new Set<string>();

function resultFor(conversationId: string): Record<string, unknown> {
  const child = getConversation(conversationId);
  if (!child) return { conversationId, error: 'Subagent chat is unavailable.' };
  const message = child.messages.find(message => message.id === child.lastCompletedMessageId);
  const result = message ? messageFragmentsReduceText(message.fragments, '\n\n', true) : '';
  return {
    conversationId, model: child.chatConfig.llmId, status: child.lastOutcome ?? 'interrupted', result,
    ...(child.lastOutcome === 'incomplete' ? { reason: child.incompleteReason, resumable: true } : child.lastOutcome !== 'ok' ? { error: `Subagent ${child.lastOutcome ?? 'interrupted'}. Inspect its chat before retrying.`, stopped: child.lastOutcome === 'stopped' } : {}),
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
    if (existing._abortController || hasChatRun(existing.id) || continuing.has(existing.id)) throw new Error('This subagent is already running.');
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

/** Saved continuation messages reserve invocation identity before starting another child run. */
export async function continueSubagent(call: { id: string; args: string }, parentConversationId: string, signal: AbortSignal, runner: AgentRunner = runAgent): Promise<Record<string, unknown>> {
  signal.throwIfAborted();
  const parent = getConversation(parentConversationId);
  if (!parent || parent.subagent) throw new Error('Only a parent chat can continue its subagents.');
  const input = continueAgentInput.parse(JSON.parse(call.args));
  const child = getConversation(input.conversationId);
  if (!child?.subagent || child.subagent.parentConversationId !== parentConversationId) throw new Error('This subagent does not belong to the parent chat.');
  if (child._abortController || hasChatRun(child.id) || continuing.has(child.id)) throw new Error('This subagent is already running.');
  if (!parent.messages.some(message => !message.pendingIncomplete && message.fragments.some(fragment => fragment.ft === 'content' && fragment.part.pt === 'tool_invocation' && fragment.part.id === call.id && fragment.part.invocation.type === 'function_call' && fragment.part.invocation.name === 'continue_agent' && fragment.part.invocation.args === call.args)))
    throw new Error('Subagent continuation was not saved in this chat.');
  if (child.messages.some(message => message.metadata?.subagentContinuation?.parentConversationId === parentConversationId && message.metadata.subagentContinuation.invocationId === call.id)) return resultFor(child.id);
  assertQuestionGeneration(child.id);
  const message = createDMessageTextContent('user', input.message);
  message.metadata = { subagentContinuation: { parentConversationId, invocationId: call.id } };
  const reservation = acquireChatRun(child.id);
  continuing.add(child.id);
  try {
    useChatStore.getState().appendMessage(child.id, message);
    useChatStore.getState()._editConversation(child.id, { lastOutcome: 'interrupted', incompleteReason: undefined });
    await flushDisk();
    signal.throwIfAborted();
    reservation.release();
    await runner(child.chatConfig.llmId, child.id, signal);
    await flushDisk();
    return resultFor(child.id);
  } catch (error) {
    useChatStore.getState()._editConversation(child.id, { lastOutcome: signal.aborted ? 'stopped' : 'error', incompleteReason: undefined });
    await flushDisk();
    return { ...resultFor(child.id), error: error instanceof Error ? error.message : 'Subagent continuation failed.' };
  } finally { reservation.release(); continuing.delete(child.id); }
}
