/**
 * How urgent a concern from a family check-in call is. A model writes it, so it
 * can come back in any case, padded, or as "critical". Read on both sides: the
 * family summary stores it, and the sponsor's urgent alert (outreach) decides on it.
 *
 * @module types/concern-urgency
 */

const CONCERN_URGENCIES = ['low', 'medium', 'high', 'urgent'] as const;
export type ConcernUrgency = (typeof CONCERN_URGENCIES)[number];

/**
 * The urgency a written value means: trimmed, in any case, with "critical" read
 * as "urgent". Null for anything else, so each caller keeps its own default.
 */
export function concernUrgency(value: unknown): ConcernUrgency | null {
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase();
  if (word === 'critical') return 'urgent';
  return CONCERN_URGENCIES.find((u) => u === word) ?? null;
}
