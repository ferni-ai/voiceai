/**
 * The rows that were missing from ferni_events, sent through the REAL insertAll (google-auth
 * is faked at its request, so the body BigQuery would get is asserted, not a transport stub):
 * - call_events: the entry starts a call before the caller is identified, so user_hash was
 *   empty on every row (prod and dev, 2026-10-24..31). BQ_CALL_USER_HASH fills it.
 * - followthrough_outcomes: no producer existed. FOLLOWTHROUGH_BQ adds one in the live commitment
 *   context builder, fed by the real settleAwaitingAnswers (only the commitment read is faked).
 * - a rejected batch: the warning says how many times and rows, and why (reason:column).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
const request = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../slack-notifications.js', () => ({
  SlackNotificationService: vi.fn().mockImplementation(() => ({
    notify: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../predictive-alerting.js', () => ({ recordMetricValue: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
  getLogger: () => {
    const l = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => l };
    return l;
  },
}));
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(function (this: unknown) {
    return { getClient: async () => ({ request }) };
  }),
}));
// The builder registry: capture the commitment builder's build().
let build: ((input: unknown) => Promise<unknown>) | undefined;
vi.mock('../../../intelligence/context-builders/index.js', () => ({
  registerContextBuilder: (b: { build: typeof build }) => {
    build = b.build;
  },
  createStandardInjection: (id: string, content: string) => ({ id, content }),
  createHighInjection: (id: string, content: string) => ({ id, content }),
}));
vi.mock('../../coach-media/feedback.js', async (orig) => ({
  ...(await orig<object>()),
  recordFollowUpAnswer: vi.fn(async () => null),
}));
// processCommitments as it runs live, minus its Firestore read: the real settle on these.
const active = vi.hoisted(() => ({ list: [] as unknown[], now: 0 }));
vi.mock('../../trust-systems/commitment-tracking.js', async () => {
  const { settleAwaitingAnswers } =
    await import('../../trust-systems/commitment-follow-through.js');
  return {
    processCommitments: async (userId: string, userText: string) => ({
      newCommitments: [],
      progressUpdates: [],
      followUpsDue: [],
      answers: await settleAwaitingAnswers(userId, userText, active.list as never, active.now),
    }),
    generateFollowUpPhrase: () => '',
  };
});
vi.mock('../../../utils/firebase-admin-app.js', () => ({
  getAdminFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ update }) }) }) }),
  }),
}));

import { bqHash, flushBqEvents, setBqTransportForTests } from '../bq-events.js';
import {
  recordCallEvent,
  resetCallQualityStateForTests,
  startCall,
} from '../call-quality-monitor.js';

await import('../../../intelligence/context-builders/intelligence/commitment-follow-up.js');

const SECRET = 'test-secret';
type Body = { rows: Array<{ insertId: string; json: Record<string, unknown> }> };

/** Every row the real insertAll posted, by table. */
function posted(): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const [opts] of request.mock.calls as Array<[{ url: string; data: Body }]>) {
    const table = /tables\/([a-z_]+)\/insertAll$/.exec(opts.url)?.[1] ?? '?';
    (out[table] ??= []).push(...opts.data.rows.map((r) => r.json));
  }
  return out;
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ data: {} });
  warn.mockReset();
  update.mockClear();
  setBqTransportForTests(null); // the real insertAll
  resetCallQualityStateForTests();
  vi.stubEnv('BQ_EVENTS', 'on');
  vi.stubEnv('LOG_HASH_SECRET', SECRET);
  vi.stubEnv('DEPLOY_ENV', 'prod');
});
afterEach(() => vi.unstubAllEnvs());

/** The live order: entry startCall (no user yet), session init's connection_success, the end. */
function liveCall(callId: string, userId: string): void {
  startCall(callId, undefined, 'ferni');
  recordCallEvent({ callId, userId, timestamp: Date.now(), type: 'connection_success' });
  recordCallEvent({ callId, timestamp: Date.now() + 5_000, type: 'call_end_natural' });
}

describe('call_events.user_hash (BQ_CALL_USER_HASH)', () => {
  it('on: the row carries the caller hash from the later event', async () => {
    vi.stubEnv('BQ_CALL_USER_HASH', 'on');
    liveCall('RM_a', 'uid-7');
    await flushBqEvents();
    const [row] = posted().call_events ?? [];
    expect(row?.user_hash).toBe(bqHash('user', 'uid-7', { LOG_HASH_SECRET: SECRET }));
    expect(row?.session_hash).toBe(bqHash('session', 'RM_a', { LOG_HASH_SECRET: SECRET }));
    expect(JSON.stringify(posted())).not.toContain('uid-7');
  });

  it('off: unchanged, the row has a session hash and no user hash (the measured state)', async () => {
    liveCall('RM_b', 'uid-8');
    await flushBqEvents();
    const [row] = posted().call_events ?? [];
    expect(row?.session_hash).toEqual(expect.any(String));
    expect(row).not.toHaveProperty('user_hash');
  });

  it('a call started with its user keeps that user', async () => {
    vi.stubEnv('BQ_CALL_USER_HASH', 'on');
    startCall('RM_c', 'uid-1', 'ferni');
    recordCallEvent({
      callId: 'RM_c',
      userId: 'uid-2',
      timestamp: Date.now(),
      type: 'user_speech',
    });
    recordCallEvent({ callId: 'RM_c', timestamp: Date.now(), type: 'call_end_natural' });
    await flushBqEvents();
    expect(posted().call_events?.[0]?.user_hash).toBe(
      bqHash('user', 'uid-1', { LOG_HASH_SECRET: SECRET })
    );
  });
});

