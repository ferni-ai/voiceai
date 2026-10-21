/**
 * What we actually know about the last time the user and a contact interacted.
 *
 * Kept apart from contact-relationship-service so callers (and tests that mock that
 * service) can ask "how long since?" without pulling in Firestore.
 *
 * @module services/contacts/last-interaction
 */

import type { ContactRelationship } from './contact-relationship-service.js';

const DAY_MS = 1000 * 60 * 60 * 24;

type WithLastInteraction = { lastInteraction?: Date | string | null };

/** A stored time (Date, Firestore Timestamp, ISO string or epoch ms) as ms, or null. */
function toMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  const date = (value as { toDate?: () => Date }).toDate?.() ?? value;
  const ms = date instanceof Date ? date.getTime() : new Date(date as string | number).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** The last real interaction as a time, or null (a serialized date string counts too). */
function lastInteractionMs(contact: WithLastInteraction): number | null {
  return toMs(contact.lastInteraction);
}

/** True only when a real interaction with this person has been recorded. */
export function hasRealInteraction(contact: WithLastInteraction): boolean {
  return lastInteractionMs(contact) !== null;
}

/** Whole days since the last real interaction, or null when there has not been one. */
export function daysSinceLastInteraction(
  contact: WithLastInteraction,
  now: Date = new Date()
): number | null {
  const ms = lastInteractionMs(contact);
  if (ms === null) return null;
  return Math.max(0, Math.floor((now.getTime() - ms) / DAY_MS));
}

/** "today", "yesterday" or "N days ago"; null when no interaction has been recorded. */
export function formatDaysAgo(days: number | null): string | null {
  if (days === null) return null;
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The interaction fields of a stored contact. Contacts saved before 2026-10-18 got
 * lastInteraction = createdAt and strengthScore = 50 with zero interactions; those were
 * defaults, not facts, so a contact with no recorded interaction reads back with neither.
 */
export function interactionFields(
  data: Record<string, unknown>
): Pick<ContactRelationship, 'lastInteraction' | 'strengthScore'> {
  const count = typeof data.interactionCount === 'number' ? data.interactionCount : 0;
  const ms = count > 0 ? toMs(data.lastInteraction) : null;
  if (ms === null) return { lastInteraction: undefined, strengthScore: undefined };
  return {
    lastInteraction: new Date(ms),
    strengthScore: typeof data.strengthScore === 'number' ? data.strengthScore : undefined,
  };
}
