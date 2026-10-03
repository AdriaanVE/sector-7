import * as React from 'react';
import { Box, Button, Dropdown, Menu, MenuButton, MenuItem, Tooltip } from '@mui/joy';
import type { DMessage } from '~/common/stores/chat/chat.message';
import { isTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { useScrollToBottom } from '~/common/scroll-to-bottom/useScrollToBottom';

export function TurnNavigator({ messages }: { messages: readonly DMessage[] }) {
  const turns = React.useMemo(() => messages.filter(message => message.role === 'user'), [messages]);
  const { setStickToBottom } = useScrollToBottom();
  const [active, setActive] = React.useState('');
  React.useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.getAttribute('data-message-id') || '');
    }, { threshold: .1 });
    for (const turn of turns) { const node = document.querySelector(`[data-message-id="${turn.id}"]`); if (node) observer.observe(node); }
    return () => observer.disconnect();
  }, [turns]);
  const excerpt = (message: DMessage) => message.fragments.filter(isTextContentFragment).map(fragment => fragment.part.text).join(' ').slice(0, 100) || 'Attachment';
  const jump = (message: DMessage) => { setStickToBottom(false); document.querySelector(`[data-message-id="${message.id}"]`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };
  if (turns.length < 3) return null;
  const stride = Math.max(1, Math.ceil(turns.length / 60));
  return <>
    <Box sx={{ position: 'fixed', right: 12, top: '20vh', height: '60vh', width: 28, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'center', gap: '2px', zIndex: 4 }}>
      {turns.filter((_, index) => index % stride === 0).map(turn => <Tooltip key={turn.id} title={excerpt(turn)} placement='left'><Button size='sm' aria-label={`Jump to ${excerpt(turn)}`} onClick={() => jump(turn)} sx={{ p: 0, minHeight: 6, maxHeight: 8, minWidth: 24, bgcolor: active === turn.id ? 'primary.400' : 'neutral.600', borderRadius: 2 }} /></Tooltip>)}
    </Box>
    <Box sx={{ display: { xs: 'block', md: 'none' }, position: 'fixed', right: 12, top: 76, zIndex: 5 }}><Dropdown><MenuButton aria-label='Jump to turn'>Turns</MenuButton><Menu sx={{ maxHeight: '60vh', overflow: 'auto', maxWidth: 280 }}>{turns.map(turn => <MenuItem key={turn.id} onClick={() => jump(turn)}>{excerpt(turn)}</MenuItem>)}</Menu></Dropdown></Box>
  </>;
}
