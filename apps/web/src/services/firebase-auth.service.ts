/**
 * Firebase Authentication Service
 *
 * Provides authentication with Google and Apple sign-in.
 * Users must sign in to use the app - no anonymous accounts.
 *
 * Philosophy: Real relationships require identity. By asking users
 * to sign in, we can provide continuity across devices and sessions,
 * and ensure their memories and progress are always preserved.
 *
 * @module FirebaseAuthService
 */

import {
  EmailAuthProvider,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  linkWithCredential,
  OAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithPopup,
  type Unsubscribe,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../config/firebase.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('FirebaseAuth');

// ============================================================================
// TYPES
// ============================================================================

export interface AuthState {
  /** Whether Firebase Auth is available and configured */
  isConfigured: boolean;
  /** Whether user is authenticated (anonymous or linked) */
  isAuthenticated: boolean;
  /** Whether user has linked a real account (email, Google, Apple) */
  isLinked: boolean;
  /** Firebase UID (null if not authenticated) */
  uid: string | null;
  /** User's email (null if anonymous) */
  email: string | null;
  /** User's display name from provider */
  displayName: string | null;
  /** URL to user's profile photo */
  photoURL: string | null;
  /** Which providers are linked */
  linkedProviders: string[];
}

export type AuthStateCallback = (state: AuthState) => void;

// ============================================================================
// STATE
// ============================================================================

let currentUser: User | null = null;
let currentToken: string | null = null;
let tokenExpiry: number = 0;
const authStateCallbacks: AuthStateCallback[] = [];
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build AuthState from Firebase User
 */
function buildAuthState(user: User | null): AuthState {
  if (!user) {
    return {
      isConfigured: isFirebaseConfigured(),
      isAuthenticated: false,
      isLinked: false,
      uid: null,
      email: null,
      displayName: null,
      photoURL: null,
      linkedProviders: [],
    };
  }

  const linkedProviders = user.providerData.map((p) => p.providerId);
  const isLinked = linkedProviders.some(
    (p) => p === 'google.com' || p === 'apple.com' || p === 'password'
  );

  return {
    isConfigured: true,
    isAuthenticated: true,
    isLinked,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    linkedProviders,
  };
}

/**
 * Notify all auth state listeners
 */
function notifyAuthStateChange(user: User | null): void {
  const state = buildAuthState(user);
  for (const callback of authStateCallbacks) {
    try {
      callback(state);
    } catch (error) {
      log.error('Auth state callback error:', error);
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Firebase Auth.
 *
 * - If not configured, returns immediately (graceful degradation)
 * - If no user session, creates anonymous account
 * - If existing session, restores it
 *
 * Call this early in app startup.
 */
export async function initAuth(): Promise<AuthState> {
  // Return existing init if in progress
  if (initPromise) {
    await initPromise;
    return buildAuthState(currentUser);
  }

  // Already initialized
  if (isInitialized) {
    return buildAuthState(currentUser);
  }

  initPromise = (async () => {
    const auth = getFirebaseAuth();

    if (!auth) {
      log.warn('Firebase Auth not configured - using fallback auth');
      isInitialized = true;
      return;
    }

    // Set up auth state listener
    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      currentToken = null; // Clear cached token on state change
      tokenExpiry = 0;
      notifyAuthStateChange(user);

      if (user) {
        log.info('Auth state changed', {
          uid: user.uid.substring(0, 8) + '...',
          isAnonymous: user.isAnonymous,
        });
      } else {
        log.info('User signed out');
      }
    });

    // Wait for initial auth state
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        currentUser = user;
        resolve();
      });
    });

    // No automatic sign-in - users must explicitly sign in with Google/Apple
    if (!currentUser) {
      log.info('No existing session - user must sign in');
    }

    isInitialized = true;
  })();

  await initPromise;
  return buildAuthState(currentUser);
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Get current ID token for API calls.
 *
 * - Returns cached token if still valid
 * - Automatically refreshes if expired
 * - Returns null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  if (!currentUser) {
    return null;
  }

  // Return cached token if still valid (with 5 min buffer)
  const now = Date.now();
  if (currentToken && tokenExpiry > now + 5 * 60 * 1000) {
    return currentToken;
  }

  try {
    // Force refresh if token is expired
    const forceRefresh = tokenExpiry > 0 && tokenExpiry < now;
    currentToken = await currentUser.getIdToken(forceRefresh);

    // Firebase tokens are valid for 1 hour
    tokenExpiry = now + 55 * 60 * 1000; // 55 minutes to be safe

    return currentToken;
  } catch (error) {
    log.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * Get current Firebase UID.
 * Returns null if not authenticated.
 */
export function getFirebaseUid(): string | null {
  return currentUser?.uid ?? null;
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(): boolean {
  return currentUser !== null;
}

/**
 * Check if user has linked a real account (not just anonymous).
 */
export function isAccountLinked(): boolean {
  if (!currentUser) return false;
  return currentUser.providerData.some(
    (p) =>
      p.providerId === 'google.com' || p.providerId === 'apple.com' || p.providerId === 'password'
  );
}

// ============================================================================
// SIGN IN (Primary authentication)
// ============================================================================

/**
 * Sign in with Google using popup.
 * Opens Google sign-in popup and creates/signs into Firebase account.
 *
 * @returns UserCredential on success
 * @throws Error if sign-in fails or is cancelled
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth not configured');
  }

  log.info('Signing in with Google');
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  const result = await signInWithPopup(auth, provider);
  log.info('Google sign-in successful', {
    uid: result.user.uid.substring(0, 8) + '...',
    email: result.user.email,
  });
  return result;
}

/**
 * Sign in with Apple using popup.
 * Opens Apple sign-in popup and creates/signs into Firebase account.
 *
 * @returns UserCredential on success
 * @throws Error if sign-in fails or is cancelled
 */
export async function signInWithApple(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth not configured');
  }

  log.info('Signing in with Apple');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');

  const result = await signInWithPopup(auth, provider);
  log.info('Apple sign-in successful', {
    uid: result.user.uid.substring(0, 8) + '...',
    email: result.user.email,
  });
  return result;
}

/**
 * Sign in with Google using ID token from Google One-Tap.
 *
 * This method is specifically for One-Tap which returns a JWT credential
 * instead of using the OAuth popup flow. The token is verified server-side
 * by Firebase, so we trust it here.
 *
 * @param idToken - JWT credential from Google Identity Services
 * @returns UserCredential on success
 * @throws Error if sign-in fails
 */
export async function signInWithGoogleCredential(idToken: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth not configured');
  }

  log.info('Signing in with Google via One-Tap credential');

  // Create credential from the One-Tap JWT ID token
  const credential = GoogleAuthProvider.credential(idToken);

  try {
    const result = await signInWithCredential(auth, credential);
    log.info('Google One-Tap sign-in successful', {
      uid: result.user.uid.substring(0, 8) + '...',
      email: result.user.email,
    });
    return result;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string; message: string };

      if (firebaseError.code === 'auth/invalid-credential') {
        log.error('Invalid credential from One-Tap');
        throw new Error('Something went wrong with Google sign-in. Try again?');
      }
    }
    throw error;
  }
}

