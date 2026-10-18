/**
 * POST /api/outreach/milestone celebrates a milestone once, and only when the server's own
 * records say it happened.
 *
 * Before: the web app kept milestone state in localStorage only and sent its own
 * daysTogether/streak. A cleared browser or a second device re-sent the same
 * email/SMS, with whatever numbers the client claimed. These cases run the real
 * route and the real session counter over stored-call shapes, with n = 0, 1, 3, 7.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'http';

type Doc = Record<string, unknown>;
const calls: Doc[] = [];
const claims = new Map<string, Doc>();
/** Updates whose data matches this fail (simulates Firestore errors on a given write). */
const failUpdate = { when: (_data: Doc) => false };

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFirestoreDb: () => ({
    collection: () => ({
      doc: (userId: string) => ({
        collection: (name: string) =>
          name === 'conversations'
            ? (() => {
                const query = {
                  select: () => query,
                  orderBy: () => query,
                  limit: () => query,
                  get: async () => ({ docs: calls.map((d) => ({ data: () => d })) }),
                };
                return query;
              })()
            : {
                doc: (id: string) => ({
                  create: async (data: Doc) => {
                    const key = `${userId}/${id}`;
                    if (claims.has(key)) throw Object.assign(new Error('exists'), { code: 6 });
                    claims.set(key, data);
                  },
                  delete: async () => void claims.delete(`${userId}/${id}`),
                  get: async () => ({
                    data: () => claims.get(`${userId}/${id}`),
                    updateTime: 'v1',
                  }),
                  update: async (data: Doc) => {
                    if (failUpdate.when(data)) throw new Error('UNAVAILABLE');
                    const key = `${userId}/${id}`;
                    claims.set(key, { ...claims.get(key), ...data });
                  },
                }),
              },
      }),
    }),
  }),
}));

const { sendMilestoneOutreach } = await import('../milestone-outreach-route.js');
const { summarizeSessions, currentDayStreak, calendarDay } =
  await import('../../services/stores/sessions-together.js');

const DAY = 24 * 60 * 60 * 1000;
const emailUser = vi.fn(async () => ({ success: true }));
const textUser = vi.fn(async () => ({ success: true }));
const getContactInfo = vi.fn(async () => ({ email: 'me@example.com', timezone: 'UTC' }));
const deps = { emailUser, textUser, getContactInfo };

/** A stored call as realtime-memory writes it: Firestore Timestamps, turnCount. */
function call(daysAgo: number, extra: Doc = {}): Doc {
  const start = new Date(Date.now() - daysAgo * DAY);
  return {
    startedAt: { toDate: () => start },
    endedAt: { toDate: () => new Date(start.getTime() + 10 * 60_000) },
    turnCount: 6,
    ...extra,
  };
}

async function post(body: Doc) {
  const out = { status: 0, body: {} as Doc };
  const res = {
    writeHead: vi.fn((s: number) => {
      out.status = s;
    }),
    setHeader: vi.fn(),
    end: vi.fn((chunk?: string) => {
      out.body = chunk ? JSON.parse(chunk) : {};
    }),
  } as unknown as ServerResponse;
  await sendMilestoneOutreach(res, 'u1', body, deps);
  return out;
}

const milestone = (milestoneId: string, extra: Doc = {}) => ({
  milestoneId,
  milestoneName: 'One week together',
  milestoneMessage: 'Seven days of talking.',
  ...extra,
});

beforeEach(() => {
  calls.length = 0;
  claims.clear();
  emailUser.mockClear();
  textUser.mockClear();
});

describe('which stored calls count as a session', () => {
  it.each([
    { name: 'n=0', docs: [], count: 0 },
    { name: 'greeting only (turnCount 1)', docs: [call(1, { turnCount: 1 })], count: 0 },
    { name: 'never ended', docs: [call(1, { endedAt: undefined })], count: 0 },
    { name: 'userTurnCount 0', docs: [call(1, { userTurnCount: 0, turnCount: 9 })], count: 0 },
    { name: 'n=1', docs: [call(1)], count: 1 },
    { name: 'n=3, two on one day', docs: [call(1), call(1), call(2)], count: 3 },
  ])('$name: $count', ({ docs, count }) => {
    expect(summarizeSessions(docs, 'UTC').count).toBe(count);
  });

  it("counts days in the user's zone, and streaks end today or yesterday", () => {
    const lateNight = Date.parse('2026-10-18T03:00:00Z'); // still the 17th in Los Angeles
    expect(calendarDay(lateNight, 'America/Los_Angeles')).toBe('2026-10-17');
    expect(calendarDay(lateNight, 'UTC')).toBe('2026-10-18');
    const now = new Date('2026-10-18T12:00:00Z');
    expect(currentDayStreak(['2026-10-16', '2026-10-17'], now, 'UTC')).toBe(2);
    expect(currentDayStreak(['2026-10-15', '2026-10-16'], now, 'UTC')).toBe(0);
  });
});

