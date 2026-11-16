/**
 * A caller held on another call (userHeld) is held at this call's end too: the real endSession
 * makes no summary model call, saves no summary and starts no after-call task, the same as for a
 * call held itself (memoryHeld). A direct runAfterCall for that caller starts no task either. An
 * unheld call still does all three. The store, the profile cache and the summary model are faked;
 * the hold is MINOR_CARE's (a caller who said they're 16). Fixtures are fictional.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => ({ write: async () => ({ success: true, memoryId: 'm1' }) }),
}));
const store = vi.hoisted(() => ({
  getProfileForWrite: vi.fn(async (userId: string): Promise<unknown> => ({ userId, name: 'Rob' })),
  saveProfile: vi.fn(async () => undefined),
  saveSummary: vi.fn(async () => undefined),
}));
vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));
/** The summary model: counted, so a held call is seen to make no call at all. */
const summarize = vi.hoisted(() =>
  vi.fn(async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 60,
    turnCount: 2,
    mainTopics: ['gardening'],
    keyPoints: ['repotted a fern on the porch'],
    emotionalArc: 'calm',
  }))
);
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: summarize,
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ add: async () => ({ id: 'x' }) }) }) }),
  }),
}));
vi.mock('../../../memory/embeddings.js', () => ({ embed: async () => [0.1] }));
vi.mock('../../../memory/firestore-vector-store.js', () => ({
  getFirestoreVectorStore: () => ({ addDocument: async () => undefined }),
}));

import { getHistoryTracker } from '../../../memory/index.js';
import {
  bindSessionUser,
  memoryHeld,
  noteCallerWords,
  resetMinorCare,
  userHeld,
} from '../../../utils/minor-care.js';
import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  runAfterCall,
} from '../after-call-tasks.js';
import { createSessionServices } from '../session-manager.js';

const UNDER_18 = "I'm 16 years old and kind of bored";
let n = 0;
let probe = vi.fn(async () => undefined);

/** A caller with an earlier call; `said16` holds that earlier call (MINOR_CARE on). */
function caller(said16: boolean): { userId: string; earlier: string; now: string } {
  n++;
  const userId = `user-call-end-${n}`;
  const earlier = `call-end-earlier-${n}`;
  bindSessionUser(earlier, userId);
  if (said16) noteCallerWords(earlier, UNDER_18);
  return { userId, earlier, now: `call-end-now-${n}` };
}

/** The real endSession of a two-turn call; what it did. */
async function endCall(sessionId: string, userId: string) {
  const services = await createSessionServices(sessionId, userId);
  const tracker = getHistoryTracker(sessionId, userId);
  tracker.addAssistantTurn('Hey, how was the weekend?');
  tracker.addUserTurn('Good, I repotted the fern on the porch.');
  await services.endSession();
  await drainAfterCallTasks(1_000);
  return {
    summaryCalls: summarize.mock.calls.filter(([id]) => id === sessionId).length,
    saved: store.saveSummary.mock.calls.length,
    tasks: probe.mock.calls.length,
  };
}

beforeEach(() => {
  vi.stubEnv('MINOR_CARE', 'on');
  summarize.mockClear();
  store.saveSummary.mockClear();
  clearAfterCallTasks(); // only the probe: no task a module registered on import
  probe = vi.fn(async () => undefined);
  registerAfterCallTask('probe', probe);
});
afterEach(async () => {
  clearAfterCallTasks();
  await drainAfterCallTasks(50);
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('call end (session-manager.ts endSession)', () => {
  it('a caller held on another call: no summary call, saved summary or task', async () => {
    const { userId, now } = caller(true);
    expect(userHeld(userId)).toBe(true);
    expect(memoryHeld(now)).toBe(false);
    expect(await endCall(now, userId)).toEqual({ summaryCalls: 0, saved: 0, tasks: 0 });
  });

  it('a call held itself: nothing either', async () => {
    const { userId, now } = caller(false);
    noteCallerWords(now, UNDER_18);
    expect(memoryHeld(now)).toBe(true);
    expect(await endCall(now, userId)).toEqual({ summaryCalls: 0, saved: 0, tasks: 0 });
  });

  it('control: an unheld caller gets the summary call, saved summary and task', async () => {
    const { userId, now } = caller(false);
    expect(userHeld(userId)).toBe(false);
    expect(memoryHeld(now)).toBe(false);
    expect(await endCall(now, userId)).toEqual({ summaryCalls: 1, saved: 1, tasks: 1 });
  });
});

describe('after-call tasks (after-call-tasks.ts runAfterCall)', () => {
  const tracker = { getDurationSeconds: () => 60 };

  it('a caller held on another call: a direct runAfterCall starts no task', async () => {
    const { userId, now } = caller(true);
    expect(userHeld(userId)).toBe(true);
    runAfterCall(userId, now, [], null, tracker);
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(probe).not.toHaveBeenCalled();
  });

  it('control: an unheld caller gets the task', async () => {
    const { userId, now } = caller(false);
    runAfterCall(userId, now, [], null, tracker);
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
