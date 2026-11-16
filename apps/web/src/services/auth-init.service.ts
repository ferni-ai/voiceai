/**
 * Authentication Initialization Service
 *
 * Initializes Firebase Auth and connects it to app state.
 * This should be called early in app startup, before any API calls.
 *
 * Flow:
 * 1. Initialize Firebase Auth (check for existing session)
 * 2. Subscribe to auth state changes
 * 3. Update app state with auth info
 *
 * Note: Users must sign in with Google or Apple before using the app.
 * No anonymous accounts are created.
 *
 * @module AuthInitService
 */

import { updateAuthState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { installApiAuthFetch } from './api-auth-fetch.js';
import { forgetThisPersonAndReload } from './forget-this-person.js';
import {
  getAuthState,
  getAuthToken,
  initAuth,
  onAuthStateChange,
  type AuthState,
} from './firebase-auth.service.js';

const log = createLogger('AuthInit');

// ============================================================================
// INITIALIZATION STATE
// ============================================================================

let isInitialized = false;
let initPromise: Promise<void> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize authentication system.
 *
 * This function:
 * 1. Initializes Firebase Auth (anonymous if no session)
 * 2. Connects auth state to app state
 *
 * Safe to call multiple times - will only initialize once.
 */
export async function initializeAuth(): Promise<AuthState> {
  // Return existing init if in progress or complete
  if (initPromise) {
    await initPromise;
    return getAuthState();
  }

  if (isInitialized) {
    return getAuthState();
  }

  initPromise = (async () => {
    log.info('Initializing authentication');

    // The API trusts only verified identity, so every /api call carries the token.
    installApiAuthFetch(window, getAuthToken);

    // Initialize Firebase Auth
    const authState = await initAuth();

    // Update app state with auth info
    updateAuthState(authState);

    // This page belongs to the first person signed in on it. If another tab signs
    // them out, or in as someone else, rebuild it rather than keep showing their
    // data under the new session; a token refresh keeps the uid and changes nothing.
    let pageUid = authState.uid;
    onAuthStateChange((newState) => {
      updateAuthState(newState);
      if (pageUid === null)
        pageUid = newState.uid; // the first sign-in, on the gate
      else if (newState.uid !== pageUid) void forgetThisPersonAndReload();
    });

    isInitialized = true;
    log.info('Authentication initialized', {
      uid: authState.uid?.substring(0, 8) + '...',
      isLinked: authState.isLinked,
    });
  })();

  await initPromise;
  return getAuthState();
}

/**
 * Check if auth is initialized.
 */
export function isAuthInitialized(): boolean {
  return isInitialized;
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

// Auto-initialize when this module is imported (if in browser)
// This ensures auth is ready as early as possible
if (typeof window !== 'undefined') {
  // Use requestIdleCallback if available for non-blocking init
  if ('requestIdleCallback' in window) {
    const windowWithIdle = window as Window & { requestIdleCallback: (cb: () => void) => void };
    windowWithIdle.requestIdleCallback(() => {
      void initializeAuth();
    });
  } else {
    // Fallback to setTimeout
    setTimeout(() => {
      void initializeAuth();
    }, 0);
  }
}
