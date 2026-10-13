import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPORT = fileURLToPath(new URL('../report.mjs', import.meta.url));

/** A rollout of `n` one-turn scenarios in one state, every reply `words` long. */
function rollout(dir, arm, words, score) {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    scenario: `tired-${i}`,
    state: 'tired',
    sample: 0,
    turns: [
      {
        caller: 'Yeah.',
        reply: 'x',
        metrics: {
          words,
          callerWords: 1,
          lengthRatio: words,
          questions: 0,
          advice: false,
          selfShare: false,
          fit: words <= 15,
        },
      },
    ],
  }));
  const file = join(dir, `${arm}.json`);
  writeFileSync(file, JSON.stringify({ arm, rows }));
  const verdicts = Object.fromEntries(rows.map((r) => [`${r.scenario}#0`, [{ score, why: '' }]]));
  writeFileSync(join(dir, `${arm}.judge.gemini.json`), JSON.stringify(verdicts));
  return file;
}

describe('attunement report', () => {
  it('pairs the arms per scenario and reports the change with its interval', () => {
    const dir = mkdtempSync(join(tmpdir(), 'attune-'));
    const off = rollout(dir, 'off', 30, 3);
    const on = rollout(dir, 'on', 10, 5);
    const out = JSON.parse(execFileSync('node', [REPORT, off, on, '--json']).toString());
    const tired = out.states.tired;
    expect(tired.baseline.words.mean).toBe(30);
    expect(tired.delta.words).toMatchObject({ mean: -20, lo: -20, hi: -20 });
    expect(tired.delta.gemini.mean).toBe(2);
    expect(tired.delta.fit.mean).toBe(1);
    expect(tired.baseline.qwen).toBe(null); // no qwen verdicts: nothing to report
    expect(tired.delta.callerShare.mean).toBeCloseTo(1 / 11 - 1 / 31, 6);
  });
});
