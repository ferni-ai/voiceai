/**
 * Consent for life story and beliefs memory.
 *
 * - Beliefs (faith, spiritual practice, philosophical beliefs) are a special
 *   category: stored only while the user's `beliefs` consent is on. Default
 *   off; a failing check counts as off.
 * - Values and life story are not gated, but a story or value whose words
 *   touch a sensitive category ("I grew up going to church every Sunday",
 *   "when I was 12 I was diagnosed with diabetes") follows that category's
 *   switch, so a story can't smuggle in what the user said no to.
 *
 * Classification is the one shared classifier (memory-consent/classifier.ts).
 *
 * @module services/life-story/consent
 */

import {
  isCategoryEnabled,
  onConsentChange,
  sensitiveCategoriesOf,
  type SensitiveCategory,
} from '../memory-consent/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LifeStoryConsent' });

type Check = (userId: string, category: SensitiveCategory) => Promise<boolean>;

let checkOverride: Check | null = null;

/** Tests: replace the consent lookup (null restores the real one). */
export function setConsentCheckForTests(check: Check | null): void {
  checkOverride = check;
}

export async function categoryEnabled(
  userId: string,
  category: SensitiveCategory
): Promise<boolean> {
  try {
    return await (checkOverride ?? isCategoryEnabled)(userId, category);
  } catch (error) {
    log.warn({ userId, category, error: String(error) }, 'Consent check failed; treating as off');
    return false;
  }
}

export async function beliefsEnabled(userId: string): Promise<boolean> {
  return categoryEnabled(userId, 'beliefs');
}

/** May automated capture store this text? False when it touches a switched-off category. */
export async function textAllowed(userId: string, text: string): Promise<boolean> {
  for (const category of sensitiveCategoriesOf(text)) {
    if (!(await categoryEnabled(userId, category))) return false;
  }
  return true;
}

/**
 * Per-session dedupe of belief writes (so a repeated phrase isn't rewritten
 * every turn). Dropped at once when Beliefs is switched off.
 */
const recentBeliefWrites = new Map<string, Set<string>>();

export function seenBeliefRecently(userId: string, key: string): boolean {
  const seen = recentBeliefWrites.get(userId) ?? new Set<string>();
  if (seen.has(key)) return true;
  if (seen.size > 50) seen.clear();
  seen.add(key);
  recentBeliefWrites.set(userId, seen);
  return false;
}

export function pendingBeliefBuffers(userId: string): number {
  return recentBeliefWrites.get(userId)?.size ?? 0;
}

/** Tests: forget every session buffer. */
export function resetBeliefBuffers(): void {
  recentBeliefWrites.clear();
}

onConsentChange((userId, category, enabled) => {
  if (category === 'beliefs' && !enabled) recentBeliefWrites.delete(userId);
});
