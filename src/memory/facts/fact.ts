/**
 * A fact: one thing Ferni knows about a person, with when it was true
 * (validFrom/validTo) and when Ferni learned and retired it, so a changed value
 * never overwrites. toFact is the strict parser: any other shape is null.
 *
 * @module memory/facts/fact
 */
import { isContactValueAllowed, toE164 } from '../domain/contact-data.js';

export const FACT_VERSION = 1;

// prettier-ignore
const FACT_ATTRIBUTES = ['phone', 'email_present', 'city', 'employer', 'role', 'relation', 'birthday',
  'pet', 'health_note', 'preference', 'goal', 'other'] as const;
export type FactAttribute = (typeof FACT_ATTRIBUTES)[number];

// prettier-ignore
const FACT_SOURCES = ['deep_extraction', 'after_call', 'live_tool', 'onboarding', 'dynamic_facts',
  'world_facts', 'manual'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/**
 * Who the fact comes from: the person said it, or an extractor inferred it. persona_canon
 * (something Ferni or a teammate says about their own life) is never stored here: the
 * writer refuses it, as Ferni's own life stays out of the person's memory.
 */
export type FactProvenance = 'user_said' | 'inferred' | 'persona_canon';
const STORED_PROVENANCE = ['user_said', 'inferred'] as const;
export type StoredProvenance = (typeof STORED_PROVENANCE)[number];

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
  readonly source: FactSource;
  /** The source's claim, not proof: user_said comes from the extracting model (by: 'caller'). */
  readonly provenance: StoredProvenance;
  readonly confidence: number; readonly sensitive: boolean;
  readonly forgottenAt: string | null; readonly lastConfirmedAt: string;
}

/** The value as stored, or null if it may not be stored for this attribute. */
export function normalizeValue(attribute: FactAttribute, raw: string): string | null {
  const value = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 200) return null;
  if (attribute === 'phone') return toE164(value);
  if (attribute === 'email_present') return value === 'true' || value === 'false' ? value : null;
  return isContactValueAllowed(attribute, value) ? value : null;
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
  'sourceEpisodeId source provenance confidence sensitive forgottenAt lastConfirmedAt'
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
    // Written before M8b without one: 'inferred', the label that claims least.
    (o.provenance === undefined ||
      (STORED_PROVENANCE as readonly unknown[]).includes(o.provenance)) &&
    typeof o.confidence === 'number' &&
    o.confidence >= 0 &&
    o.confidence <= 1 &&
    typeof o.sensitive === 'boolean' &&
    orNull(o.forgottenAt, time) &&
    time(o.lastConfirmedAt);
  return ok
    ? {
        ...(o as Omit<Fact, 'id'>),
        provenance: (o.provenance ?? 'inferred') as StoredProvenance,
        id,
      }
    : null;
}
