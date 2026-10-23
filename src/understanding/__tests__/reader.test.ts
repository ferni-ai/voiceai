import { afterEach, describe, expect, it, vi } from 'vitest';
import { abstainedFields, escalate, readTurn, type TurnReader } from '../reader.js';
import { CAR_INPUT, carReading } from './fixtures.js';

const reader = (read: TurnReader['read'], id = 'fake'): TurnReader => ({ id, read });
/** A backend call that never settles. */
const hang = <T>(): Promise<T> =>
  new Promise<T>(() => {
    /* never settles */
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('readTurn', () => {
  it('returns the reading and its latency when the backend answers in time', async () => {
    const out = await readTurn(
      reader(async () => ({ reading: carReading(), confidence: {}, backend: 'fake' })),
      CAR_INPUT,
      1000
    );
    expect(out.outcome).toBe('ok');
    expect(out.result?.reading.sarcasm).toBe(true);
    const ticks = [100, 350];
    const timed = await readTurn(
      reader(async () => ({ reading: carReading(), confidence: {}, backend: 'fake' })),
      CAR_INPUT,
      1000,
      { clock: () => ticks.shift() ?? 0 }
    );
    expect(timed.latencyMs).toBe(250);
  });

  it('times out to null and aborts the backend call', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const hung = reader((_input, signal) => {
      seen = signal;
      return hang();
    });
    const pending = readTurn(hung, CAR_INPUT, 600);
    await vi.advanceTimersByTimeAsync(599);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;
    expect(out).toMatchObject({ result: null, outcome: 'timeout' });
    expect(seen?.aborted).toBe(true);
  });

  it('stops on the caller signal (a newer final replaced this read)', async () => {
    const stop = new AbortController();
    const pending = readTurn(
      reader(() => hang()),
      CAR_INPUT,
      60_000,
      {
        signal: stop.signal,
      }
    );
    stop.abort();
    expect((await pending).outcome).toBe('aborted');
  });

  it('turns a backend error or an invalid reply into null, never a throw', async () => {
    const thrown = await readTurn(
      reader(() => Promise.reject(new Error('503'))),
      CAR_INPUT,
      1000
    );
    expect(thrown).toMatchObject({ result: null, outcome: 'error' });
    const invalid = await readTurn(
      reader(async () => null),
      CAR_INPUT,
      1000
    );
    expect(invalid).toMatchObject({ result: null, outcome: 'invalid' });
  });
});

describe('abstain and escalate (the student path)', () => {
  const student = {
    reading: carReading({ sarcasm: false, humor_cue: 'joke' }),
    confidence: { sarcasm: 0.4, humor_cue: 0.95, speech_act: 0.9 },
    backend: 'encoder-v1',
  };

  it('abstains only on fields with a confidence under the threshold', () => {
    expect(abstainedFields(student, 0.6)).toEqual(['sarcasm']);
    expect(abstainedFields({ ...student, confidence: {} }, 0.6)).toEqual([]);
  });

  it("re-reads only the abstained fields with the teacher and keeps the student's others", async () => {
    const teacher = reader(
      async () => ({ reading: carReading({ humor_cue: 'none' }), confidence: {}, backend: 't' }),
      'llm-teacher-single'
    );
    const merged = await escalate(student, teacher, CAR_INPUT, 0.6, 1000);
    expect(merged.reading.sarcasm).toBe(true); // from the teacher
    expect(merged.reading.humor_cue).toBe('joke'); // the student's, confident
    expect(merged.confidence.sarcasm).toBeNull();
    expect(merged.backend).toBe('encoder-v1+llm-teacher-single');
  });

  it("keeps the student's reading when the teacher fails", async () => {
    const teacher = reader(() => Promise.reject(new Error('down')));
    expect(await escalate(student, teacher, CAR_INPUT, 0.6, 1000)).toBe(student);
  });
});
