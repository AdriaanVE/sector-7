import * as React from 'react';

import { optimaActions, optimaOpenPreferences, useOptimaModals } from './useOptima';

// Modals
import { AixDebuggerDialog } from '~/modules/aix/client/debugger/AixDebuggerDialog';
import { LogViewerDialog } from '~/common/logger/viewer/LoggerViewerDialog';
import { ShortcutsModal } from '../../../apps/settings-modal/ShortcutsModal';

// Lazy-loaded Modals
const SettingsModalLazy = React.lazy(() => import('../../../apps/settings-modal/SettingsModal').then(module => ({ default: module.SettingsModal })));


export function Modals(props: { suspendAutoModelsSetup?: boolean }) {

  // external state
  const { preferencesTab, showAIXDebugger, showKeyboardShortcuts, showLogger, showPreferences } = useOptimaModals();

  // derived state
  const { closeAIXDebugger, closeKeyboardShortcuts, closeLogger, closePreferences, openKeyboardShortcuts } = optimaActions();


  return <>

    {/* Overlay - Preferences Modal */}
    {showPreferences && (
      <React.Suspense fallback={null}>
        <SettingsModalLazy
          open={showPreferences}
          tab={preferencesTab}
          setTab={optimaOpenPreferences}
          onClose={closePreferences}
          onOpenShortcuts={openKeyboardShortcuts}
        />
      </React.Suspense>
    )}

    {/* Logger */}
    {showLogger && <LogViewerDialog onClose={closeLogger} />}

    {/* AIX Debugger Dialog */}
    {showAIXDebugger && <AixDebuggerDialog onClose={closeAIXDebugger} />}

    {/* Overlay Shortcuts */}
    {showKeyboardShortcuts && (
      <ShortcutsModal onClose={closeKeyboardShortcuts} />
    )}

  </>;
}