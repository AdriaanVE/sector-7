import * as React from 'react';

import { Box, Dropdown, ListDivider, ListItemDecorator, ListSubheader, Menu, MenuButton, MenuItem, Typography } from '@mui/joy';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import { CHAT_EFFORTS, CHAT_MODELS, CHAT_MODEL_LABELS } from '~/common/personal/chat-config';
import { useChatConfigControl } from '~/common/personal/useChatConfigControl';

import type { ChatExecuteMode } from '../../execute-mode/execute-mode.types';


export function ComposerChatConfigPicker(props: {
  conversationId: DConversationId | null;
  buttonRef: React.Ref<HTMLButtonElement>;
  mode: ChatExecuteMode;
  capabilityHasT2I: boolean;
  onSetMode: (mode: ChatExecuteMode) => void;
  disabled: boolean;
}) {
  const { config, disabled, update } = useChatConfigControl(props.conversationId);
  const controlsDisabled = disabled || props.disabled;
  const label = config.llmId === 'gpt-6.1-sol' ? '6.1 Sol' : CHAT_MODEL_LABELS[config.llmId];
  const effort = config.effort === 'xhigh' ? 'XHigh' : config.effort[0].toUpperCase() + config.effort.slice(1);
  const isDraw = props.mode === 'generate-image';
  const check = (selected: boolean) => <ListItemDecorator sx={{ color: 'primary.plainColor' }}>{selected && <CheckRoundedIcon />}</ListItemDecorator>;

  return (
    <Dropdown>
      <MenuButton ref={props.buttonRef} disabled={controlsDisabled} size='sm' variant='plain' color='neutral'
        aria-label={`Model and effort: ${label}, ${config.effort}${isDraw ? ', draw mode' : ''}`}
        endDecorator={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
        sx={{ minWidth: 0, px: 0.75, gap: 0.5, whiteSpace: 'nowrap', fontSize: { xs: '0.75rem', sm: '0.875rem' },
          '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 } }}>
        {isDraw ? 'Draw' : <>
          <Box component='span' sx={{ color: 'text.secondary', fontWeight: 'md' }}>{label}</Box>
          <Box component='span' sx={{ color: 'text.tertiary', fontWeight: 'normal' }}>{effort}</Box>
        </>}
      </MenuButton>
      <Menu placement='top-end' size='sm' sx={{ minWidth: 220, maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto' }}>
        <ListSubheader sx={{ textTransform: 'none' }}>Model</ListSubheader>
        {CHAT_MODELS.map(llmId => <MenuItem key={llmId} role='menuitemradio' aria-checked={config.llmId === llmId} disabled={controlsDisabled}
          onClick={() => update({ ...config, llmId })}>{check(config.llmId === llmId)}{CHAT_MODEL_LABELS[llmId]}</MenuItem>)}
        <ListDivider />
        <ListSubheader sx={{ textTransform: 'none' }}>Effort</ListSubheader>
        {CHAT_EFFORTS.map(value => <MenuItem key={value} role='menuitemradio' aria-checked={config.effort === value} disabled={controlsDisabled}
          onClick={() => update({ ...config, effort: value })}>{check(config.effort === value)}{value === 'xhigh' ? 'XHigh' : value[0].toUpperCase() + value.slice(1)}</MenuItem>)}
        <ListDivider />
        {(['generate-content', 'generate-image'] as const).map(mode => <MenuItem key={mode} role='menuitemradio' aria-checked={props.mode === mode} disabled={controlsDisabled}
          onClick={() => props.onSetMode(mode)}>{check(props.mode === mode)}<Typography level='body-sm'>{mode === 'generate-content' ? 'Chat' : props.capabilityHasT2I ? 'Draw image' : 'Draw image (unconfigured)'}</Typography></MenuItem>)}
      </Menu>
    </Dropdown>
  );
}
