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
