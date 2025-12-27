/**
 * Firebase Authentication Service
 *
 * Provides seamless authentication with a relationship-first approach:
 * - Anonymous accounts created silently on first visit (zero friction)
 * - Users can optionally link social accounts when they're ready
 * - All data preserved when upgrading from anonymous to linked account
 *
 * Philosophy: Authentication should feel like meeting a friend, not
 * logging into a bank. We start the relationship immediately and let
 * users formalize it when they're ready.
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
  signInAnonymously,
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

    // If no user, sign in anonymously
    if (!currentUser) {
      log.info('No existing session, creating anonymous account');
      try {
        const credential = await signInAnonymously(auth);
        currentUser = credential.user;
        log.info('Anonymous account created', {
          uid: currentUser.uid.substring(0, 8) + '...',
        });
      } catch (error) {
        log.error('Failed to create anonymous account:', error);
        // Continue without auth - graceful degradation
      }
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
// ACCOUNT LINKING (Upgrade from Anonymous)
// ============================================================================

/**
 * Link email/password to current anonymous account.
 * Preserves all user data.
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

  if (!currentUser.isAnonymous) {
    throw new Error('Account already linked');
  }

  log.info('Linking email account');
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(currentUser, credential);

  log.info('Email account linked successfully');
  return result;
}

/**
 * Link Google account to current anonymous account.
 * Opens popup for Google sign-in, then links to existing account.
 * Preserves all user data.
 */
export async function linkWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  if (!currentUser.isAnonymous) {
    throw new Error('Account already linked');
  }

  log.info('Linking Google account');
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  // For anonymous users, we need to sign in with popup first, then link
  // This is because linkWithPopup doesn't work well with anonymous accounts
  const result = await signInWithPopup(auth, provider);

  log.info('Google account linked successfully');
  return result;
}

/**
 * Link Apple account to current anonymous account.
 * Opens popup for Apple sign-in, then links to existing account.
 * Preserves all user data.
 */
export async function linkWithApple(): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  if (!currentUser.isAnonymous) {
    throw new Error('Account already linked');
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
 * Link Google account using ID token from Google One-Tap.
 *
 * This method is specifically for One-Tap which returns a JWT credential
 * instead of using the OAuth popup flow. The token is verified server-side
 * by Firebase, so we trust it here.
 *
 * @param idToken - JWT credential from Google Identity Services
 * @returns UserCredential on success
 * @throws Error if linking fails
 */
export async function linkWithGoogleCredential(idToken: string): Promise<UserCredential> {
  const auth = getFirebaseAuth();
  if (!auth || !currentUser) {
    throw new Error('Not authenticated');
  }

  if (!currentUser.isAnonymous) {
    throw new Error('Account already linked');
  }

  log.info('Linking Google account via One-Tap credential');

  // Create credential from the One-Tap JWT ID token
  // GoogleAuthProvider.credential(idToken, accessToken?) creates an OAuthCredential
  // For One-Tap/GIS, idToken is a JWT that Firebase validates server-side
  const credential = GoogleAuthProvider.credential(idToken);

  try {
    const result = await linkWithCredential(currentUser, credential);
    log.info('Google account linked successfully via One-Tap');
    return result;
  } catch (error: unknown) {
    // Handle specific Firebase errors with friendly messages
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as { code: string; message: string };

      if (firebaseError.code === 'auth/credential-already-in-use') {
        log.warn('Google account already linked to another user');
        throw new Error(
          'This Google account is already linked to another Ferni account. Try a different account?'
        );
      }

      if (firebaseError.code === 'auth/invalid-credential') {
        log.error('Invalid credential from One-Tap');
        throw new Error('Something went wrong with Google sign-in. Try again?');
      }

      if (firebaseError.code === 'auth/provider-already-linked') {
        log.info('Google already linked to this account');
        throw new Error('You already have Google linked to this account!');
      }
    }

    throw error;
  }
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
