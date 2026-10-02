/**
 * Read and change the user's sensitive-memory consent.
 *
 * One record per user at `bogle_users/{uid}.memoryConsent`. Every category is
 * OFF until the user says yes. Reads go through a short cache (a few seconds)
 * so capture paths can call `isCategoryEnabled` on every turn; writes update
 * the cache at once and notify in-process listeners, so capture in this
 * process stops the moment a switch goes off. Other processes see the change
 * within the cache TTL.
 *
 * `isCategoryEnabled` fails closed: if consent can't be read, the category is
 * treated as off.
 *
 * @module services/memory-consent/store
 */

import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import {
  CONSENT_FIELD,
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  SENSITIVE_CATEGORIES,
  USERS_COLLECTION,
  isSensitiveCategory,
  needsConsentAnswer,
  type CategoryConsent,
  type ConsentError,
  type ConsentSource,
  type MemoryConsent,
  type SensitiveCategory,
} from './types.js';

const log = createLogger({ module: 'MemoryConsent' });

const CACHE_TTL_MS = 5_000;
const MAX_CACHE = 5_000;
const cache = new Map<string, { at: number; consent: MemoryConsent }>();

export type ConsentChangeListener = (
  userId: string,
  category: SensitiveCategory,
  enabled: boolean
) => void;
const listeners = new Set<ConsentChangeListener>();

/** Be told when a category is switched on or off in this process. Returns an unsubscribe. */
export function onConsentChange(listener: ConsentChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tests. */
export function clearConsentCache(): void {
  cache.clear();
}

function validUser(userId: string): boolean {
  return Boolean(userId) && userId !== 'anonymous' && !userId.includes('/');
}

function err(code: ConsentError['code'], message: string): Result<never, ConsentError> {
  return failure({ code, message });
}

function parseCategory(raw: unknown): CategoryConsent {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONSENT.categories.health;
  const r = raw as Record<string, unknown>;
  const source = r.source;
  return {
    enabled: r.enabled === true,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    source: source === 'page' || source === 'voice' || source === 'onboarding' ? source : null,
  };
}

/** Parse the stored field. Anything malformed reads as "off". */
export function parseConsent(raw: unknown): MemoryConsent {
  if (!raw || typeof raw !== 'object') return DEFAULT_CONSENT;
  const r = raw as Record<string, unknown>;
  const cats = (r.categories && typeof r.categories === 'object' ? r.categories : {}) as Record<
    string,
    unknown
  >;
  return {
    // Records from before versioning answered the first wording.
    version: typeof r.version === 'number' ? r.version : 1,
    answeredAt: typeof r.answeredAt === 'string' ? r.answeredAt : null,
    categories: {
      health: parseCategory(cats.health),
      finances: parseCategory(cats.finances),
      beliefs: parseCategory(cats.beliefs),
    },
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
  };
}

function remember(userId: string, consent: MemoryConsent): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(userId, { at: Date.now(), consent });
}

