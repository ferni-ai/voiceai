/**
 * Fact identity — deterministic IDs for `bogle_users/{uid}/dynamic_facts/{factId}`.
 *
 * Re-learning the same fact (same subject + predicate) must land on the same
 * document, and a user's deletion tombstone (`memory_tombstones/{factId}`)
 * must match the ID extraction would produce again.
 *
 * NOTE: minimal version created by the memory-control work so it can compute
 * tombstone IDs. The extraction work owns this module; keep these signatures.
 *
 * @module memory/dynamic/fact-identity
 */

import { createHash } from 'crypto';

/** Lowercase, trim and collapse whitespace so trivial variations share a key. */
export function normalizeFactKey(key: { subject: string; predicate: string }): string {
  const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${norm(key.subject)}|${norm(key.predicate)}`;
}

/** Stable document ID for a fact key (hex, Firestore-safe). */
export function factIdFor(key: { subject: string; predicate: string }): string {
  return createHash('sha256').update(normalizeFactKey(key)).digest('hex').slice(0, 32);
}
