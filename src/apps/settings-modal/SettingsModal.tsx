import * as React from 'react';

import { Box, Button } from '@mui/joy';
import KeyboardCommandKeyOutlinedIcon from '@mui/icons-material/KeyboardCommandKeyOutlined';

import type { PreferencesTabId } from '~/common/layout/optima/store-layout-optima';
import { AppBreadcrumbs } from '~/common/components/AppBreadcrumbs';
import { darkModeToggleButtonSx } from '~/common/components/DarkModeToggleButton';
import { GoodModal } from '~/common/components/modals/GoodModal';
import { useIsMobile } from '~/common/components/useMatchMedia';
import { PersonalSettings } from '~/common/personal/PersonalSettings';

const _styles = {

  // mobile: fullscreen with a scrolling form and fixed title/footer
  modalMobile: {
    flexGrow: 1,
    height: '100dvh',
    maxHeight: '100dvh',
    backgroundColor: 'background.level1',
  },

  // desktop: tuned width (keeps form rows paired, not stretched) + height-bounded so the right pane scrolls internally
  modalDesktop: {
    boxShadow: 'none',
    backgroundColor: 'background.level1',
    width: 'min(780px, 94vw)',
    maxWidth: 'min(780px, 94vw)',
    maxHeight: 'min(90dvh, 960px)',
  },

  artworkBody: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      backgroundImage: 'url(/sector-7-settings-neon.webp)',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right top',
      backgroundSize: { xs: '310px auto', sm: '440px auto' },
      opacity: { xs: 0.1, sm: 0.16 },
      pointerEvents: 'none',
    },
    '@media (forced-colors: active)': { '&::before': { display: 'none' } },
  },

  startButton: {
    display: 'flex',
    gap: 1,
    alignItems: 'center',
  },

} as const;


/** Personal settings persist locally; artwork stays behind the scrollable form. */
export function SettingsModal(props: {
  open: boolean,
  tab: PreferencesTabId,
  setTab: (index: PreferencesTabId) => void,
  onClose: () => void,
  onOpenShortcuts: () => void,
}) {

  // external state
  const isMobile = useIsMobile();

  return (
    <GoodModal
      // title='Preferences' strongerTitle
      title={
        <AppBreadcrumbs size='md' rootTitle={isMobile ? 'App' : 'Application'}>
          <AppBreadcrumbs.Leaf><b>Preferences</b></AppBreadcrumbs.Leaf>
        </AppBreadcrumbs>
      }
      open={props.open} onClose={props.onClose}
      fullscreen={isMobile}
      startButton={
        <Box sx={_styles.startButton}>

          {!isMobile && <Button variant='soft' color='neutral' onClick={props.onOpenShortcuts} startDecorator={<KeyboardCommandKeyOutlinedIcon color='primary' />} sx={darkModeToggleButtonSx}>
            Shortcuts
          </Button>}
        </Box>
      }
      unfilterBackdrop
      sx={isMobile ? _styles.modalMobile : _styles.modalDesktop}
    >

      <Box sx={_styles.artworkBody}>
        <Box sx={{ position: 'relative', p: 2, minHeight: 0, overflow: 'auto' }}><PersonalSettings /></Box>
      </Box>

    </GoodModal>
  );
}
