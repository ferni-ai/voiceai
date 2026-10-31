import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clusterBootstrap } from '../../voice-eval/judge-stats.mjs';
import * as cs from '../choice-score.mjs';

const { FLOOR, pairedChoice, scoreChoice } = cs;
import { loadTestSet, TEST_SET, TEST_SET_SHA256 } from '../test-set.mjs';

const CLI = new URL('../choice-score.mjs', import.meta.url).pathname;
/** n scored rows over two seed files (alternating): the first `right` call the labelled tool, the
 *  rest another tool the judge rejected; then `errors` errored rows. Queries are unique unless
 *  `queries` caps them (row i asks query i % queries). */
const rows = (n, right, { prefix = 'q', errors = 0, queries = Infinity, sent = n } = {}) =>
  Array.from({ length: n + errors }, (_, i) => ({
    query: `${prefix}${i % queries}`,
    seedFile: `s${(i % 2) + 1}`,
    label: 'setTimer',
    final: i < right ? 'setTimer' : 'setReminder',
    sufficient: i < right ? undefined : false,
    labelSent: i < sent,
    ...(i >= n ? { error: 'ApiError: 429 judge' } : {}),
  }));
const width = ([lo, hi]) => hi - lo;

describe('scoreChoice', () => {
  it('pools right-or-equivalent, counting a judged-sufficient tool as right', () => {
    const r = rows(600, 420);
    r[500].sufficient = true;
    const s = scoreChoice(r);
    expect(s.rate).toBeCloseTo(421 / 600);
    expect(s.ci[0]).toBeLessThan(s.rate);
    expect(s.ci[1]).toBeGreaterThan(s.rate);
    expect(s.verdict).toBe('FAIL');
    expect(scoreChoice(rows(600, 480)).verdict).toBe('PASS');
    expect(scoreChoice(rows(600, 468)).verdict).toBe('PASS'); // 78.0% is at the floor, not under it
    expect(FLOOR).toBe(0.78);
  });

  it('counts judge errors, so an always-failing judge is visible', () => {
    const r = rows(600, 480).map((x, i) => (i >= 590 ? { ...x, judgeError: true } : x));
    expect(scoreChoice(r).judgeErrors).toBe(10);
    expect(scoreChoice(rows(600, 480)).judgeErrors).toBe(0);
  });

  it('reports the right-tool-sent rate', () => {
    expect(scoreChoice(rows(600, 480, { sent: 450 })).labelSent).toBeCloseTo(0.75);
  });

  it('is INVALID when errored rows are over 2%, since dropping them biases the rate', () => {
    expect(scoreChoice(rows(588, 520, { errors: 12 })).verdict).toBe('PASS'); // exactly 2%
    expect(scoreChoice(rows(587, 520, { errors: 13 })).verdict).toBe('INVALID');
  });

  it('FAILs when errored rows counted as wrong put it under the floor (review #2454)', () => {
    // A true 76.5% (459/600) whose 12 errors all hit misses: 459/588 = 78.06% on scored rows.
    const s = scoreChoice(rows(588, 459, { errors: 12 }));
    expect(s.rate).toBeCloseTo(0.7806, 3);
    expect(s.worst).toBeCloseTo(0.765, 3);
    expect(s.verdict).toBe('FAIL');
  });

  it('is INVALID under the minimum sample or with one seed file', () => {
    expect(cs.MIN_ROWS).toBe(400);
    expect(scoreChoice(rows(1, 1)).verdict).toBe('INVALID');
    expect(scoreChoice(rows(399, 399)).verdict).toBe('INVALID');
    const oneSeed = rows(600, 600).map((r) => ({ ...r, seedFile: 's1' }));
    expect(scoreChoice(oneSeed).verdict).toBe('INVALID');
  });

  it('resamples whole requests: two seeds asking the same requests widen the CI', () => {
    // 300 requests asked once by each seed, with the same outcome both times.
    const r = rows(600, 0, { queries: 300 }).map((x, i) => ({
      ...x,
      final: i % 300 < 225 ? 'setTimer' : 'setReminder',
    }));
    const s = scoreChoice(r);
    expect(s.requests).toBe(300);
    const byRow = clusterBootstrap(
      r.map((x) => +(x.final === x.label)),
      r.map((_, i) => i),
      {
        B: 10000,
        seed: 20261022,
      }
    );
    const rowCi = [byRow[250], byRow[9750]];
    expect(width(s.ci)).toBeGreaterThan(1.3 * width(rowCi)); // about sqrt(2) wider
  });
});

