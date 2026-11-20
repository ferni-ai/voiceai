/**
 * Menu regroup flag. Off by default.
 *
 * When on, the settings menu shows the same rows in five groups named for what
 * they hold (Check-ins, What I remember, Your day, Your journey, Settings) instead
 * of today's five (Let's Practice, Our Story, Let's Do Something, Your World,
 * How This Works), where "Let's Practice" holds the calendar and notification
 * settings. No row is added or removed. Plan:
 * docs/plans/2026-10-31-design-elevation.md (menu map, move 6).
 *
 * Turn it on in one browser with `localStorage.setItem('ferni:menu-regroup', 'on')`,
 * or for a build with `VITE_MENU_REGROUP=true`.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('MenuRegroupFlag');

export const MENU_REGROUP_STORAGE_KEY = 'ferni:menu-regroup';

export function isMenuRegroupOn(): boolean {
  try {
    const override = localStorage.getItem(MENU_REGROUP_STORAGE_KEY);
    if (override !== null) return override === 'on' || override === 'true';
  } catch (error) {
    log.debug('localStorage unavailable for the menu regroup flag', { error: String(error) });
  }
  return import.meta.env.VITE_MENU_REGROUP === 'true';
}
