/**
 * The gate every WorldObservation passes before it is stored. Other teams'
 * extractors write into the sink, so nothing is trusted: missing or unknown
 * fields drop the observation, a date that is not a real YYYY-MM-DD is
 * removed (a wrong date would fire "due" on the wrong day), confidence is
 * clamped to 0..1, long text is cut, and crisis text and non-people ("Ferni",
 * "the AI", a pronoun) are never kept.
 *
 * @module intelligence/world-model/temporal/validate
 */

import { isCrisisText } from '../crisis-filter.js';
import { isDay, type SubjectKind, type WorldObservation } from './types.js';

export const MAX_SUBJECT_CHARS = 80;
export const MAX_ATTRIBUTE_CHARS = 40;
export const MAX_VALUE_CHARS = 200;
export const MAX_QUOTE_CHARS = 280;

const KINDS: ReadonlySet<string> = new Set<SubjectKind>(['person', 'self', 'goal', 'situation']);
const NOT_SOMEONE =
  /^(?:ferni|they|them|he|she|it|we|you|i|me|user|speaker|the ai|ai|assistant|an? ai)$/i;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : null;
}

/** The observation, cleaned, if it is well enough formed to keep; else null. */
export function validObservation(raw: unknown, sessionId: string): WorldObservation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Record<keyof WorldObservation, unknown>>;
  const kind = o.subjectKind;
  const subject = text(o.subject, MAX_SUBJECT_CHARS);
  const attribute = text(o.attribute, MAX_ATTRIBUTE_CHARS)?.toLowerCase();
  const value = text(o.value, MAX_VALUE_CHARS);
  if (!subject || !attribute || !value || typeof kind !== 'string' || !KINDS.has(kind)) return null;
  if (kind !== 'self' && NOT_SOMEONE.test(subject)) return null;
  if (typeof o.observedAt !== 'string' || Number.isNaN(Date.parse(o.observedAt))) return null;
  const relation = text(o.relation, MAX_SUBJECT_CHARS) ?? undefined;
  if ([subject, value, relation].some((t) => isCrisisText(t))) return null;

  const confidence =
    typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : 0.5;
  const source = (o.source ?? {}) as { kind?: unknown; sessionId?: unknown; quote?: unknown };
  const quote = text(source.quote, MAX_QUOTE_CHARS);
  const hint = (o.replaces ?? null) as { attribute?: unknown; priorValue?: unknown } | null;
  const hintAttribute = hint ? text(hint.attribute, MAX_ATTRIBUTE_CHARS)?.toLowerCase() : null;
  const priorValue = hint ? text(hint.priorValue, MAX_VALUE_CHARS) : null;

  return {
    subject,
    subjectKind: kind as SubjectKind,
    ...(relation ? { relation } : {}),
    attribute,
    value,
    ...(isDay(o.eventDate) ? { eventDate: o.eventDate } : {}),
    ...(isDay(o.since) ? { since: o.since } : {}),
    observedAt: new Date(o.observedAt).toISOString(),
    confidence: Math.min(1, Math.max(0, confidence)),
    source: {
      kind: source.kind === 'turn' ? 'turn' : 'summary',
      sessionId: text(source.sessionId, MAX_SUBJECT_CHARS) ?? sessionId,
      ...(quote && !isCrisisText(quote) ? { quote } : {}),
    },
    ...(hintAttribute
      ? { replaces: { attribute: hintAttribute, ...(priorValue ? { priorValue } : {}) } }
      : {}),
  };
}
