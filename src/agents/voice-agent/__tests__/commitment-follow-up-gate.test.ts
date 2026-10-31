/**
 * The proactive engine's commitment follow-up, gated before it reaches the call.
 *
 * Before: the engine's "how's that going?" came back on every call (an id from
 * Date.now(), memory in one pod), took any newest commitment, and asked how a
 * call went that Ferni had never placed.
 *
 * Drives the production engine, gate and ask record (commitment_checkins).
 * Mocked: Firestore (an in-memory fake of the doc paths used), the commitment
 * list, and the on-behalf call records.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();
const store = vi.hoisted(() => ({ down: false }));

/** A tolerant Firestore fake: doc paths read and write `docs`; queries return nothing. */
function ref(path: string[]): unknown {
  const snap = () => {
    const data = docs.get(path.join('/'));
    return { exists: data !== undefined, data: () => data, docs: [], empty: true, size: 0 };
  };
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        if (prop === 'collection' || prop === 'doc')
          return (id: string) => ref([...path, String(id)]);
        if (prop === 'get')
          return async () => {
            if (store.down) throw new Error('UNAVAILABLE');
            return snap();
          };
        if (prop === 'set')
          return async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
            const key = path.join('/');
            docs.set(key, opts?.merge ? { ...docs.get(key), ...data } : data);
          };
        return () => ref(path);
      },
    }
  );
}

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => ref([]),
}));
vi.mock('../../../services/superhuman/firestore-utils.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFirestoreDb: () => ref([]),
}));

/** Every info line any logger writes: [fields, message]. */
const logged = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const logger = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'info'
            ? (fields: Record<string, unknown>, msg: string) => logged.push([fields, msg])
            : prop === 'child'
              ? logger
              : () => undefined,
      }
    );
  return { ...real, createLogger: logger, getLogger: logger };
});

const commitments = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock('../../../services/superhuman/commitment-keeper.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadUserCommitments: async () => commitments.list,
}));

import {
  FOLLOW_UP_SPACING_MS,
  liveFollowUpGateDeps,
  noteFollowUpInjected,
  pickCommitmentFollowUp,
  surfaceProactiveInsight,
  type FollowUpGateDeps,
} from '../commitment-follow-up-gate.js';
import {
  checkInKey,
  forgetCheckInMemo,
} from '../../../services/superhuman/commitment-checkin-cooldown.js';
import type { CallRecords } from '../../../services/outreach/call-status.js';
import {
  checkProactiveTriggers,
  clearProactiveState,
  markInsightSurfaced,
} from '../../../intelligence/proactive/proactive-engine.js';
import type { ContextWindow } from '../../../intelligence/context-assembler.js';

const USER = 'user-follow-up-gate';
const DAY = 86_400_000;
// Wednesday 2026-10-14 15:00 UTC.
const NOW = Date.UTC(2026, 9, 14, 15);

function commitment(statement: string, createdAt: number, extra: Record<string, unknown> = {}) {
  return {
    id: `c-${commitments.list.length}`,
    statement,
    summary: statement,
    status: 'active',
    createdAt,
    followUpCount: 0,
    ...extra,
  };
}

function contextWith(activeCommitments: string[]): ContextWindow {
  return {
    immediate: {
      timeOfDay: 'afternoon',
      dayOfWeek: 'Wednesday',
      isWeekend: false,
      hour: 15,
      isLateNight: false,
    },
    activeDomains: [],
    today: { agenda: [], upcomingMeetings: 0, hasImportantEvent: false },
    recent: { topicsDiscussed: [], emotionalPatterns: [], openThreads: [] },
    relationship: {
      trustLevel: 0.5,
      sessionCount: 3,
      daysSinceFirstContact: 10,
      activeCommitments,
    },
    capacity: { bandwidth: 'medium', stressIndicators: [], burnoutRisk: 'low' },
  } as ContextWindow;
}

