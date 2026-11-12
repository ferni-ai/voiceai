/**
 * The crisis kernel's K0 baseline (scripts/crisis-eval/baseline/generate.ts) is what this head's
 * deterministic crisis readers make of every crisis corpus line. Any change to a reader, a corpus
 * or a prod profile changes the file: rerun `pnpm crisis:baseline` and review the diff, since the
 * later kernel steps are measured against it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { baselineText, changedRows, CONFIGS, OUT, readAll } from '../baseline/generate.js';

/**
 * `read()`, counting writes to process.env.TZ. Each write makes Node drop its time zone cache;
 * one per corpus line (31k lines, 3 configs) made regenerating take most of the 120 s timeout on
 * a loaded runner. The proxy forwards every read and write, so the readers see the real env.
 */
function zoneWrites<T>(read: () => T): [T, number] {
  const { env } = process;
  let writes = 0;
  process.env = new Proxy(env, {
    set: (target, key, value) => {
      if (key === 'TZ') writes++;
      return Reflect.set(target, key, value);
    },
    deleteProperty: (target, key) => {
      if (key === 'TZ') writes++;
      return Reflect.deleteProperty(target, key);
    },
  });
  try {
    return [read(), writes];
  } finally {
    process.env = env;
  }
}

describe('crisis K0 deterministic baseline', () => {
  it('regenerating on this head reproduces the committed file byte for byte', () => {
    const [committed, zone] = [readFileSync(OUT, 'utf8'), process.env.TZ];
    const [fresh, writes] = zoneWrites(baselineText);
    expect(process.env.TZ, 'the caller zone is restored').toBe(zone);
    // The rows read differently first, by name; then any other byte (a key, a hash, the head).
    expect(changedRows(committed, fresh), 'run pnpm crisis:baseline').toEqual([]);
    expect(fresh === committed, 'run pnpm crisis:baseline').toBe(true);
    // The zone is pinned once per pass (set, then restored), never once per line.
    const passes = Object.keys(CONFIGS).length;
    expect(writes, 'pin TZ once per readAll pass').toBeLessThanOrEqual(2 * passes);
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
