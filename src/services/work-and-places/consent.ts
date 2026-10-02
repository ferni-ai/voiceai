/**
 * Memory-category consent gate for work & places.
 *
 * Work and places are not sensitive categories (health, finances, beliefs), so
 * they have no switch and are always allowed. The check still goes through
 * `services/memory-consent` for any area that is a sensitive category, so a
 * future switch would be honoured automatically.
 *
 * - Not a sensitive category: allowed.
 * - Check throws: NOT allowed (fail closed; better to forget than to keep
 *   something the user turned off).
 *
 * @module services/work-and-places/consent
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isCategoryEnabled, isSensitiveCategory } from '../memory-consent/index.js';
import type { LifeArea } from './types.js';

const log = createLogger({ module: 'WorkAndPlacesConsent' });

type CategoryCheck = (userId: string, category: string) => Promise<boolean> | boolean;

const defaultCheck: CategoryCheck = (userId, category) =>
  isSensitiveCategory(category) ? isCategoryEnabled(userId, category) : true;

let override: CategoryCheck | null | undefined;

/** Tests: inject a check (null = no consent service). */
export function setConsentCheckForTests(check: CategoryCheck | null | undefined): void {
  override = check;
}

function resolveCheck(): CategoryCheck | null {
  return override !== undefined ? override : defaultCheck;
}

/** Whether automated capture may store memories in this area for this user. */
export async function isAreaEnabled(userId: string, area: LifeArea): Promise<boolean> {
  const check = resolveCheck();
  if (!check) return true;
  try {
    return (await check(userId, area)) !== false;
  } catch (error) {
    log.warn({ userId, area, error: String(error) }, 'Consent check failed: not storing');
    return false;
  }
}
