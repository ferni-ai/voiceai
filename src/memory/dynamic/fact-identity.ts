/**
 * Fact identity: deterministic ids for remembered facts.
 *
 * Every writer of bogle_users/{uid}/dynamic_facts uses these ids so the same
 * fact learned twice upserts one document instead of adding a duplicate, and
 * so a tombstone at memory_tombstones/{factId} can block re-extraction of a
 * fact the user deleted.
 *
 * The key is subject + predicate ("Biscuit" + "breed"). The value is not part
 * of the key, so "lives in Austin" later becoming "lives in Denver" updates the
 * same fact. Predicates that hold many values at once (likes, events) carry
 * the value in the predicate: see predicateForFact().
 *
 * @module memory/dynamic/fact-identity
 */

import { createHash } from 'node:crypto';

export interface FactKey {
  subject: string;
  predicate: string;
}

/** Ways the extractor names the caller themself; they all mean the same subject. */
const SELF_SUBJECT = /^(the\s+)?(user|speaker|me|myself|i|caller|self)$/;

/** Lowercase, Unicode-normalised, punctuation-free, single-spaced. */
export function normalizeFactPart(part: string): string {
  return part
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/['’]s\b/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The normalised key text a fact id is hashed from.
 * Accepts the structured key, or free text (used as the predicate of the caller).
 */
export function normalizeFactKey(key: FactKey | string): string {
  const { subject, predicate } =
    typeof key === 'string' ? { subject: 'user', predicate: key } : key;
  let s = normalizeFactPart(subject);
  if (SELF_SUBJECT.test(s) || s === '') s = 'user';
  const p = normalizeFactPart(predicate);
  return `${s}|${p}`;
}

/** Deterministic fact id: `f_` + 32 hex chars of SHA-256 over the normalised key. */
export function factIdFor(key: FactKey): string;
export function factIdFor(key: FactKey | string): string;
export function factIdFor(key: FactKey | string): string {
  const digest = createHash('sha256').update(normalizeFactKey(key)).digest('hex');
  return `f_${digest.slice(0, 32)}`;
}

/** Deterministic id for an entity (person, place, ...) by type and name. */
export function entityIdFor(name: string, type: string): string {
  const key = `${normalizeFactPart(type)}|${normalizeFactPart(name)}`;
  return `e_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

/** Deterministic id for a relationship edge. Bidirectional edges ignore direction. */
export function relationshipIdFor(
  source: string,
  target: string,
  type: string,
  bidirectional = false
): string {
  let [a, b] = [normalizeFactPart(source), normalizeFactPart(target)];
  if (bidirectional && b < a) [a, b] = [b, a];
  const key = `${a}|${normalizeFactPart(type)}|${b}`;
  return `r_${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}

/** Fact types whose predicate can hold several values at once ("likes jazz", "likes hiking"). */
const MULTI_VALUED_TYPES = new Set(['preference', 'event', 'relationship']);

/** The subset of an extracted fact needed to identify it. */
export interface IdentifiableFact {
  entityName: string;
  key: string;
  value: string;
  factType?: string;
}

/**
 * The predicate used for a fact's id. Single-valued facts (attribute, state)
 * use the key alone so a new value replaces the old one; multi-valued facts
 * include the value so each one is kept.
 */
export function predicateForFact(fact: IdentifiableFact): string {
  return MULTI_VALUED_TYPES.has(fact.factType ?? '') ? `${fact.key} ${fact.value}` : fact.key;
}

/** The deterministic id for an extracted fact. */
export function factIdForExtracted(fact: IdentifiableFact): string {
  return factIdFor({ subject: fact.entityName, predicate: predicateForFact(fact) });
}

/** Human-readable text for a fact ("Biscuit: breed is golden retriever"). */
export function factText(fact: IdentifiableFact): string {
  const subject = normalizeFactKey({ subject: fact.entityName, predicate: '' }).startsWith('user|')
    ? 'User'
    : fact.entityName.trim();
  const key = fact.key.replace(/_/g, ' ').trim();
  return `${subject}: ${key} is ${fact.value.trim()}`;
}
