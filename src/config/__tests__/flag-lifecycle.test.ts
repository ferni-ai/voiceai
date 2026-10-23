/**
 * Experiments expire. Every experiment flag needs an expiry date that hasn't
 * passed and a tracking issue ('TBD' allowed until ISSUE_TBD_UNTIL). At expiry the
 * flag is deleted, made permanent, or given a new date with a reason.
 */
import { describe, expect, it } from 'vitest';
import { FLAG_EXPIRY_BACKFILL } from '../flag-lifecycle-backfill.generated.js';
import { flagLifecycle, isoDay, ISSUE_TBD_UNTIL, lifecycleProblems } from '../flag-lifecycle.js';
import { FLAG_MANIFEST } from '../flag-manifest.js';
import type { FlagSpec } from '../flag-spec.js';

const today = isoDay(new Date());
const exp = (extra: Partial<FlagSpec> = {}): FlagSpec => ({
  default: 'off',
  owner: 'voice',
  kind: 'experiment',
  ...extra,
});

describe('flag lifecycle: the manifest', () => {
  it('has no expired experiment, and every experiment has an expiry and an issue', () => {
    const problems = Object.entries(FLAG_MANIFEST).flatMap(([name, spec]) =>
      lifecycleProblems(name, spec as FlagSpec, today)
    );
    expect(problems).toEqual([]);
  });

  it('backfills only flags that are still experiments in the manifest', () => {
    const manifest = FLAG_MANIFEST as Record<string, FlagSpec>;
    const stale = Object.keys(FLAG_EXPIRY_BACKFILL).filter(
      (n) => manifest[n]?.kind !== 'experiment'
    );
    expect(stale, 'delete these lines from flag-lifecycle-backfill.generated.ts').toEqual([]);
  });
});

describe('flag lifecycle: the rules', () => {
  it('fails an experiment past its expiry, or on its expiry day', () => {
    expect(
      lifecycleProblems('X', exp({ expires: '2026-01-01', issue: '#1' }), '2026-01-02')[0]
    ).toMatch(/expired 2026-01-01/);
    expect(
      lifecycleProblems('X', exp({ expires: '2026-01-02', issue: '#1' }), '2026-01-02')
    ).toHaveLength(1);
    expect(
      lifecycleProblems('X', exp({ expires: '2026-01-03', issue: '#1' }), '2026-01-02')
    ).toEqual([]);
  });

  it('fails an experiment with no expiry anywhere, or a malformed one', () => {
    expect(lifecycleProblems('NOT_BACKFILLED_X', exp({ issue: '#1' }), '2026-01-02')[0]).toMatch(
      /no expires/
    );
    expect(
      lifecycleProblems('X', exp({ expires: '2026-13-45', issue: '#1' }), '2026-01-02')[0]
    ).toMatch(/not YYYY-MM-DD/);
  });

  it("allows issue 'TBD' only before ISSUE_TBD_UNTIL, and requires an issue", () => {
    const tbd = exp({ expires: '2099-01-01', issue: 'TBD' });
    expect(lifecycleProblems('X', tbd, '2026-10-23')).toEqual([]);
    expect(lifecycleProblems('X', tbd, ISSUE_TBD_UNTIL)[0]).toMatch(/still 'TBD'/);
    expect(lifecycleProblems('X', exp({ expires: '2099-01-01' }), '2026-10-23')[0]).toMatch(
      /no issue/
    );
  });

  it('does not hold kill-switches and config flags to an expiry', () => {
    expect(
      lifecycleProblems('X', { default: 'on', owner: 'voice', kind: 'kill-switch' }, '2026-10-23')
    ).toEqual([]);
  });

  it("prefers the flag's own spec to the backfill, and gives backfilled ones issue 'TBD'", () => {
    const name = Object.keys(FLAG_EXPIRY_BACKFILL)[0]!;
    expect(flagLifecycle(name, exp())).toMatchObject({ source: 'backfill', issue: 'TBD' });
    expect(flagLifecycle(name, exp({ expires: '2099-01-01', issue: '#9' }))).toMatchObject({
      source: 'spec',
      expires: '2099-01-01',
      issue: '#9',
    });
  });
});
