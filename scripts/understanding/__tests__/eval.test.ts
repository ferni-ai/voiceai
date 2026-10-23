import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TurnReader } from '../../../src/understanding/index.js';
import { evaluate, loadGolden } from '../eval.js';
import { percentile, scoreField, wilson } from '../metrics.js';

const rows = loadGolden(readFileSync(join(__dirname, 'fixtures', 'golden-tiny.jsonl'), 'utf8'));

/** Reads every labelled row right except one, where it calls Sam's "Sam here." a greeting. */
const oracle: TurnReader = {
  id: 'oracle',
  read: async (input) => {
    const row = rows.find((r) => r.input.callerTurn === input.callerTurn);
    if (!row?.label) return null;
    const reading =
      row.id === 'self-id-not-answer'
        ? { ...row.label, speech_act: 'greeting' as const }
        : row.label;
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
    expect(
      percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100], 95)
    ).toBe(19);
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

describe('eval runner on the synthetic fixture', () => {
  it('loads 7 rows, 6 labelled; a label off the schema is an error', () => {
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.label).length).toBe(6);
    expect(() => loadGolden('{"input":{},"label":{"speech_act":"rant"}}')).toThrow(/schema v0.1/);
  });

  it('scores each backend and the rules with known numbers, and hands every teacher reading out', async () => {
    const seen: string[] = [];
    const report = await evaluate(rows, [oracle], 1000, (row, backend, reading, outcome) =>
      seen.push(`${row.id}:${backend}:${outcome}:${reading ? 'r' : '-'}`)
    );
    const o = report.oracle;
    expect(o.scored).toBe(6);
    expect(o.outcomes).toEqual({ ok: 6, invalid: 1 });
    expect(o.fields.speech_act.accuracy).toMatchObject({ k: 5, n: 6, rate: 0.833 });
    expect(o.fields.speech_act.classes['"greeting"'].precision).toMatchObject({ k: 0, n: 1 });
    expect(o.fields.speech_act.classes['"self_id"'].recall).toMatchObject({ k: 0, n: 1 });
    expect(o.fields.sarcasm.accuracy).toMatchObject({ k: 6, n: 6 });
    expect(o.fields['shared.answered'].accuracy).toMatchObject({ k: 6, n: 6 });
    expect(o.latency_ms.p50).not.toBeNull();
    // Today's rules (answer-turn.ts) get "on the 30th" and "I just sent it" right, read
    // "Sam here." as an answer, and miss the other three: 2 of 6. ATTUNE reads the
    // sarcastic car line as excited, and greeting-not-yet misses "on the 30th" as a day
    // ahead (#2452).
    const rules = report.rules.fields;
    expect(rules['shared.answered'].accuracy).toMatchObject({ k: 2, n: 6 });
    expect(rules['shared.affect'].classes['"upbeat"'].precision).toMatchObject({ k: 1, n: 2 });
    expect(rules['shared.day_ahead'].classes.true.recall).toMatchObject({ k: 0, n: 1 });
    expect(Object.keys(rules).sort()).toEqual(
      ['affect', 'answered', 'bad_news', 'crisis_risk', 'day_ahead', 'humor'].map(
        (k) => `shared.${k}`
      )
    );
    expect(seen).toHaveLength(7);
    expect(seen).toContain('unlabelled:oracle:invalid:-');
    expect(seen).toContain('claim-sent:oracle:ok:r');
  });
});
