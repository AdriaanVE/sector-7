import * as React from 'react';
import { keyframes } from '@emotion/react';
import { Box } from '@mui/joy';

const orbit = keyframes`
  0% { stroke-dashoffset: 0; opacity: 0; }
  8% { opacity: 1; }
  85% { opacity: 1; }
  100% { stroke-dashoffset: -100; opacity: 0; }
`;

/** The static border and travelling highlight share the same one-pixel edge. */
export function ComposerRim() {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [runId, setRunId] = React.useState(0);
  React.useEffect(() => {
    const frame = svgRef.current?.parentElement;
    if (!frame) return;
    const replay = () => setRunId(id => id + 1);
    const focusIn = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node && frame.contains(event.relatedTarget))) replay(); };
    const pointerDown = () => { if (frame.contains(document.activeElement)) replay(); };
    const focusOut = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node && frame.contains(event.relatedTarget))) setRunId(0); };
    frame.addEventListener('focusin', focusIn);
    frame.addEventListener('pointerdown', pointerDown);
    frame.addEventListener('focusout', focusOut);
    return () => {
      frame.removeEventListener('focusin', focusIn);
      frame.removeEventListener('pointerdown', pointerDown);
      frame.removeEventListener('focusout', focusOut);
    };
  }, []);
  const gradientId = React.useId();
  return <Box component='svg' ref={svgRef} aria-hidden='true' className='composer-rim' sx={{
    position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none',
    '& rect': { fill: 'none', width: 'calc(100% - 1px)', height: 'calc(100% - 1px)' },
    '& .composer-border': { stroke: 'rgba(168,85,247,.4)', transition: 'stroke 180ms ease-out' },
    '& .composer-highlight': { animation: `${orbit} 2.4s linear both` },
    '@media (prefers-reduced-motion: reduce)': { '& .composer-highlight': { display: 'none' }, '& .composer-border': { transition: 'none' } },
    '@media (forced-colors: active)': { display: 'none' },
  }}>
    <defs>
      <linearGradient id={gradientId} x1='0%' y1='0%' x2='100%' y2='100%'>
        <stop offset='0%' stopColor='#A855F7' />
        <stop offset='50%' stopColor='#d6b5ff' />
        <stop offset='100%' stopColor='#A855F7' />
      </linearGradient>
    </defs>
    <rect className='composer-border' x='.5' y='.5' width='100%' height='100%' rx='19.5' strokeWidth='1' />
    {runId > 0 && <rect key={runId} className='composer-highlight' x='.5' y='.5' width='100%' height='100%' rx='19.5' pathLength='100' stroke={`url(#${gradientId})`} strokeWidth='1' strokeDasharray='15 85' strokeLinecap='round' />}
  </Box>;
}
