import * as z from 'zod/v4';
import type { DMessage } from '~/common/stores/chat/chat.message';
import { isContentFragment, isToolInvocationPart, isToolResponsePart, isVoidThinkingFragment, isVoidPlaceholderFragment } from '~/common/stores/chat/chat.fragments';

export const questionSchema = z.object({ questions: z.array(z.object({
  id: z.string().min(1).max(64), text: z.string().min(1).max(4000),
  choices: z.array(z.string().min(1).max(1000)).max(5).optional(),
})).min(1).max(3) }).superRefine((value, ctx) => {
  if (new Set(value.questions.map(question => question.id)).size !== value.questions.length) ctx.addIssue({ code: 'custom', message: 'Question IDs must be unique.' });
});
export type QuestionInput = z.infer<typeof questionSchema>;
export type PendingQuestion = QuestionInput & { invocationId: string; messageId: string; model: string; answered?: boolean };
export type Outcome = 'ok' | 'error' | 'stopped' | 'interrupted' | 'incomplete';
export type IncompleteReason = 'repeat-guard' | 'round-limit' | 'idle-timeout';
export type Phase = 'Stopping' | 'Connecting' | 'Thinking' | 'Searching' | 'Running code' | 'Listing files' | 'Reading files' | 'Editing files' | 'Running command' | 'Running subagent' | 'Responding';
export interface Attention { lastCompletedMessageId?: string; lastSeenMessageId?: string; lastOutcome?: Outcome; incompleteReason?: IncompleteReason; pendingQuestions?: PendingQuestion[] }
export function attentionLabel(attention: Attention, working?: Phase | null): string | null {
  if (working) return working;
  if (attention.pendingQuestions?.some(question => !question.answered)) return 'Needs your answer';
  if (attention.lastOutcome === 'incomplete') return 'Paused';
  if (attention.lastOutcome === 'error' || attention.lastOutcome === 'interrupted') return attention.lastOutcome === 'error' ? 'Failed' : 'Interrupted';
  if (attention.lastCompletedMessageId && attention.lastCompletedMessageId !== attention.lastSeenMessageId) return 'Unread';
  return null;
}
export function canMarkSeen(endVisible: boolean, documentVisible: boolean, focused: boolean) { return endVisible && documentVisible && focused; }
export function questionInvocations(message: DMessage, model: string): PendingQuestion[] {
  if (message.pendingIncomplete || ['client-abort', 'issue', 'filter'].includes(message.generator?.tokenStopReason ?? '')) return [];
  const answered = new Set(message.fragments.filter(isContentFragment).filter(fragment => isToolResponsePart(fragment.part)).map(fragment => 'id' in fragment.part ? fragment.part.id : ''));
  return message.fragments.filter(isContentFragment).flatMap(fragment => {
    if (!isToolInvocationPart(fragment.part) || fragment.part.invocation.type !== 'function_call' || fragment.part.invocation.name !== 'ask_user_question' || answered.has(fragment.part.id)) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(fragment.part.invocation.args); } catch { throw new Error('The model supplied an incomplete question. Retry the message.'); }
    const result = questionSchema.safeParse(parsed);
    if (!result.success) throw new Error('The model supplied an invalid question. Retry the message.');
    return [{ ...result.data, invocationId: fragment.part.id, messageId: message.id, model }];
  });
}
export function messagePhase(message: Pick<DMessage, 'fragments'>): Phase {
  for (const fragment of [...message.fragments].reverse()) {
    if (isVoidPlaceholderFragment(fragment)) {
      const active = [...(fragment.part.opLog || [])].reverse().find(operation => operation.state === 'active');
      if (active?.mot === 'search-web') return 'Searching';
      if (active?.mot === 'code-exec') return 'Running code';
    }
    if (isContentFragment(fragment) && isToolInvocationPart(fragment.part)) {
      const name = fragment.part.invocation.type === 'function_call' ? fragment.part.invocation.name : 'code';
      if (name === 'folder_list') return 'Listing files';
      if (name === 'folder_read') return 'Reading files';
      if (/folder_edit|folder_write|folder_move|folder_delete/.test(name)) return 'Editing files';
      if (name === 'local_command') return 'Running command';
      if (name === 'spawn_agent' || name === 'continue_agent') return 'Running subagent';
      if (/code|bash|python/.test(name)) return 'Running code';
      if (/search|fetch/.test(name)) return 'Searching';
    }
    if (isVoidThinkingFragment(fragment)) return 'Thinking';
    if (isContentFragment(fragment) && fragment.part.pt === 'text') return 'Responding';
  }
  return 'Connecting';
}

export function unknownFunctionInvocations(message: DMessage) {
  const responded = new Set(message.fragments.filter(isContentFragment).flatMap(fragment => isToolResponsePart(fragment.part) ? [fragment.part.id] : []));
  return message.fragments.filter(isContentFragment).flatMap(fragment => isToolInvocationPart(fragment.part) && fragment.part.invocation.type === 'function_call' && fragment.part.invocation.name !== 'ask_user_question' && !responded.has(fragment.part.id)
    ? [{ id: fragment.part.id, name: fragment.part.invocation.name }] : []);
}
