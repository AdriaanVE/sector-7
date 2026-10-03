import { create } from 'zustand';
import { useChatStore, getConversation } from '~/common/stores/chat/store-chats';
import { create_FunctionCallResponse_ContentFragment } from '~/common/stores/chat/chat.fragments';
import { flushDisk } from './disk-storage';
import { hasChatRun } from './chat-run';

type QuestionOperation = 'saving' | 'continuing';
export const useQuestionOperations = create<{ active: Record<string, QuestionOperation> }>(() => ({ active: {} }));
export function questionOperation(conversationId: string) { return useQuestionOperations.getState().active[conversationId]; }
function begin(conversationId: string, operation: QuestionOperation) {
  if (questionOperation(conversationId)) return false;
  useQuestionOperations.setState(state => ({ active: { ...state.active, [conversationId]: operation } })); return true;
}
function end(conversationId: string) {
  useQuestionOperations.setState(state => { const active = { ...state.active }; delete active[conversationId]; return { active }; });
}
/** IDs are unique within an invocation, so both identities are required for draft answers. */
export function questionAnswerKey(invocationId: string, questionId: string) { return JSON.stringify([invocationId, questionId]); }

export async function answerQuestions(conversationId: string, answers: Record<string, string>, dismissed = false) {
  if (hasChatRun(conversationId) || getConversation(conversationId)?._abortController || !begin(conversationId, 'saving')) return false;
  const chat = getConversation(conversationId);
  const pending = chat?.pendingQuestions?.filter(question => !question.answered) ?? [];
  if (!chat || !pending.length) { end(conversationId); return false; }
  const owned = new Set<string>();
  const invocationIds = new Set(pending.map(q => q.invocationId));
  try {
    const responses = pending.map(question => {
      const message = chat.messages.find(message => message.id === question.messageId);
      if (!message) throw new Error('Question message is missing. Restore the chat.');
      const invocationAnswers = Object.fromEntries(question.questions.map(item => [item.id, answers[questionAnswerKey(question.invocationId, item.id)] ?? '']));
      if (!dismissed && Object.values(invocationAnswers).some(answer => !answer.trim())) throw new Error('Answer every question before sending.');
      const response = create_FunctionCallResponse_ContentFragment(question.invocationId, dismissed ? 'dismissed by user' : false,
        'ask_user_question', JSON.stringify(dismissed ? { dismissed: true } : { answers: invocationAnswers }), 'client');
      owned.add(response.fId);
      return { messageId: message.id, response };
    });
    useChatStore.getState()._editConversation(conversationId, current => ({
      messages: current.messages.map(message => ({ ...message, fragments: [...message.fragments, ...responses.filter(r => r.messageId === message.id).map(r => r.response)] })),
      pendingQuestions: dismissed ? current.pendingQuestions?.filter(q => !invocationIds.has(q.invocationId)) : current.pendingQuestions?.map(question => invocationIds.has(question.invocationId) ? { ...question, answered: true } : question),
    }));
    await flushDisk(false);
    return true;
  } catch (error) {
    // Remove only this transaction's response fragments and flags. Preserve concurrent messages and edits.
    useChatStore.getState()._editConversation(conversationId, current => ({
      messages: current.messages.map(message => ({ ...message, fragments: message.fragments.filter(fragment => !owned.has(fragment.fId)) })),
      pendingQuestions: [...(current.pendingQuestions ?? []).filter(q => !invocationIds.has(q.invocationId)), ...pending],
    }));
    throw error;
  } finally { end(conversationId); }
}

export async function continueQuestions(conversationId: string, generate: () => Promise<boolean>): Promise<boolean> {
  if (!begin(conversationId, 'continuing')) return false;
  try {
    const chat = getConversation(conversationId);
    if (!chat?.pendingQuestions?.length || chat.pendingQuestions.some(q => !q.answered) || chat._abortController || hasChatRun(conversationId)) return false;
    return await generate();
  } finally { end(conversationId); }
}

export function assertNoPendingQuestion(conversationId: string) {
  if (hasChatRun(conversationId) || getConversation(conversationId)?._abortController) throw new Error('Wait for the running chat and local tools to finish before editing, retrying, branching or changing model.');
  if (questionOperation(conversationId) || getConversation(conversationId)?.pendingQuestions?.some(question => !question.answered))
    throw new Error('Wait for the answer save, or answer or dismiss the pending question before editing, retrying, branching or changing model.');
}
export function assertQuestionGeneration(conversationId: string, continuation = false) {
  if (hasChatRun(conversationId) || getConversation(conversationId)?._abortController) throw new Error('Wait for the running chat and local tools to finish before sending again.');
  const operation = questionOperation(conversationId);
  const pending = getConversation(conversationId)?.pendingQuestions;
  if (operation === 'saving' || operation === 'continuing' && !continuation || pending?.length && (!continuation || operation !== 'continuing') || pending?.some(q => !q.answered))
    throw new Error('Wait for the answer to be saved before continuing.');
}
