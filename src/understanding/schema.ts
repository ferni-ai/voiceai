/**
 * Turn reading v0.1: one closed-set read of a turn, the schema shared with the
 * golden set (voiceai-evidence/golden-set-2026-10-22). Change it only together
 * with the golden set's labels. It reads a caller turn; action_claim reads the
 * same way on a Ferni turn.
 *
 * Every backend returns the same shape plus, per field, a confidence (null when
 * the backend has none) and its own id, so a calibrated student model can
 * abstain on a field and hand just that field to a slower teacher.
 *
 * @module understanding/schema
 */
import { z } from 'zod';

const valence = z.number().int().min(-2).max(2);

const turnReading = z
  .object({
    speech_act: z.enum([
      'answer',
      'greeting',
      'self_id',
      'pleasantry',
      'question',
      'request',
      'statement',
      'topic_change',
      'backchannel',
      'closing',
    ]),
    answered_prior_question: z.enum(['yes', 'no', 'partial', 'n/a']),
    affect: z
      .object({
        label: z.enum(['low', 'neutral', 'upbeat', 'mixed', 'distress']),
        valence,
        arousal: z.enum(['low', 'med', 'high']),
      })
      .strict(),
    // How good or bad the words sound, and the events they describe: sarcasm is
    // the two in conflict ("oh fantastic, my car broke down") when not sincere.
    affect_text: valence,
    affect_situation: valence,
    affect_target: z.enum(['caller', 'ferni', 'other', 'none']),
    sarcasm: z.boolean(),
    action_claim: z
      .object({
        kind: z.enum(['none', 'send', 'call', 'schedule', 'book', 'remember', 'other']),
        tense: z.enum(['past', 'present', 'future']),
        // The speaker's own doing, not something asked of the listener.
        own_life: z.boolean(),
      })
      .strict(),
    explicit_self_report: z.boolean(),
    time_expressions: z.array(
      z
        .object({
          text: z.string(),
          kind: z.enum(['point', 'span']),
          // Null when the words name no resolvable date ("someday").
          start_iso: z.string().nullable(),
          end_iso: z.string().nullable(),
          relation: z.enum(['future', 'ongoing', 'past']),
        })
        .strict()
    ),
    temporal_orientation: z.enum(['future_plan', 'past_report', 'ongoing', 'none']),
    // Graded and monotone. Never enough alone to offer 988: it is one signal
    // into the tiered crisis stack, which needs confirmed ideation for that.
    crisis_signal: z.enum(['none', 'distress', 'passive', 'active', 'plan']),
    name_given: z.string().nullable(),
    humor_cue: z.enum(['none', 'laugh', 'joke', 'good_news']),
  })
  .strict();

export type TurnReading = z.infer<typeof turnReading>;
export const TURN_READING_ZOD = turnReading;

type Nested = 'affect' | 'action_claim';
/** A field compared on its own: the nested objects split into their parts. */
export type ReadingField =
  | Exclude<keyof TurnReading, Nested>
  | { [K in Nested]: `${K}.${keyof TurnReading[K] & string}` }[Nested];
export const READING_FIELDS = Object.entries(turnReading.shape).flatMap(([k, v]) =>
  v instanceof z.ZodObject ? Object.keys(v.shape).map((p) => `${k}.${p}`) : [k]
) as ReadingField[];

/** JSON Schema for model structured output (no $schema key: Vertex rejects it). */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}
export const TURN_READING_JSON_SCHEMA = jsonSchemaOf(turnReading);

/** A reading from raw model output (string or object), or null when it is not valid. Never throws. */
export function parseTurnReading(raw: unknown): TurnReading | null {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
    } catch {
      return null;
    }
  }
  const parsed = turnReading.safeParse(value);
  return parsed.success ? parsed.data : null;
}

type Value = string | number | boolean | null;

/** A field's value in a reading, comparable with ===; time expressions as relation[,relation]. */
export function fieldValue(r: TurnReading, field: ReadingField): Value {
  if (field === 'time_expressions') return r.time_expressions.map((t) => t.relation).join(',');
  const [head, part] = field.split('.') as [keyof TurnReading, string?];
  const v = r[head];
  return part ? ((v as Record<string, Value>)[part] ?? null) : (v as Value);
}

/** The reading with `field` set to `value` (for merging a teacher's answer into a student's). */
export function withField(
  r: TurnReading,
  field: ReadingField,
  value: Value | TurnReading['time_expressions']
): TurnReading {
  const [head, part] = field.split('.') as [keyof TurnReading, string?];
  const next = structuredClone(r) as Record<string, unknown>;
  if (part) (next[head] as Record<string, unknown>)[part] = value;
  else next[head] = value;
  return next as TurnReading;
}

/** What a backend reads from: the turn, its context, and the call's clock. */
export interface TurnInput {
  /** Ferni's last spoken line before this turn ('' when none). */
  ferniLast: string;
  callerTurn: string;
  /** Up to two caller turns before this one, oldest first. */
  priorCallerTurns: string[];
  /** When the turn was said, ISO 8601. */
  callTimestamp: string;
  /** The caller's IANA zone, when known. */
  callerTimezone?: string;
  /** The name the caller is known by, when known. */
  callerName?: string;
}

/** A backend's answer: the reading, per-field confidence (null = none), and who read it. */
export interface ScoredReading {
  reading: TurnReading;
  confidence: Partial<Record<ReadingField, number | null>>;
  backend: string;
}
