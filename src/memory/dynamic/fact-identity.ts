/**
 * Deterministic fact identity (minimal version).
 *
 * Contract: `factIdFor({ subject, predicate })` is a stable hash of the
 * normalized fact key, so re-learning a fact upserts the same document.
 * Agent B owns the full implementation; this keeps the exact exported
 * signatures so identity merging can key facts the same way.
 *
 * @module memory/dynamic/fact-identity
 */

import { createHash } from 'crypto';

export interface FactKey {
  subject: string;
  predicate: string;
}

/** Lowercase, trim and collapse whitespace in each part of the key. */
export function normalizeFactKey(key: FactKey): string {
  const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');
  return `${norm(key.subject)}|${norm(key.predicate)}`;
}

/** Stable document id for a fact. */
export function factIdFor(key: { subject: string; predicate: string }): string {
  return createHash('sha256').update(normalizeFactKey(key)).digest('hex').slice(0, 32);
}