describe('POST /api/outreach/milestone', () => {
  it.each([
    { n: 0, sent: false, reason: 'not-reached' },
    { n: 1, sent: true },
  ])('first-hello with $n sessions: sent = $sent', async ({ n, sent, reason }) => {
    for (let i = 0; i < n; i++) calls.push(call(i));
    const { status, body } = await post(milestone('first-hello'));
    expect(status).toBe(200);
    expect(body.sent).toBe(sent);
    if (reason) expect(body.reason).toBe(reason);
    expect(emailUser).toHaveBeenCalledTimes(sent ? 1 : 0);
  });

  it("ignores the client's numbers: 3 days of sessions is not a week, whatever it claims", async () => {
    calls.push(call(0), call(1), call(2));
    const { body } = await post(milestone('week-together', { daysTogether: 999, streak: 50 }));
    expect(body).toMatchObject({ sent: false, reason: 'not-reached' });
    expect(emailUser).not.toHaveBeenCalled();
  });

  it('sends a reached milestone once, with the server count, however often it is asked', async () => {
    for (let i = 0; i < 7; i++) calls.push(call(i));
    const first = await post(milestone('streak-7', { streak: 99 }));
    const again = await post(milestone('streak-7', { streak: 99 }));

    expect(first.body.sent).toBe(true);
    expect(again.body).toMatchObject({ sent: false, reason: 'already-sent' });
    expect(emailUser).toHaveBeenCalledTimes(1);
    const emailBody = (emailUser.mock.calls[0] as unknown as [string, string, string])[2];
    expect(emailBody).toContain("That's 7 days in a row.");
    expect(emailBody).not.toContain('99');
  });

  it('releases the claim when nothing went out, so a retry can still celebrate', async () => {
    calls.push(call(0));
    emailUser.mockResolvedValueOnce({ success: false });
    expect((await post(milestone('first-hello'))).body.sent).toBe(false);
    expect((await post(milestone('first-hello'))).body.sent).toBe(true);
  });

  it('refuses a milestone it does not know', async () => {
    expect((await post(milestone('made-up'))).status).toBe(400);
  });

  it('counts the call that crosses the threshold while it is still going', async () => {
    // The app fires first-hello as the first call connects: nothing has ended yet
    calls.push(call(0, { endedAt: undefined, turnCount: 1 }));
    const { body } = await post(milestone('first-hello'));
    expect(body.sent).toBe(true);
    expect(emailUser).toHaveBeenCalledTimes(1);
  });

  it('a call left open for more than 6 hours is not the live one', async () => {
    const start = new Date(Date.now() - 7 * 60 * 60 * 1000);
    calls.push({ startedAt: { toDate: () => start }, turnCount: 1 });
    expect((await post(milestone('first-hello'))).body).toMatchObject({ reason: 'not-reached' });
  });

  it('marks the claim sent, and never sends it again', async () => {
    calls.push(call(0));
    await post(milestone('first-hello'));
    expect(claims.get('u1/first-hello')).toMatchObject({ state: 'sent' });
    expect(claims.get('u1/first-hello')?.sentAt).toBeInstanceOf(Date);
    expect((await post(milestone('first-hello'))).body).toMatchObject({ reason: 'already-sent' });
    expect(emailUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'pending, 5 min (a send starting)', state: 'pending', ageMin: 5, sends: false },
    { name: 'pending, 20 min (died before sending)', state: 'pending', ageMin: 20, sends: true },
    { name: 'sending, 20 min (may have gone out)', state: 'sending', ageMin: 20, sends: false },
    { name: 'sent, however old', state: 'sent', ageMin: 600, sends: false },
    { name: 'no state (legacy or unknown), 20 min', state: undefined, ageMin: 20, sends: false },
  ])('an existing claim, $name: sends again = $sends', async ({ state, ageMin, sends }) => {
    calls.push(call(0));
    claims.set('u1/first-hello', {
      milestoneId: 'first-hello',
      claimedAt: new Date(Date.now() - ageMin * 60_000),
      ...(state ? { state } : {}),
    });
    const { body } = await post(milestone('first-hello'));
    expect(body.sent).toBe(sends);
    expect(emailUser).toHaveBeenCalledTimes(sends ? 1 : 0);
  });

  it('a failed mark after a successful send never reopens the claim', async () => {
    calls.push(call(0));
    failUpdate.when = (data) => data.state === 'sent'; // both attempts fail
    try {
      expect((await post(milestone('first-hello'))).body.sent).toBe(true);
      expect(claims.get('u1/first-hello')).toMatchObject({ state: 'sending' });
      // Retried now and well past the stale window: still never sent twice
      expect((await post(milestone('first-hello'))).body.sent).toBe(false);
      claims.set('u1/first-hello', {
        ...claims.get('u1/first-hello'),
        claimedAt: new Date(Date.now() - 60 * 60_000),
      });
      expect((await post(milestone('first-hello'))).body.sent).toBe(false);
      expect(emailUser).toHaveBeenCalledTimes(1);
    } finally {
      failUpdate.when = () => false;
    }
  });

  it('a mark that fails once is retried and lands', async () => {
    calls.push(call(0));
    let failures = 1;
    failUpdate.when = (data) => data.state === 'sent' && failures-- > 0;
    try {
      await post(milestone('first-hello'));
      expect(claims.get('u1/first-hello')).toMatchObject({ state: 'sent' });
    } finally {
      failUpdate.when = () => false;
    }
  });

  it('the text is signed once, by textUser, not again here', async () => {
    calls.push(call(0));
    getContactInfo.mockResolvedValueOnce({
      phone: '+15550001111',
      timezone: 'UTC',
    } as unknown as Awaited<ReturnType<typeof getContactInfo>>);
    await post(milestone('first-hello'));
    expect(String((textUser.mock.calls[0] as unknown as [string, string])[1])).not.toMatch(
      /- Ferni/
    );
  });
});
