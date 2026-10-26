/**
 * Experiments expire, warn first. Expired or TBD experiments are warnings (annotations and a
 * nightly issue per owner), never a failure; only a PR that adds or edits an experiment's spec
 * without a future expiry fails (scripts/flags/expiry.ts). Every date here is injected, so no
 * test changes verdict at midnight.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAG_EXPIRY_BACKFILL, parseBackfill } from '../flag-lifecycle-backfill.js';
import {
  flagLifecycle,
  ISSUE_TBD_UNTIL,
  ISSUE_TBD_WARN_FROM,
  lifecycleWarnings,
  MAX_EXPIRY_DAYS,
  MISSING_EXPIRES_GRACE,
  specProblems,
  touchedProblems,
} from '../flag-lifecycle.js';
import { FLAG_MANIFEST } from '../flag-manifest.js';
import type { FlagSpec } from '../flag-spec.js';

const KILL_SWITCH: FlagSpec = { default: 'on', owner: 'voice', kind: 'kill-switch' };
const exp = (extra: Partial<FlagSpec> = {}): FlagSpec => ({
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  ...extra,
});

describe('flag lifecycle: the manifest', () => {
  it('backfills only flags that are still experiments in the manifest', () => {
    const manifest = FLAG_MANIFEST as Record<string, FlagSpec>;
    const stale = Object.keys(FLAG_EXPIRY_BACKFILL).filter(
      (n) => manifest[n]?.kind !== 'experiment'
    );
    expect(stale, 'delete these names from flag-lifecycle-backfill.ts').toEqual([]);
  });

  it('gives every experiment an expiry (its spec or the backfill), so the backfill never has to grow', () => {
    // The backfill may only shrink (scripts/flags/expiry.ts). If this fails, an experiment landed
    // without expires: give it expires + issue in its own spec, never a new backfill name.
    const uncovered = Object.entries(FLAG_MANIFEST as Record<string, FlagSpec>)
      .filter(([n, s]) => s.kind === 'experiment' && flagLifecycle(n, s).source === 'none')
      .map(([n]) => n);
    expect(uncovered).toEqual([]);
  });

  it('had no warnings on the day the backfill landed', () => {
    const warnings = Object.entries(FLAG_MANIFEST).flatMap(([n, s]) =>
      lifecycleWarnings(n, s as FlagSpec, '2026-10-23')
    );
    expect(warnings).toEqual([]);
  });

  it('spreads the experiments that were already past 90 days, a few dates apart', () => {
    const early = Object.values(FLAG_EXPIRY_BACKFILL)
      .map((b) => b.expires)
      .filter((e) => e < '2026-12-20');
    expect(early.length).toBeGreaterThan(0);
    expect(new Set(early).size).toBe(early.length);
  });
});

describe('flag lifecycle: warnings (never failures)', () => {
  it('warns on an experiment past its expiry, or on its expiry day', () => {
    expect(
      lifecycleWarnings('X', exp({ expires: '2026-01-01', issue: '#1' }), '2026-01-02')[0]
    ).toMatch(/expired 2026-01-01/);
    expect(
      lifecycleWarnings('X', exp({ expires: '2026-01-02', issue: '#1' }), '2026-01-02')
    ).toHaveLength(1);
    expect(
      lifecycleWarnings('X', exp({ expires: '2026-01-03', issue: '#1' }), '2026-01-02')
    ).toEqual([]);
  });

  it('allows a missing expiry on an existing flag until the grace date', () => {
    expect(lifecycleWarnings('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-11-30')).toEqual([]);
    expect(
      lifecycleWarnings('NOT_BACKFILLED_X', exp({ issue: '#1' }), MISSING_EXPIRES_GRACE)[0]
    ).toMatch(/no expires/);
  });

  it("warns about issue 'TBD' from ISSUE_TBD_WARN_FROM (2026-12-01), weeks before it can fail", () => {
    expect(
      lifecycleWarnings('X', exp({ expires: '2099-01-01', issue: 'TBD' }), '2026-11-30')
    ).toEqual([]);
    expect(
      lifecycleWarnings('X', exp({ expires: '2099-01-01', issue: 'TBD' }), ISSUE_TBD_WARN_FROM)[0]
    ).toMatch(/still 'TBD'/);
  });

  it('holds kill-switches and config flags to nothing', () => {
    expect(lifecycleWarnings('X', KILL_SWITCH, '2099-01-01')).toEqual([]);
  });

  it("prefers the flag's own spec to the backfill, and gives backfilled ones issue 'TBD'", () => {
    const name = Object.keys(FLAG_EXPIRY_BACKFILL)[0]!;
    expect(flagLifecycle(name, exp())).toMatchObject({ source: 'backfill', issue: 'TBD' });
    expect(flagLifecycle(name, exp({ expires: '2099-01-01', issue: '#9' }))).toMatchObject({
      source: 'spec',
      expires: '2099-01-01',
    });
  });
});

const EXISTING = { isNew: false } as const;
/** The nightly job has opened 'Flag expiry: voice' as #3001, and nothing for other owners. */
const voiceIssueOpen = (owner: string): string | undefined =>
  owner === 'voice' ? '#3001' : undefined;

