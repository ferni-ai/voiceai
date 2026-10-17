/**
 * Captions v2 flag. Off by default.
 *
 * When on, live call captions render in their own region above the call
 * controls (live-captions.ts) instead of the one-line pill over the avatar.
 * Turn it on for a build with VITE_CAPTIONS_V2=true, or for one browser with
 * localStorage `ferni:flag:captions-v2` = 'true' ('false' forces it off).
 *
 * @module ui/captions/captions-flag
 */

export const CAPTIONS_V2_STORAGE_KEY = 'ferni:flag:captions-v2';

export function isCaptionsV2Enabled(): boolean {
  try {
    const override = localStorage.getItem(CAPTIONS_V2_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_CAPTIONS_V2 === 'true';
}

export const CAPTIONS_BREATH_STORAGE_KEY = 'ferni:flag:captions-breath';

/**
 * Breath sub-flag: Ferni's words rise in as they are spoken, with the current
 * word underlined and breath dots at a pause. Needs captions v2 on. Off by
 * default. Turn it on for a build with VITE_CAPTIONS_BREATH=true, or for one
 * browser with localStorage `ferni:flag:captions-breath` = 'true'.
 */
export function isCaptionsBreathEnabled(): boolean {
  if (!isCaptionsV2Enabled()) return false;
  try {
    const override = localStorage.getItem(CAPTIONS_BREATH_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_CAPTIONS_BREATH === 'true';
}