describe('pairedChoice', () => {
  it('diffs the requests both builds answered', () => {
    const p = pairedChoice(rows(600, 360), rows(600, 480));
    expect(p.requests).toBe(600);
    expect(p.diff).toBeCloseTo(-0.2);
    expect(p.ci[1]).toBeLessThan(0);
    expect(pairedChoice(rows(10, 5), rows(10, 5, { prefix: 'other' }))).toBeNull();
  });

  it('averages each request first when seeds repeat it, then diffs per request', () => {
    const row = (query, right) => ({
      query,
      label: 't',
      final: right ? 't' : 'x',
      sufficient: false,
    });
    const cand = [row('a', 1), row('a', 0), row('a', 1), row('b', 0)];
    const base = [row('a', 0), row('b', 0)];
    const p = pairedChoice(cand, base);
    expect(p.requests).toBe(2);
    expect(p.diff).toBeCloseTo(1 / 3); // a: 2/3 - 0, b: 0 - 0; first row or pooled rows say 0.5
  });

  it('counts the baseline errors it dropped', () => {
    expect(pairedChoice(rows(600, 480), rows(588, 480, { errors: 12 })).baseErrors).toBe(12);
  });
});

describe('CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'choice-'));
  const files = (r, name) =>
    ['s1', 's2'].map((s) => {
      const f = join(dir, `${name}-${s}.json`);
      writeFileSync(f, JSON.stringify(r.filter((x) => x.seedFile === s)));
      return f;
    });

  it('exits 1 under the floor, 0 above it, 2 when INVALID, and writes the summary', () => {
    const out = join(dir, 'tool-choice.json');
    const low = spawnSync('node', [CLI, '--out', out, ...files(rows(600, 420), 'low')], {
      encoding: 'utf8',
    });
    expect(low.status).toBe(1);
    expect(low.stdout).toContain('70.0%');
    expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({
      verdict: 'FAIL',
      n: 600,
      files: 2,
    });
    expect(spawnSync('node', [CLI, '--floor', '0.6', ...files(rows(600, 420), 'ok')]).status).toBe(
      0
    );
    expect(spawnSync('node', [CLI, ...files(rows(560, 540, { errors: 40 }), 'err')]).status).toBe(
      2
    );
    // 600 rows in one file with no seedFile field: only MIN_FILES makes this INVALID.
    const one = join(dir, 'one.json');
    writeFileSync(one, JSON.stringify(rows(600, 600).map(({ seedFile, ...r }) => r)));
    const single = spawnSync('node', [CLI, one], { encoding: 'utf8' });
    expect(single.status).toBe(2);
    expect(single.stdout).toMatch(/600 rows .*1 seed files.*INVALID/);
  });

  it('marks an INVALID baseline and shows its errors', () => {
    const r = spawnSync(
      'node',
      [
        CLI,
        '--baseline',
        files(rows(500, 450, { errors: 100 }), 'bad').join(','),
        ...files(rows(600, 480), 'cand'),
      ],
      { encoding: 'utf8' }
    );
    expect(r.stdout).toMatch(/baseline .*100 errored.*INVALID/);
  });
});

describe('frozen eval set', () => {
  it('is the reviewed v1 set, found from the script dir whatever the cwd', () => {
    const set = loadTestSet();
    expect(set).toHaveLength(2375);
    expect(set.every((r) => Object.keys(r).join() === 'query,tool')).toBe(true);
    expect(TEST_SET.pathname).toMatch(/scripts\/tool-retrieval\/fixtures\/choice-test-v1\.json$/);
    const mod = new URL('../test-set.mjs', import.meta.url).href;
    const elsewhere = spawnSync(
      'node',
      ['-e', `import('${mod}').then((m) => console.log(m.loadTestSet().length))`],
      {
        cwd: tmpdir(),
        encoding: 'utf8',
      }
    );
    expect(elsewhere.stdout.trim()).toBe('2375');
  });

  it('refuses an edited file, naming the expected and actual hash and what to do', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'set-')), 'edited.json');
    writeFileSync(f, readFileSync(TEST_SET, 'utf8').replace('createSafeSpace', 'holdSecret'));
    expect(() => loadTestSet(f)).toThrow(TEST_SET_SHA256);
    expect(() => loadTestSet(f)).toThrow(/actual [0-9a-f]{64}/);
    expect(() => loadTestSet(f)).toThrow(/choice-test-v2\.json/);
  });
});
