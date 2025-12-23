/**
 * Google One-Tap Sign-In Service
 *
 * Provides non-intrusive Google sign-in via One-Tap prompt.
 * Integrates with Firebase Auth to link anonymous accounts.
 *
 * Philosophy: Authentication should feel like an invitation, not a gate.
 * One-Tap appears gently, respects dismissals, and never interrupts conversations.
 *
 * @module GoogleOneTapService
 */

import { createLogger } from '../utils/logger.js';
import { linkWithGoogleCredential, getAuthState, onAuthStateChange } from './firebase-auth.service.js';
import { appState } from '../state/app.state.js';

const log = createLogger('GoogleOneTap');

// ============================================================================
// TYPES
// ============================================================================

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleOneTapConfig) => void;
          prompt: (callback?: (notification: PromptNotification) => void) => void;
          cancel: () => void;
          disableAutoSelect: () => void;
          revoke: (email: string, callback: () => void) => void;
        };
      };
    };
  }
}

interface GoogleOneTapConfig {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: 'signin' | 'signup' | 'use';
  itp_support?: boolean;
  prompt_parent_id?: string;
  state_cookie_domain?: string;
  ux_mode?: 'popup' | 'redirect';
  use_fedcm_for_prompt?: boolean;
}

interface CredentialResponse {
  credential: string; // JWT ID token
  select_by: string;
  clientId?: string;
}

interface PromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
  DISMISSED_UNTIL: 'ferni_one_tap_dismissed_until',
  PROMPT_COUNT: 'ferni_one_tap_prompt_count',
} as const;

/** Cooldown periods after dismissal (progressive backoff) */
const COOLDOWN = {
  FIRST_DISMISS: 24 * 60 * 60 * 1000, // 24 hours
  SECOND_DISMISS: 7 * 24 * 60 * 60 * 1000, // 1 week
  THIRD_DISMISS: 30 * 24 * 60 * 60 * 1000, // 1 month
} as const;

/** Delay before showing prompt (let user see app first) */
const INITIAL_DELAY_MS = 8000; // 8 seconds

/** Minimum session duration before showing prompt */
const MIN_SESSION_MS = 5000;

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;
let isPromptShowing = false;
let sessionStartTime = Date.now();

// ============================================================================
// COOLDOWN MANAGEMENT
// ============================================================================

function getDismissedUntil(): number {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.DISMISSED_UNTIL);
    return value ? parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}

function getPromptCount(): number {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.PROMPT_COUNT);
    return value ? parseInt(value, 10) : 0;
  } catch {
    return 0;
  }
}

function recordDismissal(): void {
  try {
    const count = getPromptCount() + 1;
    localStorage.setItem(STORAGE_KEYS.PROMPT_COUNT, count.toString());

    let cooldown = COOLDOWN.FIRST_DISMISS;
    if (count >= 3) cooldown = COOLDOWN.THIRD_DISMISS;
    else if (count >= 2) cooldown = COOLDOWN.SECOND_DISMISS;

    const dismissedUntil = Date.now() + cooldown;
    localStorage.setItem(STORAGE_KEYS.DISMISSED_UNTIL, dismissedUntil.toString());

    log.info('One-Tap dismissed', { count, cooldownDays: cooldown / (24 * 60 * 60 * 1000) });
  } catch {
    // Private browsing - ignore
  }
}

/**
 * Check if we're in the cooldown period after a dismissal.
 */
export function isInCooldown(): boolean {
  const dismissedUntil = getDismissedUntil();
  return Date.now() < dismissedUntil;
}

/**
 * Clear the cooldown (useful for testing).
 */
export function clearCooldown(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.DISMISSED_UNTIL);
    localStorage.removeItem(STORAGE_KEYS.PROMPT_COUNT);
    log.info('One-Tap cooldown cleared');
  } catch {
    // Ignore
  }
}

// ============================================================================
// ELIGIBILITY CHECKS
// ============================================================================

function shouldShowOneTap(): boolean {
  // 1. Check if GIS is loaded
  if (!window.google?.accounts?.id) {
    log.debug('GIS not loaded');
    return false;
  }

  // 2. Check if client ID is configured
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    log.debug('Google Client ID not configured');
    return false;
  }

  // 3. Check if user is anonymous (not already linked)
  const authState = getAuthState();
  if (authState.isLinked) {
    log.debug('User already has linked account');
    return false;
  }

  // 4. Check cooldown
  if (isInCooldown()) {
    log.debug('In cooldown period');
    return false;
  }

  // 5. Check if prompt is already showing
  if (isPromptShowing) {
    log.debug('Prompt already showing');
    return false;
  }

  // 6. Check if in voice conversation (NEVER interrupt)
  const connectionState = appState.get('connection');
  if (connectionState === 'connected' || connectionState === 'connecting') {
    log.debug('Voice conversation active - not showing');
    return false;
  }

  // 7. Check minimum session duration
  if (Date.now() - sessionStartTime < MIN_SESSION_MS) {
    log.debug('Session too short');
    return false;
  }

  return true;
}

