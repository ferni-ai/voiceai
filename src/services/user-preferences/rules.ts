/**
 * Pure rules for the preference profile: ids, validation, precedence and the
 * evidence threshold. No I/O — everything here is unit-testable.
 *
 * @module services/user-preferences/rules
 */

import { createHash } from 'crypto';
import { mergeDetails, sanitizeDetails } from './interest-details.js';
import {
  DETAIL_DOMAINS,
  LIST_PREFIXES,
  PREFERENCE_DOMAINS,
  SINGLE_KEYS,
  type PreferenceDomain,
  type PreferenceInput,
  type UserPreference,
} from './types.js';

export const MAX_VALUE_LENGTH = 200;
/** Inferred preferences change behaviour only above this confidence... */
export const HIGH_CONFIDENCE = 0.85;
/** ...or once seen in this many distinct conversations. */
export const MIN_EVIDENCE_CONVERSATIONS = 2;
/** Boundaries err on the side of caution: a lower bar to start respecting one. */
export const BOUNDARY_MIN_CONFIDENCE = 0.6;

export function normalizeItem(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'&+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Naive singular for allergen names: peanuts → peanut, eggs → egg (not shellfish, molasses). */
export function singular(text: string): string {
  return text.replace(/([a-z]{3,}[^s])s$/, '$1');
}

/** Deterministic document id for a (domain, key) pair. */
export function preferenceIdFor(domain: PreferenceDomain, key: string): string {
  const [prefix, ...rest] = key.split(':');
  const normalizedKey = rest.length > 0 ? `${prefix}:${normalizeItem(rest.join(':'))}` : key;
  const digest = createHash('sha256').update(`${domain}|${normalizedKey}`).digest('hex');
  return `pref_${digest.slice(0, 24)}`;
}

/** Tombstone doc id, kept distinct from fact tombstones in the shared collection. */
export function tombstoneIdFor(preferenceId: string): string {
  return preferenceId;
}

export function isPreferenceDomain(value: unknown): value is PreferenceDomain {
  return typeof value === 'string' && (PREFERENCE_DOMAINS as readonly string[]).includes(value);
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

/**
 * Validate and canonicalise an input. Returns the canonical input, or an error.
 * Closed-vocabulary values are lowercased; list items are normalised.
 */
export function validateInput(
  input: PreferenceInput
): { ok: true; value: PreferenceInput } | { ok: false; error: ValidationError } {
  if (!isPreferenceDomain(input.domain)) {
    return { ok: false, error: { field: 'domain', message: 'unknown domain' } };
  }
  if (typeof input.key !== 'string' || input.key.length === 0 || input.key.length > 120) {
    return { ok: false, error: { field: 'key', message: 'key is required' } };
  }
  const rawValue = typeof input.value === 'string' ? input.value.trim() : '';
  if (rawValue.length === 0 || rawValue.length > MAX_VALUE_LENGTH) {
    return { ok: false, error: { field: 'value', message: 'value is required (max 200 chars)' } };
  }
  const confidence = Number.isFinite(input.confidence)
    ? Math.min(1, Math.max(0, input.confidence))
    : 0.5;

  const single = SINGLE_KEYS[input.domain]?.[input.key];
  if (single !== undefined) {
    let value = rawValue;
    if (single !== null) {
      value = rawValue.toLowerCase();
      if (!single.includes(value)) {
        return {
          ok: false,
          error: { field: 'value', message: `expected one of: ${single.join(', ')}` },
        };
      }
    }
    return {
      ok: true,
      value: { ...input, value, confidence, sentiment: undefined, details: undefined },
    };
  }

  const [prefix, ...rest] = input.key.split(':');
  let item = normalizeItem(rest.join(':'));
  if (!LIST_PREFIXES[input.domain]?.includes(prefix) || item.length === 0) {
    return { ok: false, error: { field: 'key', message: 'unknown key for this domain' } };
  }
  let canonicalValue = rawValue;
  if (input.domain === 'food' && (prefix === 'allergy' || prefix === 'intolerance')) {
    // "peanuts" and "peanut" are the same allergy
    item = singular(item);
    canonicalValue = singular(rawValue.toLowerCase());
  }
  const sentiment =
    input.domain === 'likes' || input.domain === 'media' || input.domain === 'food'
      ? (input.sentiment ?? 'like')
      : undefined;
  if (sentiment !== undefined && sentiment !== 'like' && sentiment !== 'dislike') {
    return { ok: false, error: { field: 'sentiment', message: 'like or dislike' } };
  }
  let details: PreferenceInput['details'];
  if (DETAIL_DOMAINS.includes(input.domain)) {
    const clean = sanitizeDetails(input.details);
    if (clean === null)
      return { ok: false, error: { field: 'details', message: 'invalid details' } };
    details = clean;
  }
  return {
    ok: true,
    value: {
      ...input,
      key: `${prefix}:${item}`,
      value: canonicalValue,
      confidence,
      sentiment,
      details,
    },
  };
}

/** 3 = deliberate user setting, 2 = stated in conversation, 1 = inferred. */
export function rankOf(p: { userEdited?: boolean; source: string }): number {
  if (p.userEdited) return 3;
  return p.source === 'explicit' ? 2 : 1;
}

export type MergeDecision =
  | { kind: 'create'; next: UserPreference }
  | { kind: 'replace'; next: UserPreference }
  | { kind: 'reinforce'; next: UserPreference }
  | { kind: 'provenance_only'; next: UserPreference }
  | { kind: 'skip' };

/** Combine independent evidence: 1 - (1-a)(1-b), capped below certainty. */
function combineConfidence(a: number, b: number): number {
  return Math.min(0.99, 1 - (1 - a) * (1 - b));
}

function union(list: readonly string[], add?: string): string[] {
  const out = [...list];
  if (add && !out.includes(add)) out.push(add);
  return out;
}

/**
 * Decide what an incoming write does to the existing document.
 * - Same value: reinforce (union provenance, combine confidence, raise source).
 * - Different value: replaces only when incoming rank >= existing rank.
 *   A lower-ranked write still records provenance on a user-edited doc (contract:
 *   automated writers may only arrayUnion sourceConversationIds).
 */
export function decideMerge(
  existing: UserPreference | undefined,
  input: PreferenceInput,
  id: string,
  nowIso: string
): MergeDecision {
  const userEdited = input.userEdited === true;
  const isInterest = DETAIL_DOMAINS.includes(input.domain);
  if (!existing) {
    return {
      kind: 'create',
      next: {
        id,
        domain: input.domain,
        key: input.key,
        value: input.value,
        ...(input.sentiment ? { sentiment: input.sentiment } : {}),
        ...(isInterest ? { details: mergeDetails(undefined, input.details, 'auto', nowIso) } : {}),
        source: userEdited ? 'explicit' : input.source,
        confidence: userEdited ? 1 : input.confidence,
        userEdited,
        sourceConversationIds: union([], input.conversationId),
        ...(input.factId ? { sourceFactIds: [input.factId] } : {}),
        createdAt: nowIso,
        updatedAt: nowIso,
        ...(userEdited ? { editedAt: nowIso } : {}),
      },
    };
  }

  const inRank = rankOf({ userEdited, source: input.source });
  const exRank = rankOf(existing);
  const sameValue =
    existing.value.toLowerCase() === input.value.toLowerCase() &&
    (existing.sentiment ?? null) === (input.sentiment ?? null);
  const convs = union(existing.sourceConversationIds, input.conversationId);
  const facts = input.factId
    ? union(existing.sourceFactIds ?? [], input.factId)
    : existing.sourceFactIds;

  if (inRank < exRank) {
    // A lower-ranked writer never changes the value, source or confidence. When it
    // agrees, it may only add provenance (contract: arrayUnion sourceConversationIds).
    const provenanceChanged =
      convs.length !== existing.sourceConversationIds.length ||
      (facts?.length ?? 0) !== (existing.sourceFactIds?.length ?? 0);
    if (!sameValue || !provenanceChanged) return { kind: 'skip' };
    return {
      kind: 'provenance_only',
      next: {
        ...existing,
        sourceConversationIds: convs,
        ...(facts ? { sourceFactIds: facts } : {}),
        ...(isInterest
          ? { details: mergeDetails(existing.details, undefined, 'touch', nowIso) }
          : {}),
      },
    };
  }

  if (sameValue) {
    const explicit = userEdited || existing.source === 'explicit' || input.source === 'explicit';
    return {
      kind: 'reinforce',
      next: {
        ...existing,
        source: explicit ? 'explicit' : 'inferred',
        confidence: userEdited ? 1 : combineConfidence(existing.confidence, input.confidence),
        userEdited: existing.userEdited || userEdited,
        sourceConversationIds: convs,
        ...(facts ? { sourceFactIds: facts } : {}),
        ...(isInterest
          ? {
              details: mergeDetails(
                existing.details,
                input.details,
                userEdited ? 'user' : 'auto',
                nowIso
              ),
            }
          : {}),
        updatedAt: nowIso,
        ...(userEdited ? { editedAt: nowIso } : {}),
      },
    };
  }

  // Different value, incoming rank >= existing rank: the newer statement wins and
  // evidence restarts from this conversation.
  return {
    kind: 'replace',
    next: {
      ...existing,
      value: input.value,
      ...(input.sentiment ? { sentiment: input.sentiment } : {}),
      ...(isInterest
        ? {
            details: mergeDetails(
              existing.details,
              input.details,
              userEdited ? 'user' : 'auto',
              nowIso
            ),
          }
        : {}),
      source: userEdited ? 'explicit' : input.source,
      confidence: userEdited ? 1 : input.confidence,
      userEdited,
      sourceConversationIds: union([], input.conversationId),
      ...(input.factId ? { sourceFactIds: [input.factId] } : { sourceFactIds: [] }),
      updatedAt: nowIso,
      ...(userEdited ? { editedAt: nowIso } : {}),
    },
  };
}

/** Does this preference have enough standing to change how Ferni behaves? */
export function isActive(p: UserPreference): boolean {
  if (p.userEdited || p.source === 'explicit') return true;
  if (p.domain === 'boundaries' && p.confidence >= BOUNDARY_MIN_CONFIDENCE) return true;
  return (
    p.confidence >= HIGH_CONFIDENCE || p.sourceConversationIds.length >= MIN_EVIDENCE_CONVERSATIONS
  );
}
