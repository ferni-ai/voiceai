/**
 * In memory: a person in Your People who has died, as the user marked them.
 *
 * #1339 inferred a death from a memorial date. This is the real field: the user
 * marks someone "in memory", optionally with the day they passed, and can undo
 * it. Ferni never sets it himself. Behind CONTACT_IN_MEMORY (off by default);
 * with the flag off the field is neither saved nor read.
 *
 * With no documented consent Ferni talks ABOUT someone who has died, never AS
 * them, and never offers to call, text or message them.
 *
 * @module services/contacts/in-memory
 */

import { flagOn } from '../../config/env-flag.js';

/** How the user marked someone who has died */
export interface InMemory {
  /** The day they passed (YYYY-MM-DD), when the user gave it */
  passedOn?: string;
  /** When the user marked them (ISO timestamp, set by the server) */
  markedAt: string;
}

interface MaybeInMemory {
  inMemory?: InMemory;
}

/** True when the In memory field is live */
export function inMemoryOn(): boolean {
  return flagOn('CONTACT_IN_MEMORY');
}

/** True when the user has marked this person in memory (and the flag is on) */
export function isInMemory(contact: MaybeInMemory | null | undefined): boolean {
  return inMemoryOn() && !!contact?.inMemory;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day, not after today */
function isPastDay(text: string, now: Date): boolean {
  const match = DATE_ONLY.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return real && date.getDate() === day && date <= today;
}

/** What an edit asks for: set the field, clear it, or a value that isn't valid */
export type InMemoryEdit = { set: InMemory } | { clear: true } | { invalid: true };

/**
 * The `inMemory` value of a contact edit. `null` or `false` clears it. `true`, or
 * `{ passedOn: 'YYYY-MM-DD' }` with a real day that isn't in the future, sets it.
 */
export function parseInMemoryEdit(value: unknown, now: Date = new Date()): InMemoryEdit {
  if (value === null || value === false) return { clear: true };
  const markedAt = now.toISOString();
  if (value === true) return { set: { markedAt } };
  if (typeof value !== 'object' || Array.isArray(value)) return { invalid: true };

  const { passedOn } = value as Record<string, unknown>;
  if (passedOn === undefined || passedOn === null || passedOn === '') {
    return { set: { markedAt } };
  }
  if (typeof passedOn !== 'string' || !isPastDay(passedOn, now)) return { invalid: true };
  return { set: { passedOn, markedAt } };
}

/** The anniversary of the day they passed, as a memorial date */
export function passingDate(contact: MaybeInMemory): {
  date: string;
  type: 'memorial';
  label: string;
} | null {
  const passedOn = isInMemory(contact) ? contact.inMemory?.passedOn : undefined;
  return passedOn ? { date: passedOn, type: 'memorial', label: 'anniversary of passing' } : null;
}

/**
 * What the agent is told about the people the user has lost, so Ferni speaks of
 * them in the past tense and never offers to reach them. Empty when there are none.
 */
export function inMemoryContext(people: ReadonlyArray<MaybeInMemory & { name: string }>): string {
  const lost = people.filter(isInMemory);
  if (lost.length === 0) return '';
  const lines = lost.map((p) => `- ${p.name} has passed away${passedLabel(p.inMemory)}.`);
  return [
    'IN MEMORY (the user told you these people have died):',
    ...lines,
    'Talk about them in the past tense, and only as the user leads. Never speak as them. Never offer to call, text, email or message them, or to send them anything.',
    '',
    '',
  ].join('\n');
}

function passedLabel(inMemory: InMemory | undefined): string {
  if (!inMemory?.passedOn) return '';
  const [year, month] = inMemory.passedOn.split('-').map(Number);
  const when = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return ` (in ${when})`;
}
