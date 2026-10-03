import { getChatLLMId } from '~/common/stores/llms/store-llms';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import type { DMessage } from '~/common/stores/chat/chat.message';
import { ConversationsManager } from '~/common/chat-overlay/ConversationsManager';
import { createTextContentFragment, isContentOrAttachmentFragment, isImageRefPart, isTextContentFragment, isZyncAssetImageReferencePart } from '~/common/stores/chat/chat.fragments';
import { getConversation } from '~/common/stores/chat/store-chats';

import type { ChatExecuteMode } from '../execute-mode/execute-mode.types';
import { textToDrawCommand } from '../commands/CommandsDraw';

import { _handleExecuteCommand, RET_NO_CMD } from './_handleExecuteCommand';
import { runImageGenerationUpdatingState } from './image-generate';
import { runPersonaOnConversationHead } from './chat-persona';


export async function _handleExecute(chatExecuteMode: ChatExecuteMode, conversationId: DConversationId, executeCallerNameDebug: string) {

  // Handle missing conversation
  if (!conversationId)
    return 'err-no-conversation';

  const chatLLMId = getConversation(conversationId)?.chatConfig.llmId ?? getChatLLMId();
  const cHandler = ConversationsManager.getHandler(conversationId);
  const initialHistory = cHandler.historyViewHeadOrThrow('handle-execute-' + executeCallerNameDebug) as Readonly<DMessage[]>;

  // Handle unconfigured
  if (!chatLLMId || !chatExecuteMode)
    return !chatLLMId ? 'err-no-chatllm' : 'err-no-chatmode';

  // handle missing last user message (or fragment)
  // note that we use the initial history, as the user message could have been displaced on the edited versions
  const lastMessage = initialHistory.length >= 1 ? initialHistory.slice(-1)[0] : null;
  const firstFragment = lastMessage?.fragments[0];
  if (!lastMessage || !firstFragment)
    return 'err-no-last-message';


  // execute a command, if the last message has one
  if (lastMessage.role === 'user') {
    const cmdRC = await _handleExecuteCommand(lastMessage.id, firstFragment, lastMessage, cHandler, chatLLMId);
    if (cmdRC !== RET_NO_CMD) return cmdRC;
  }

  // synchronous long-duration tasks, which update the state as they go
  switch (chatExecuteMode) {
    case 'generate-content':
      return await runPersonaOnConversationHead(chatLLMId, conversationId);

    case 'append-user':
      return true;

    case 'generate-image':
      // verify we were called with a single DMessageTextContent
      if (!isTextContentFragment(firstFragment))
        return false;
      const imagePrompt = firstFragment.part.text;
      cHandler.messageFragmentReplace(lastMessage.id, firstFragment.fId, createTextContentFragment(textToDrawCommand(imagePrompt)), true);

      // use additional image fragments as image inputs
      const imageInputFragments = lastMessage.fragments.slice(1)
        .filter(fragment => isContentOrAttachmentFragment(fragment) && (
          isZyncAssetImageReferencePart(fragment.part) || isImageRefPart(fragment.part)
        ));

      return await runImageGenerationUpdatingState(cHandler, imagePrompt, imageInputFragments);

    default:
      console.log('Chat execute: issue running', chatExecuteMode, conversationId, lastMessage);
      return false;
  }
}
