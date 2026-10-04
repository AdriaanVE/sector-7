import * as React from 'react';

import { SvgIcon, SvgIconProps } from '@mui/joy';

export function OpenFolderIcon(props: SvgIconProps) {
  return <SvgIcon viewBox='0 0 24 24' {...props}>
    <g fill='none' stroke='currentColor' strokeWidth='1.75' strokeLinecap='round' strokeLinejoin='round'>
      <path d='M3 18V6a2 2 0 0 1 2-2h4l2 3h7a2 2 0 0 1 2 2v2' />
      <path d='M3 18l3-7h16l-3 7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' />
    </g>
  </SvgIcon>;
}
