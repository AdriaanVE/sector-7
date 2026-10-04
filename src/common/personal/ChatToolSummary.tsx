import * as React from 'react';
import { Box, Typography } from '@mui/joy';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import type { DMessageFragment } from '~/common/stores/chat/chat.fragments';
import type { Immutable } from '~/common/types/immutable.types';
import type { NativeHistory } from './native-history';
import { completedToolSummary } from './tool-display';

export function ChatToolSummary({ fragments, showAll, pending, nativeHistory, compact, children }: {
  fragments: readonly Immutable<DMessageFragment>[];
  showAll: boolean;
  pending: boolean;
  nativeHistory?: Immutable<NativeHistory>;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const summary = React.useMemo(() => completedToolSummary(fragments, showAll, pending, nativeHistory), [fragments, showAll, pending, nativeHistory]);
  if (!summary) return null;
  return <Box aria-label='Tool activity summary' sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, color: compact ? 'text.tertiary' : 'text.secondary' }}>
    {compact && <Box aria-hidden='true' sx={{ width: 16, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }} />}
    <BuildCircleIcon aria-hidden='true' sx={{ fontSize: compact ? 14 : 16, flexShrink: 0 }} />
    <Typography level={compact ? 'body-xs' : 'body-sm'} title={summary} sx={{ color: 'inherit', minWidth: 0, ...(compact ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }) }}>{summary}</Typography>
    {compact && <Box aria-hidden='true' sx={{ flex: 1, minWidth: 16, borderTop: '1px solid', borderColor: 'divider' }} />}
    {children}
  </Box>;
}
