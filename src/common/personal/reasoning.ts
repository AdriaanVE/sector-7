import type { DMessage } from '~/common/stores/chat/chat.message';
import { isVoidThinkingFragment } from '~/common/stores/chat/chat.fragments';

export function filterCrossModelReasoning(history: readonly DMessage[], targetModel: string): DMessage[] {
  return history.map(message => {
    if (message.generator?.mgt !== 'aix' || message.generator.aix.mId === targetModel) return message;
    return {
      ...message,
      fragments: message.fragments.filter(fragment => !isVoidThinkingFragment(fragment)
        || (!fragment.part.textSignature && !fragment.part.redactedData)),
    };
  });
}