/** The user's consent (all off when nothing is stored). */
export async function getConsent(
  userId: string,
  opts: { fresh?: boolean } = {}
): Promise<Result<MemoryConsent, ConsentError>> {
  if (!validUser(userId)) return err('invalid_user', 'No user');
  const hit = cache.get(userId);
  if (!opts.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return success(hit.consent);
  const db = getFirestoreDb();
  if (!db) return err('storage_unavailable', 'Storage unavailable');
  try {
    const snap = await db.collection(USERS_COLLECTION).doc(userId).get();
    const consent = parseConsent(snap.exists ? snap.data()?.[CONSENT_FIELD] : undefined);
    remember(userId, consent);
    return success(consent);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not read memory consent');
    return err('storage_unavailable', 'Could not read consent');
  }
}

/**
 * May Ferni remember things in this category for this user? Never throws;
 * false when off, unanswered, or unreadable.
 */
export async function isCategoryEnabled(
  userId: string,
  category: SensitiveCategory
): Promise<boolean> {
  if (!validUser(userId) || !isSensitiveCategory(category)) return false;
  const result = await getConsent(userId);
  return result.success ? result.data.categories[category].enabled : false;
}

export interface ConsentChange {
  /** Categories to switch; others are left as they are. */
  readonly categories: Partial<Record<SensitiveCategory, boolean>>;
  readonly source: ConsentSource;
  /** Mark the upfront question as answered (true for any deliberate choice). */
  readonly answered?: boolean;
}

/** Apply a change and persist it. Notifies listeners for every category that flipped. */
export async function updateConsent(
  userId: string,
  change: ConsentChange
): Promise<Result<MemoryConsent, ConsentError>> {
  if (!validUser(userId)) return err('invalid_user', 'No user');
  for (const key of Object.keys(change.categories)) {
    if (!isSensitiveCategory(key)) return err('invalid_category', `Unknown category ${key}`);
  }
  const current = await getConsent(userId, { fresh: true });
  if (!current.success) return current;
  const db = getFirestoreDb();
  if (!db) return err('storage_unavailable', 'Storage unavailable');

  const now = new Date().toISOString();
  const before = current.data;
  const categories = { ...before.categories };
  const flipped: Array<[SensitiveCategory, boolean]> = [];
  for (const category of SENSITIVE_CATEGORIES) {
    const want = change.categories[category];
    if (typeof want !== 'boolean') continue;
    if (categories[category].enabled !== want) flipped.push([category, want]);
    categories[category] = { enabled: want, updatedAt: now, source: change.source };
  }
  // A deliberate choice answers the current wording; re-answering after the
  // wording changed records a fresh answer time.
  const answering = change.answered !== false;
  const next: MemoryConsent = {
    version: answering ? CONSENT_VERSION : before.version,
    answeredAt: !answering
      ? before.answeredAt
      : needsConsentAnswer(before)
        ? now
        : (before.answeredAt ?? now),
    categories,
    updatedAt: now,
  };

  try {
    await db
      .collection(USERS_COLLECTION)
      .doc(userId)
      .set({ [CONSENT_FIELD]: next }, { merge: true });
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not save memory consent');
    return err('storage_unavailable', 'Could not save consent');
  }
  remember(userId, next);
  log.info(
    {
      userId,
      flipped: flipped.map(([c, on]) => `${c}:${on ? 'on' : 'off'}`),
      source: change.source,
    },
    'Memory consent changed'
  );
  for (const [category, enabled] of flipped) {
    for (const listener of listeners) {
      try {
        listener(userId, category, enabled);
      } catch (error) {
        log.warn({ category, error: String(error) }, 'Consent listener failed');
      }
    }
  }
  return success(next);
}

/** Switch one category on or off. */
export function setCategoryConsent(
  userId: string,
  category: SensitiveCategory,
  enabled: boolean,
  source: ConsentSource
): Promise<Result<MemoryConsent, ConsentError>> {
  if (!isSensitiveCategory(category)) {
    return Promise.resolve(err('invalid_category', `Unknown category ${String(category)}`));
  }
  return updateConsent(userId, { categories: { [category]: enabled }, source, answered: true });
}

/**
 * Answer the upfront question again after its wording changed, keeping every
 * switch exactly as it is ("keep my choices").
 */
export function confirmConsentChoices(
  userId: string,
  source: ConsentSource
): Promise<Result<MemoryConsent, ConsentError>> {
  return updateConsent(userId, { categories: {}, source, answered: true });
}

/** The one upfront question: yes turns every category on, no records the answer with all off. */
export function answerUpfrontConsent(
  userId: string,
  agree: boolean,
  source: ConsentSource
): Promise<Result<MemoryConsent, ConsentError>> {
  return updateConsent(userId, {
    categories: { health: agree, finances: agree, beliefs: agree },
    source,
    answered: true,
  });
}
