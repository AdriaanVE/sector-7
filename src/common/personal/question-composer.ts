import { getConversation } from '~/common/stores/chat/store-chats';
import { answerQuestions, continueQuestions, questionAnswerKey } from './questions';

/** Consume only a plain-text answer. Other drafts stay available for the next message. */
export async function sendComposerQuestionAnswer(conversationId: string, draft: { mode: string; text: string; hasContext: boolean }, onSaved: () => void, generate: () => Promise<boolean>): Promise<boolean | undefined> {
  const pending = getConversation(conversationId)?.pendingQuestions;
  if (!pending?.length) return undefined;
  if (pending.every(question => question.answered)) throw new Error('Your answers are saved. Click Continue on the answer card first; your draft will stay here.');
  if (draft.mode !== 'generate-content') throw new Error('Answer or dismiss the pending question before using another message mode.');
  if (draft.hasContext) throw new Error('Use the answer card to answer while keeping attachments, skills and references for your next message.');
  const answers = Object.fromEntries(pending.filter(question => !question.answered).flatMap(question => question.questions.map(item => [questionAnswerKey(question.invocationId, item.id), draft.text])));
  if (!await answerQuestions(conversationId, answers)) return false;
  onSaved();
  return await continueQuestions(conversationId, generate);
}
