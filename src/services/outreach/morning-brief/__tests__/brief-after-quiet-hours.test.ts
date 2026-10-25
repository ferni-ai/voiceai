/**
 * QUIET_HOURS_FROM_PREFS: when the quiet hours saved in the menu hold 08:00, the morning brief
 * moves to the hour they end that morning (before noon) instead of being skipped for the day.
 * Flag off or unset, every decision is main's: 08:00 local, unless quiet then (a time grid).
 * Instants are UTC; 2026-10-18 is CDT (UTC-5).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';
import { runMorningBriefs, type MorningBriefDeps } from '../brief-job.js';
import { isUserQuiet } from '../../quiet-hours.js';
import { wallTimeIn } from '../../../../utils/time-zone.js';

const SETH = 'uid-seth';
const CHI = 'America/Chicago';
let user: Record<string, unknown> = {};
const saveWindow = (quietStart?: string, quietEnd?: string) => {
  user = {
    contactInfo: { timezone: CHI },
    name: 'Seth Ford',
    ...(quietStart && { messagingPrefs: { quietStart, quietEnd, zone: CHI } }),
  };
};

function fakeDeps() {
  const claimed = new Set<string>();
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const deps: MorningBriefDeps = {
    env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: SETH },
    cohortUsers: async () => [],
    userDoc: async () => user,
    readDay: async () => ({
      events: [],
      reminders: ['Call the plumber'],
      tasks: [],
      commitments: [],
    }),
    claims: {
      async claim(userId, dateKey, kind) {
        const key = `${userId}:${dateKey}:${kind}`;
        if (claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      async release(userId, dateKey, kind) {
        claimed.delete(`${userId}:${dateKey}:${kind}`);
      },
    },
    sendText,
    sendPush: vi.fn(async () => true),
  };
  return { deps, sendText };
}
const at = (iso: string) => new Date(iso);

beforeEach(() => vi.stubEnv('QUIET_HOURS_FROM_PREFS', 'on'));
afterEach(() => vi.unstubAllEnvs());

describe('a saved window that holds 08:00 (20:00 to 09:30)', () => {
  beforeEach(() => saveWindow('20:00', '09:30'));

  it('the brief goes at 09:30, once, instead of not at all', async () => {
    const { deps, sendText } = fakeDeps();
    const eight = await runMorningBriefs(deps, at('2026-10-18T13:05:00Z')); // 08:05
    expect(eight.report.reasons).toEqual({ 'quiet-hours': 1 });
    const early = await runMorningBriefs(deps, at('2026-10-18T14:20:00Z')); // 09:20
    expect(early.report.reasons).toEqual({ 'not-8am': 1 });
    const moved = await runMorningBriefs(deps, at('2026-10-18T14:35:00Z')); // 09:35
    expect(moved.report.sent).toBe(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    const again = await runMorningBriefs(deps, at('2026-10-18T14:50:00Z')); // 09:50
    expect(again.report.reasons).toEqual({ 'already-sent': 1 });
    const late = await runMorningBriefs(fakeDeps().deps, at('2026-10-18T15:35:00Z')); // 10:35
    expect(late.report.reasons).toEqual({ 'not-8am': 1 });
  });
});

describe('windows it does not move for', () => {
  it('all day (00:00 to 23:59): ends after noon, so no brief that day', async () => {
    saveWindow('00:00', '23:59');
    for (const iso of ['2026-10-18T13:05:00Z', '2026-10-18T17:05:00Z', '2026-10-19T04:59:00Z']) {
      const { deps, sendText } = fakeDeps();
      await runMorningBriefs(deps, at(iso));
      expect(sendText).not.toHaveBeenCalled();
    }
  });

  it('a window that ends at noon or later (06:00 to 13:00): no brief that afternoon', async () => {
    saveWindow('06:00', '13:00');
    user.outreachPreferences = { quietHours: { enabled: false } }; // only the saved window holds
    const { deps, sendText } = fakeDeps();
    const afternoon = await runMorningBriefs(deps, at('2026-10-18T18:05:00Z')); // 13:05
    expect(afternoon.report.reasons).toEqual({ 'not-8am': 1 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('a window that leaves 08:00 free (12:00 to 14:00): 08:00 as before, not after it', async () => {
    saveWindow('12:00', '14:00');
    expect((await runMorningBriefs(fakeDeps().deps, at('2026-10-18T13:05:00Z'))).report.sent).toBe(
      1
    );
    const after = await runMorningBriefs(fakeDeps().deps, at('2026-10-18T19:05:00Z')); // 14:05
    expect(after.report.reasons).toEqual({ 'not-8am': 1 });
  });
});

const DAYS = ['2026-03-08', '2026-10-25'];
const TIMES = DAYS.flatMap((d) => {
  const base = Date.parse(`${d}T00:00:00Z`);
  const out: Date[] = [];
  for (let m = 0; m < 24 * 60; m += 10) out.push(new Date(base + m * 60_000));
  return out;
});
const WINDOWS: Array<[string?, string?]> = [
  [],
  ['00:00', '23:59'],
  ['20:00', '09:30'],
  ['07:00', '08:30'],
  ['12:00', '14:00'],
];

describe('flag off or unset: identical to main over a time grid', () => {
  it.each(['off', undefined])('QUIET_HOURS_FROM_PREFS=%s', async (flag) => {
    if (flag) vi.stubEnv('QUIET_HOURS_FROM_PREFS', flag);
    else delete process.env.QUIET_HOURS_FROM_PREFS;
    const differ: string[] = [];
    for (const [start, end] of WINDOWS) {
      saveWindow(start, end);
      for (const now of TIMES) {
        const main = wallTimeIn(now, CHI).hour === 8 && !isUserQuiet(user, now);
        const { deps, sendText } = fakeDeps();
        await runMorningBriefs(deps, now);
        if (sendText.mock.calls.length > 0 !== main) differ.push(`${start} ${now.toISOString()}`);
      }
    }
    expect(differ).toEqual([]);
  });
});
