/**
 * Apple sign-in on the web. Off by default, so the gate hides "Continue with Apple".
 *
 * Apple's web popup needs the OAuth code flow set up on the Firebase Apple
 * provider (Services ID, team ID, key). Without it every attempt fails with
 * auth/operation-not-allowed, which looked to people like they had cancelled.
 * The native iOS app signs in with Apple on its own and is not affected.
 *
 * Turn it on for a build with VITE_APPLE_WEB_SIGNIN=true once that config is in
 * place, or for one browser with localStorage `ferni:flag:apple-web-signin` =
 * 'true' ('false' forces it off on a build that has it on).
 *
 * @module config/apple-web-signin-flag
 */

export const APPLE_WEB_SIGNIN_STORAGE_KEY = 'ferni:flag:apple-web-signin';

export function isAppleWebSignInEnabled(): boolean {
  try {
    const override = localStorage.getItem(APPLE_WEB_SIGNIN_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build setting.
  }
  return import.meta.env.VITE_APPLE_WEB_SIGNIN === 'true';
}
