/**
 * Experiments expire, warn first. Expired or TBD experiments are warnings (annotations and a
 * nightly issue per owner), never a failure; only a PR that adds or edits an experiment's spec
 * without a future expiry fails (scripts/flags/expiry.ts). Every date here is injected, so no
 * test changes verdict at midnight.
 */
import { describe, expect, it } from 'vitest';
import { FLAG_EXPIRY_BACKFILL } from '../flag-lifecycle-backfill.generated.js';
import {
  flagLifecycle,
  ISSUE_TBD_UNTIL,
  lifecycleWarnings,
  MISSING_EXPIRES_GRACE,
  specProblems,
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
    expect(stale, 'delete these lines from flag-lifecycle-backfill.generated.ts').toEqual([]);
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
