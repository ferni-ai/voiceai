// The caller's local hour is pinned per run (caller-clock.mjs, #3164): a sweep at any wall-clock
// time puts a caller at 14:00 unless the scenario asks for an hour, and EVAL_TZ still overrides.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DAYTIME,
  ZONES,
  callerClock,
  isNight,
  localMinutes,
  minutesOf,
  scenarioCallerTime,
} from '../caller-clock.mjs';

/** The 2026-10-30 candidate sweep's crisis-relay s1: 04:02 in Tokyo. */
const SWEEP = new Date('2026-10-30T19:02:00Z');
const gap = (a, b) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));

describe('callerClock: a scenario with no time zone gets the daytime default', () => {
  it('is 14:00 local, not night, at the instant Tokyo was at 04:02', () => {
    expect(localMinutes(SWEEP, 'Asia/Tokyo')).toBe(4 * 60 + 2);
    const c = callerClock({ env: {}, scenario: '# crisis-relay\nHey.\n', now: SWEEP });
    expect(c.source).toBe('default');
    expect(c.zone).not.toBe('Asia/Tokyo');
    expect(gap(minutesOf(c.local), minutesOf(DAYTIME))).toBeLessThanOrEqual(30);
    expect(localMinutes(SWEEP, c.zone)).toBe(minutesOf(c.local));
    expect(c.night).toBe(false);
  });
  it('stays within 30 min of 14:00 at every hour, in winter and in summer', () => {
    for (const day of ['2026-01-15', '2026-07-15', '2026-10-31']) {
      for (let h = 0; h < 24; h++) {
        const now = new Date(`${day}T${String(h).padStart(2, '0')}:17:00Z`);
        const c = callerClock({ env: {}, now });
        expect(
          gap(minutesOf(c.local), 14 * 60),
          `${now.toISOString()} ${c.zone}`
        ).toBeLessThanOrEqual(30);
        expect(c.night).toBe(false);
      }
    }
  });
  it('every zone it can pick is one Intl knows, and any hour is in reach all year', () => {
    for (const z of ZONES) expect(localMinutes(SWEEP, z), z).not.toBeNull();
    for (const now of [new Date('2026-01-15T00:00:00Z'), new Date('2026-07-15T00:00:00Z')]) {
      const hours = new Set(ZONES.map((z) => Math.floor(localMinutes(now, z) / 60)));
      expect(hours.size, now.toISOString()).toBe(24);
    }
  });
});

describe('callerClock: night only on purpose', () => {
  const night = "# a tired caller\n#@time-of-day 02:30\nHey. Can't sleep.\n";
  it("uses the scenario's #@time-of-day", () => {
    expect(scenarioCallerTime(night)).toBe('02:30');
    const c = callerClock({ env: {}, scenario: night, now: SWEEP });
    expect(c.source).toBe('scenario');
    expect(gap(minutesOf(c.local), 150)).toBeLessThanOrEqual(30);
    expect(c.night).toBe(true);
  });
  it('EVAL_CALLER_TIME wins over the scenario', () => {
    const c = callerClock({ env: { EVAL_CALLER_TIME: '10:00' }, scenario: night, now: SWEEP });
    expect(c.source).toBe('EVAL_CALLER_TIME');
    expect(gap(minutesOf(c.local), 600)).toBeLessThanOrEqual(30);
  });
  it('EVAL_TZ still overrides both, at its wall-clock hour, and says when that is night', () => {
    const c = callerClock({ env: { EVAL_TZ: 'Asia/Tokyo', EVAL_CALLER_TIME: '14:00' }, scenario: night, now: SWEEP }); // prettier-ignore
    expect(c).toEqual({ zone: 'Asia/Tokyo', local: '04:02', source: 'EVAL_TZ', night: true });
    expect(callerClock({ env: { EVAL_TZ: 'none' }, now: SWEEP })).toEqual({
      zone: 'none',
      local: null,
      source: 'EVAL_TZ',
      night: false,
    });
  });
  it('refuses a malformed time instead of falling back to some hour', () => {
    for (const bad of ['9', '24:00', '2:3', 'noon'])
      expect(() => callerClock({ env: { EVAL_CALLER_TIME: bad }, now: SWEEP })).toThrow(
        /not HH:MM/
      );
    expect(() => callerClock({ env: {}, scenario: '#@time-of-day late\n', now: SWEEP })).toThrow(
      /scenario/
    );
  });
  it("matches the agent's late-night window, 23:00 to 05:00", () => {
    const lf = readFileSync(
      new URL('../../../src/agents/personas/listen-first.ts', import.meta.url),
      'utf8'
    );
    expect(lf).toContain('hour >= 23 || hour < 5');
    expect([22 * 60 + 59, 23 * 60, 4 * 60 + 59, 5 * 60].map(isNight)).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });
});

describe('run.sh sends the pinned zone', () => {
  const plan = (scenario, env = {}) =>
    JSON.parse(
      execFileSync(
        '/bin/zsh',
        [fileURLToPath(new URL('../run.sh', import.meta.url)), 'dev', scenario, 'x'],
        {
          env: { ...process.env, EVAL_TZ: '', EVAL_CALLER_TIME: '', ...env, EVAL_DRY_RUN: '1' },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      )
    );
  // CI's ubuntu runner has no zsh (caller-realism.test.mjs skips the same way).
  it.skipIf(!existsSync('/bin/zsh'))(
    'as job metadata: the default zone, the night scenario, EVAL_TZ',
    () => {
      const day = plan('crisis-relay');
      expect(day.caller_clock).toBe('default');
      expect(localMinutes(new Date(), day.metadata.timezone)).not.toSatisfy(isNight);
      const late = plan('quiet-late-night');
      expect(late.caller_clock).toBe('scenario');
      expect(localMinutes(new Date(), late.metadata.timezone)).toSatisfy(isNight);
      expect(plan('crisis-relay', { EVAL_TZ: 'Asia/Tokyo' }).metadata.timezone).toBe('Asia/Tokyo');
    }
  );
});

describe('the nightly lanes', () => {
  it('no longer pin every caller to Asia/Tokyo', () => {
    for (const lane of ['a', 'b']) {
      const text = readFileSync(new URL(`../nightly/lanes/${lane}.txt`, import.meta.url), 'utf8');
      expect(text, lane).not.toMatch(/^EVAL_TZ=Asia\/Tokyo/m);
    }
  });
});
