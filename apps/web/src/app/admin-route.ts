/**
 * Admin Route
 *
 * Alternate entry for /admin: the unified Admin Portal, or the legacy
 * dashboard with ?legacy. Admin code is only loaded on this route.
 */

import { appRuntime } from './app-runtime-state.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Initialize admin dashboard (alternate route).
 * Uses the new unified Admin Portal for centralized management.
 */
export async function initializeAdmin(): Promise<void> {
  log.info('Initializing Admin Portal...');

  // Check for legacy admin route (backwards compatibility)
  const useLegacyAdmin = window.location.search.includes('legacy');

  if (useLegacyAdmin) {
    // Legacy admin dashboard (for backward compatibility)
    const appContent = document.getElementById('app') || document.body;
    // Set body to allow scrolling for admin dashboard
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    appContent.innerHTML = `
      <div id="adminDashboard" style="min-height: 100vh; background: var(--color-background-surface, #0d0d1a); color: var(--color-text-primary); overflow-y: auto; padding-bottom: 2rem;"></div>
      <a href="/" style="position: fixed; top: 1rem; left: 1rem; color: var(--color-ferni-ink); text-decoration: none; font-size: 0.875rem; z-index: var(--z-dropdown);">
        ← Back to App
      </a>
    `;
    // Admin code only loads on the admin route
    const { initAdminDashboard, injectAdminStyles } = await import('../ui/admin.ui.js');
    injectAdminStyles();
    await initAdminDashboard();
  } else {
    // New unified Admin Portal (loaded only on the admin route)
    const { initAdminPortal } = await import('../admin/index.js');
    await initAdminPortal();
  }

  appRuntime.isInitialized = true;
}
