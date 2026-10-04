import { useChatStore } from '~/common/stores/chat/store-chats';
import { flushDisk } from './disk-storage';
import { useChatRuns } from './chat-run';
import { useQuestionOperations } from './questions';

export function installDesktopLifecycle(): (() => void) | undefined {
  return window.sector7Desktop?.onPrepareClose(async () => {
    for (const chat of useChatStore.getState().conversations)
      if (chat._abortController) useChatStore.getState().abortConversationTemp(chat.id);
    const deadline = Date.now() + 10000;
    while (Object.keys(useChatRuns.getState().active).length || Object.keys(useQuestionOperations.getState().active).length) {
      if (Date.now() >= deadline) throw new Error('Active work has not stopped.');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await flushDisk();
  });
}
