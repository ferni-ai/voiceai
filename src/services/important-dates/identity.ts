/**
 * Deterministic identity for important dates.
 *
 * The same date learned twice (by voice, by detection, from the web page)
 * must land on the same document, so the id is a hash of the normalised key.
 * Ids are prefixed `date_` so they never collide with fact ids in the shared
 * `memory_tombstones` collection.
 *
 * @module services/important-dates/identity
 */

import { createHash } from 'crypto';
import type { ImportantDateKind } from './types.js';

/** Lowercase, trim, drop possessives/punctuation, collapse whitespace. */
export function normalizeDateKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function importantDateIdFor(key: string): string {
  const hash = createHash('sha256').update(normalizeDateKey(key)).digest('hex');
  return `date_${hash.slice(0, 24)}`;
}

const SELF_WORDS = new Set(['', 'me', 'my', 'mine', 'myself', 'i', 'our', 'us', 'we', 'self']);

/**
 * The conventional key for a date: `birthday:sam`, `anniversary:self`,
 * `deadline:tax return`. Detection and voice tools both use this so the same
 * date converges on one document.
 */
export function importantDateKey(input: {
  kind: ImportantDateKind;
  person?: string;
  title?: string;
}): string {
  const person = normalizeDateKey(input.person ?? '');
  if (input.kind === 'birthday' || input.kind === 'anniversary') {
    return `${input.kind}:${SELF_WORDS.has(person) ? 'self' : person}`;
  }
  const subject = person && !SELF_WORDS.has(person) ? `${person} ` : '';
  return `${input.kind}:${subject}${normalizeDateKey(input.title ?? '')}`.trim();
}
