/**
 * Firebase auth state types. Extracted from firebase-auth.service.ts.
 */

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
