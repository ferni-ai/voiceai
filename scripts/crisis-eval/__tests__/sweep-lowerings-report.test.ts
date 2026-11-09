/**
 * What the crisis sweep prints (sweep-compare.ts reportLines, printed by
 * sweep-lowerings.ts). The fixtures include the held-out set and the sweep runs in
 * public CI logs, so a raised or lowered row is named by its `source#index` id and
 * its text never reaches stdout or stderr. The summary lines keep their exact
 * format: CI and people grep them. Rows here are fictional.
 */
import { describe, expect, it } from 'vitest';

import { compareSweeps, reportLines, type SweepRow } from '../sweep-compare.js';

const MARKER = 'ZZ-MARKER-7f3a';

const row = (over: Partial<SweepRow>): SweepRow => ({
  id: 'x#0',
  src: 'x',
  label: 'crisis',
  text: `${MARKER} placeholder`,
  sev: 0.5,
  crisis: true,
  imminent: false,
  subject: 'self',
  level: 'concerning',
  ...over,
});

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** One raised row (heldout#12), one lowered row (graded#3), one identical row. */
function sweep() {
  const base = [
    row({ id: 'heldout#12', src: 'heldout', text: `${MARKER} raised row` }),
    row({ id: 'graded#3', src: 'graded', text: `${MARKER} lowered row` }),
    row({ id: 'blind#0', src: 'blind', text: `${MARKER} unchanged row` }),
  ];
  const head = [{ ...base[0], sev: 0.9 }, { ...base[1], sev: 0.2 }, { ...base[2] }];
  return compareSweeps(base, head);
}

describe('crisis sweep report', () => {
  it('carries no row text out of the comparison', () => {
    const cmp = sweep();
    expect(count([...cmp.raised, ...cmp.lowered].join('\n'), MARKER)).toBe(0);
  });

  it('prints raised and lowered rows by id, never by text, on stdout or stderr', () => {
    const { stdout, stderr } = reportLines(sweep(), 3, '1.5');
    const all = [...stdout, ...stderr].join('\n');
    expect(count(all, MARKER)).toBe(0);
    expect(stdout).toContain(
      'raised  [heldout/crisis] sev 0.5->0.9 crisis true->true imminent false->false ' +
        'subject self->self level concerning->concerning | heldout#12'
    );
    expect(stdout).toContain(
      'LOWERED [graded/crisis] sev 0.5->0.2 crisis true->true imminent false->false ' +
        'subject self->self level concerning->concerning | graded#3'
    );
    expect(count(all, 'blind#0')).toBe(0);
  });

  it('keeps the summary and the lowered verdict byte-identical', () => {
    const { stdout, stderr } = reportLines(sweep(), 3, '1.5');
    expect(stdout[0]).toBe('3 reads in 1.5s: 1 lowered, 1 raised, 1 identical');
    expect(stderr).toEqual([
      '\n1 distinct crisis reads went DOWN vs base. The crisis lane is recall-first: patterns ' +
        'are only ever added. Restore the lowered reads, or, if lowering them is intended, ' +
        "that is Seth's call: he approves it with the PR label crisis:lowering-approved.",
    ]);
  });

  it('shows 50 raised rows, then how many more, and nothing on stderr when none went down', () => {
    const base = Array.from({ length: 52 }, (_, i) =>
      row({ id: `heldout#${i}`, src: 'heldout', text: `${MARKER} ${i}` })
    );
    const { stdout, stderr } = reportLines(
      compareSweeps(
        base,
        base.map((r) => ({ ...r, sev: 0.9 }))
      ),
      52,
      '0.4'
    );
    expect(stdout[0]).toBe('52 reads in 0.4s: 0 lowered, 52 raised, 0 identical');
    expect(
      stdout.slice(1, 51).every((l) => /^raised {2}\[heldout\/crisis\] .* \| heldout#\d+$/.test(l))
    ).toBe(true);
    expect(stdout.slice(51)).toEqual(['raised  ... and 2 more']);
    expect(stderr).toEqual([]);
    expect(count(stdout.join('\n'), MARKER)).toBe(0);
  });
});
