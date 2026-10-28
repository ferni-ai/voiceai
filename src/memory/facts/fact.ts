/**
 * A fact: one thing Ferni knows about a person, with when it was true
 * (validFrom/validTo) and when Ferni learned and retired it, so a changed value
 * never overwrites. toFact is the strict parser: any other shape is null.
 *
 * @module memory/facts/fact
 */

export const FACT_VERSION = 1;

// prettier-ignore
const FACT_ATTRIBUTES = ['phone', 'email_present', 'city', 'employer', 'role', 'relation', 'birthday',
  'pet', 'health_note', 'preference', 'goal', 'other'] as const;
export type FactAttribute = (typeof FACT_ATTRIBUTES)[number];

// prettier-ignore
const FACT_SOURCES = ['deep_extraction', 'after_call', 'live_tool', 'onboarding', 'dynamic_facts',
  'world_facts', 'manual'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/** One value at a time: a new value replaces the old. The rest (pets, goals...) can hold several. */
const SINGLE = new Set('phone email_present city employer role relation birthday'.split(' '));
export const isSingleValued = (a: FactAttribute): boolean => SINGLE.has(a);

// prettier-ignore
export interface Fact {
  readonly v: typeof FACT_VERSION;
  readonly id: string;
  readonly subjectId: string;
  readonly attribute: FactAttribute;
  /** At most 200 chars. A phone is E.164; email_present is 'true' or 'false', never the address. */
  readonly value: string;
  readonly validFrom: string | null; readonly validTo: string | null;
  readonly learnedAt: string; readonly retiredAt: string | null;
  readonly supersededBy: string | null; readonly sourceEpisodeId: string | null;
  readonly source: FactSource; readonly confidence: number; readonly sensitive: boolean;
  readonly forgottenAt: string | null; readonly lastConfirmedAt: string;
}

const E164 = /^\+[1-9]\d{6,14}$/;
const DATE_LIKE = /^(\d{4}-)?\d{2}-\d{2}$/;
// Seven digits in any script, whatever sits between them, is a number someone could dial
const DIGITS = /\p{Nd}/gu;

function e164(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  const full = /^\d{10}$/.test(digits)
    ? `+1${digits}`
    : /^1\d{10}$/.test(digits)
      ? `+${digits}`
      : digits;
  return E164.test(full) ? full : null;
}

/** The value as stored, or null if it may not be stored for this attribute. */
export function normalizeValue(attribute: FactAttribute, raw: string): string | null {
  const value = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 200) return null;
  if (attribute === 'phone') return e164(value);
  if (attribute === 'email_present') return value === 'true' || value === 'false' ? value : null;
  if (value.includes('@')) return null;
  if (attribute === 'birthday' && DATE_LIKE.test(value)) return value;
  return (value.match(DIGITS)?.length ?? 0) >= 7 ? null : value;
}

/** What two values are compared by: same fact, however it was cased or spaced. */
export const valueKey = (value: string): string => value.toLowerCase();

const ID = /^[\w:.@+-]{1,200}$/;
export const isFactId = (x: unknown): x is string => typeof x === 'string' && ID.test(x);
type Obj = Record<string, unknown>;
const time = (x: unknown): boolean =>
  typeof x === 'string' && x.includes('T') && !Number.isNaN(Date.parse(x));
const orNull = (x: unknown, ok: (v: unknown) => boolean): boolean => x === null || ok(x);
const KEYS = (
  'v subjectId attribute value validFrom validTo learnedAt retiredAt supersededBy ' +
  'sourceEpisodeId source confidence sensitive forgottenAt lastConfirmedAt'
).split(' ');

/** A stored document as a fact, or null for any shape this build didn't write. */
export function toFact(id: string, data: unknown): Fact | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const o = data as Obj;
  const attribute = o.attribute;
  const ok =
    Object.keys(o).every((k) => KEYS.includes(k)) &&
    o.v === FACT_VERSION &&
    isFactId(id) &&
    isFactId(o.subjectId) &&
    (FACT_ATTRIBUTES as readonly unknown[]).includes(attribute) &&
    typeof o.value === 'string' &&
    normalizeValue(attribute as FactAttribute, o.value) === o.value &&
    orNull(o.validFrom, time) &&
    orNull(o.validTo, time) &&
    time(o.learnedAt) &&
    orNull(o.retiredAt, time) &&
    orNull(o.supersededBy, isFactId) &&
    orNull(o.sourceEpisodeId, isFactId) &&
    (FACT_SOURCES as readonly unknown[]).includes(o.source) &&
    typeof o.confidence === 'number' &&
    o.confidence >= 0 &&
    o.confidence <= 1 &&
    typeof o.sensitive === 'boolean' &&
    orNull(o.forgottenAt, time) &&
    time(o.lastConfirmedAt);
  return ok ? { ...(o as Omit<Fact, 'id'>), id } : null;
}
