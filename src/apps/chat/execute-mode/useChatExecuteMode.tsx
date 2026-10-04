import * as React from 'react';

import type { ChatExecuteMode } from './execute-mode.types';
import { ExecuteModeItems } from './execute-mode.items';


export function chatExecuteModeCanAttach(chatExecuteMode: ChatExecuteMode, capabilityHasT2IEdit: boolean): boolean | 'only-images' {
  const executeMode = ExecuteModeItems[chatExecuteMode];
  if (!executeMode) return false;
  if (executeMode.canAttach === 'requires-tti-edit' && capabilityHasT2IEdit)
    return 'only-images';
  return executeMode.canAttach === true;
}


export function useChatExecuteMode() {
  const [chatExecuteMode, setChatExecuteMode] = React.useState<ChatExecuteMode>('generate-content');
  return {
    chatExecuteMode,
    setChatExecuteMode,
    chatExecuteModeSendColor: ExecuteModeItems[chatExecuteMode]?.sendColor || 'primary',
    chatExecuteModeSendLabel: ExecuteModeItems[chatExecuteMode]?.sendText || 'Send',
  };
}
