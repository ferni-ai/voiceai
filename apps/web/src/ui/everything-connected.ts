/**
 * Everything Connected
 *
 * Opens the Connected Life panel (all integrations in one place) with the
 * connect handlers for each service. Shared by the settings menu's
 * "Everything Connected" row and the "What I Do For You" connections tab.
 */

import { LINKEDIN_ENABLED } from '../config/linkedin.js';
import {
  openCalendarSettings,
  showAppleHealthSettings,
  showEightSleepSettings,
  showLinkedInSettings,
  showOuraSettings,
  showVibeController,
  showWearableSettings,
} from './lazy-screens.js';
import { triggerSpotifyLinkToggle } from './spotify.ui.js';
import { t } from '../i18n/index.js';
import { openWithLoadingShell } from './components/panel-loading-shell.js';

export function openEverythingConnected(): Promise<void> {
  // It checks every integration before it draws: the shell answers the tap meanwhile
  return openWithLoadingShell({
    label: t('menu.items.allConnections'),
    readySelector: '.connected-life-overlay',
    open: openConnectedLife,
    close: () => void import('./connected-life.ui.js').then((m) => m.hideConnectedLife()),
  });
}

function openConnectedLife(): Promise<void> {
  return import('./connected-life.ui.js').then(({ showConnectedLife }) => {
    return showConnectedLife({
      onConnectAppleHealth: () => void showAppleHealthSettings(),
      onConnectOura: () => void showOuraSettings(),
      onConnectEightSleep: () => void showEightSleepSettings(),
      onConnectWearables: () => void showWearableSettings(),
      onConnectCalendar: () => void openCalendarSettings(),
      onConnectLinkedIn: LINKEDIN_ENABLED ? () => void showLinkedInSettings() : undefined,
      onConnectSpotify: () => void triggerSpotifyLinkToggle(),
      onConnectEcobee: () => void showVibeController(), // Ecobee is in Vibe Controller
      onOpenVibeController: () => void showVibeController(),
    });
  });
}
