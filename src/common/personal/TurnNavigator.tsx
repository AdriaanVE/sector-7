import * as React from 'react';
import { keyframes } from '@emotion/react';
import { Box, Button, Dropdown, Menu, MenuButton, MenuItem, Tooltip, Typography } from '@mui/joy';
import type { SxProps } from '@mui/joy/styles/types';

import type { DMessage } from '~/common/stores/chat/chat.message';
import { isTextContentFragment } from '~/common/stores/chat/chat.fragments';
import { useScrollToBottom } from '~/common/scroll-to-bottom/useScrollToBottom';

import { chatViewportRect, findChatScrollRoot } from './conversation-viewport';
import { activeTurnIndex, turnBuckets, turnFocusIndex } from './turn-navigation';

const previewEnter = keyframes`from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: translateX(0); }`;
const stripeStep = 12;
const targetSx = {
  p: 0, minWidth: 36, width: 36, borderRadius: 4, justifyContent: 'flex-start',
  color: 'text.secondary', background: 'transparent', boxShadow: 'none', transition: 'none',
  '&:not(:disabled):not([aria-disabled="true"]):hover': { background: 'transparent', boxShadow: 'none', transform: 'none' },
  '&:focus-visible': { outline: '2px solid', outlineColor: 'focusVisible', outlineOffset: 2, boxShadow: 'none' },
} as const satisfies SxProps;
const menuSx = { maxHeight: '60vh', overflow: 'auto', width: 320, maxWidth: 'calc(100vw - 24px)' } as const;
const excerptSx = { overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' } as const;
const previewSx = {
  p: 2, width: 320, maxWidth: 'calc(100vw - 64px)', borderRadius: 14,
  bgcolor: 'background.popup', border: '1px solid', borderColor: 'neutral.700',
  boxShadow: '0 8px 32px rgba(0, 0, 0, .18)',
  animation: `${previewEnter} 140ms ease-out`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const;

function turnExcerpt(message: DMessage, limit = 180) {
  const text = message.fragments.filter(isTextContentFragment).map(fragment => fragment.part.text).join(' ').replace(/\s+/g, ' ').trim();
  if (text) return text.length > limit ? `${text.slice(0, limit).trimEnd()}...` : text;
  return message.fragments.filter(fragment => fragment.ft === 'attachment').map(fragment => fragment.title).join(', ') || 'Attachment';
}

function TurnPreview({ messages, turn, start, end }: { messages: readonly DMessage[]; turn: DMessage; start: number; end: number }) {
  const promptIndex = messages.findIndex(message => message.id === turn.id);
  let answer: DMessage | undefined;
  for (let index = promptIndex + 1; index < messages.length && messages[index].role !== 'user'; index++) {
    const message = messages[index];
    if (message.role === 'assistant' && message.fragments.some(isTextContentFragment)) { answer = message; break; }
  }
  return <Box>
    <Typography level='body-sm' sx={{ ...excerptSx, WebkitLineClamp: 2, color: 'text.primary', fontWeight: 500 }}>{turnExcerpt(turn)}</Typography>
    {answer && <Typography level='body-sm' sx={{ ...excerptSx, WebkitLineClamp: 3, color: 'text.secondary', mt: .75, lineHeight: 1.55 }}>{turnExcerpt(answer, 280)}</Typography>}
    {start !== end && <Typography level='body-xs' sx={{ mt: 1, color: 'text.tertiary' }}>Turns {start + 1}-{end + 1}. Click to choose a turn.</Typography>}
  </Box>;
}

export function TurnNavigator({ messages, listRef }: {
  messages: readonly DMessage[];
  listRef: React.RefObject<HTMLUListElement>;
}) {
  const turns = React.useMemo(() => messages.filter(message => message.role === 'user'), [messages]);
  const turnIds = JSON.stringify(turns.map(turn => turn.id));
  const { setStickToBottom } = useScrollToBottom();
  const [active, setActive] = React.useState('');
  const [hovered, setHovered] = React.useState<number | null>(null);
  const [previewBucket, setPreviewBucket] = React.useState<number | null>(null);
  const [openBucket, setOpenBucket] = React.useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [railSpace, setRailSpace] = React.useState({ height: 240, center: 200 });
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
      const height = Math.max(stripeStep, Math.floor(Math.min(availableHeight * .5, availableHeight - 96) / stripeStep) * stripeStep);
      const center = viewport.top - rect.top + availableHeight / 2;
      setRailSpace(previous => previous.height === height && previous.center === center ? previous : { height, center });
      if (needsMeasure) {
        positions = ordered.map(({ node }) => {
          const bounds = node.getBoundingClientRect();
          return { top: bounds.top - rect.top + root.scrollTop, bottom: bounds.bottom - rect.top + root.scrollTop };
        });
        needsMeasure = false;
      }
      const index = activeTurnIndex(positions, root.scrollTop + viewport.top - rect.top, root.scrollTop + viewport.bottom - rect.top);
      setActive(ordered[index]?.id || '');
    };
    const schedule = (measure: boolean) => {
      needsMeasure ||= measure;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onScroll = () => schedule(false);
    const resize = new ResizeObserver(() => schedule(true));
    resize.observe(root);
    resize.observe(list);
    // Changes within a row can shift anchors without changing the list's overall height.
    ordered.forEach(({ node }) => resize.observe(node));
    const composer = root.closest('#app-chat-panels')?.parentElement?.querySelector('[data-chat-composer]');
    if (composer) resize.observe(composer);
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('resize', onScroll);
    window.visualViewport?.addEventListener('scroll', onScroll);
    schedule(true);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(jumpFrameRef.current);
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
    setHovered(null);
    setPreviewBucket(null);
    cancelAnimationFrame(jumpFrameRef.current);
    // Joy restores menu trigger focus on close. Navigate after that focus can scroll.
    jumpFrameRef.current = requestAnimationFrame(() => {
      jumpFrameRef.current = 0;
      if (!node.isConnected || findChatScrollRoot(listRef.current) !== root) return;
      setStickToBottom(false);
      // An immediate jump cannot re-enable sticking while passing the latest reply.
      const viewport = chatViewportRect(root);
      root.scrollTo({ top: node.getBoundingClientRect().top - viewport.top + root.scrollTop, behavior: 'auto' });
    });
  };
  const buckets = turnBuckets(turns.length, railSpace.height, stripeStep);
  const bucketCount = buckets.length;
  React.useEffect(() => {
    // Regrouping can remove an open menu without sending its close event.
    setOpenBucket(null);
    setPreviewBucket(null);
    setHovered(null);
  }, [bucketCount, turnIds]);
  const railHeight = buckets.length * stripeStep;
  const activeIndex = turns.findIndex(turn => turn.id === active);
  const activeBucket = Math.max(0, buckets.findIndex(bucket => activeIndex >= bucket.start && activeIndex <= bucket.end));
  const highlighted = hovered ?? activeBucket;
  const menuItems = (start: number, end: number) => turns.slice(start, end + 1).map((turn, offset) => <MenuItem
    key={turn.id} onClick={() => jump(turn)} selected={active === turn.id}
    aria-label={`Turn ${start + offset + 1}: ${turnExcerpt(turn)}`}
    sx={{ minHeight: 44, alignItems: 'flex-start', whiteSpace: 'normal', gap: 1 }}
  >
    <Typography level='body-xs' sx={{ minWidth: 24, pt: .3 }}>{start + offset + 1}</Typography>
    <Typography level='body-sm' sx={{ overflowWrap: 'anywhere' }}>{turnExcerpt(turn)}</Typography>
  </MenuItem>);

  if (turns.length < 3) return null;
  return <Box component='li' sx={{ position: 'sticky', top: Math.max(16, railSpace.center - railHeight / 2), height: 0, flexShrink: 0, alignSelf: 'flex-start', width: 36, ml: { xs: '-36px', md: '-40px' }, zIndex: 4, listStyle: 'none', transition: 'top 220ms ease-out', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}>
    <Box component='nav' aria-label='Conversation turns'>
      <Box sx={{ display: { xs: 'block', md: 'none' }, '@media (pointer: coarse)': { display: 'block' } }}>
        <Dropdown onOpenChange={(_event, open) => setMobileMenuOpen(open)}>
          <MenuButton aria-label={`Jump to turn (${turns.length} turns)`} variant='plain' sx={{ ...targetSx, minHeight: 44, flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: '4px' }}>
            {[8, 16, 8].map((width, index) => <Box key={index} component='span' sx={{ width, height: 2, borderRadius: 1, bgcolor: 'text.secondary' }} />)}
          </MenuButton>
          <Menu placement='bottom-start' aria-label='All conversation turns' sx={menuSx}>{mobileMenuOpen && menuItems(0, turns.length - 1)}</Menu>
        </Dropdown>
      </Box>
      <Box ref={railRef} sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', height: railHeight, transition: 'height 220ms ease-out', '@media (pointer: coarse)': { display: 'none' }, '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} onKeyDownCapture={event => {
        const targets = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
        const index = event.target instanceof HTMLButtonElement ? targets.indexOf(event.target) : -1;
        const next = turnFocusIndex(event.key, index, targets.length);
        if (index >= 0 && next !== null) { event.preventDefault(); event.stopPropagation(); targets[next].focus({ preventScroll: true }); }
        if (event.key === 'Escape') { setHovered(null); setPreviewBucket(null); }
      }}>
        {buckets.map(({ start, end }, index) => {
          const current = activeIndex >= start && activeIndex <= end;
          const distance = Math.abs(index - highlighted);
          const highlightedStripe = distance === 0;
          const previewTurn = current ? turns[activeIndex] : turns[start];
          const label = start === end ? `Turn ${start + 1}: ${turnExcerpt(turns[start])}` : `Turns ${start + 1} to ${end + 1}: ${turnExcerpt(turns[start])}`;
          const tick = <Box component='span' data-turn-stripe sx={{
            width: highlightedStripe ? 28 : distance === 1 ? 20 : distance === 2 ? 14 : 8,
            height: 2, borderRadius: 1, bgcolor: highlightedStripe ? 'primary.400' : 'neutral.500',
            boxShadow: highlightedStripe ? '0 0 4px rgba(0, 255, 179, .65), 0 0 10px rgba(0, 255, 179, .28)' : 'none',
            opacity: highlightedStripe ? 1 : distance < 3 ? .7 : .45,
            transition: 'width 180ms cubic-bezier(.2, .8, .2, 1), background-color 180ms ease-out, opacity 180ms ease-out, box-shadow 180ms ease-out',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            '@media (forced-colors: active)': { bgcolor: current ? 'Highlight' : 'CanvasText', boxShadow: 'none', opacity: 1 },
          }} />;
          const sx = { ...targetSx, minHeight: stripeStep, height: stripeStep, flexShrink: 0 };
          const events = { onMouseEnter: () => setHovered(index), onMouseLeave: () => setHovered(null), onFocus: () => setHovered(index), onBlur: () => setHovered(null) };
          const targetProps = { variant: 'plain' as const, 'aria-label': label, 'aria-current': current ? 'location' as const : undefined, tabIndex: index === activeBucket ? 0 : -1, sx, ...events };
          const preview = previewBucket === index ? <TurnPreview messages={messages} turn={previewTurn} start={start} end={end} /> : '';
          const tooltipProps = {
            title: preview, open: previewBucket === index && openBucket === null,
            onOpen: () => setPreviewBucket(index), onClose: () => setPreviewBucket(previous => previous === index ? null : previous),
            placement: 'right' as const, variant: 'plain' as const, describeChild: true,
            enterDelay: 100, enterNextDelay: 0, leaveDelay: 80, sx: previewSx,
          };
          const stripe = <Tooltip key={turns[start].id} {...tooltipProps}>
            {start === end
              ? <Button {...targetProps} onClick={() => jump(turns[start])}>{tick}</Button>
              : <MenuButton {...targetProps}>{tick}</MenuButton>}
          </Tooltip>;
          return start === end ? stripe : <Dropdown key={turns[start].id} open={openBucket === index} onOpenChange={(_event, open) => { setOpenBucket(open ? index : null); if (open) setPreviewBucket(null); }}>
            {stripe}
            <Menu placement='right-start' aria-label={`Turns ${start + 1} to ${end + 1}`} sx={menuSx}>{openBucket === index && menuItems(start, end)}</Menu>
          </Dropdown>;
        })}
      </Box>
    </Box>
  </Box>;
}
