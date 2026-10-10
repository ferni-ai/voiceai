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

export function openEverythingConnected(): void {
  void import('./connected-life.ui.js').then(({ showConnectedLife }) => {
    void showConnectedLife({
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
