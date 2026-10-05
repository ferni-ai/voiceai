/**
 * Test-user sign-in for local runs against the Firebase Auth emulator.
 *
 * The emulator's Google popup can't hand its result back in embedded or
 * automated browsers, which left the signed-in app unreachable locally. When
 * VITE_USE_FIREBASE_EMULATORS is on (dev only), the sign-in gate also offers
 * the user seeded by scripts/e2e/seed-emulators.ts. That account exists only
 * in the emulator; production builds compile this down to an empty list.
 */

import { signInWithEmailAndPassword } from 'firebase/auth';
import { getFirebaseAuth, useFirebaseEmulators } from '../config/firebase.js';

const EMULATOR_TEST_USER = { email: 'test@ferni.local', password: 'Test123!@#' };

/** Extra sign-in buttons for the gate: one in emulator mode, none otherwise. */
export function emulatorSignInButtons(onError: (error: unknown) => void): HTMLButtonElement[] {
  if (!useFirebaseEmulators) return [];

  const button = document.createElement('button');
  button.className = 'sign-in-gate-btn sign-in-gate-btn--google';
  button.dataset.provider = 'emulator';
  button.textContent = 'Sign in as emulator test user';
  button.addEventListener('click', () => {
    const auth = getFirebaseAuth();
    if (!auth) return onError(new Error('Firebase Auth not configured'));
    signInWithEmailAndPassword(auth, EMULATOR_TEST_USER.email, EMULATOR_TEST_USER.password).catch(onError);
  });
  return [button];
}
