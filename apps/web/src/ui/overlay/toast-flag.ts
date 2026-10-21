/**
 * Toast region flag. ON by default.
 *
 * On: every toast (Moments whispers, notices and celebrations, notification
 * cards, proactive outreach, milestones, easter-egg achievements, trust
 * signals) renders in the shared toast region (toast-region.ts). On phones
 * that is one toast at a time, under the status island, with its full text,
 * clear of Connect and the home buttons. A weak connection shows in the status
 * island instead of a corner pill that sat under the status bar and on the
 * toasts. Dialogs and the offline banner (whose island version has no "Try
 * again") are not part of this: they stay behind the overlay-host flag
 * (overlay-flag.ts).
 *
 * Kill switch, back to the old per-surface toasts:
 * - every visitor: set the repo variable VITE_TOAST_REGION=off and redeploy the
 *   web app (deploy-firebase.yml and deploy-production.yml pass it to the build)
 * - one browser: localStorage `ferni:flag:toast-region` = 'off' ('on' forces it
 *   on for a build that has it off)
 * The overlay host turns it on regardless: with that flag on, toasts were
 * already in the region.
 *
 * This is the only place the flag is read.
 *
 * @module ui/overlay/toast-flag
 */

import { isOverlayHostEnabled } from './overlay-flag.js';

export const TOAST_REGION_STORAGE_KEY = 'ferni:flag:toast-region';

const isOff = (value: unknown): boolean => value === 'off' || value === 'false';

export function isToastRegionEnabled(): boolean {
  if (isOverlayHostEnabled()) return true;
  try {
    const override = localStorage.getItem(TOAST_REGION_STORAGE_KEY);
    if (override === 'on' || override === 'true') return true;
    if (isOff(override)) return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return !isOff(import.meta.env.VITE_TOAST_REGION);
}
