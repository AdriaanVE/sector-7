import * as React from 'react';
import { keyframes } from '@emotion/react';
import { Box, Chip, Tooltip, Typography } from '@mui/joy';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { ConversationsManager } from '~/common/chat-overlay/ConversationsManager';
import { useChatOverlayStore } from '~/common/chat-overlay/store-perchat_vanilla';
import { attentionLabel } from './attention';

const activitySpin = keyframes`from { transform: rotate(0deg); } to { transform: rotate(360deg); }`;

export function ChatAttentionIndicator({ id, isCurrent = false }: { id: string; isCurrent?: boolean }) {
  return <ChatAttention id={id} compact isCurrent={isCurrent} />;
}

export function ChatAttention({ id, compact = false, isCurrent = false }: { id: string; compact?: boolean; isCurrent?: boolean }) {
  const chat = useChatStore(state => state.conversations.find(chat => chat.id === id));
  const handler = ConversationsManager.getHandler(id);
  const activity = useChatOverlayStore(handler.conversationOverlayStore, state => state.activity);
  const attention = chat ? attentionLabel(chat, activity?.phase) : null;
  const label = compact && isCurrent && attention === 'Unread' ? null : attention;
  const stateColor = label === 'Needs your answer' ? '#FF4ECB' : label === 'Failed' ? 'danger.outlinedColor' : activity?.phase ? '#5B8CFF' : 'text.tertiary';
  if (compact) {
    const accessibleLabel = label === 'Unread' ? 'Unread reply' : label;
    const indicator = activity?.phase ? (
      <Box component='span' aria-hidden='true' sx={{
        width: 13, height: 13, boxSizing: 'border-box', borderRadius: '50%',
        border: '1.5px solid rgba(0, 255, 179, .24)', borderTopColor: '#00FFB3', borderRightColor: '#00FFB3',
        animation: `${activitySpin} 1.15s linear infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        '@media (forced-colors: active)': { borderColor: 'GrayText', borderTopColor: 'CanvasText', borderRightColor: 'CanvasText' },
      }} />
    ) : label === 'Unread' ? (
      <Box component='span' aria-hidden='true' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#A855F7', '@media (forced-colors: active)': { bgcolor: 'Highlight', forcedColorAdjust: 'none' } }} />
    ) : label === 'Needs your answer' ? <HelpOutlineRoundedIcon sx={{ fontSize: 16, color: '#FF4ECB' }} />
      : label === 'Failed' ? <ErrorRoundedIcon sx={{ fontSize: 16, color: 'danger.outlinedColor' }} />
        : label === 'Interrupted' ? <PauseRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : null;
    const slot = <Box component='span' role={label ? 'img' : undefined} aria-label={accessibleLabel || undefined} aria-hidden={!label || undefined} sx={{ width: 18, height: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', '@media (forced-colors: active)': { color: 'CanvasText', '& svg': { color: 'CanvasText' } } }}>{indicator}</Box>;
    return label ? <Tooltip title={accessibleLabel} disableInteractive>{slot}</Tooltip> : slot;
  }
  return label ? (
    <Box sx={{ display: 'grid', gap: 1, minWidth: 0, px: 1.5, py: 1.25, bgcolor: '#0C1924', border: '1px solid', borderColor: 'divider', borderLeft: '2px solid', borderLeftColor: stateColor, borderRadius: 'md' }}>
      <Chip size='sm' variant='plain' color={label === 'Failed' ? 'danger' : 'neutral'} sx={{ justifySelf: 'start', px: 0, color: stateColor }}>{label}</Chip>
      {activity?.detail && <Typography component='pre' level='body-xs' role='log' aria-live='polite' sx={{ m: 0, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'code', fontSize: '0.8125rem', lineHeight: 1.55, color: 'text.secondary' }}>{activity.detail}</Typography>}
    </Box>
  ) : null;
}
