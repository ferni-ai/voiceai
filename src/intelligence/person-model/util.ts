/**
 * Readers shared by the person-model builders: store fields arrive loosely
 * typed (ISO strings, epoch ms, Timestamps), so no read trusts a schema.
 *
 * @module intelligence/person-model/util
 */
import { isForgotten } from '../../memory/index.js';
import type { Provenance } from './types.js';

export type Doc = Record<string, unknown>;

export const DAY = 86_400_000;

/** A run of 7+ digits (separators allowed) or an @: contact data, never stored or rendered. */
const CONTACT = /@|(?:\d[\s().-]*){7,}/;

export function hasContactData(text: string): boolean {
  return CONTACT.test(text);
}

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

/** A text fit to keep: one short line, not about a forgotten topic, no contact data. */
export function keep(text: unknown, forgotten: readonly string[], max = 120): string | null {
  const s = str(text).replace(/\s+/g, ' ').slice(0, max);
  return s && !hasContactData(s) && !isForgotten(s, forgotten) ? s : null;
}