// ============================================================================
// CREDENTIAL HANDLING
// ============================================================================

async function handleCredentialResponse(response: CredentialResponse): Promise<void> {
  log.info('One-Tap credential received');
  isPromptShowing = false;

  try {
    // Link the Google credential to the anonymous Firebase account
    await linkWithGoogleCredential(response.credential);

    // Clear cooldown on successful link
    clearCooldown();

    log.info('Successfully linked Google account via One-Tap');

    // Dispatch success event for UI feedback
    window.dispatchEvent(
      new CustomEvent('ferni:one-tap-success', {
        detail: { method: 'one-tap' },
      })
    );
  } catch (error) {
    log.error('Failed to link Google credential:', error);

    // Dispatch error event
    window.dispatchEvent(
      new CustomEvent('ferni:one-tap-error', {
        detail: { error: error instanceof Error ? error.message : 'Unknown error' },
      })
    );
  }
}

function handlePromptNotification(notification: PromptNotification): void {
  if (notification.isNotDisplayed()) {
    const reason = notification.getNotDisplayedReason();
    log.debug('One-Tap not displayed:', reason);
    isPromptShowing = false;
  } else if (notification.isSkippedMoment()) {
    const reason = notification.getSkippedReason();
    log.debug('One-Tap skipped:', reason);
    isPromptShowing = false;
  } else if (notification.isDismissedMoment()) {
    const reason = notification.getDismissedReason();
    log.debug('One-Tap dismissed:', reason);

    // Only record dismissal if user explicitly closed it
    if (reason === 'user_cancel' || reason === 'tap_outside') {
      recordDismissal();
    }

    isPromptShowing = false;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Google One-Tap.
 * Call after Firebase Auth is initialized.
 */
export function initGoogleOneTap(): void {
  if (isInitialized) return;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    log.warn('Google One-Tap not configured (missing VITE_GOOGLE_CLIENT_ID)');
    return;
  }

  // Wait for GIS to load
  const initializeWhenReady = (): void => {
    if (!window.google?.accounts?.id) {
      // Retry after a short delay
      setTimeout(initializeWhenReady, 500);
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      auto_select: false, // Don't auto-select - let user confirm
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true, // Better Safari support
      use_fedcm_for_prompt: true, // Use FedCM when available (Chrome)
    });

    isInitialized = true;
    sessionStartTime = Date.now();

    log.info('Google One-Tap initialized');

    // Subscribe to auth state changes
    onAuthStateChange((state) => {
      if (state.isLinked) {
        // User linked account - cancel any pending prompt
        cancelOneTap();
      }
    });

    // Schedule initial prompt
    schedulePrompt();
  };

  initializeWhenReady();
}

// ============================================================================
// PROMPT CONTROL
// ============================================================================

function schedulePrompt(): void {
  setTimeout(() => {
    showOneTapIfEligible();
  }, INITIAL_DELAY_MS);
}

/**
 * Show One-Tap prompt if user is eligible.
 * Checks all eligibility criteria before showing.
 */
export function showOneTapIfEligible(): void {
  if (!shouldShowOneTap()) return;

  log.info('Showing One-Tap prompt');
  isPromptShowing = true;

  window.google?.accounts.id.prompt(handlePromptNotification);
}

/**
 * Cancel the One-Tap prompt if it's showing.
 * Call this when starting a voice conversation.
 */
export function cancelOneTap(): void {
  if (isPromptShowing && window.google?.accounts?.id) {
    window.google.accounts.id.cancel();
    isPromptShowing = false;
    log.debug('One-Tap cancelled');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const googleOneTapService = {
  init: initGoogleOneTap,
  show: showOneTapIfEligible,
  cancel: cancelOneTap,
  isInCooldown,
  clearCooldown,
};

// Debug utilities for dev mode
if (import.meta.env.DEV) {
  (window as unknown as { googleOneTap: typeof googleOneTapService }).googleOneTap =
    googleOneTapService;
}
