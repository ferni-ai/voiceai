/**
 * The crisis sweep's comparison (sweep-compare.ts): any read going down is a
 * lowering, a read only going up is raised, equal reads are identical, and
 * sweeps that don't line up are refused rather than compared.
 */
import { describe, expect, it } from 'vitest';

import { compareSweeps, direction, type SweepRow } from '../sweep-compare.js';

const row = (over: Partial<SweepRow> = {}): SweepRow => ({
  id: 'heldout#0',
  src: 'heldout',
  label: 'crisis',
  text: 'i want to end it all',
  sev: 0.9,
  crisis: true,
  imminent: false,
  subject: 'self',
  level: 'crisis',
  ...over,
});

describe('direction', () => {
  it('is 0 for identical reads', () => {
    expect(direction(row(), row())).toBe(0);
  });

  it.each<[string, Partial<SweepRow>, Partial<SweepRow>]>([
    ['severity', { sev: 0.9 }, { sev: 0.75 }],
    ['isCrisis', { crisis: true }, { crisis: false }],
    ['imminent danger', { imminent: true }, { imminent: false }],
    ['subject self -> third party', { subject: 'self' }, { subject: 'third_party' }],
    ['subject -> none', { subject: 'bereaved' }, { subject: null }],
    ['assessSafety level', { level: 'crisis' }, { level: 'urgent' }],
  ])('is -1 when %s goes down', (_name, base, head) => {
    expect(direction(row(base), row(head))).toBe(-1);
  });

  it('is -1 when one read goes down even though another goes up', () => {
    expect(direction(row({ sev: 0.75, level: 'crisis' }), row({ sev: 0.9, level: 'safe' }))).toBe(
      -1
    );
  });

  it('is 1 when reads only go up', () => {
    const base = row({ sev: 0, crisis: false, subject: null, level: 'safe' });
    expect(
      direction(base, row({ sev: 0, crisis: false, subject: null, level: 'concerning' }))
    ).toBe(1);
    expect(direction(row({ imminent: false }), row({ imminent: true }))).toBe(1);
  });

  it('refuses an assessSafety level or subject it cannot order', () => {
    expect(() => direction(row(), row({ level: 'severe' }))).toThrow(/unknown crisis read/);
    expect(() => direction(row({ subject: 'other' }), row())).toThrow(/unknown crisis read/);
  });
});

describe('compareSweeps', () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => row({ id: `x#${i}`, text: `t${i}` }));

  it('counts lowered, raised and identical rows and lists each lowered line', () => {
    const base = ids(3);
    const head = [
      { ...base[0], sev: 0.6, crisis: false },
      { ...base[1], imminent: true },
      { ...base[2] },
    ];
    const cmp = compareSweeps(base, head);
    expect(cmp).toMatchObject({ loweredRows: 1, raisedRows: 1, identical: 1 });
    expect(cmp.lowered).toEqual([
      expect.stringMatching(/sev 0\.9->0\.6 crisis true->false .*\| t0$/),
    ]);
    expect(cmp.raised).toEqual([expect.stringMatching(/imminent false->true .*\| t1$/)]);
  });

  it('reports nothing lowered for identical sweeps', () => {
    const cmp = compareSweeps(ids(4), ids(4));
    expect(cmp).toEqual({ lowered: [], raised: [], loweredRows: 0, raisedRows: 0, identical: 4 });
  });

  it('lists a lowering repeated across fixtures once but counts every row', () => {
    const base = [row({ id: 'a#0' }), row({ id: 'b#0' })];
    const head = base.map((r) => ({ ...r, sev: 0 }));
    const cmp = compareSweeps(base, head);
    expect(cmp.loweredRows).toBe(2);
    expect(cmp.lowered).toHaveLength(1);
  });

  it('refuses sweeps of different fixture sets', () => {
    expect(() => compareSweeps(ids(2), ids(3))).toThrow(/differ in length/);
    expect(() => compareSweeps(ids(1), [row({ id: 'y#0', text: 't0' })])).toThrow(/row 0 differs/);
  });
});
