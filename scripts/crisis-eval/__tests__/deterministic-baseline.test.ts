/**
 * The crisis kernel's K0 baseline (scripts/crisis-eval/baseline/generate.ts) is what this head's
 * deterministic crisis readers make of every crisis corpus line. Any change to a reader, a corpus
 * or a prod profile changes the file: rerun `pnpm crisis:baseline` and review the diff, since the
 * later kernel steps are measured against it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { baselineText, OUT, readAll } from '../baseline/generate.js';

describe('crisis K0 deterministic baseline', () => {
  it('regenerating on this head reproduces the committed file byte for byte', () => {
    expect(baselineText() === readFileSync(OUT, 'utf8'), 'run pnpm crisis:baseline').toBe(true);
  }, 120_000);

  it('a flag the readers read changes the readings, so a profile is really applied', () => {
    // #3339: EARLY_WARNING_WORD_BOUNDARY=on drops early-warning crisis_risk on run-together lines.
    const file = 'src/services/wellbeing-tracking/__tests__/crisis-joined-words.json';
    const off = readAll({}).get(file)!;
    const on = readAll({ EARLY_WARNING_WORD_BOUNDARY: 'on' }).get(file)!;
    const changed = off.filter((r, i) => JSON.stringify(r[3]) !== JSON.stringify(on[i][3]));
    expect(changed.length).toBeGreaterThan(0);
  }, 120_000);
});
