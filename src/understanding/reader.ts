/**
 * Swappable turn readers and the one way to call them: a strict timeout, null
 * (never a throw) on any failure. v0 is the LLM teacher, shadow only. The live
 * path is meant to be a small multi-head encoder over "[Ferni's last turn]
 * [SEP] [caller turn]" with calibrated per-field confidence: it answers at once
 * and escalate() has the teacher re-read only the fields it abstains on.
 *
 * @module understanding/reader
 */
import { fieldValue, READING_FIELDS, withField } from './schema.js';
import type { ReadingField, ScoredReading, TurnInput } from './schema.js';

export interface TurnReader {
  /** Logged with every reading, e.g. "llm-teacher-single". */
  readonly id: string;
  read: (input: TurnInput, signal: AbortSignal) => Promise<ScoredReading | null>;
}

export type ReadOutcome = 'ok' | 'timeout' | 'invalid' | 'error' | 'aborted';
export interface TimedRead {
  result: ScoredReading | null;
  outcome: ReadOutcome;
  latencyMs: number;
}

/**
 * One read under a strict timeout: on timeout (or `signal`) the call is aborted
 * and the result is null.
 */
export async function readTurn(
  reader: TurnReader,
  input: TurnInput,
  timeoutMs: number,
  { signal, clock = () => performance.now() }: { signal?: AbortSignal; clock?: () => number } = {}
): Promise<TimedRead> {
  const started = clock();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<'timeout' | 'aborted'>((resolve) => {
    const stop = (why: 'timeout' | 'aborted') => () => {
      controller.abort();
      resolve(why);
    };
    timer = setTimeout(stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', stop('aborted'), { once: true });
  });
  const done = (result: ScoredReading | null, outcome: ReadOutcome): TimedRead => ({
    result,
    outcome,
    latencyMs: Math.round(clock() - started),
  });
  try {
    const result = await Promise.race([reader.read(input, controller.signal), stopped]);
    if (result === 'timeout' || result === 'aborted') return done(null, result);
    return done(result, result ? 'ok' : 'invalid');
  } catch {
    return done(null, controller.signal.aborted ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}

/** Fields the backend is less sure of than `threshold` (no confidence: never abstains). */
export function abstainedFields(scored: ScoredReading, threshold: number): ReadingField[] {
  return READING_FIELDS.filter((f) => {
    const c = scored.confidence[f];
    return typeof c === 'number' && c < threshold;
  });
}

/**
 * The student's reading with each abstained field re-read by the teacher. Runs
 * after the reply has started; when the teacher fails the student's stands.
 */
export async function escalate(
  student: ScoredReading,
  teacher: TurnReader,
  input: TurnInput,
  threshold: number,
  timeoutMs: number
): Promise<ScoredReading> {
  const fields = abstainedFields(student, threshold);
  if (fields.length === 0) return student;
  const { result } = await readTurn(teacher, input, timeoutMs);
  if (!result) return student;
  let reading = student.reading;
  const confidence = { ...student.confidence };
  for (const f of fields) {
    const { reading: t } = result;
    reading = withField(
      reading,
      f,
      f === 'time_expressions' ? t.time_expressions : fieldValue(t, f)
    );
    confidence[f] = result.confidence[f] ?? null;
  }
  return { reading, confidence, backend: `${student.backend}+${teacher.id}` };
}