describe('flag lifecycle: the hard rule for a spec a PR adds or edits', () => {
  it('needs its own valid, future expires and an issue', () => {
    expect(specProblems('X', exp({ expires: '2027-01-01', issue: '#1' }), '2026-10-23')).toEqual(
      []
    );
    expect(
      specProblems('X', exp({ expires: '2027-01-01', issue: 'TBD' }), '2026-10-23', EXISTING)
    ).toEqual([]);
    expect(specProblems('X', exp({ issue: '#1' }), '2026-10-23')[0]).toMatch(/needs expires/);
    expect(specProblems('X', exp({ expires: '2026-10-23', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /not in the future/
    );
    expect(specProblems('X', exp({ expires: '2026-02-30', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /not a YYYY-MM-DD date/
    );
    expect(specProblems('X', exp({ expires: '2027-01-01' }), '2026-10-23')[0]).toMatch(
      /needs a real issue/
    );
    expect(specProblems('X', exp({ expires: '2027-01-01' }), '2026-10-23', EXISTING)[0]).toMatch(
      /edited experiment needs issue/
    );
  });

  it('does not apply to kill-switches and config flags', () => {
    expect(specProblems('X', KILL_SWITCH, '2026-10-23')).toEqual([]);
  });

  it("needs a real issue on a NEW experiment from day one: 'TBD', a non-issue or none fails", () => {
    for (const issue of ['TBD', 'later', '2555', undefined]) {
      expect(
        specProblems('X', exp({ expires: '2027-01-01', issue }), '2026-10-23')[0],
        String(issue)
      ).toMatch(/new experiment needs a real issue/);
    }
    // the owner's nightly issue does not stand in for a new flag's own issue
    expect(
      specProblems('X', exp({ expires: '2027-01-01', issue: 'TBD' }), '2026-10-23', {
        isNew: true,
        ownerIssue: voiceIssueOpen,
      })
    ).toHaveLength(1);
    expect(
      specProblems(
        'X',
        exp({ expires: '2027-01-01', issue: 'https://github.com/ferni-ai/voiceai/issues/9' }),
        '2026-10-23'
      )
    ).toEqual([]);
  });

  it("lets an EDITED existing experiment keep 'TBD' until 2027-01-15, then needs a real or owner issue", () => {
    const spec = exp({ expires: '2027-03-01', issue: 'TBD' });
    expect(specProblems('X', spec, '2027-01-14', EXISTING)).toEqual([]);
    expect(specProblems('X', spec, '2027-01-15', EXISTING)[0]).toMatch(
      /edited after 2027-01-15 and its issue is 'TBD'/
    );
    expect(
      specProblems('X', spec, '2027-01-15', { isNew: false, ownerIssue: voiceIssueOpen })
    ).toEqual([]);
    expect(
      specProblems('X', exp({ expires: '2027-03-01', issue: '#7' }), '2027-01-15', EXISTING)
    ).toEqual([]);
    expect(
      specProblems('X', exp({ expires: '2027-03-01', issue: 'soon' }), '2026-10-23', EXISTING)[0]
    ).toMatch(/is not '#123'/);
  });
});

describe('flag lifecycle: the dates are pinned', () => {
  it('pins the warnings to 2026-12-01, the TBD failure to 2027-01-15, and the longest expiry to 180 days', () => {
    expect(MISSING_EXPIRES_GRACE).toBe('2026-12-01');
    expect(ISSUE_TBD_WARN_FROM).toBe('2026-12-01');
    expect(ISSUE_TBD_UNTIL).toBe('2027-01-15');
    expect(MAX_EXPIRY_DAYS).toBe(180);
  });
});

describe('flag lifecycle: the backfill file', () => {
  it('reads back from its own text exactly (the Flag expiry check parses the base version this way)', () => {
    const text = readFileSync(join(__dirname, '..', 'flag-lifecycle-backfill.ts'), 'utf8');
    const parsed = parseBackfill(text);
    expect(Object.fromEntries(parsed)).toEqual(
      Object.fromEntries(Object.entries(FLAG_EXPIRY_BACKFILL).map(([n, b]) => [n, b.expires]))
    );
    expect(parsed.size).toBeGreaterThan(200);
  });
});

describe('flag lifecycle: after the grace date, touching a flag means fixing it', () => {
  it('fails a touched experiment with no expiry anywhere from 2026-12-01', () => {
    expect(touchedProblems('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-11-30')).toEqual([]);
    expect(touchedProblems('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-12-01')[0]).toMatch(
      /still has no expires/
    );
  });

  it('passes a touched BACKFILLED experiment (issue TBD) until 2027-01-15, and fails it from then', () => {
    const name = Object.keys(FLAG_EXPIRY_BACKFILL)[0]!; // backfilled: has an expiry, issue TBD
    for (const day of ['2026-10-26', '2026-12-01', '2027-01-14'])
      expect(touchedProblems(name, exp(), day), day).toEqual([]);
    for (const day of ['2027-01-15', '2027-06-01'])
      expect(touchedProblems(name, exp(), day)[0], day).toMatch(
        /touched after 2027-01-15 and its issue is 'TBD'/
      );
    expect(touchedProblems(name, exp({ issue: '#12' }), '2027-01-15')).toEqual([]);
  });

  it("accepts the owner's open nightly issue for a backfilled flag, with no hand edit", () => {
    const name = Object.keys(FLAG_EXPIRY_BACKFILL)[0]!;
    const asked: string[] = [];
    const lookup = (owner: string): string | undefined => {
      asked.push(owner);
      return voiceIssueOpen(owner);
    };
    expect(touchedProblems(name, exp(), '2027-01-15', lookup)).toEqual([]); // owner voice: #3001
    expect(touchedProblems(name, exp({ owner: 'memory' }), '2027-01-15', lookup)).toHaveLength(1);
    // before the cut-off nothing is looked up (no gh call in CI until 2027-01-15)
    asked.length = 0;
    expect(touchedProblems(name, exp(), '2027-01-14', lookup)).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('caps a new or edited expires at 180 days, and refuses TBD on an edit after the cut-off', () => {
    expect(specProblems('X', exp({ expires: '2027-04-21', issue: '#1' }), '2026-10-23')).toEqual(
      []
    ); // day 180
    expect(specProblems('X', exp({ expires: '2027-04-22', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /more than 180 days/
    );
    expect(
      specProblems('X', exp({ expires: '2027-03-01', issue: 'TBD' }), '2027-01-15', EXISTING)[0]
    ).toMatch(/'TBD'/);
  });
});
