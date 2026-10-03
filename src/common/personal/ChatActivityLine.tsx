import * as React from 'react';
import { keyframes } from '@emotion/react';
import { Box, Typography } from '@mui/joy';
import { ConversationsManager } from '~/common/chat-overlay/ConversationsManager';
import { useChatOverlayStore } from '~/common/chat-overlay/store-perchat_vanilla';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { toolActivityLabel } from './tool-display';

const spin = keyframes`to { transform: rotate(360deg); }`;
const arrive = keyframes`from { opacity: .5; color: #A855F7; } to { opacity: 1; color: #99D6C5; }`;
const pulse = keyframes`0%, 100% { text-shadow: 0 0 4px rgba(0,255,179,.12); } 50% { text-shadow: 0 0 10px rgba(0,255,179,.3); }`;

export function ChatActivityLine({ conversationId }: { conversationId: string }) {
  const handler = ConversationsManager.getHandler(conversationId);
  const activity = useChatOverlayStore(handler.conversationOverlayStore, state => state.activity);
  const message = useChatStore(state => state.conversations.find(chat => chat.id === conversationId)?.messages.find(message => message.id === activity?.opId));
  const folders = useFolderStore(state => state.folders.find(project => project.conversationIds.includes(conversationId))?.connectedFolders);
  if (!activity) return null;
  const label = toolActivityLabel(message?.fragments || [], activity.phase, { folders, toolId: activity.toolId });
  return <Box component='li' aria-label='Current activity' sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, px: 2, py: 1.5, color: 'text.secondary' }}>
    <Box component='span' aria-hidden='true' sx={{
      width: 13, height: 13, flexShrink: 0, borderRadius: '50%', boxSizing: 'border-box',
      border: '1.5px solid rgba(0, 255, 179, .22)', borderTopColor: '#00FFB3',
      animation: `${spin} 1.2s linear infinite`, boxShadow: '0 0 8px rgba(0,255,179,.25)',
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      '@media (forced-colors: active)': { boxShadow: 'none', borderColor: 'GrayText', borderTopColor: 'CanvasText' },
    }} />
    <Typography component='span' level='body-sm' role='status' aria-live='polite' aria-atomic='true' title={label} sx={{
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, color: '#99D6C5',
      animation: `${pulse} 2.8s ease-in-out infinite`,
      '@media (prefers-reduced-motion: reduce)': { animation: 'none', textShadow: 'none' },
      '@media (forced-colors: active)': { animation: 'none', textShadow: 'none', color: 'CanvasText' },
    }}><Box component='span' key={label} sx={{ animation: `${arrive} 160ms ease-out`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' }, '@media (forced-colors: active)': { animation: 'none' } }}>{label}</Box></Typography>
  </Box>;
}
