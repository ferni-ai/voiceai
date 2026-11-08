import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TurnReader, TurnReading } from '../../../src/understanding/index.js';
import { evaluate, guardSealed, loadGolden, teacherLine } from '../eval.js';
import { percentile, scoreField, wilson } from '../metrics.js';

const text = readFileSync(join(__dirname, 'fixtures', 'golden-tiny.jsonl'), 'utf8');
const rows = loadGolden(text, { tz: 'America/New_York' });
const raw = text
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as { id: string; consensus?: TurnReading });

/** Reads every labelled row as labelled, except "Sam here.", which it calls a greeting. */
const oracle: TurnReader = {
  id: 'oracle',
  read: async (input) => {
    const row = raw.find(
      (r) => rows.find((g) => g.id === r.id)?.input.callerTurn === input.callerTurn
    );
    if (!row?.consensus) return null;
    const reading = {
      ...row.consensus,
      arousal: row.consensus.arousal ?? 'high',
      affect_target: row.consensus.affect_target ?? 'other',
    };
    if (row.id === 'self-id-not-answer') reading.speech_act = 'greeting';
    return { reading, confidence: {}, backend: 'oracle' };
  },
};

describe('metrics', () => {
  it('wilson: 8 of 10 is 0.8 with the 95% interval [0.490, 0.943]; 0 of 0 has none', () => {
    expect(wilson(8, 10)).toEqual({ k: 8, n: 10, rate: 0.8, ci: [0.49, 0.943] });
    expect(wilson(0, 0)).toEqual({ k: 0, n: 0, rate: null, ci: null });
  });

  it('percentile is nearest-rank', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3);
    expect(percentile([...Array.from({ length: 19 }, (_, i) => i + 1), 100], 95)).toBe(19);
    expect(percentile([], 50)).toBeNull();
  });

  it('a missing prediction counts against accuracy and recall', () => {
    const s = scoreField([
      ['a', 'a'],
      ['a', undefined],
      ['b', 'a'],
    ]);
    expect(s.accuracy).toMatchObject({ k: 1, n: 3 });
    expect(s.classes['"a"']).toMatchObject({ precision: { k: 1, n: 2 }, recall: { k: 1, n: 2 } });
    expect(s.classes['"b"'].recall).toMatchObject({ k: 0, n: 1 });
  });
});

describe('golden-set rows', () => {
  it('reads context into the input and scores only the fields the labellers agreed on', () => {
    const car = rows.find((r) => r.id === 'sarcasm-car');
    expect(car?.input).toMatchObject({
      ferniLast: 'How was the drive in?',
      priorCallerTurns: ['morning'],
      callTimestamp: '2026-10-22T10:00:00-04:00',
      callerTimezone: 'America/New_York',
    });
    expect(rows.find((r) => r.id === 'pleasantry-opener')?.opener).toBe(true);
    const dog = rows.find((r) => r.id === 'laugh-dog')?.gold ?? {};
    expect('arousal' in dog || 'affect_target' in dog).toBe(false);
    expect(dog['shared.humor']).toBe(true);
    expect(rows.find((r) => r.id === 'unlabelled')?.gold).toEqual({});
  });

  it('refuses the sealed split unless asked: by file name and by row', () => {
    expect(() => guardSealed('/x/split_test_sealed.jsonl', false)).toThrow(/--sealed/);
    expect(() => guardSealed('/x/split_test_sealed.jsonl', true)).not.toThrow();
    expect(() => guardSealed('/x/split_dev.jsonl', false)).not.toThrow();
    const sealedRow = text.split('\n')[0].replace('"split": "dev"', '"split": "test_sealed"');
    expect(() => loadGolden(sealedRow, { tz: 'UTC' })).toThrow(/--sealed/);
    expect(loadGolden(sealedRow, { tz: 'UTC', sealed: true })).toHaveLength(1);
  });
});

describe('eval runner on the synthetic fixture', () => {
  it('scores each backend and the rules with known numbers', async () => {
    const seen: string[] = [];
    const report = await evaluate(rows, [oracle], 1000, (row, backend, reading, outcome) =>
      seen.push(`${row.id}:${backend}:${outcome}:${reading ? 'r' : '-'}`)
    );
    const o = report.oracle;
    expect(o.outcomes).toEqual({ ok: 6, invalid: 1 });
    expect(o.fields.speech_act.accuracy).toMatchObject({ k: 5, n: 6, rate: 0.833 });
    expect(o.fields.speech_act.classes['"greeting"'].precision).toMatchObject({ k: 0, n: 1 });
    expect(o.fields.speech_act.classes['"self_id"'].recall).toMatchObject({ k: 0, n: 1 });
    expect(o.fields.arousal.accuracy).toMatchObject({ k: 5, n: 5 }); // the dog row's labellers disagreed
    expect(o.fields['shared.answered'].accuracy).toMatchObject({ k: 6, n: 6 });
    expect(o.latency_ms.p50).not.toBeNull();
    // Today's rules (answer-turn.ts) get the 30th, "I just sent it" and the dog right, read
    // "Sam here." as an answer and miss "Good thanks, you?" and the car line: 3 of 6.
    // greeting-not-yet misses "on the 30th" as a day ahead (#2452).
    const rules = report.rules.fields;
    expect(rules['shared.answered'].accuracy).toMatchObject({ k: 3, n: 6 });
    expect(rules['shared.day_ahead'].classes.true.recall).toMatchObject({ k: 0, n: 1 });
    expect(Object.keys(rules)).toEqual(
      ['affect', 'answered', 'bad_news', 'crisis_risk', 'day_ahead', 'humor'].map(
        (k) => `shared.${k}`
      )
    );
    expect(seen).toHaveLength(7);
    expect(seen).toContain('unlabelled:oracle:invalid:-');
  });

  it('teacher labels carry the row id and reading, never the turn or its context', async () => {
    const car = rows.find((r) => r.id === 'sarcasm-car')!;
    const line = teacherLine(
      car,
      'llm-teacher-parallel',
      (await oracle.read(car.input, new AbortController().signal))!.reading,
      'ok'
    );
    expect(JSON.parse(line)).toMatchObject({
      id: 'sarcasm-car',
      teacher: 'llm-teacher-parallel',
      outcome: 'ok',
      reading: { sarcasm: true },
    });
    expect(line).not.toMatch(/fantastic|drive in|morning/);
  });
});
