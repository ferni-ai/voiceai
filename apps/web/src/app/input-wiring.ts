/**
 * Input Wiring
 *
 * Call control events (connect, mute, hang up, escape), swipe gestures
 * and the marketplace button.
 */

import { appState } from '../state/app.state.js';
import { relationshipStageService } from '../services/index.js';
import { controlsUI } from '../ui/controls.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { gesturesUI, initGesturesUI } from '../ui/gestures.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { marketplaceUI } from '../ui/marketplace.ui.js';
import { getSettingsMenuUI } from '../ui/settings-menu.ui.js';
import { addTrackedListener } from './init-helpers.js';
import type { AppHost } from './app-host.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Global call control events.
 */
export function wireCallControlEvents(host: AppHost): void {
  // 💚 Connection Heart - Listen for connect requests
  addTrackedListener(window, 'ferni:request-connect', () => {
    const state = appState.get('connection');
    if (state === 'disconnected' || state === 'error') {
      void host.connect();
    }
  });

  // ⌨️ Keyboard Shortcuts - Global hotkeys for power users
  addTrackedListener(window, 'ferni:toggle-mute', () => {
    if (appState.get('connection') === 'connected') {
      host.toggleMute();
    }
  });

  addTrackedListener(window, 'ferni:toggle-call', () => {
    const connectionState = appState.get('connection');
    if (connectionState === 'connected') {
      void host.disconnect();
    } else if (connectionState === 'disconnected' || connectionState === 'error') {
      void host.connect();
    }
  });

  addTrackedListener(window, 'ferni:escape', () => {
    // First check if any modal is open (they have their own escape handlers)
    const openModal = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (openModal) {
      // Let the modal handle escape itself
      return;
    }
    // If connected and no modal, end the call
    if (appState.get('connection') === 'connected') {
      void host.disconnect();
    }
  });

  // 🌅 Conversation End - Auto-disconnect after agent says goodbye
  addTrackedListener(window, 'ferni:conversation-end-disconnect', (e) => {
    if (appState.get('connection') === 'connected') {
      const detail = (e as CustomEvent<{ agentInitiated?: boolean; exitType?: string }>).detail;

      // 📞 Agent-initiated disconnect - show tactile button press
      if (detail?.agentInitiated) {
        log.info('🛑 Agent-initiated disconnect', { exitType: detail.exitType });
        controlsUI.showAgentHangupState();
      }

      void host.disconnect();
    }
  });
}

/**
 * Mobile gestures and the marketplace button.
 */
export function wireGestures(host: AppHost): void {
  // Gesture support for mobile with swipe navigation
  initGesturesUI({
    onSwipeLeft: () => {
      const next = gesturesUI.getNextPersona();
      host.selectPersona(next);
      soundUI.play('switch');
    },
    onSwipeRight: () => {
      const prev = gesturesUI.getPreviousPersona();
      host.selectPersona(prev);
      soundUI.play('switch');
    },
    onLongPress: (_element) => {
      // Could show context menu in the future
    },
    onPullDown: () => {
      // Pull-to-refresh: Show feedback and reload data from backend
      log.debug('Pull-to-refresh triggered');
      // Show subtle feedback
      messageUI.show('Refreshing...', 'info');
      // Try to sync with backend
      void relationshipStageService
        .loadFromBackend()
        .then((synced) => {
          if (synced) {
            messageUI.show('Synced with cloud', 'success');
          } else {
            messageUI.show("You're up to date", 'success');
          }
        })
        .catch(() => {
          messageUI.show("Couldn't sync", 'info');
        });
    },
    onMenuClose: () => {
      // Swipe-to-close settings menu
      const settingsMenu = getSettingsMenuUI();
      if (settingsMenu) {
        settingsMenu.hide();
      }
    },
  });

  // Marketplace button - opens agent marketplace modal
  const marketplaceBtn = document.getElementById('marketplaceBtn');
  if (marketplaceBtn) {
    addTrackedListener(marketplaceBtn, 'click', ((e: MouseEvent) => {
      e.stopPropagation(); // Prevent team roster from handling this
      void marketplaceUI.open();
    }) as EventListener);
  }
}
