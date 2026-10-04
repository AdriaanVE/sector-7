import { useChatRuns } from '~/common/personal/chat-run';
import { assertNoPendingQuestion, useQuestionOperations } from '~/common/personal/questions';
import { useFolderStore } from '~/common/stores/folders/store-chat-folders';
import * as React from 'react';
import { Box, Dropdown, Menu, MenuButton, MenuItem, Option, Select, Slider, Typography } from '@mui/joy';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';

import { CHAT_EFFORTS, CHAT_MODELS, CHAT_MODEL_LABELS, normalizeChatConfig } from '~/common/personal/chat-config';
import type { DConversationId } from '~/common/stores/chat/chat.conversation';
import type { OptimaBarControlMethods } from '~/common/layout/optima/bar/OptimaBarDropdown';
import { useChatStore } from '~/common/stores/chat/store-chats';
import { useConversationTitle } from '~/common/stores/chat/hooks/useConversationTitle';
import { downloadSingleChat } from '~/modules/trade/trade.client';

export function ChatBarChat(props: {
  conversationId: DConversationId | null;
  llmDropdownRef: React.Ref<OptimaBarControlMethods>;
  personaDropdownRef: React.Ref<OptimaBarControlMethods>;
}) {
  const conversation = useChatStore(state => state.conversations.find(c => c.id === props.conversationId));
  const projects = useFolderStore(state => state.folders);
  const operation = useQuestionOperations(state => props.conversationId ? state.active[props.conversationId] : undefined);
  const runActive = useChatRuns(state => !!props.conversationId && !!state.active[props.conversationId]);
  const controlsDisabled = runActive || !!conversation?._abortController || !!operation || !!conversation?.pendingQuestions?.some(question => !question.answered);
  const config = normalizeChatConfig(conversation?.chatConfig);
  const { title } = useConversationTitle(props.conversationId);
  const update = (next: typeof config) => {
    if (props.conversationId) assertNoPendingQuestion(props.conversationId);
    if (props.conversationId) useChatStore.getState()._editConversation(props.conversationId, { chatConfig: next, ...(next.llmId !== config.llmId ? { freshContainer: true } : {}) });
  };
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', minWidth: 0, minHeight: 44, py: 0.5, px: { xs: 0.5, md: 2.5 }, '& button:focus-visible, & [role="combobox"]:focus-visible, & input:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 }, '@media (forced-colors: active)': { '& :focus-visible': { outlineColor: 'Highlight' } } }}>
    <Typography level='title-sm' sx={{ flex: { xs: '1 0 100%', sm: 1 }, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'text.primary' }}>{title || 'New chat'}</Typography>
    <Select size='sm' variant='plain' sx={{ flexShrink: 0 }} disabled={controlsDisabled} aria-label='Chat model' value={config.llmId} onChange={(_, llmId) => llmId && update({ ...config, llmId })}>
      {CHAT_MODELS.map(id => <Option key={id} value={id}>{CHAT_MODEL_LABELS[id]}</Option>)}
    </Select>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, px: 1, flex: { xs: 1, sm: '0 0 auto' } }}>
      <Typography level='body-xs' sx={{ minWidth: 68, color: 'text.secondary', whiteSpace: 'nowrap' }}>Effort: {config.effort}</Typography>
      <Slider disabled={controlsDisabled} size='sm' sx={{ width: { xs: 96, md: 116 }, minWidth: 80, py: 1.5, '--Slider-thumbSize': '14px', '& .MuiSlider-mark': { width: 3, height: 3 }, '& .MuiSlider-thumb:focus-visible, & .MuiSlider-thumb.Mui-focusVisible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 3 } }} min={0} max={4} step={1} marks value={CHAT_EFFORTS.indexOf(config.effort)}
        aria-label='Reasoning effort' getAriaValueText={value => CHAT_EFFORTS[value]} valueLabelFormat={value => CHAT_EFFORTS[value]}
        onChange={(_, value) => typeof value === 'number' && update({ ...config, effort: CHAT_EFFORTS[value] })} />
    </Box>
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
        <MenuItem onClick={() => props.conversationId && useChatStore.getState()._editConversation(props.conversationId, { lastSeenMessageId: conversation?.lastCompletedMessageId, lastOutcome: 'ok' })}>Mark read</MenuItem>
        <MenuItem onClick={() => props.conversationId && useChatStore.getState().setArchived(props.conversationId, !conversation?.isArchived)}>{conversation?.isArchived ? 'Unarchive' : 'Archive'}</MenuItem>
        <MenuItem color='danger' onClick={() => props.conversationId && useChatStore.getState().deleteConversations([props.conversationId])}>Delete chat</MenuItem>
      </Menu>
    </Dropdown>
  </Box>;
}
