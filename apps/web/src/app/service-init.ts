/**
 * Service Initialization
 *
 * Starts the background services. Nothing here may block UI
 * initialization, especially on iOS.
 */

import { checkAndClaimDemoSession, hasPendingClaim } from '../services/demo-claim.service.js';
import { getAuthToken } from '../services/firebase-auth.service.js';
import { getLocation } from '../services/geolocation.service.js';
import { initGoogleOneTap } from '../services/google-one-tap.service.js';
import { t } from '../i18n/index.js';
import { addTrackedListener } from './init-helpers.js';
import { audioService, moodService, spotifyService } from '../services/index.js';
import { detectAndSyncTimezone } from '../services/timezone.service.js';
import { toast } from '../ui/whisper.ui.js';
import { initModalCoordinator } from '../services/modal-coordinator.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Initialize all services.
 * IMPORTANT: Services should NOT block UI initialization, especially on iOS.
 */
export async function initializeServices(): Promise<void> {
  // Initialize modal coordinator FIRST - gates all popups for first-time users
  // Philosophy: "First conversation IS the onboarding"
  initModalCoordinator();

  // 🆔 CRITICAL: Ensure user profile exists early for Better Than Human memory
  // This creates the Firestore profile on first visit so we can start remembering immediately
  ensureProfileExists();

  // Initialize audio service (non-blocking - loads sounds in background)
  try {
    audioService.initialize();
  } catch (err) {
    log.warn('Audio service init failed:', err);
    // Continue anyway - sounds are nice but not critical
  }

  // Initialize mood service (connects humanizing system to UI)
  moodService.init();

  // Detect and sync user timezone (non-blocking)
  // Ensures outreach calls & notifications respect quiet hours
  void detectAndSyncTimezone()
    .then((tz) => {
      log.debug('Timezone detected:', tz);
    })
    .catch((err) => {
      log.warn('Timezone detection failed:', err);
      // Continue anyway - default timezone will be used
    });

  // 📍 "Better than Human" - Initialize location awareness (non-blocking)
  // Gets best-known location from localStorage/timezone - no permission prompt
  void getLocation()
    .then((loc) => {
      if (loc.city) {
        log.debug({ city: loc.city, source: loc.source }, '📍 Location loaded');
      } else {
        log.debug(
          { source: loc.source },
          '📍 Location: no city yet (will detect from IP on connect)'
        );
      }
    })
    .catch((err) => {
      log.debug('Location init skipped:', err);
    });

  // Initialize Spotify silently in the background
  // iTunes is the default for everyone, so no need to show Spotify status
  void spotifyService
    .initialize()
    .then((_success) => {
      // Spotify integration ready (or fell back to iTunes)
    })
    .catch((_err) => {
      // No error shown - iTunes is the default anyway
    });

  // 🎯 "Better than human" - Check for demo session to claim
  // If user came from landing page demo, claim their conversation
  if (hasPendingClaim()) {
    log.info('Pending demo claim detected - processing...');
    void checkAndClaimDemoSession(getAuthToken)
      .then((result) => {
        if (result.success && !result.alreadyClaimed) {
          // Show warm acknowledgment
          const conversation = result.conversation;
          if (conversation && conversation.highlights && conversation.highlights.length > 0) {
            toast.success('Welcome back! I remember our conversation.');
          } else {
            toast.success("Welcome! So glad you're here.");
          }
          log.info('Demo session claimed successfully');
        } else if (result.success && result.alreadyClaimed) {
          log.debug('Demo session was already claimed');
        }
      })
      .catch((err) => {
        log.warn('Demo claim failed:', err);
        // No error shown to user - not critical
      });
  }

  // 🔐 Google One-Tap Sign-In - Gentle prompt for anonymous users
  // Shows after 8 seconds, respects dismissals with progressive cooldown
  initGoogleOneTap();

  // The One-Tap service only dispatches events; confirm the outcome warmly.
  addTrackedListener(window, 'ferni:one-tap-success', () => {
    toast.success(t('auth.rememberSuccess', "Got it! I'll remember you now."));
  });
  addTrackedListener(window, 'ferni:one-tap-error', (event) => {
    const detail = (event as CustomEvent<{ error?: string }>).detail;
    log.warn('One-Tap sign-in failed:', detail?.error);
    toast.error(detail?.error ?? t('auth.somethingWentWrong', 'Something went wrong'));
  });

  // 🧠 Better Than Human: Voice ↔ App Sync
  // Track user activity in the app so voice agent knows context
  try {
    const { initAppContextTracking } = await import('../services/app-context-tracking.service.js');
    initAppContextTracking();
    log.debug('App context tracking initialized');
  } catch (err) {
    log.warn('App context tracking init failed:', err);
    // Non-critical - continue without it
  }
}

/**
 * Ensure user profile exists in Firestore (early creation for Better Than Human memory)
 * This creates the profile on first visit, BEFORE voice connection, so we can:
 * 1. Start tracking identity immediately
 * 2. Sync onboarding state across devices
 * 3. Remember the user's name from wherever they enter it
 */
async function ensureProfileExists(): Promise<void> {
  try {
    const { apiPost } = await import('../utils/api.js');
    const { getDeviceId, getUserName } = await import('../state/app.state.js');

    const deviceId = getDeviceId();
    const userName = getUserName();

    // Call the profile endpoint to ensure profile exists
    const response = await apiPost<{ success: boolean; profile: unknown }>('/api/user/profile', {
      deviceId,
      name: userName || undefined, // Don't send null
    });

    if (response.ok && response.data) {
      log.info('Profile ensured:', {
        hasName:
          !!response.data.profile &&
          typeof response.data.profile === 'object' &&
          'name' in response.data.profile,
        deviceLinked: !!deviceId,
      });
    }
  } catch (err) {
    // Non-critical - profile will be created on voice connection
    log.debug('Early profile creation skipped:', err);
  }
}
