/**
 * Optional memory-category consent gate.
 *
 * Work and places are not special categories, so nothing here asks for
 * consent. But if the user has turned a memory category off, automated
 * capture must not store anything from it. A consent service
 * (`src/services/memory-consent/`) is being built separately; this adapter
 * loads it by a computed path so this module compiles with or without it and
 * picks it up automatically once it exists.
 *
 * - Module absent, or no recognisable check function: allowed.
 * - Check throws: NOT allowed (fail closed; better to forget than to keep
 *   something the user turned off).
 *
 * @module services/work-and-places/consent
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { LifeArea } from './types.js';

const log = createLogger({ module: 'WorkAndPlacesConsent' });

type CategoryCheck = (userId: string, category: string) => Promise<boolean> | boolean;

const MODULE_PATH = ['..', 'memory-consent', 'index.js'].join('/');
const CHECK_NAMES = ['isMemoryCategoryEnabled', 'isCategoryEnabled', 'isCategoryAllowed'];

let override: CategoryCheck | null | undefined;
let loaded: CategoryCheck | null | undefined;

/** Tests: inject a check (null = no consent service). */
export function setConsentCheckForTests(check: CategoryCheck | null | undefined): void {
  override = check;
  loaded = undefined;
}

async function resolveCheck(): Promise<CategoryCheck | null> {
  if (override !== undefined) return override;
  if (loaded !== undefined) return loaded;
  try {
    const mod = (await import(/* @vite-ignore */ MODULE_PATH)) as Record<string, unknown>;
    const name = CHECK_NAMES.find((n) => typeof mod[n] === 'function');
    loaded = name ? (mod[name] as CategoryCheck) : null;
  } catch {
    loaded = null;
  }
  return loaded;
}

/** Whether automated capture may store memories in this area for this user. */
export async function isAreaEnabled(userId: string, area: LifeArea): Promise<boolean> {
  const check = await resolveCheck();
  if (!check) return true;
  try {
    return (await check(userId, area)) !== false;
  } catch (error) {
    log.warn({ userId, area, error: String(error) }, 'Consent check failed: not storing');
    return false;
  }
}
