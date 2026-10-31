/**
 * Readers shared by the person-model builders: store fields arrive loosely
 * typed (ISO strings, epoch ms, Timestamps), so no read trusts a schema.
 *
 * @module intelligence/person-model/util
 */
import { containsContactData, isForgotten } from '../../memory/index.js';
import type { FollowUpKind } from '../../services/follow-through/index.js';
import { wallTimeIn } from '../../utils/time-zone.js';
import type { Provenance } from './types.js';

export type Doc = Record<string, unknown>;

export const DAY = 86_400_000;

/** Contact data, never stored or rendered: the one shared rule (memory/domain/contact-data). */
export const hasContactData = containsContactData;

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Epoch ms from an ISO string, epoch ms, a Firestore Timestamp or its JSON form. */
export function ms(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof o.toMillis === 'function') return o.toMillis();
    const s = o._seconds ?? o.seconds;
    if (typeof s === 'number') return s * 1000;
  }
  return null;
}

export const iso = (t: number | null): string | null =>
  t === null ? null : new Date(t).toISOString();

export const prov = (now: Date, sources: string[], inputDocs: number): Provenance => ({
  builtAt: now.toISOString(),
  sources,
  method: 'code',
  inputDocs,
});

/** Not built here (LLM or a later PR): readers derive it live. */
export const dirty = (method: Provenance['method'] = 'code'): Provenance => ({
  builtAt: null,
  sources: [],
  method,
  inputDocs: 0,
});

/** Wall time in their zone (UTC without one); dow 0 = Sunday. */
export function local(t: number, tz: string | null): { day: string; hour: number; dow: number } {
  const w = wallTimeIn(new Date(t), tz ?? 'UTC');
  const day = `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
  return { day, hour: w.hour, dow: new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() };
}

/** A text fit to keep: one short line, not about a forgotten topic, no contact data. */
export function keep(text: unknown, forgotten: readonly string[], max = 120): string | null {
  const s = str(text).replace(/\s+/g, ' ').slice(0, max);
  return s && !hasContactData(s) && !isForgotten(s, forgotten) ? s : null;
}

const KINDS: readonly FollowUpKind[] = [
  'reminder',
  'commitment',
  'promise',
  'thread',
  'date',
  'dose',
];
export const followUpKind = (v: unknown): FollowUpKind | undefined => KINDS.find((k) => k === v);

/** Ferni's own promise still open, read as ferni-commitments.ts getPendingCommitments does. */
export function ferniOpen(c: Doc, now: number): boolean {
  if (c.fulfilled === true || (str(c.outcome) && c.outcome !== 'open') || str(c.releasedAt))
    return false;
  if (c.type === 'remember' || c.type === 'avoid') return false;
  const due = ms(c.dueBy);
  return due === null || due >= now;
}
