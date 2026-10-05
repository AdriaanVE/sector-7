import * as z from 'zod/v4';
import type { DConversation } from '~/common/stores/chat/chat.conversation';
import { questionSchema, type Attention, type PendingQuestion } from './attention';

const invocationSchema = z.object({ pt: z.literal('tool_invocation'), id: z.string().min(1), invocation: z.object({ type: z.literal('function_call'), name: z.string(), args: z.string() }) });
const responseSchema = z.object({ pt: z.literal('tool_response'), id: z.string().min(1), error: z.union([z.boolean(), z.string()]), response: z.object({ type: z.literal('function_call'), name: z.string(), result: z.string() }) });
const pendingSchema = questionSchema.and(z.object({ invocationId: z.string().min(1), messageId: z.string().min(1), model: z.string().min(1) }));
const attentionSchema = z.object({ lastCompletedMessageId: z.string().optional().catch(undefined), lastSeenMessageId: z.string().optional().catch(undefined), lastOutcome: z.enum(['ok', 'error', 'stopped', 'interrupted', 'incomplete']).optional().catch(undefined) });

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return undefined; }
}

/** Rebuild UI state from saved calls and results. Never execute tools or rewrite provider history. */
export function normalizeQuestionHistory(chat: Pick<DConversation, 'messages' | 'pendingQuestions' | 'lastCompletedMessageId' | 'lastSeenMessageId' | 'lastOutcome'>): Attention {
  const messageCounts = new Map<string, number>();
  const invocationCounts = new Map<string, number>();
  for (const message of chat.messages) {
    messageCounts.set(message.id, (messageCounts.get(message.id) ?? 0) + 1);
    for (const fragment of message.fragments) {
      if (!fragment || !('part' in fragment) || !fragment.part || fragment.part.pt !== 'tool_invocation') continue;
      invocationCounts.set(fragment.part.id, (invocationCounts.get(fragment.part.id) ?? 0) + 1);
    }
  }
  const previous = (Array.isArray(chat.pendingQuestions) ? chat.pendingQuestions : []).flatMap(question => {
    const parsed = pendingSchema.safeParse(question);
    return parsed.success ? [parsed.data] : [];
  });
  let lastAssistantIndex = -1;
  for (const [index, message] of chat.messages.entries()) if (message.role === 'assistant') lastAssistantIndex = index;
  const pendingQuestions: PendingQuestion[] = [];
  for (const [index, message] of chat.messages.entries()) {
    if (message.role !== 'assistant' || message.pendingIncomplete || ['client-abort', 'issue', 'filter'].includes(message.generator?.tokenStopReason ?? '')) continue;
    for (const fragment of message.fragments) {
      if (!fragment || !('part' in fragment)) continue;
      const call = invocationSchema.safeParse(fragment.part);
      if (!call.success || call.data.invocation.name !== 'ask_user_question') continue;
      const input = questionSchema.safeParse(parseJson(call.data.invocation.args));
      if (!input.success) continue;
      const { id: invocationId } = call.data;
      const responses = message.fragments.flatMap(candidate => {
        if (!candidate || !('part' in candidate) || !candidate.part || candidate.part.pt !== 'tool_response' || candidate.part.id !== invocationId) return [];
        return [responseSchema.safeParse(candidate.part)];
      });
      if (!responses.length && index === lastAssistantIndex && chat.lastOutcome === 'interrupted' && chat.lastCompletedMessageId === message.id) continue;
      let answered = false;
      if (responses.length) {
        // A consumed answer cannot be acted on, even if old result metadata is damaged.
        if (index !== lastAssistantIndex) continue;
        // Errors, dismissals and malformed results are terminal, never requests for another answer.
        if (responses.length !== 1) throw new Error('Question has duplicate results. Restore a valid chat backup.');
        const response = responses[0];
        if (!response.success || response.data.error || response.data.response.name !== 'ask_user_question') continue;
        const result = z.object({ answers: z.record(z.string(), z.string().refine(answer => !!answer.trim())) }).safeParse(parseJson(response.data.response.result));
        if (!result.success || Object.keys(result.data.answers).length !== input.data.questions.length || input.data.questions.some(question => !Object.hasOwn(result.data.answers, question.id))) continue;
        answered = true;
      }
      if (!message.id || messageCounts.get(message.id) !== 1 || invocationCounts.get(invocationId) !== 1)
        throw new Error('Question identity is ambiguous. Restore a valid chat backup.');
      const generatorModel = message.generator?.mgt === 'aix' ? message.generator.aix.mId : message.generator?.name;
      const model = typeof generatorModel === 'string' && generatorModel ? generatorModel : undefined;
      const matching = previous.filter(question => question.messageId === message.id && question.invocationId === invocationId && JSON.stringify(question.questions) === JSON.stringify(input.data.questions));
      const savedModels = new Set(matching.map(question => question.model));
      const originalModel = model ?? (savedModels.size === 1 ? matching[0].model : undefined);
      if (!originalModel) throw new Error('Question model is missing. Restore a valid chat backup.');
      pendingQuestions.push({ ...input.data, invocationId, messageId: message.id, model: originalModel, ...(answered && { answered: true }) });
    }
  }
  const attention = attentionSchema.safeParse(chat);
  const fields = attention.success ? attention.data : {};
  const validAnchor = (id: string | undefined) => id && messageCounts.get(id) === 1 && chat.messages.some(message => message.id === id && message.role === 'assistant') ? id : undefined;
  const interrupted = chat.messages[lastAssistantIndex]?.pendingIncomplete ? chat.messages[lastAssistantIndex] : undefined;
  const lastCompletedMessageId = validAnchor(interrupted?.id ?? fields.lastCompletedMessageId);
  return { pendingQuestions, lastCompletedMessageId, lastSeenMessageId: validAnchor(fields.lastSeenMessageId), lastOutcome: lastCompletedMessageId ? interrupted ? 'interrupted' : fields.lastOutcome : undefined };
}
