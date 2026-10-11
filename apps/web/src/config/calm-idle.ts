/**
 * Calm idle flag ("one hero" idle screen). Off by default.
 *
 * When on, the idle screen shows Ferni, the talk button and at most one
 * self-showing interruption per session (services/attention-queue.ts), and a
 * few decorative modules load when the first call starts instead of at boot
 * (app/calm-boot.ts).
 *
 * Turn it on, in order of precedence:
 * - `?calm_idle=1` in the URL (remembered on this device; `?calm_idle=0` clears it)
 * - `localStorage.ferni_calm_idle = '1'`
 * - build with `VITE_CALM_IDLE=true`
 */

export const CALM_IDLE_STORAGE_KEY = 'ferni_calm_idle';

function readStored(): string | null {
  try {
    return localStorage.getItem(CALM_IDLE_STORAGE_KEY);
  } catch {
    // Storage can throw in private mode; the flag then falls back to the build default.
    return null;
  }
}

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(CALM_IDLE_STORAGE_KEY, '1');
    else localStorage.removeItem(CALM_IDLE_STORAGE_KEY);
  } catch {
    // Not remembered; the URL parameter still applies to this page load.
  }
}

export function isCalmIdleOn(): boolean {
  const fromUrl =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('calm_idle');
  if (fromUrl === '1' || fromUrl === '0') {
    remember(fromUrl === '1');
    return fromUrl === '1';
  }
  const stored = readStored();
  if (stored !== null) return stored === '1';
  return import.meta.env.VITE_CALM_IDLE === 'true';
}
