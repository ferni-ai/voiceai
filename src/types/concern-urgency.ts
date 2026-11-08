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

/** A concern as the sponsor-facing readers (alert and briefing) see it. */
export interface LabelledConcern {
  urgency: unknown;
  /**
   * False when the model's label only read as this urgency once trimmed,
   * lowercased or "critical" was read as urgent. Missing on records stored
   * before it existed: those only ever held labels already written this way.
   */
  labelWasCanonical?: boolean;
}

const raises = (u: unknown): boolean => u === 'urgent' || u === 'high';

/**
 * The one concern the sponsor hears about: the first urgent or high one. A label
 * the model already wrote as "urgent" or "high" comes first, so the pick is the
 * one made before other labels were read; those only add a pick where there was none.
 */
export function concernForSponsor<T extends LabelledConcern>(
  concerns: readonly T[] | undefined
): T | undefined {
  const canonical = concerns?.find((c) => c.labelWasCanonical !== false && raises(c.urgency));
  return canonical ?? concerns?.find((c) => raises(concernUrgency(c.urgency)));
}
