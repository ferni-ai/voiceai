/**
 * Overlay host flag. Off by default.
 *
 * When on, toasts and notices render in the shared toast region
 * (ui/overlay/toast-region.ts) instead of the Moments bottom pill.
 * Turn it on for a build with VITE_OVERLAY_HOST=true, or for one browser with
 * localStorage `ferni:flag:overlay-host` = 'true' ('false' forces it off on a
 * build that has it on).
 *
 * @module ui/overlay/overlay-flag
 */

export const OVERLAY_HOST_STORAGE_KEY = 'ferni:flag:overlay-host';

export function isOverlayHostEnabled(): boolean {
  try {
    const override = localStorage.getItem(OVERLAY_HOST_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_OVERLAY_HOST === 'true';
}
