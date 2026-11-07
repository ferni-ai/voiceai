/**
 * Review of #2593: each half of the rolling-restart check on its own, and a crashed half-logged
 * boot that must not block a healthy one for good.
 */
import { describe, expect, it } from 'vitest';
import { BootCollector, newSealer, snapshotOf } from '../secrets-parity-lib.js';

const isFlag = (n: string) => n === 'X_FLAG';
const T0 = Date.parse('2026-10-23T09:00:00.000Z');
const MIN = 60_000;

function line(at: number, hash: string, part = 1, parts = 1, flags: Record<string, string> = {}) {
  const body = JSON.stringify({ part, parts, commit: 'c1', hash, flags, env: {} });
  return `[${new Date(at).toISOString()}] [worker] EFFECTIVE_SETTINGS ${body}`;
}

function snap(names: string[], lines: string[], seal = newSealer()) {
  const c = new BootCollector(isFlag, seal);
  lines.forEach((l) => c.add(l));
  return snapshotOf('prod', { names, newest: T0 - MIN }, c.result());
}

const rolling = (s: { problems: readonly string[] }) =>
  s.problems.some((p) => p.includes('too close'));

describe('rolling restart', () => {
  it('flags boots whose lines interleave even when they started more than 2 min apart', () => {
    const s = snap(
      [],
      [
        line(T0, 'hA', 1, 2),
        line(T0 + 5 * MIN, 'hB', 1, 2),
        line(T0 + 5 * MIN, 'hA', 2, 2),
        line(T0 + 5 * MIN, 'hB', 2, 2),
      ]
    );
    expect(rolling(s)).toBe(true);
  });

  it('flags fully logged boots under 2 min apart whose lines do not interleave', () => {
    const s = snap([], [line(T0, 'hA'), line(T0 + 90_000, 'hB')]);
    expect(rolling(s)).toBe(true);
    expect(s.problems.join()).toMatch(/restart the agent/);
  });

  it('does not let an old half-logged boot block a healthy boot an hour later', () => {
    const crashed = snap([], [line(T0, 'hX', 1, 2), line(T0 + 60 * MIN, 'hB')]);
    expect(crashed.problems).toEqual([]);
    const midBoot = snap([], [line(T0, 'hX', 2, 2), line(T0 + 60 * MIN, 'hB')]); // backlog began mid-boot
    expect(midBoot.problems).toEqual([]);
  });
});
