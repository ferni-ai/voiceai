/**
 * Firebase auth state shape and builder. Extracted from firebase-auth.service.ts.
 */

import type { User } from 'firebase/auth';
import { isFirebaseConfigured } from '../config/firebase.js';

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

/**
 * Build AuthState from Firebase User
 */
export function buildAuthState(user: User | null): AuthState {
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
