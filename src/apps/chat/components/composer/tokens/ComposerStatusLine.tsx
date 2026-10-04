import * as React from 'react';

import { Box, Typography } from '@mui/joy';

import type { DPricingChatGenerate } from '~/common/stores/llms/llms.pricing';
import { formatModelsCost } from '~/common/util/costUtils';

import { tokenCountsMathAndMessage, TokenTooltip } from './TokenTooltip';


const tokenNumberFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 0 });

export const ComposerStatusLine = React.memo(function ComposerStatusLine(props: {
  direct: number;
  responseMax: number;
  limit: number;
  chatPricing?: DPricingChatGenerate;
  pending: boolean;
  compact: boolean;
}) {
  const hasContext = props.pending || props.limit > 0;
  if (!hasContext) return null;

  const total = props.direct + props.responseMax;
  const { message, costMin } = tokenCountsMathAndMessage(props.limit, props.direct, 0, props.responseMax, props.chatPricing);
  const color = props.limit > 0 && !props.pending
    ? total > props.limit ? 'danger' : total >= props.limit * 0.8 ? 'warning' : 'primary'
    : 'primary';
  const showCost = !props.compact && !props.pending && costMin !== undefined && costMin >= 0.01;
  const tooltip = props.pending ? 'Updating context estimate...'
    : `Estimated context, including output and thinking reserve. Uses tiktoken fallback.\n\n${message}`;

  return (
    <TokenTooltip color={color} message={tooltip} placement='top-end'>
      <Box tabIndex={0} sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: { xs: 0.5, sm: 0.75 },
        minWidth: 0, color: 'text.tertiary', cursor: 'help', mt: 0.25,
        '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 },
      }}>
        <Typography level='body-xs' sx={{
          fontSize: '0.6875rem', fontFamily: 'code', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0,
          color: color === 'primary' ? 'text.tertiary' : `${color}.plainColor`,
        }}>
          {props.pending ? '...' : `${tokenNumberFormat.format(total).toLowerCase()} / ${tokenNumberFormat.format(props.limit).toLowerCase()}`}
        </Typography>
        {showCost && <>
          <Typography level='body-xs' sx={{ color: 'text.tertiary' }}>·</Typography>
          <Typography level='body-xs' sx={{ fontSize: '0.6875rem', color: 'text.tertiary', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatModelsCost(costMin)}</Typography>
        </>}
      </Box>
    </TokenTooltip>
  );
});