describe('followthrough_outcomes (FOLLOWTHROUGH_BQ)', () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const asked = (id: string, hoursAgo: number) => ({
    id,
    content: 'call my mom',
    awaitingAnswer: true,
    followUpAskedAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  });
  /** One caller turn through the live builder, with these commitments awaiting an answer. */
  const turn = async (userId: string, userText: string, commitments: unknown[]) => {
    Object.assign(active, { list: commitments, now });
    await build!({ userText, userData: { turnCount: 0 }, services: { userId } });
  };

  it('on: a settled answer sends one row with the outcome, hashes and delay', async () => {
    vi.stubEnv('FOLLOWTHROUGH_BQ', 'on');
    await turn('uid-9', 'Yeah I called her, it went great', [asked('c1', 0.1)]);
    expect(update).toHaveBeenCalledTimes(1);
    await flushBqEvents();
    const rows = posted().followthrough_outcomes ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      env: 'prod',
      item_kind: 'commitment',
      outcome: 'done',
      user_hash: bqHash('user', 'uid-9', { LOG_HASH_SECRET: SECRET }),
      item_hash: bqHash('item', 'c1', { LOG_HASH_SECRET: SECRET }),
    });
    expect(rows[0]?.delay_hours).toBeCloseTo(0.1, 5);
    expect(JSON.stringify(rows)).not.toMatch(/mom|called her|uid-9/);
  });

  it('every outcome passes its allowlist (none written as other)', async () => {
    vi.stubEnv('FOLLOWTHROUGH_BQ', 'on');
    await turn('u', "No, I didn't get to it", [asked('n', 0.1)]);
    await turn('u', "I'd rather not talk about it", [asked('d', 0.1)]);
    await turn('u', 'anything', [asked('x', 1)]); // past the answer window
    await flushBqEvents();
    expect((posted().followthrough_outcomes ?? []).map((r) => r.outcome)).toEqual([
      'not_done',
      'deflected',
      'unanswered',
    ]);
  });

  it('a turn with nothing awaiting an answer sends no row', async () => {
    vi.stubEnv('FOLLOWTHROUGH_BQ', 'on');
    await turn('u', 'Yeah I called her', [{ id: 'z', content: 'x', awaitingAnswer: false }]);
    await flushBqEvents();
    expect(posted().followthrough_outcomes).toBeUndefined();
  });

  it('off: the answer is still recorded, and nothing is sent', async () => {
    await turn('uid-9', 'Yeah I called her', [asked('c2', 0.1)]);
    expect(update).toHaveBeenCalledTimes(1);
    await flushBqEvents();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('a rejected insert is a counted warning', () => {
  it('names reason:column and counts rows, never the message', async () => {
    request.mockResolvedValue({
      data: {
        insertErrors: [
          { index: 0, errors: [{ reason: 'invalid', location: 'flags', message: 'pat@x.com' }] },
          { index: 1, errors: [{ reason: 'stopped', location: '', message: 'pat@x.com' }] },
        ],
      },
    });
    for (const id of ['RM_d', 'RM_e']) {
      startCall(id, undefined, 'ferni');
      recordCallEvent({ callId: id, timestamp: Date.now(), type: 'call_end_natural' });
    }
    await flushBqEvents();
    const call = warn.mock.calls.find((c) => String(c[1]).includes('insert failed (call_events)'));
    expect(call?.[0]).toMatchObject({
      errorName: 'InsertErrors',
      status: 2,
      reasons: ['invalid:flags', 'stopped'],
      times: 1,
      rowsDropped: 2,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('pat@x.com');
  });

  it('a rate-limited repeat is counted into the next line', async () => {
    vi.useFakeTimers();
    try {
      request.mockRejectedValue(Object.assign(new Error('x'), { name: 'GaxiosError', code: 403 }));
      for (const id of ['RM_f', 'RM_g', 'RM_h']) {
        startCall(id, undefined, 'ferni');
        recordCallEvent({ callId: id, timestamp: Date.now(), type: 'call_end_natural' });
        await flushBqEvents(); // eslint-disable-line no-await-in-loop -- one batch each
      }
      const lines = () => warn.mock.calls.filter((c) => String(c[1]).includes('insert failed'));
      expect(lines()).toHaveLength(1);
      vi.advanceTimersByTime(5 * 60_000);
      startCall('RM_i', undefined, 'ferni');
      recordCallEvent({ callId: 'RM_i', timestamp: Date.now(), type: 'call_end_natural' });
      await flushBqEvents();
      expect(lines()).toHaveLength(2);
      expect(lines()[1]?.[0]).toMatchObject({ times: 3, rowsDropped: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});
