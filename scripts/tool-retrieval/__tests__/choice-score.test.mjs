import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLOOR, pairedChoice, scoreChoice } from '../choice-score.mjs';

const CLI = new URL('../choice-score.mjs', import.meta.url).pathname;
const SET = new URL('../fixtures/choice-test-v1.json', import.meta.url);
/** n rows: the first `right` call the labelled tool, the rest another tool the judge rejected. */
const rows = (n, right, { prefix = 'q', errors = 0 } = {}) =>
  Array.from({ length: n + errors }, (_, i) => ({
    query: `${prefix}${i}`,
    label: 'setTimer',
    final: i < right ? 'setTimer' : 'setReminder',
    sufficient: i < right ? undefined : false,
    labelSent: true,
    ...(i >= n ? { error: 'ApiError: 400 thought_signature' } : {}),
  }));

describe('scoreChoice', () => {
  it('pools right-or-equivalent, counting a judged-sufficient tool as right', () => {
    const r = rows(100, 70);
    r[80].sufficient = true;
    const s = scoreChoice(r);
    expect(s.rate).toBeCloseTo(0.71);
    expect(s.ci[0]).toBeLessThan(0.71);
    expect(s.ci[1]).toBeGreaterThan(0.71);
    expect(s.verdict).toBe('FAIL');
    expect(scoreChoice(rows(100, 80)).verdict).toBe('PASS');
    expect(scoreChoice(rows(100, 78)).verdict).toBe('PASS'); // at the floor is not under it
    expect(FLOOR).toBe(0.78);
  });
  it('is INVALID when errored rows are over 2%, since dropping them biases the rate', () => {
    expect(scoreChoice(rows(98, 90, { errors: 2 })).verdict).toBe('PASS'); // exactly 2 of 100
    expect(scoreChoice(rows(97, 90, { errors: 3 })).verdict).toBe('INVALID');
  });
});

describe('pairedChoice', () => {
  it('diffs the requests both builds answered', () => {
    const p = pairedChoice(rows(100, 60), rows(100, 80));
    expect(p.requests).toBe(100);
    expect(p.diff).toBeCloseTo(-0.2);
    expect(p.ci[1]).toBeLessThan(0);
    expect(pairedChoice(rows(10, 5), rows(10, 5, { prefix: 'other' }))).toBeNull();
  });
});

describe('CLI', () => {
  const file = (r) => {
    const f = join(mkdtempSync(join(tmpdir(), 'choice-')), 'choice.json');
    writeFileSync(f, JSON.stringify(r));
    return f;
  };
  it('exits 1 under the floor, 0 above it, 2 on too many errors, and writes the summary', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'choice-')), 'tool-choice.json');
    const low = spawnSync('node', [CLI, '--out', out, file(rows(100, 70))], { encoding: 'utf8' });
    expect(low.status).toBe(1);
    expect(low.stdout).toContain('70.0%');
    expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({ verdict: 'FAIL', n: 100 });
    expect(spawnSync('node', [CLI, '--floor', '0.6', file(rows(100, 70))]).status).toBe(0);
    expect(spawnSync('node', [CLI, file(rows(100, 90, { errors: 5 }))]).status).toBe(2);
  });
});

describe('frozen eval set', () => {
  it('is the reviewed v1 set eval-choice.ts pins', () => {
    const text = readFileSync(SET, 'utf8');
    expect(createHash('sha256').update(text).digest('hex')).toBe(
      'eaab17e8ce0487732e42713824d80f57caffed030785910ea5cf3dc2594d4f8b'
    );
    const set = JSON.parse(text);
    expect(set).toHaveLength(2375);
    expect(set.every((r) => Object.keys(r).join() === 'query,tool')).toBe(true);
  });
});
