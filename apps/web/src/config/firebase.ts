/**
 * Firebase Configuration
 *
 * Initializes Firebase for authentication.
 * Uses environment variables for configuration (set in .env or Vite config).
 *
 * Philosophy: Authentication should be invisible. Users start immediately
 * with an anonymous account, and can optionally link their identity later
 * when they're ready to build a deeper relationship.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Firebase');

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Firebase web configuration. Build-time VITE_FIREBASE_* values when set;
 * otherwise loaded at startup by loadFirebaseConfig().
 */
const firebaseConfig: Record<'apiKey' | 'authDomain' | 'projectId' | 'storageBucket' | 'messagingSenderId' | 'appId', string> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);

/**
 * Fill in the web config from Firebase Hosting when the build didn't carry it.
 *
 * The CI build that deploys the app never had VITE_FIREBASE_* set, so
 * production shipped with Firebase off: "Sign in with Google" threw "Firebase
 * Auth not configured" and nobody could get past the sign-in screen. Firebase
 * Hosting serves this project's (public) web config at /__/firebase/init.json,
 * so the app reads it there and can't drift from the real project.
 */
export async function loadFirebaseConfig(
  fetchImpl: typeof fetch = fetch,
  hostname: string = globalThis.location?.hostname ?? ''
): Promise<boolean> {
  // Only Firebase Hosting serves init.json; a local dev server doesn't.
  if (isFirebaseConfigured() || LOCAL_HOSTS.has(hostname)) return isFirebaseConfigured();
  try {
    const response = await fetchImpl('/__/firebase/init.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const hosted = (await response.json()) as Partial<typeof firebaseConfig>;
    for (const key of Object.keys(firebaseConfig) as Array<keyof typeof firebaseConfig>) {
      if (hosted[key]) firebaseConfig[key] = hosted[key];
    }
  } catch (error) {
    log.warn('Could not load the Firebase config from hosting', error);
  }
  return isFirebaseConfigured();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

/**
 * Check if Firebase is configured.
 * Returns false if required environment variables are missing.
 */
export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);
}

/**
 * Get the Firebase app instance.
 * Initializes on first call (lazy initialization).
 */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) {
    log.warn('Firebase not configured - missing environment variables');
    return null;
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
  }

  return firebaseApp;
}

/**
 * Get the Firebase Auth instance.
 * Initializes on first call (lazy initialization).
 */
export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;

  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
  }

  return firebaseAuth;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { firebaseConfig };
