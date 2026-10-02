/**
 * Firestore persistence for the user preference profile.
 *
 * Path: `bogle_users/{uid}/preferences/{prefId}` (prefId = preferenceIdFor(domain, key)).
 * Tombstones: `bogle_users/{uid}/memory_tombstones/{prefId}` (kind: 'preference').
 *
 * A short write-through cache keeps session-start reads cheap; every write here
 * updates it, so reads after writes in the same process are consistent.
 *
 * @module services/user-preferences/store
 */

import type { Firestore } from '@google-cloud/firestore';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { failure, success, type Result } from '../../types/result.js';
import {
  decideMerge,
  isPreferenceDomain,
  preferenceIdFor,
  tombstoneIdFor,
  validateInput,
} from './rules.js';
import { legacySettingsToInputs } from './legacy.js';
import { sanitizeDetails } from './interest-details.js';
import {
  DETAIL_DOMAINS,
  LEGACY_SETTINGS_DOC,
  PREFERENCES_COLLECTION,
  TOMBSTONE_COLLECTION,
  USERS_COLLECTION,
  type PreferenceDomain,
  type InterestDetails,
  type PreferenceInput,
  type Sentiment,
  type UpsertResult,
  type UserPreference,
} from './types.js';

const log = createLogger({ module: 'UserPreferenceStore' });

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; prefs: Map<string, UserPreference> }>();

export type TombstoneReason = 'user_deleted' | 'voice_forget' | 'conversation_deleted';

function db(): Firestore | null {
  return getFirestoreDb();
}

function prefsCol(fs: Firestore, userId: string) {
  return fs.collection(USERS_COLLECTION).doc(userId).collection(PREFERENCES_COLLECTION);
}

