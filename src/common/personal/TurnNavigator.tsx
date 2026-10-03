import * as React from 'react';
import { Box, Button, Dropdown, Menu, MenuButton, MenuItem, Tooltip, Typography } from '@mui/joy';
import MenuIcon from '@mui/icons-material/Menu';

import type { DMessage } from '~/common/stores/chat/chat.message';
import { isTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { useScrollToBottom } from '~/common/scroll-to-bottom/useScrollToBottom';

import { chatViewportRect, findChatScrollRoot } from './conversation-viewport';
import { activeTurnIndex, turnBuckets, turnFocusIndex } from './turn-navigation';

function turnExcerpt(message: DMessage) {
  return message.fragments.filter(isTextContentFragment).map(fragment => fragment.part.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Attachment';
}

const targetSx = {
  p: 0, minWidth: 40, borderRadius: 8,
  '&:focus-visible': { outline: '2px solid', outlineColor: 'focusVisible', outlineOffset: 2 },
} as const;

export function TurnNavigator({ messages, listRef }: {
  messages: readonly DMessage[];
  listRef: React.RefObject<HTMLUListElement>;
}) {
  const turns = React.useMemo(() => messages.filter(message => message.role === 'user'), [messages]);
  const turnIds = JSON.stringify(turns.map(turn => turn.id));
  const { setStickToBottom } = useScrollToBottom();
  const [active, setActive] = React.useState('');
  const [railHeight, setRailHeight] = React.useState(240);
  const railRef = React.useRef<HTMLDivElement>(null);
  const nodesRef = React.useRef(new Map<string, HTMLElement>());
  const jumpFrameRef = React.useRef(0);

  React.useEffect(() => {
    const list = listRef.current;
    const root = findChatScrollRoot(list);
    if (!list || !root) return;
    const ids: string[] = JSON.parse(turnIds);
    const nodes = new Map(Array.from(list.querySelectorAll<HTMLElement>('[data-message-id]')).map(node => [node.dataset.messageId || '', node]));
    nodesRef.current = nodes;
    const ordered = ids.flatMap(id => { const node = nodes.get(id); return node ? [{ id, node }] : []; });
    let positions: { top: number; bottom: number }[] = [];
    let frame = 0;
    let needsMeasure = false;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const viewport = chatViewportRect(root);
      const availableHeight = Math.max(0, viewport.bottom - viewport.top);
      setRailHeight(Math.max(24, Math.min(availableHeight * .6, availableHeight - 100)));
      if (needsMeasure) {
        positions = ordered.map(({ node }) => {
          const bounds = node.getBoundingClientRect();
          return { top: bounds.top - rect.top + root.scrollTop, bottom: bounds.bottom - rect.top + root.scrollTop };
        });
        needsMeasure = false;
      }
      const top = root.scrollTop + viewport.top - rect.top;
      const bottom = root.scrollTop + viewport.bottom - rect.top;
      const index = activeTurnIndex(positions, top, bottom);
      setActive(ordered[index]?.id || '');
    };
    const schedule = (measure: boolean) => {
      needsMeasure ||= measure;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onScroll = () => schedule(false);
    const observer = new IntersectionObserver(() => schedule(false), { root, threshold: 0 });
    ordered.forEach(({ node }) => observer.observe(node));
    const resize = new ResizeObserver(() => schedule(true));
    resize.observe(root);
    resize.observe(list);
    // Changes within a row can shift anchors without changing the list's overall height.
    ordered.forEach(({ node }) => resize.observe(node));
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('scroll', onScroll);
    schedule(true);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(jumpFrameRef.current);
      observer.disconnect();
      resize.disconnect();
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.visualViewport?.removeEventListener('resize', onScroll);
      window.visualViewport?.removeEventListener('scroll', onScroll);
      nodesRef.current.clear();
    };
  }, [listRef, turnIds]);

  const jump = (turn: DMessage) => {
    const root = findChatScrollRoot(listRef.current);
    const node = nodesRef.current.get(turn.id);
    if (!root || !node) return;
    setStickToBottom(false);
    cancelAnimationFrame(jumpFrameRef.current);
    // Joy restores menu trigger focus on close. Navigate after that focus can scroll.
    jumpFrameRef.current = requestAnimationFrame(() => {
      jumpFrameRef.current = 0;
      if (!node.isConnected || findChatScrollRoot(listRef.current) !== root) return;
      setStickToBottom(false);
      // An immediate jump cannot re-enable sticking while passing the latest reply.
      root.scrollTo({ top: node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop, behavior: 'auto' });
    });
  };
  const buckets = turnBuckets(turns.length, railHeight);
  const activeIndex = turns.findIndex(turn => turn.id === active);
  const activeBucket = Math.max(0, buckets.findIndex(bucket => activeIndex >= bucket.start && activeIndex <= bucket.end));
  const menuItems = (start: number, end: number) => turns.slice(start, end + 1).map((turn, offset) => <MenuItem
    key={turn.id} onClick={() => jump(turn)} selected={active === turn.id}
    aria-label={`Turn ${start + offset + 1}: ${turnExcerpt(turn)}`}
    sx={{ minHeight: 44, alignItems: 'flex-start', whiteSpace: 'normal', gap: 1 }}
  >
    <Typography level='body-xs' sx={{ minWidth: 24, pt: .3 }}>{start + offset + 1}</Typography>
    <Typography level='body-sm' sx={{ overflowWrap: 'anywhere' }}>{turnExcerpt(turn)}</Typography>
  </MenuItem>);
  const menuSx = { maxHeight: '60vh', overflow: 'auto', width: 300, maxWidth: 'calc(100vw - 24px)' } as const;

  if (turns.length < 3) return null;
  return <Box component='li' sx={{ position: 'sticky', top: 12, height: 0, alignSelf: 'flex-end', width: 44, mr: '-52px', zIndex: 4, listStyle: 'none' }}>
    <Box component='nav' aria-label='Conversation turns' sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: .5 }}>
      <Dropdown>
        <Tooltip title='Jump to turn' placement='left'>
          <MenuButton aria-label={`Jump to turn (${turns.length} turns)`} variant='plain' sx={{ ...targetSx, minHeight: 44 }}>
            <MenuIcon fontSize='small' />
          </MenuButton>
        </Tooltip>
        <Menu placement='bottom-end' aria-label='All conversation turns' sx={menuSx}>{menuItems(0, turns.length - 1)}</Menu>
      </Dropdown>
      <Box ref={railRef} sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', '@media (pointer: coarse)': { display: 'none' } }} onKeyDownCapture={event => {
        const targets = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
        const index = event.target instanceof HTMLButtonElement ? targets.indexOf(event.target) : -1;
        const next = turnFocusIndex(event.key, index, targets.length);
        if (index >= 0 && next !== null) { event.preventDefault(); event.stopPropagation(); targets[next].focus({ preventScroll: true }); }
      }}>
        {buckets.map(({ start, end }, index) => {
          const current = activeIndex >= start && activeIndex <= end;
          const label = start === end ? `Turn ${start + 1}: ${turnExcerpt(turns[start])}` : `Turns ${start + 1} to ${end + 1}: ${turnExcerpt(turns[start])}`;
          const tick = <Box component='span' sx={{ width: current ? 22 : 14, height: 4, borderRadius: 4, bgcolor: current ? 'primary.400' : 'neutral.600' }} />;
          const sx = { ...targetSx, minHeight: 24, height: railHeight / buckets.length };
          return start === end ? <Tooltip key={turns[start].id} title={label} placement='left'>
            <Button variant='plain' aria-label={label} aria-current={current ? 'location' : undefined} tabIndex={index === activeBucket ? 0 : -1} onClick={() => jump(turns[start])} sx={sx}>{tick}</Button>
          </Tooltip> : <Dropdown key={turns[start].id}>
            <Tooltip title={`${label}. Open exact turns.`} placement='left'>
              <MenuButton variant='plain' aria-label={label} aria-current={current ? 'location' : undefined} tabIndex={index === activeBucket ? 0 : -1} sx={sx}>{tick}</MenuButton>
            </Tooltip>
            <Menu placement='left-start' aria-label={`Turns ${start + 1} to ${end + 1}`} sx={menuSx}>{menuItems(start, end)}</Menu>
          </Dropdown>;
        })}
      </Box>
    </Box>
  </Box>;
}
