/**
 * #3858: the call check-in asked how a plan went before its day came. "Go for a run" due
 * tomorrow, a call today: "Did you end up getting that run in this morning?". The hello
 * already held back (greeting-not-yet.ts commitmentAhead), but loadCallCheckIns still put it in
 * the first recall note and stamped it followed up, which can hold back the real ask later.
 * CHECKIN_WAITS_FOR_DUE on: a commitment whose target date is today or later, where the caller
 * is, is neither picked nor stamped. Off: as before. Invented lines only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rememberCallerTimeZone } from '../../../utils/caller-time-zone.js';
import { loadCallCheckIns, type CommitmentStore } from '../commitment-follow-up.js';

const DAY = 86_400_000;
// 18:00 UTC on 10-10: still 10-10 in Los Angeles, already 10-11 in Tokyo.
const NOW = Date.parse('2026-10-10T18:00:00Z');

afterEach(() => vi.unstubAllEnvs());

function storeWith(rows: Array<{ id: string; targetDate?: number }>) {
  const marked: string[] = [];
  const store: CommitmentStore = {
    active: async () =>
      rows.map(({ id, targetDate }) => ({
        id,
        data: {
          status: 'active',
          statement: `I'm going to go for a long run, plan ${id}.`,
          createdAt: NOW - DAY,
          followUpCount: 0,
          ...(targetDate !== undefined && { targetDate }),
        },
      })),
    markFollowedUp: async (_user, c) => {
      marked.push(c.id);
    },
  };
  return { store, marked };
}

async function picked(userId: string, rows: Array<{ id: string; targetDate?: number }>) {
  const { store, marked } = storeWith(rows);
  const open = (await loadCallCheckIns(userId, store, NOW)).map((c) => c.id);
  return { open: open.sort(), marked: marked.sort() };
}

describe('the call check-in waits for a plan to fall due (#3858)', () => {
  const tomorrow = { id: 'tomorrow', targetDate: NOW + DAY };
  const past = { id: 'past', targetDate: NOW - 2 * DAY };

  it('flag off: a plan due tomorrow is asked about and stamped, as before', async () => {
    vi.stubEnv('CHECKIN_WAITS_FOR_DUE', 'off');
    expect(await picked('riley-off', [tomorrow])).toEqual({
      open: ['tomorrow'],
      marked: ['tomorrow'],
    });
  });

  it('flag on: a plan due tomorrow is neither asked about nor stamped; a past one still is', async () => {
    vi.stubEnv('CHECKIN_WAITS_FOR_DUE', 'on');
    expect(await picked('riley-on', [tomorrow, past])).toEqual({
      open: ['past'],
      marked: ['past'],
    });
  });

  it('flag on: one with no target date is still asked about', async () => {
    vi.stubEnv('CHECKIN_WAITS_FOR_DUE', 'on');
    expect((await picked('riley-undated', [{ id: 'undated' }])).open).toEqual(['undated']);
  });

  it("flag on: due today where the caller is waits, by the caller's calendar day", async () => {
    vi.stubEnv('CHECKIN_WAITS_FOR_DUE', 'on');
    // A date-only target stored as midnight UTC: the calendar day 10-10.
    const dueTenth = { id: 'tenth', targetDate: Date.parse('2026-10-10T00:00:00Z') };
    rememberCallerTimeZone('America/Los_Angeles', 'riley-la');
    rememberCallerTimeZone('Asia/Tokyo', 'riley-tokyo');
    expect((await picked('riley-la', [dueTenth])).open).toEqual([]); // still the 10th: today
    expect((await picked('riley-tokyo', [dueTenth])).open).toEqual(['tenth']); // the 11th: past
  });
});
