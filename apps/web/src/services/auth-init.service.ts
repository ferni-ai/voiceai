/**
 * Authentication Initialization Service
 *
 * Initializes Firebase Auth and connects it to app state.
 * This should be called early in app startup, before any API calls.
 *
 * Flow:
 * 1. Initialize Firebase Auth (creates anonymous account if needed)
 * 2. Subscribe to auth state changes
 * 3. Update app state with auth info
 * 4. Trigger migration if device user is upgrading to Firebase
 *
 * @module AuthInitService
 */

import { STORAGE_KEYS } from '../config/index.js';
import { getDeviceId, updateAuthState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import {
  getAuthState,
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
// MIGRATION CHECK
// ============================================================================

/**
 * Check if we need to migrate device-based data to Firebase UID.
 * Returns true if:
 * - User has device-based data (from before Firebase auth)
 * - User now has a Firebase UID
 * - Migration hasn't been done yet
 */
function needsMigration(firebaseUid: string | null): boolean {
  if (!firebaseUid) return false;

  try {
    // Check if we have a legacy device-based user ID
    const legacyUserId = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!legacyUserId) return false;

    // If legacy ID starts with 'device:', we might need migration
    if (!legacyUserId.startsWith('device:')) return false;

    // Check if we've already migrated this device to this Firebase UID
    const migratedUid = localStorage.getItem('ferni_migrated_uid');
    if (migratedUid === firebaseUid) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Request migration of device data to Firebase UID.
 * This calls the backend migration endpoint.
 */
async function requestMigration(deviceId: string, firebaseUid: string): Promise<void> {
  log.info('Requesting data migration', {
    deviceId: deviceId.substring(0, 8) + '...',
    firebaseUid: firebaseUid.substring(0, 8) + '...',
  });

  try {
    const response = await fetch('/api/auth/migrate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': `device:${deviceId}`, // Legacy auth for this request
      },
      body: JSON.stringify({
        deviceId,
        firebaseUid,
      }),
    });

    if (response.ok) {
      // Mark migration as complete
      localStorage.setItem('ferni_migrated_uid', firebaseUid);
      log.info('Migration successful');
    } else {
      const error = (await response.json().catch(() => ({ error: 'Unknown' }))) as { error?: string };
      log.warn('Migration failed', { status: response.status, error });
    }
  } catch (error) {
    log.error('Migration request failed:', error);
    // Don't throw - app should still work without migration
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize authentication system.
 *
 * This function:
 * 1. Initializes Firebase Auth (anonymous if no session)
 * 2. Connects auth state to app state
 * 3. Triggers migration if needed
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

    // Initialize Firebase Auth
    const authState = await initAuth();

    // Update app state with auth info
    updateAuthState(authState);

    // Subscribe to future auth state changes
    onAuthStateChange((newState) => {
      updateAuthState(newState);
    });

    // Check if we need to migrate device data
    if (authState.uid && needsMigration(authState.uid)) {
      const deviceId = getDeviceId();
      // Don't await - migration happens in background
      void requestMigration(deviceId, authState.uid);
    }

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
