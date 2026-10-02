/**
 * Deterministic identity for aspirations.
 *
 * "Someday I want to live by the sea" and "I'd love to live by the sea" should
 * converge on one dream, so the id hashes the level plus a normalised title
 * (lowercased, accents and punctuation dropped, leading "I want to"-style
 * filler removed). Ids are prefixed `asp_` so they never collide with fact or
 * date ids in the shared `memory_tombstones` collection.
 *
 * @module services/aspirations/identity
 */

import { createHash } from 'crypto';
import type { AspirationLevel } from './types.js';

const LEADING_FILLER =
  /^(?:(?:someday|one day|eventually|honestly|really|so|and|but|like|well)\s+)*(?:i(?:'d| would)? (?:really )?(?:want|wanna|hope|wish|plan|need|love|like|dream(?: of)?|am trying|m trying|am going|m going|have always wanted|ve always wanted)\s+(?:to\s+)?|i(?:'ve| have) always (?:wanted|dreamed of|dreamt of)\s+(?:to\s+)?|before i die i (?:want|hope) to\s+|my (?:big |biggest |lifelong |main )?(?:dream|goal|aim|plan|habit) is (?:to\s+)?|i'm (?:trying|going|working) (?:to|on)\s+|to\s+)/;

/** Lowercase, strip accents/punctuation/filler, collapse whitespace. */
export function normalizeAspirationTitle(title: string): string {
  let t = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip filler repeatedly ("someday I want to ..." → "...").
  for (let i = 0; i < 3; i++) {
    const next = t.replace(LEADING_FILLER, '').trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/'/g, '').replace(/\s+/g, ' ').trim();
}

export function aspirationIdFor(level: AspirationLevel, title: string): string {
  const hash = createHash('sha256')
    .update(`${level}:${normalizeAspirationTitle(title)}`)
    .digest('hex');
  return `asp_${hash.slice(0, 24)}`;
}

export const ASPIRATION_ID_PATTERN = /^asp_[a-f0-9]{24}$/;

export function milestoneIdFor(title: string): string {
  const hash = createHash('sha256').update(normalizeAspirationTitle(title)).digest('hex');
  return `ms_${hash.slice(0, 12)}`;
}

/**
 * Loose match used when the exact id misses: same level and one normalised
 * title contains the other (≥ 8 chars), e.g. "write a book" vs "write a book
 * about my grandmother".
 */
export function titlesOverlap(a: string, b: string): boolean {
  const na = normalizeAspirationTitle(a);
  const nb = normalizeAspirationTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  return short.length >= 8 && long.includes(short);
}
