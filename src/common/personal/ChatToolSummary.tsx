import * as React from 'react';
import { Box, Typography } from '@mui/joy';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import type { DMessageFragment } from '~/common/stores/chat/chat.fragments';
import type { Immutable } from '~/common/types/immutable.types';
import type { NativeHistory } from './native-history';
import { completedToolSummary } from './tool-display';

export function ChatToolSummary({ fragments, showAll, pending, nativeHistory }: {
  fragments: readonly Immutable<DMessageFragment>[];
  showAll: boolean;
  pending: boolean;
  nativeHistory?: Immutable<NativeHistory>;
}) {
  const summary = React.useMemo(() => completedToolSummary(fragments, showAll, pending, nativeHistory), [fragments, showAll, pending, nativeHistory]);
  if (!summary) return null;
  return <Box aria-label='Tool activity summary' sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0, color: 'text.secondary' }}>
    <BuildCircleIcon aria-hidden='true' sx={{ fontSize: 16, mt: '2px', flexShrink: 0 }} />
    <Typography level='body-sm' sx={{ color: 'inherit', minWidth: 0, overflowWrap: 'anywhere' }}>{summary}</Typography>
  </Box>;
}
