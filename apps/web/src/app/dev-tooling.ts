/**
 * Dev Tooling
 *
 * Development-only console helpers (window.testSoul,
 * window.testFirstTimeUser).
 */

import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Install dev-only helpers. Call once at startup; no-op in production.
 */
export function installDevTooling(): void {
  // 🧪 Soul test utilities (available as window.testSoul in dev)
  // NOTE: Test file imported dynamically to avoid build errors
  if (import.meta.env.DEV) {
    void import('../ui/soul.test.js');
  }

  // 🧪 First-time user testing utilities (available as window.testFirstTimeUser in dev)
  // Usage: window.testFirstTimeUser.reset() - Reset to first-time user state
  //        window.testFirstTimeUser.simulate(3) - Simulate 3 conversations
  //        window.testFirstTimeUser.status() - Get current unlock status
  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).testFirstTimeUser = {
      reset: () => {
        modalCoordinator.resetToFirstTimeUser();
        log.info('Reset to first-time user. Reload the page to test.');
      },
      simulate: (count: number) => {
        modalCoordinator.simulateConversations(count);
        log.info({ count }, 'Simulated conversations. Reload the page to see changes.');
      },
      status: () => {
        const status = modalCoordinator.getFirstTimeUserStatus();
        log.info(
          {
            conversationCount: status.conversationCount,
            isFirstTimeUser: status.isFirstTimeUser,
            unlocked: status.unlockedFeatures,
            locked: status.lockedFeatures,
          },
          'First-Time User Status'
        );
        return status;
      },
    };
  }
}
