import { useChatStore } from '~/common/stores/chat/store-chats';
import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import { addSnackbar } from '~/common/components/snackbar/useSnackbarsStore';

import { normalizeChatConfig, type ChatConfig } from './chat-config';
import { useChatRuns } from './chat-run';
import { assertNoPendingQuestion, useQuestionOperations } from './questions';


/** Shared controls keep model, effort and tool edits locked throughout a turn or question save. */
export function useChatConfigControl(conversationId: DConversationId | null) {
  const conversation = useChatStore(state => state.conversations.find(chat => chat.id === conversationId));
  const operation = useQuestionOperations(state => conversationId ? state.active[conversationId] : undefined);
  const runActive = useChatRuns(state => !!conversationId && !!state.active[conversationId]);
  const disabled = !conversation || runActive || !!conversation._abortController || !!operation || !!conversation.pendingQuestions?.some(question => !question.answered);
  const config = normalizeChatConfig(conversation?.chatConfig);

  const update = (next: ChatConfig) => {
    if (!conversationId || disabled) return;
    try {
      assertNoPendingQuestion(conversationId);
      useChatStore.getState()._editConversation(conversationId, { chatConfig: next, ...(next.llmId !== config.llmId ? { freshContainer: true } : {}) });
    } catch (error) {
      addSnackbar({ key: 'chat-config', message: error instanceof Error ? error.message : 'Chat settings could not be changed.', type: 'issue' });
    }
  };

  return { conversation, config, disabled, update };
}
