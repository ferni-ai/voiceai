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
 * Firebase configuration from environment variables.
 * In production, these are set via Vite's env system (VITE_ prefix).
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

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
