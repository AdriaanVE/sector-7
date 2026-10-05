import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import * as React from 'react';
import { Box, Dropdown, Menu, MenuButton, MenuItem, Typography } from '@mui/joy';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import { useChatConfigControl } from '~/common/personal/useChatConfigControl';
import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useConversationTitle } from '~/common/stores/chat/hooks/useConversationTitle';
import { downloadSingleChat } from '~/modules/trade/trade.client';

export function ChatBarChat(props: {
  conversationId: DConversationId | null;
}) {
  const { conversation, config, disabled: controlsDisabled, update } = useChatConfigControl(props.conversationId);
  const projects = useFolderStore(state => state.folders);
  const { title } = useConversationTitle(props.conversationId);
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0, minHeight: 44, py: 0.5, px: { xs: 0.5, md: 2.5 }, '& button:focus-visible, & [role="combobox"]:focus-visible, & input:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 }, '@media (forced-colors: active)': { '& :focus-visible': { outlineColor: 'Highlight' } } }}>
    <Typography level='title-sm' sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'text.primary' }}>{title || 'New chat'}</Typography>
    <Dropdown>
      <MenuButton aria-label='Conversation menu' size='sm' variant='plain' color='neutral' sx={{ '--IconButton-size': { xs: '40px', sm: '32px' }, minWidth: { xs: 40, sm: 32 }, px: 0.5 }}><MoreHorizIcon /></MenuButton>
      <Menu>
        {(['webSearch', 'webFetch', 'codeSandbox'] as const).map(tool => {
          const supported = tool === 'webSearch' || (tool === 'codeSandbox' ? config.llmId === 'gpt-6.1-sol' : config.llmId !== 'gpt-6.1-sol');
          return <MenuItem key={tool} disabled={controlsDisabled || !supported} role='menuitemcheckbox' aria-checked={supported && config.tools[tool]}
            onClick={() => update({ ...config, tools: { ...config.tools, [tool]: !config.tools[tool] } })}>
            {supported && config.tools[tool] ? 'On: ' : 'Off: '}{({ webSearch: 'Web search', webFetch: 'Web fetch', codeSandbox: 'Code execution' })[tool]}{!supported ? tool === 'codeSandbox' ? ' (GPT-6.1 Sol only)' : ' (Claude only)' : ''}
          </MenuItem>;
        })}
        <MenuItem onClick={() => conversation && downloadSingleChat(conversation, 'markdown')}>Export Markdown</MenuItem>
        <MenuItem onClick={() => conversation && downloadSingleChat(conversation, 'json')}>Export JSON</MenuItem>
        {projects.map(project => <MenuItem key={project.id} onClick={() => props.conversationId && useFolderStore.getState().addConversationToFolder(project.id, props.conversationId)}>Move to {project.title}</MenuItem>)}
        <MenuItem onClick={() => { if (props.conversationId) for (const project of projects) useFolderStore.getState().removeConversationFromFolder(project.id, props.conversationId); }}>Remove from project</MenuItem>
        <MenuItem onClick={() => props.conversationId && useChatStore.getState()._editConversation(props.conversationId, { lastSeenMessageId: conversation?.lastCompletedMessageId })}>Mark read</MenuItem>
        <MenuItem onClick={() => props.conversationId && useChatStore.getState().setArchived(props.conversationId, !conversation?.isArchived)}>{conversation?.isArchived ? 'Unarchive' : 'Archive'}</MenuItem>
        <MenuItem color='danger' onClick={() => props.conversationId && useChatStore.getState().deleteConversations([props.conversationId])}>Delete chat</MenuItem>
      </Menu>
    </Dropdown>
  </Box>;
}
