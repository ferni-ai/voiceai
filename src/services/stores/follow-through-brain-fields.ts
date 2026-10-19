/**
 * Parses the follow-up brain's optional fields on a stored follow-up (design
 * §2.2). Each is kept only when well formed and dropped on its own otherwise,
 * so a row written before they existed, or with one bad field, still reads as
 * the follow-up it was. Absent stays absent: never `key: undefined`.
 *
 * @module services/stores/follow-through-brain-fields
 */

import {
  ASK_ANSWERS,
  ASK_TYPES,
  CLOSE_REASONS,
  EVENT_PRECISIONS,
  VALENCES,
  type Ask,
  type FollowUp,
  type Salience,
} from '../follow-through/index.js';

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const isTime = (x: unknown): x is string => typeof x === 'string' && !Number.isNaN(Date.parse(x));
const oneOf = (values: readonly string[], x: unknown): boolean => values.includes(x as string);
const ENUMS: Record<string, readonly string[]> = {
  eventPrecision: EVENT_PRECISIONS,
  askType: ASK_TYPES,
  owner: ['caller', 'ferni'],
  closedReason: CLOSE_REASONS,
};
const ASK_ENUMS: Record<string, readonly string[]> = {
  answer: ASK_ANSWERS,
  valence: VALENCES,
  by: ['live', 'llm'],
};

function askOf(x: unknown): Ask[] {
  if (!isRecord(x) || !isTime(x.at) || !oneOf(['opener', 'in-call', 'text'], x.via)) return [];
  if (typeof x.personaId !== 'string' || typeof x.sessionId !== 'string') return [];
  const out: Record<string, unknown> = { at: x.at, via: x.via, personaId: x.personaId };
  out.sessionId = x.sessionId;
  for (const [k, values] of Object.entries(ASK_ENUMS)) if (oneOf(values, x[k])) out[k] = x[k];
  if (isTime(x.answeredAt)) out.answeredAt = x.answeredAt;
  return [out as unknown as Ask];
}

function salienceOf(s: unknown): Salience | null {
  if (!isRecord(s)) return null;
  const { weight, heavy, sensitive, by, v } = s;
  const ok =
    typeof weight === 'number' &&
    weight >= 0 &&
    weight <= 1 &&
    typeof heavy === 'boolean' &&
    typeof sensitive === 'boolean' &&
    (by === 'llm' || by === 'rule') &&
    typeof v === 'number';
  return ok ? { weight, heavy, sensitive, by, v } : null;
}

/** The well-formed brain fields of a stored follow-up. */
export function brainFieldsOf(data: Record<string, unknown>): Partial<FollowUp> {
  const out: Record<string, unknown> = {};
  if (typeof data.topicKey === 'string' && data.topicKey) out.topicKey = data.topicKey;
  if (Array.isArray(data.sources))
    out.sources = data.sources.flatMap((s) =>
      isRecord(s) && typeof s.store === 'string' && typeof s.ref === 'string'
        ? [{ store: s.store, ref: s.ref }]
        : []
    );
  if (data.eventAt === null || isTime(data.eventAt)) out.eventAt = data.eventAt;
  for (const [k, values] of Object.entries(ENUMS)) if (oneOf(values, data[k])) out[k] = data[k];
  const salience = salienceOf(data.salience);
  if (salience) out.salience = salience;
  if (Array.isArray(data.asks)) out.asks = data.asks.flatMap(askOf);
  for (const k of ['snoozedUntil', 'nextEligibleAt']) if (isTime(data[k])) out[k] = data[k];
  return out as Partial<FollowUp>;
}