const noCalls: CallRecords = { load: async () => ({ deferred: [], results: [] }) };
const deps = (callRecords: CallRecords = noCalls): FollowUpGateDeps => ({
  ...liveFollowUpGateDeps,
  callRecords,
});

/** One call start on a fresh instance: the engine's insight, then the gate. */
async function callStart(now: number, extra: { distressLevel?: number; crisis?: object } = {}) {
  vi.setSystemTime(now);
  const texts = commitments.list.map((c) => String(c.summary));
  const engine = checkProactiveTriggers(USER, contextWith(texts), 'session_start');
  const insight = engine.insights.find((i) => i.category === 'commitment_reminder');
  return surfaceProactiveInsight({ userId: USER, turnNumber: 1, insight, now, ...extra }, deps());
}

/** A new process: nothing in memory, only what was stored. */
function newInstance(): void {
  clearProactiveState();
  forgetCheckInMemo();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  docs.clear();
  logged.length = 0;
  store.down = false;
  commitments.list = [];
  newInstance();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('commitment follow-up gate', () => {
  it('asks once, then not again within 48 h on another instance; again after', async () => {
    commitments.list = [commitment("I'm going to start running in the mornings", NOW - 4 * DAY)];

    const first = await callStart(NOW);
    expect(first?.category).toBe('commitment_reminder');
    expect(first?.message).toContain('start running in the mornings');
    markInsightSurfaced(USER, first!.id);
    await noteFollowUpInjected(USER, first!.id, NOW);

    newInstance();
    expect(await callStart(NOW + 6 * 3_600_000)).toBeNull();

    newInstance();
    expect(await callStart(NOW + FOLLOW_UP_SPACING_MS + 60_000)).not.toBeNull();
  });

  it('records the ask only when the insight is injected', async () => {
    const text = "I'm going to start running in the mornings";
    commitments.list = [commitment(text, NOW - 4 * DAY)];
    const path = `bogle_users/${USER}/commitment_checkins/${checkInKey(USER, text)}`;

    const picked = await callStart(NOW);
    expect(picked).not.toBeNull();
    expect(docs.has(path)).toBe(false);

    await noteFollowUpInjected(USER, picked!.id, NOW);
    expect(docs.get(path)?.lastAskedAt).toBe(NOW);

    await noteFollowUpInjected(USER, 'late_night_123', NOW);
    expect([...docs.keys()]).toEqual([path]);
  });

  it('says nothing before the event it names, and asks once it has passed', async () => {
    // Said Monday 10-12: "Thursday" is 10-15.
    commitments.list = [
      commitment('I have a job interview Thursday and I am nervous', Date.UTC(2026, 9, 12, 18)),
    ];
    expect(await callStart(NOW)).toBeNull();
    expect((await pickCommitmentFollowUp(USER, NOW, deps())).reason).toBe('future-event');

    newInstance();
    expect(await callStart(Date.UTC(2026, 9, 16, 18))).not.toBeNull();
  });

  it('waits for a stored target date in the future', async () => {
    commitments.list = [
      commitment("I'm going to finish the quarterly report", NOW - DAY, { targetDate: NOW + DAY }),
    ];
    expect(await callStart(NOW)).toBeNull();
  });

  describe('a promise to call someone', () => {
    const call = 'Please call my mom and check on her';
    const request = { contactQuery: 'mom' };

    it('says nothing while the call is held or was never placed', async () => {
      commitments.list = [commitment(call, NOW - 3 * DAY)];
      const held: CallRecords = {
        load: async () => ({
          deferred: [
            {
              kind: 'on_behalf',
              status: 'pending',
              scheduledFor: new Date(NOW + 2 * 3_600_000).toISOString(),
              timezone: 'America/New_York',
              createdAt: new Date(NOW - DAY).toISOString(),
              request,
            },
          ],
          results: [],
        }),
      };
      expect((await pickCommitmentFollowUp(USER, NOW, deps(held))).reason).toBe(
        'call-not-completed'
      );
      expect((await pickCommitmentFollowUp(USER, NOW, deps(noCalls))).reason).toBe(
        'call-not-completed'
      );
      expect(await callStart(NOW)).toBeNull();
    });

    it('may ask once the call completed', async () => {
      commitments.list = [commitment(call, NOW - 3 * DAY)];
      const completed: CallRecords = {
        load: async () => ({
          deferred: [],
          results: [
            {
              request,
              outcome: { status: 'completed' },
              capturedAt: new Date(NOW - DAY).toISOString(),
            },
          ],
        }),
      };
      const decision = await pickCommitmentFollowUp(USER, NOW, deps(completed));
      expect(decision.reason).toBe('picked');
      expect(decision.insight?.message).toContain('call my mom');
    });
  });

  it('never asks about an order or a request to Ferni', async () => {
    commitments.list = [
      commitment("I'll take butter and honey", NOW - 3 * DAY),
      commitment("I'm going to need you to remind me about it", NOW - 3 * DAY),
    ];
    expect(await callStart(NOW)).toBeNull();
    expect((await pickCommitmentFollowUp(USER, NOW, deps())).reason).toBe('low-quality');
  });

  it('skips a junk newest commitment and asks about the real one behind it', async () => {
    commitments.list = [
      commitment("I'll take butter and honey", NOW - DAY),
      commitment("I'm going to start running in the mornings", NOW - 4 * DAY),
    ];
    expect((await callStart(NOW))?.message).toContain('start running');
  });

  it('never asks on a crisis-guided turn or when the caller sounds heavy', async () => {
    commitments.list = [commitment("I'm going to start running in the mornings", NOW - 4 * DAY)];
    expect(await callStart(NOW, { crisis: { isCrisis: true } })).toBeNull();
    newInstance();
    expect(await callStart(NOW, { crisis: { softCheck: true } })).toBeNull();
    newInstance();
    expect(await callStart(NOW, { distressLevel: 0.7 })).toBeNull();
    newInstance();
    expect(await callStart(NOW, { distressLevel: 0.2 })).not.toBeNull();
  });

  it('does not ask when the ask record cannot be read', async () => {
    commitments.list = [commitment("I'm going to start running in the mornings", NOW - 4 * DAY)];
    store.down = true;
    expect(await callStart(NOW)).toBeNull();
  });

  it('logs one FOLLOWUP_DECISION per call start, with a hash and never the words', async () => {
    const text = "I'm going to start running in the mornings";
    commitments.list = [commitment(text, NOW - 4 * DAY)];
    const decisions = () => logged.filter(([, msg]) => msg === 'FOLLOWUP_DECISION');

    await callStart(NOW);
    await surfaceProactiveInsight({ userId: USER, turnNumber: 2 }, deps());
    expect(decisions().map(([f]) => f)).toEqual([
      {
        source: 'proactive-engine',
        picked: true,
        reason: 'picked',
        topicHash: checkInKey(USER, text).slice(0, 12),
        userId: USER,
        sessionId: undefined,
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain('running');

    newInstance();
    await callStart(NOW, { distressLevel: 0.9 });
    expect(decisions()[1][0]).toMatchObject({ picked: false, reason: 'heavy-mood' });
  });

  it('passes other insights through unchanged', async () => {
    const insight = { id: 'late_night_1', category: 'late_night_support', message: 'Up late?' };
    const out = await surfaceProactiveInsight(
      { userId: USER, turnNumber: 1, insight, crisis: { isCrisis: true } },
      deps()
    );
    expect(out).toBe(insight);
  });
});

// #2283: the same arc came back at turn 6, 12, 18... for a whole call.
describe('an emotional-arc insight (ARC_INSIGHT_ONCE)', () => {
  const arc = {
    id: 'arc_work_stress',
    category: 'emotional_trajectory',
    message: "I've been noticing your work stress has been quite intense lately.",
  };
  const atTurn = (turnNumber: number, insight: typeof arc = arc) =>
    surfaceProactiveInsight({ userId: USER, turnNumber, insight }, deps());

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('on: reaches the prompt once, then is dropped on later pauses', async () => {
    vi.stubEnv('ARC_INSIGHT_ONCE', 'on');
    expect(await atTurn(6)).toBe(arc);
    markInsightSurfaced(USER, arc.id);
    expect(await atTurn(12)).toBeNull();
    expect(await atTurn(18)).toBeNull();
  });

  it('on: a different arc, or another kind of insight, still comes through', async () => {
    vi.stubEnv('ARC_INSIGHT_ONCE', 'on');
    markInsightSurfaced(USER, arc.id);
    const other = { ...arc, id: 'arc_sleep' };
    expect(await atTurn(12, other)).toBe(other);
    const dream = { ...arc, category: 'dream_keeper' };
    expect(await atTurn(12, dream)).toBe(dream);
  });

  it('off (default): the surfaced arc comes back on every pause, as before', async () => {
    markInsightSurfaced(USER, arc.id);
    expect(await atTurn(12)).toBe(arc);
    vi.stubEnv('ARC_INSIGHT_ONCE', 'off');
    expect(await atTurn(18)).toBe(arc);
    expect(await atTurn(19)).toBeNull();
  });
});

// #3167: nothing marked a pattern-mirror pattern shared, so it came back every
// third turn of every call (22 times in one 18-minute call).
describe('a pattern-mirror insight (PATTERN_MIRROR_ONCE)', () => {
  const pattern = {
    id: 'pattern_putting_off',
    category: 'pattern_mirror',
    message: "Can I share something I've noticed? It seems like when work piles up...",
  };
  const shared: Array<[string, string]> = [];
  const withMark = (): FollowUpGateDeps => ({
    ...deps(),
    markPatternShared: async (userId, patternId) => {
      shared.push([userId, patternId]);
    },
  });
  const atTurn = (turnNumber: number, insight: typeof pattern = pattern) =>
    surfaceProactiveInsight({ userId: USER, turnNumber, insight }, withMark());

  beforeEach(() => {
    shared.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('on: reaches the prompt once, is stored as shared, then is dropped on later pauses', async () => {
    vi.stubEnv('PATTERN_MIRROR_ONCE', 'on');
    expect(await atTurn(6)).toBe(pattern);
    expect(shared).toEqual([[USER, pattern.id]]);
    markInsightSurfaced(USER, pattern.id);
    expect(await atTurn(9)).toBeNull();
    expect(await atTurn(12)).toBeNull();
    expect(shared).toHaveLength(1);
  });

  it('on: a store that fails to save still lets the insight through once', async () => {
    vi.stubEnv('PATTERN_MIRROR_ONCE', 'on');
    const other = { ...pattern, id: 'pattern_store_down' };
    const failing: FollowUpGateDeps = {
      ...deps(),
      markPatternShared: () => Promise.reject(new Error('UNAVAILABLE')),
    };
    const out = await surfaceProactiveInsight(
      { userId: USER, turnNumber: 6, insight: other },
      failing
    );
    expect(out).toBe(other);
  });

  it('on: an arc or a different pattern is not marked as a shared pattern', async () => {
    vi.stubEnv('PATTERN_MIRROR_ONCE', 'on');
    const arc = { ...pattern, id: 'arc_other', category: 'emotional_trajectory' };
    expect(await atTurn(6, arc)).toBe(arc);
    expect(shared).toEqual([]);
    const next = { ...pattern, id: 'pattern_next' };
    expect(await atTurn(9, next)).toBe(next);
    expect(shared).toEqual([[USER, 'pattern_next']]);
  });

  it('off (default): never stored as shared and comes back on every pause, as before', async () => {
    markInsightSurfaced(USER, pattern.id);
    expect(await atTurn(6)).toBe(pattern);
    vi.stubEnv('PATTERN_MIRROR_ONCE', 'off');
    expect(await atTurn(9)).toBe(pattern);
    expect(await atTurn(12)).toBe(pattern);
    expect(await atTurn(13)).toBeNull();
    expect(shared).toEqual([]);
  });
});
