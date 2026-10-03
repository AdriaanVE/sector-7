import * as React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { themeZIndexDesktopNav } from '~/common/app.theme';
import { Box, IconButton, Tooltip } from '@mui/joy';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsIcon from '@mui/icons-material/Settings';
import { PanelGroup } from 'react-resizable-panels';

import { GlobalDragOverlay } from '~/common/components/dnd-dt/GlobalDragOverlay';
import { Is } from '~/common/util/pwaUtils';
import { checkVisibleNav, navItems } from '~/common/app.nav';
import { useBrowserTranslationWarning } from '~/common/components/useIsBrowserTranslating';
import { useGlobalShortcuts } from '~/common/components/shortcuts/useGlobalShortcuts';
import { useIsMobile } from '~/common/components/useMatchMedia';
import { usePWADesktopModeWarning } from '~/common/components/useIsBrowserInPWADesktop';
import { useUIPreferencesStore } from '~/common/stores/store-ui';

import { ScratchClip } from './scratchclip/ScratchClip';
import { scratchClipSupported } from './scratchclip/store-scratchclip';
import { useGlobalClipboardSaver } from './scratchclip/useGlobalClipboardSaver';

import { DesktopDrawer } from './drawer/DesktopDrawer';


import { MobileDrawer } from './drawer/MobileDrawer';

import { Modals } from './Modals';
import { PageWrapper } from './PageWrapper';
import { optimaActions, optimaOpenModels, optimaOpenPreferences, optimaToggleDrawer, optimaTogglePanel, useOptimaDrawerOpen } from './useOptima';


// this undoes the PanelGroup styling on mobile, as it's not needed
// NOTE: there may be benefits with the PanelGroup layout, namely that
// it's already 100% x 100% and doesn't scroll, so there would be no
// chance of overflow, and outer limits are set here
const undoPanelGroupSx: React.CSSProperties = {
  display: 'block',
  marginLeft: undefined,
  marginRight: undefined,
  width: undefined,
  height: undefined,
  overflow: undefined,
};


/**
 * Core layout of big-AGI, used by all the Primary applications therein.
 *
 * Main functions:
 *  - modern responsive layout
 *  - core layout of the application, with the Nav, Panes, PageBar, etc.
 *    - the child(ren) of this layout are placed in the main content area
 *  - allows for pluggable components of children applications, via usePluggableOptimaLayout
 *  - overlays and displays various modals
 *  - flicker free
 */
export function OptimaLayout(props: { suspendAutoModelsSetup?: boolean, children: React.ReactNode }) {

  // external state
  const { route } = useRouter();
  const isMobile = useIsMobile();
  const drawerOpen = useOptimaDrawerOpen();

  // external: clipboard snippet support
  const supportsClip = scratchClipSupported();
  useGlobalClipboardSaver(supportsClip);

  // derived state
  const currentApp = navItems.apps.find(item => item.route === route);

  // global warnings
  const translationWarning = useBrowserTranslationWarning();
  const pwaDesktopModeWarning = usePWADesktopModeWarning();

  // global shortcuts for Optima
  useGlobalShortcuts('OptimaApp', React.useMemo(() => [
    // Preferences & Model dialogs
    { key: ',', ctrl: true, action: optimaOpenPreferences },

    { key: 'g', ctrl: true, shift: true, action: optimaActions().openLogger },
    { key: 'a', ctrl: true, shift: true, action: optimaActions().toggleAIXDebugger },
    // Font Scale
    { key: '+', ctrl: true, shift: true, action: useUIPreferencesStore.getState().increaseContentScaling },
    { key: '-', ctrl: true, shift: true, action: useUIPreferencesStore.getState().decreaseContentScaling },
    // Shortcuts
    { key: Is.OS.MacOS ? '/' : '?', ctrl: true, shift: true, action: optimaActions().openKeyboardShortcuts },
    { key: 'h', ctrl: true, shift: true, action: '_specialPrintShortcuts' },
    // Layout
    { key: '(', ctrl: true, shift: true, action: () => optimaToggleDrawer() },

  ], []));

  return <>

    {/* Global Warnings */}
    {translationWarning}
    {pwaDesktopModeWarning}

    <PanelGroup direction='horizontal' id='root-layout' style={isMobile ? undoPanelGroupSx : undefined}>


      {/* Desktop: 4 horizontal sections: Nav | Drawer | Page | Panel */}



      {!isMobile && <Box component='nav' aria-label='Main navigation' sx={{ width: 52, flexShrink: 0, position: 'relative', zIndex: themeZIndexDesktopNav, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 1, bgcolor: '#060F14', borderRight: '1px solid', borderColor: 'divider', '& button, & a': { '--IconButton-size': '36px', color: 'text.secondary', '&:hover': { transform: 'none', boxShadow: 'none', color: 'text.primary' }, '&:focus-visible': { outline: '2px solid var(--joy-palette-focusVisible)', outlineOffset: 2 } }, '@media (forced-colors: active)': { '& :focus-visible': { outlineColor: 'Highlight' } } }}>
        <Tooltip title='Chats'><IconButton component={Link} href='/' onClick={event => { if (route === '/') event.preventDefault(); }} aria-label='Chats' aria-current={route === '/' ? 'page' : undefined} variant={route === '/' ? 'soft' : 'plain'} color='neutral'><HomeOutlinedIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
        <Tooltip title='Toggle sidebar'><IconButton aria-label='Toggle sidebar' aria-expanded={drawerOpen} variant='plain' color='neutral' onClick={optimaToggleDrawer}><MenuIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title='Settings'><IconButton aria-label='Settings' variant='plain' color='neutral' onClick={() => optimaOpenPreferences()}><SettingsIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
      </Box>}
      {!isMobile && <DesktopDrawer key='optima-drawer' component='aside' currentApp={currentApp} />}

      {/*<Panel defaultSize={100}>*/}
      <PageWrapper key='app-page-wrapper' component='main' isMobile={isMobile} currentApp={currentApp}>
        {props.children}
      </PageWrapper>
      {/*</Panel>*/}




      {/* Mobile - 2 panes overlay the Page */}

      {isMobile && <MobileDrawer key='optima-drawer' component='aside' currentApp={currentApp} />}




    </PanelGroup>

    {/* Global Window Overlay */}
    {Is.Desktop && <GlobalDragOverlay />}

    {/* Overlay Modals */}
    <Modals suspendAutoModelsSetup={props.suspendAutoModelsSetup} />

    {/* Shared Clipboard History */}
    {supportsClip && <ScratchClip />}

  </>;
}