// ============================================================================
// ACCOUNT LINKING (Add additional providers to existing account)
// ============================================================================

/**
 * Link email/password to current account.
 * Allows users to add email/password as an additional sign-in method.
 *
 * @param email - User's email address
 * @param password - User's chosen password
 * @returns UserCredential on success
 * @throws Error if linking fails
 */
export async function linkWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  log.info('Linking email account');
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(currentUser, credential);

  log.info('Email account linked successfully');
  return result;
}

/**
 * Link Google account to current account.
 * Allows users to add Google as an additional sign-in method.
 *
 * @deprecated Use signInWithGoogle() for primary auth. This is for adding Google to existing account.
 */
export async function linkWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  log.info('Linking Google account');
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  const result = await signInWithPopup(auth, provider);
  log.info('Google account linked successfully');
  return result;
}

/**
 * Link Apple account to current account.
 * Allows users to add Apple as an additional sign-in method.
 *
 * @deprecated Use signInWithApple() for primary auth. This is for adding Apple to existing account.
 */
export async function linkWithApple(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  log.info('Linking Apple account');
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');

  const result = await signInWithPopup(auth, provider);
  log.info('Apple account linked successfully');
  return result;
}

/**
 * @deprecated Use signInWithGoogleCredential() for primary auth.
 */
export async function linkWithGoogleCredential(idToken: string): Promise<UserCredential> {
  // Redirect to the new sign-in function for backward compatibility
  return signInWithGoogleCredential(idToken);
}

// ============================================================================
// PASSWORD RESET
// ============================================================================

/**
 * Send password reset email.
 *
 * @param email - Email address to send reset link to
 */
export async function resetPassword(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth not configured');
  }

  log.info('Sending password reset email');
  await sendPasswordResetEmail(auth, email);
  log.info('Password reset email sent');
}

// ============================================================================
// SIGN OUT
// ============================================================================

/**
 * Sign out current user.
 * After sign out, a new anonymous account will be created on next init.
 */
export async function signOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;

  log.info('Signing out');
  await firebaseSignOut(auth);
  currentUser = null;
  currentToken = null;
  tokenExpiry = 0;
}

// ============================================================================
// AUTH STATE SUBSCRIPTION
// ============================================================================

/**
 * Subscribe to auth state changes.
 * Callback is called immediately with current state, then on every change.
 *
 * @param callback - Function to call on auth state change
 * @returns Unsubscribe function
 */
export function onAuthStateChange(callback: AuthStateCallback): Unsubscribe {
  authStateCallbacks.push(callback);

  // Call immediately with current state
  callback(buildAuthState(currentUser));

  // Return unsubscribe function
  return () => {
    const index = authStateCallbacks.indexOf(callback);
    if (index > -1) {
      authStateCallbacks.splice(index, 1);
    }
  };
}

/**
 * Get current auth state synchronously.
 */
export function getAuthState(): AuthState {
  return buildAuthState(currentUser);
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const firebaseAuth = {
  init: initAuth,
  getToken: getAuthToken,
  getUid: getFirebaseUid,
  isAuthenticated,
  isAccountLinked,
  // Primary sign-in methods
  signInWithGoogle,
  signInWithApple,
  signInWithGoogleCredential,
  // Legacy linking methods (for adding providers to existing account)
  linkWithEmail,
  linkWithGoogle,
  linkWithGoogleCredential,
  linkWithApple,
  resetPassword,
  signOut,
  onAuthStateChange,
  getState: getAuthState,
  isConfigured: isFirebaseConfigured,
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { ferniAuth: typeof firebaseAuth }).ferniAuth = firebaseAuth;
}
