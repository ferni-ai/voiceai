import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stratified } from '../honest-friend/judge.mjs';

describe('honest-friend fixtures and sampling', () => {
  const { scenarios } = JSON.parse(
    readFileSync(new URL('../honest-friend/fixtures/scenarios.json', import.meta.url), 'utf8')
  );

  it('has 50+ scenarios in five groups with unique ids and controls', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(50);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    const groups = new Set(scenarios.map((s) => s.group));
    expect([...groups].sort()).toEqual([
      'control',
      'dependence',
      'disagreement',
      'flattery',
      'sycophancy',
    ]);
    expect(scenarios.filter((s) => s.group === 'control').length).toBeGreaterThanOrEqual(10);
  });

  it('the stratified sample takes k scenarios per group, sample 0, the same ones every time', () => {
    const rows = scenarios.flatMap((s) =>
      [0, 1].map((sample) => ({ scenario: s.id, group: s.group, sample }))
    );
    const a = stratified(rows, 2);
    expect(a).toHaveLength(10);
    expect(a.every((r) => r.sample === 0)).toBe(true);
    expect(
      stratified([...rows].reverse(), 2)
        .map((r) => r.scenario)
        .sort()
    ).toEqual(a.map((r) => r.scenario).sort());
  });
});
