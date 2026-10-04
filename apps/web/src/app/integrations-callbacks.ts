/**
 * Integrations Settings Callbacks
 *
 * Wires the "Better than Human" integrations panel to real server routes.
 * Success is only reported after the server confirms it; every failure is
 * shown to the user rather than swallowed.
 */

import { messageUI } from '../ui/message.ui.js';
import {
  getIntegrationsSettingsUI,
  type IntegrationsUICallbacks,
} from '../ui/integrations-settings.ui.js';
import { connectLinkedIn, disconnectLinkedIn } from '../services/linkedin.service.js';
import { startOAuthConnect } from '../services/oauth-connect.service.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('IntegrationsCallbacks');

/** Re-fetch status from the server and redraw the panel. */
function refreshPanel(): void {
  void getIntegrationsSettingsUI().show();
}

export function createIntegrationsCallbacks(): IntegrationsUICallbacks {
  return {
    onConnectLinkedIn: () => {
      void connectLinkedIn();
    },
    onDisconnectLinkedIn: () => {
      void disconnectLinkedIn();
    },
    // Google Calendar connects and disconnects through /auth/google/*, the
    // flow whose token store every calendar feature (and the status) reads.
    onConnectCalendar: () => {
      void startOAuthConnect('google_calendar').then((result) => {
        if (!result.success)
          messageUI.show(result.error ?? "Couldn't connect. Try again?", 'error', 4000);
      });
    },
    onDisconnectCalendar: async () => {
      const response = await apiPost<{ success?: boolean }>('/auth/google/unlink', {});
      const ok = response.ok && response.data?.success === true;
      messageUI.show(
        ok ? 'Calendar disconnected' : "Couldn't disconnect. Try again?",
        ok ? 'success' : 'error',
        ok ? 2500 : 4000
      );
      refreshPanel();
    },
    onConnectBiometrics: async (platform) => {
      const { connectBiometrics, isPlatformAvailable, getPlatformConfig } =
        await import('../services/biometrics.service.js');
      type BiometricsPlatform = Parameters<typeof connectBiometrics>[0];
      const typedPlatform = platform as BiometricsPlatform;

      if (!isPlatformAvailable(typedPlatform)) {
        const name = getPlatformConfig(typedPlatform)?.name;
        messageUI.show(
          name ? `${name} isn't available on this device` : 'Platform not available',
          'warning',
          3000
        );
        return;
      }

      log.info('Connect biometrics requested', { platform });
      const result = await connectBiometrics(typedPlatform);
      if (!result.success && result.error) {
        messageUI.show(result.error, 'error', 4000);
      }
    },
    onDisconnectBiometrics: async () => {
      const { disconnectBiometrics, fetchWearableProviders, getLinkedWearables } =
        await import('../services/biometrics.service.js');
      const linked = getLinkedWearables(await fetchWearableProviders());
      const result = await disconnectBiometrics(linked);
      messageUI.show(
        result.success ? 'Disconnected' : (result.error ?? "Couldn't disconnect. Try again?"),
        result.success ? 'success' : 'error',
        result.success ? 2500 : 4000
      );
      refreshPanel();
    },
    onConnectBanking: async () => {
      const { connectBanking } = await import('../services/banking.service.js');
      const result = await connectBanking();
      if (result.success) {
        messageUI.show('Bank connected!', 'success', 2500);
        refreshPanel();
      } else if (result.error && result.error !== 'User cancelled') {
        messageUI.show(result.error, 'error', 4000);
      }
    },
    onDisconnectBanking: async () => {
      const { disconnectBanking } = await import('../services/banking.service.js');
      const result = await disconnectBanking();
      messageUI.show(
        result.success ? 'Bank disconnected' : (result.error ?? "Couldn't disconnect. Try again?"),
        result.success ? 'success' : 'error',
        result.success ? 2500 : 4000
      );
      refreshPanel();
    },
  };
}
