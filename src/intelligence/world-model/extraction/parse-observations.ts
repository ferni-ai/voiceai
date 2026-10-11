/**
 * Turns the extraction model's reply into observations the world model can
 * trust, dropping anything that would plant a wrong memory.
 *
 * What gets dropped, and why:
 * - Ferni, the AI, or a pronoun as the subject: the entity store filed
 *   "Ferni", "AI Assistant" and "They" as people in the caller's life.
 * - A date that isn't a real YYYY-MM-DD within two years of the call: a wrong
 *   date is worse than none ("how did Tuesday go?" on the wrong Tuesday).
 * - Unknown attributes or subject kinds, empty values.
 *
 * @module intelligence/world-model/extraction/parse-observations
 */
import type { WorldObservation } from '../temporal/types.js';
import { SUBJECT_KINDS, WORLD_ATTRIBUTES } from './extraction-prompt.js';

/** Names that are never a person in the caller's life. Whole-value match. */
const NOT_A_SUBJECT = new Set([
  'ferni',
  'ai',
  'the ai',
  'assistant',
  'ai assistant',
  'the assistant',
  'bot',
  'they',
  'them',
  'he',
  'she',
  'it',
  'that',
  'this',
  'someone',
  'somebody',
  'unknown',
  'user',
  'the user',
  'caller',
  'the caller',
]);

const MAX_VALUE = 120;
const MAX_QUOTE = 200;
const DAY_MS = 86_400_000;
const DATE_WINDOW_DAYS = 730;

export interface ParseContext {
  sessionId: string;
  /** ISO time of call start, used as observedAt. */
  observedAt: string;
  /** YYYY-MM-DD of the call in the caller's timezone. */
  callDate: string;
}

function str(x: unknown, max: number): string | undefined {
  if (typeof x !== 'string') return undefined;
  const t = x.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
}

/** A real calendar day within two years of the call, or undefined. */
export function validDate(x: unknown, callDate: string): string | undefined {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return undefined;
  const d = new Date(`${x}T00:00:00Z`);
  // Rejects 2026-02-30, which Date rolls over to March.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x) return undefined;
  const call = new Date(`${callDate}T00:00:00Z`).getTime();
  if (Number.isNaN(call) || Math.abs(d.getTime() - call) > DATE_WINDOW_DAYS * DAY_MS)
    return undefined;
  return x;
}

function oneOf<T extends string>(x: unknown, allowed: readonly T[]): T | undefined {
  return typeof x === 'string' && (allowed as readonly string[]).includes(x) ? (x as T) : undefined;
}

/** A change marker the store can act on without a judge: a known attribute, an optional old value. */
function replacesOf(x: unknown): WorldObservation['replaces'] | undefined {
  if (typeof x !== 'object' || x === null) return undefined;
  const r = x as Record<string, unknown>;
  const attribute = oneOf(r.attribute, WORLD_ATTRIBUTES);
  if (!attribute) return undefined;
  const priorValue = str(r.priorValue, MAX_VALUE);
  return priorValue ? { attribute, priorValue } : { attribute };
}

/** The optional fields: relation (people only), dates that check out, the quote. */
function withDetails(
  obs: WorldObservation,
  r: Record<string, unknown>,
  ctx: ParseContext
): WorldObservation {
  const relation = obs.subjectKind === 'person' ? str(r.relation, 40) : undefined;
  if (relation) obs.relation = relation;
  const eventDate = validDate(r.eventDate, ctx.callDate);
  if (eventDate) obs.eventDate = eventDate;
  const since = validDate(r.since, ctx.callDate);
  if (since) obs.since = since;
  const quote = str(r.quote, MAX_QUOTE);
  if (quote) obs.source.quote = quote;
  const replaces = replacesOf(r.replaces);
  if (replaces) obs.replaces = replaces;
  return obs;
}

/** Validates one raw item; undefined when it can't be trusted. */
export function toObservation(raw: unknown, ctx: ParseContext): WorldObservation | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const subjectKind = oneOf(r.subjectKind, SUBJECT_KINDS);
  const attribute = oneOf(r.attribute, WORLD_ATTRIBUTES);
  const value = str(r.value, MAX_VALUE);
  let subject = str(r.subject, 60);
  if (!subjectKind || !attribute || !value || !subject) return undefined;
  if (subjectKind === 'self') subject = 'self';
  else if (NOT_A_SUBJECT.has(subject.toLowerCase())) return undefined;

  const confidence =
    typeof r.confidence === 'number' && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : 0.5;
  const obs: WorldObservation = {
    subject,
    subjectKind,
    attribute,
    value,
    observedAt: ctx.observedAt,
    confidence,
    source: { kind: 'turn', sessionId: ctx.sessionId },
  };
  return withDetails(obs, r, ctx);
}

/** The observations in a model reply; [] when the reply has no usable JSON. */
export function parseObservations(
  reply: string | null | undefined,
  ctx: ParseContext
): WorldObservation[] {
  if (!reply) return [];
  const json = reply.match(/\{[\s\S]*\}/);
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json[0]);
  } catch {
    return [];
  }
  const items = (parsed as { observations?: unknown }).observations;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => toObservation(i, ctx))
    .filter((o): o is WorldObservation => o !== undefined);
}