function tombstoneDoc(fs: Firestore, userId: string, prefId: string) {
  return fs
    .collection(USERS_COLLECTION)
    .doc(userId)
    .collection(TOMBSTONE_COLLECTION)
    .doc(tombstoneIdFor(prefId));
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Parse a stored document; returns null for non-preference docs (e.g. legacy `settings`). */
export function parsePreferenceDoc(
  id: string,
  data: Record<string, unknown> | undefined
): UserPreference | null {
  if (!data || !isPreferenceDomain(data.domain) || typeof data.key !== 'string') return null;
  if (typeof data.value !== 'string') return null;
  const sentiment =
    data.sentiment === 'like' || data.sentiment === 'dislike'
      ? (data.sentiment as Sentiment)
      : undefined;
  let details: InterestDetails | undefined;
  if (DETAIL_DOMAINS.includes(data.domain) && data.details && typeof data.details === 'object') {
    const raw = data.details as Record<string, unknown>;
    details = {
      ...(sanitizeDetails(raw) ?? {}),
      ...(raw.lastMentionedAt ? { lastMentionedAt: toIso(raw.lastMentionedAt) } : {}),
    };
  }
  return {
    id,
    domain: data.domain,
    key: data.key,
    value: data.value,
    ...(sentiment ? { sentiment } : {}),
    ...(details ? { details } : {}),
    source: data.source === 'explicit' ? 'explicit' : 'inferred',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    userEdited: data.userEdited === true,
    sourceConversationIds: strings(data.sourceConversationIds),
    ...(Array.isArray(data.sourceFactIds) ? { sourceFactIds: strings(data.sourceFactIds) } : {}),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    ...(data.editedAt ? { editedAt: toIso(data.editedAt) } : {}),
  };
}

function toDoc(p: UserPreference): Record<string, unknown> {
  // JSON round-trip drops undefined at every depth (Firestore rejects it).
  const doc = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  delete doc.id;
  return doc;
}

async function loadMap(userId: string, fresh = false): Promise<Map<string, UserPreference>> {
  const hit = cache.get(userId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.prefs;
  const fs = db();
  const prefs = new Map<string, UserPreference>(hit?.prefs ?? []);
  if (!fs) return prefs;
  try {
    const snap = await prefsCol(fs, userId).get();
    prefs.clear();
    let legacy: Record<string, unknown> | undefined;
    for (const doc of snap.docs ?? []) {
      if (doc.id === LEGACY_SETTINGS_DOC) {
        legacy = doc.data() as Record<string, unknown>;
        continue;
      }
      const parsed = parsePreferenceDoc(doc.id, doc.data() as Record<string, unknown>);
      if (parsed) prefs.set(parsed.id, parsed);
    }
    cache.set(userId, { at: Date.now(), prefs });
    if (legacy && !legacy.migratedToProfileAt) await migrateLegacy(fs, userId, legacy);
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Could not load preferences');
  }
  return cache.get(userId)?.prefs ?? prefs;
}

/** Fold the old single `settings` doc (old setPreference tool) into the profile, once. */
async function migrateLegacy(
  fs: Firestore,
  userId: string,
  legacy: Record<string, unknown>
): Promise<void> {
  for (const input of legacySettingsToInputs(legacy)) {
    await upsertPreference(userId, input);
  }
  await prefsCol(fs, userId)
    .doc(LEGACY_SETTINGS_DOC)
    .set({ migratedToProfileAt: new Date().toISOString() }, { merge: true });
}

export async function listPreferences(
  userId: string,
  opts: { fresh?: boolean } = {}
): Promise<UserPreference[]> {
  const map = await loadMap(userId, opts.fresh);
  return [...map.values()].sort(
    (a, b) => a.domain.localeCompare(b.domain) || a.key.localeCompare(b.key)
  );
}

export async function getPreference(userId: string, id: string): Promise<UserPreference | null> {
  const map = await loadMap(userId);
  return map.get(id) ?? null;
}

async function isTombstoned(fs: Firestore, userId: string, prefId: string): Promise<boolean> {
  try {
    const snap = await tombstoneDoc(fs, userId, prefId).get();
    return snap.exists === true;
  } catch (error) {
    log.warn({ userId, error: String(error) }, 'Tombstone check failed; skipping write');
    return true;
  }
}

/**
 * Write a preference, applying precedence and tombstones.
 * Automated writes skip tombstoned ids; a deliberate user setting clears the tombstone.
 */
export async function upsertPreference(
  userId: string,
  raw: PreferenceInput
): Promise<UpsertResult> {
  const checked = validateInput(raw);
  if (!checked.ok)
    return { outcome: 'invalid', reason: `${checked.error.field}: ${checked.error.message}` };
  const input = checked.value;
  const id = preferenceIdFor(input.domain, input.key);
  const fs = db();
  const map = await loadMap(userId);

  if (fs) {
    if (input.userEdited) {
      await tombstoneDoc(fs, userId, id)
        .delete()
        .catch((e: unknown) => log.warn({ userId, error: String(e) }, 'Could not clear tombstone'));
    } else if (await isTombstoned(fs, userId, id)) {
      return { outcome: 'skipped_tombstoned' };
    }
  }

  const decision = decideMerge(map.get(id), input, id, new Date().toISOString());
  if (decision.kind === 'skip')
    return { outcome: 'skipped_lower_precedence', preference: map.get(id) };

  if (fs) {
    try {
      await prefsCol(fs, userId).doc(id).set(toDoc(decision.next));
    } catch (error) {
      log.warn({ userId, id, error: String(error) }, 'Could not save preference');
      return { outcome: 'invalid', reason: 'storage unavailable' };
    }
  }
  map.set(id, decision.next);
  const outcome =
    decision.kind === 'create' ? 'created' : decision.kind === 'replace' ? 'updated' : 'reinforced';
  return { outcome, preference: decision.next };
}

export type EditError = 'not_found' | 'invalid' | 'storage';

/** A user edit from the Preferences page: always wins, marks userEdited. */
export async function editPreference(
  userId: string,
  id: string,
  patch: { value?: string; sentiment?: Sentiment; details?: InterestDetails }
): Promise<Result<UserPreference, EditError>> {
  const existing = await getPreference(userId, id);
  if (!existing) return failure('not_found');
  const result = await upsertPreference(userId, {
    domain: existing.domain,
    key: existing.key,
    value: patch.value ?? existing.value,
    sentiment: patch.sentiment ?? existing.sentiment,
    ...(patch.details ? { details: patch.details } : {}),
    source: 'explicit',
    confidence: 1,
    userEdited: true,
  });
  if (!result.preference)
    return failure(result.reason === 'storage unavailable' ? 'storage' : 'invalid');
  return success(result.preference);
}

/** Delete one preference and tombstone it so inference can't bring it back. */
export async function deletePreference(
  userId: string,
  id: string,
  reason: TombstoneReason = 'user_deleted'
): Promise<boolean> {
  const map = await loadMap(userId);
  const existing = map.get(id);
  if (!existing) return false;
  const fs = db();
  if (fs) {
    await prefsCol(fs, userId).doc(id).delete();
    await tombstoneDoc(fs, userId, id).set({
      createdAt: new Date().toISOString(),
      reason,
      kind: 'preference',
      domain: existing.domain,
      key: existing.key,
    });
  }
  map.delete(id);
  return true;
}

export async function forgetPreferenceByKey(
  userId: string,
  domain: PreferenceDomain,
  key: string,
  reason: TombstoneReason = 'voice_forget'
): Promise<boolean> {
  const checked = validateInput({ domain, key, value: 'x', source: 'explicit', confidence: 1 });
  const canonicalKey = checked.ok ? checked.value.key : key;
  return deletePreference(userId, preferenceIdFor(domain, canonicalKey), reason);
}

async function removeProvenance(
  userId: string,
  matches: (p: UserPreference) => boolean,
  strip: (p: UserPreference) => UserPreference
): Promise<number> {
  const map = await loadMap(userId, true);
  const fs = db();
  let changed = 0;
  for (const pref of [...map.values()]) {
    if (!matches(pref)) continue;
    const next = strip(pref);
    const orphaned =
      !next.userEdited &&
      next.sourceConversationIds.length === 0 &&
      (next.sourceFactIds?.length ?? 0) === 0;
    if (orphaned) {
      await deletePreference(userId, pref.id, 'conversation_deleted');
    } else {
      if (fs) await prefsCol(fs, userId).doc(pref.id).set(toDoc(next));
      map.set(pref.id, next);
    }
    changed += 1;
  }
  return changed;
}

/**
 * Cascade hook for conversation deletion (C): drop the conversation from provenance;
 * a non-user-edited preference left with no evidence is deleted and tombstoned.
 */
export async function deletePreferencesFor(
  userId: string,
  conversationId: string
): Promise<number> {
  return removeProvenance(
    userId,
    (p) => p.sourceConversationIds.includes(conversationId),
    (p) => ({
      ...p,
      sourceConversationIds: p.sourceConversationIds.filter((c) => c !== conversationId),
    })
  );
}

/** Cascade hook for fact deletion (C / B): same rule, keyed by fact id. */
export async function deletePreferencesDerivedFromFact(
  userId: string,
  factId: string
): Promise<number> {
  return removeProvenance(
    userId,
    (p) => (p.sourceFactIds ?? []).includes(factId),
    (p) => ({ ...p, sourceFactIds: (p.sourceFactIds ?? []).filter((f) => f !== factId) })
  );
}

/** Wipe the whole profile (account-level "delete all my memory"). Returns docs removed. */
export async function deleteAllPreferences(userId: string): Promise<number> {
  const fs = db();
  let removed = 0;
  if (fs) {
    const snap = await prefsCol(fs, userId).get();
    for (const doc of snap.docs ?? []) {
      await doc.ref.delete();
      removed += 1;
    }
  }
  cache.delete(userId);
  return removed;
}

export async function exportPreferences(
  userId: string
): Promise<{ preferences: UserPreference[]; exportedAt: string }> {
  return {
    preferences: await listPreferences(userId, { fresh: true }),
    exportedAt: new Date().toISOString(),
  };
}

export function clearPreferenceCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
