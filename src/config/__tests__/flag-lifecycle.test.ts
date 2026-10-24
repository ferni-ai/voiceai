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

  it("warns about issue 'TBD' only from ISSUE_TBD_UNTIL", () => {
    expect(
      lifecycleWarnings('X', exp({ expires: '2099-01-01', issue: 'TBD' }), '2026-10-23')
    ).toEqual([]);
    expect(
      lifecycleWarnings('X', exp({ expires: '2099-01-01', issue: 'TBD' }), ISSUE_TBD_UNTIL)[0]
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

describe('flag lifecycle: the hard rule for a spec a PR adds or edits', () => {
  it('needs its own valid, future expires and an issue', () => {
    expect(specProblems('X', exp({ expires: '2027-01-01', issue: 'TBD' }), '2026-10-23')).toEqual(
      []
    );
    expect(specProblems('X', exp({ issue: '#1' }), '2026-10-23')[0]).toMatch(/needs expires/);
    expect(specProblems('X', exp({ expires: '2026-10-23', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /not in the future/
    );
    expect(specProblems('X', exp({ expires: '2026-02-30', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /not a YYYY-MM-DD date/
    );
    expect(specProblems('X', exp({ expires: '2027-01-01' }), '2026-10-23')[0]).toMatch(
      /needs issue/
    );
  });

  it('does not apply to kill-switches and config flags', () => {
    expect(specProblems('X', KILL_SWITCH, '2026-10-23')).toEqual([]);
  });
});

describe('flag lifecycle: the dates are pinned', () => {
  it('pins the grace date and the TBD cut-off to 2026-12-01, and the longest expiry to 180 days', () => {
    expect(MISSING_EXPIRES_GRACE).toBe('2026-12-01');
    expect(ISSUE_TBD_UNTIL).toBe('2026-12-01');
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
  it('fails a touched experiment with no expiry anywhere, or still TBD, only from 2026-12-01', () => {
    const name = Object.keys(FLAG_EXPIRY_BACKFILL)[0]!; // backfilled: has an expiry, issue TBD
    expect(touchedProblems('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-11-30')).toEqual([]);
    expect(touchedProblems('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-12-01')[0]).toMatch(
      /still has no expires/
    );
    expect(touchedProblems(name, exp(), '2026-11-30')).toEqual([]);
    expect(touchedProblems(name, exp(), '2026-12-01')[0]).toMatch(/still 'TBD'/);
    expect(touchedProblems(name, exp({ issue: '#12' }), '2026-12-01')).toEqual([]);
  });

  it('caps a new or edited expires at 180 days, and refuses TBD after the cut-off', () => {
    expect(specProblems('X', exp({ expires: '2027-04-21', issue: '#1' }), '2026-10-23')).toEqual(
      []
    ); // day 180
    expect(specProblems('X', exp({ expires: '2027-04-22', issue: '#1' }), '2026-10-23')[0]).toMatch(
      /more than 180 days/
    );
    expect(
      specProblems('X', exp({ expires: '2027-01-01', issue: 'TBD' }), '2026-12-01')[0]
    ).toMatch(/'TBD' after 2026-12-01/);
  });
});
