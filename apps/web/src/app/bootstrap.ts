/**
 * Bootstrap
 *
 * The startup sequence: crash reporting and diagnostics, special routes,
 * platform, theme, i18n, auth, then services and UI.
 */

import { visualStorytellingService } from '../services/visual-storytelling.service.js';
import { initializeAuth } from '../services/auth-init.service.js';
import { showSignInGate } from '../ui/sign-in-gate.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { initCLIAuth } from '../ui/cli-auth.ui.js';
import { initI18n } from '../i18n/index.js';
import { hideSplashScreen, initPlatform, isNative, platform } from '../utils/platform.js';
import { initializeAdmin } from './admin-route.js';
import { appRuntime } from './app-runtime-state.js';
import { setupConnectionCallbacks } from './connection-callbacks.js';
import { setupEngagementCallbacks } from './engagement-callbacks.js';
import { setupHandoffCallbacks } from './handoff-callbacks.js';
import { initializeServices } from './service-init.js';
import { promptForUserName } from './startup-checks.js';
import { initializeTheme } from './theme-init.js';
import { initializeUI } from './ui-init.js';
import type { AppHost } from './app-host.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Initialize the application.
 * Must be called after DOM is ready.
 */
export async function initializeApp(host: AppHost): Promise<void> {
  if (appRuntime.isInitialized) {
    log.warn('App already initialized');
    return;
  }

  // Initialize crash reporter FIRST for comprehensive error capture
  try {
    const { initCrashReporter } = await import('../services/crash-reporter.service.js');
    void initCrashReporter();
  } catch (e) {
    log.warn('Failed to initialize crash reporter:', e);
  }

  // Initialize disconnect diagnostics for detailed mic drop analysis
  try {
    const { initDisconnectDiagnostics, flushStoredDiagnostics } =
      await import('../services/disconnect-diagnostics.service.js');
    void initDisconnectDiagnostics();
    // Flush any diagnostics stored from previous session
    void flushStoredDiagnostics();
  } catch (e) {
    log.warn('Failed to initialize disconnect diagnostics:', e);
  }

  // Initialize offline service (service worker, sync queue)
  try {
    const { initOfflineService } = await import('../services/offline.service.js');
    void initOfflineService();
  } catch (e) {
    log.warn('Failed to initialize offline service:', e);
  }

  // Check for admin route
  if (window.location.pathname === '/admin') {
    void initializeAdmin();
    return;
  }

  // Check for CLI authentication route
  if (window.location.pathname === '/cli-auth') {
    initCLIAuth();
    return;
  }

  // DISABLED: No skeleton loading - everything visible immediately
  // initSkeletonUI();

  // Add app-loaded class immediately so everything is visible
  document.body.classList.add('app-loaded');

  try {
    // Skip intro - take users straight to the app
    // The awakening can still be triggered manually if needed

    // Initialize platform detection (Electron/iOS/Web)
    void initPlatform();
    log.info('Running on:', platform());

    // Initialize theme system first (affects all UI)
    initializeTheme();

    // Initialize i18n (internationalization) - must await before UI init
    await initI18n();

    // Check authentication - require sign-in before proceeding
    // This matches iOS behavior where users must sign in with Apple/Google
    // IMPORTANT: Must await auth initialization to restore any existing session
    const authState = await initializeAuth();
    if (!authState.isAuthenticated) {
      log.info('User not authenticated, showing sign-in gate');
      await showSignInGate();
      log.info('User signed in, continuing app initialization');
    } else {
      log.info('User already authenticated', { uid: authState.uid?.slice(0, 8) });
    }

    // Initialize visual storytelling service (fetches user's ambient preferences)
    // This integrates sleep patterns, relationship metrics, and milestones
    if (authState.uid) {
      visualStorytellingService.init(authState.uid).catch((err) => {
        log.warn({ error: err }, 'Failed to initialize visual storytelling service');
      });
    }

    // Initialize services (non-blocking)
    initializeServices();

    // Initialize UI components
    initializeUI(host);

    // Set up service callbacks
    setupServiceCallbacks(host);

    // Prompt for user name if needed
    promptForUserName();

    appRuntime.isInitialized = true;

    // Hide native splash screen on iOS/Android
    if (isNative()) {
      void hideSplashScreen(300);
    }

    // Mark entrance complete immediately (no animations to wait for)
    const avatarContainerEl = document.querySelector('.avatar-container');
    avatarContainerEl?.classList.add('entrance-complete');

    const rosterContainer = document.querySelector('.entrance-roster');
    rosterContainer?.classList.add('entrance-complete');

    // Also mark persona name as entrance-complete to ensure it stays visible
    // after persona transitions (fixes opacity: 0 stuck state bug)
    const personaNameEl = document.querySelector('.entrance-name');
    personaNameEl?.classList.add('entrance-complete');

    // CRITICAL FIX: CSS animations with fill:forwards override even !important rules.
    // We must wait for animations to finish, then cancel them and commit final styles.
    // Animation delay is 250ms + 400ms duration = 650ms total
    setTimeout(() => {
      const nameEl = document.querySelector('.entrance-name') as HTMLElement;
      if (nameEl) {
        // Cancel the CSS animation and force final styles
        nameEl.getAnimations().forEach((a) => a.cancel());
        nameEl.style.setProperty('opacity', '1', 'important');
        nameEl.style.setProperty('transform', 'none', 'important');
      }
      const subtitleEl = document.querySelector('.entrance-subtitle') as HTMLElement;
      if (subtitleEl) {
        subtitleEl.getAnimations().forEach((a) => a.cancel());
        subtitleEl.style.setProperty('opacity', '1', 'important');
        subtitleEl.style.setProperty('transform', 'none', 'important');
      }
    }, 700); // 250ms delay + 400ms duration + 50ms buffer

    // Signal entrance complete to avatar feedback system
    avatarFeedback.setEntranceComplete();
  } catch (error) {
    log.error('Initialization failed:', error);
    messageUI.show('Having trouble starting up. Try refreshing?', 'error');
  }
}

/**
 * Set up callbacks for service events.
 */
function setupServiceCallbacks(host: AppHost): void {
  setupConnectionCallbacks(host);
  setupHandoffCallbacks();
  setupEngagementCallbacks();
}
