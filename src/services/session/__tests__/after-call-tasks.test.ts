import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  getProfile: vi.fn(async (userId: string) => ({
    userId,
    name: 'Sam',
    totalConversations: 3,
    contactInfo: { timezone: 'America/Denver' },
  })),
  saveProfile: vi.fn(async () => undefined),
  saveSummary: vi.fn(async () => undefined),
}));

vi.mock('../../global-services.js', () => ({ getGlobalServices: async () => ({ store }) }));
vi.mock('../../data-layer/profile-cache.js', () => ({
  getProfileWithCache: async (uid: string, load: (u: string) => Promise<unknown>) => load(uid),
  cacheProfile: async () => undefined,
  invalidateProfile: async () => undefined,
}));
vi.mock('../../../memory/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  summarizeWithLLM: async (sessionId: string) => ({
    id: `sum-${sessionId}`,
    sessionId,
    timestamp: new Date(),
    duration: 60,
    turnCount: 2,
    mainTopics: ['knee surgery'],
    keyPoints: ['Mom has knee surgery Tuesday'],
    emotionalArc: 'worried then calm',
  }),
}));

import { getHistoryTracker } from '../../../memory/index.js';
import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  pendingAfterCallTasks,
  registerAfterCallTask,
  registeredAfterCallTasks,
  runAfterCall,
  runAfterCallTasks,
  type AfterCallContext,
} from '../after-call-tasks.js';
import { createSessionServices } from '../session-manager.js';

const ctx: AfterCallContext = { userId: 'u1', sessionId: 's1', turns: [], startedAt: new Date() };
const never = (): Promise<void> =>
  new Promise<void>(() => {
    // never settles
  });

afterEach(async () => {
  clearAfterCallTasks();
  await drainAfterCallTasks(50);
});

describe('runAfterCallTasks', () => {
  it('returns at once even when a task never finishes', () => {
    registerAfterCallTask('hangs', never, { timeoutMs: 60_000 });
    const t0 = Date.now();
    runAfterCallTasks(ctx);
    expect(Date.now() - t0).toBeLessThan(20);
    expect(pendingAfterCallTasks()).toBe(1);
  });

  it('a throwing task does not stop the others', async () => {
    const ran = vi.fn(async () => undefined);
    registerAfterCallTask('throws', async () => {
      throw new Error('boom');
    });
    registerAfterCallTask('fine', ran);
    runAfterCallTasks(ctx);
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(ran).toHaveBeenCalledWith(ctx);
  });

  it('a hung task is let go at its own timeout', async () => {
    registerAfterCallTask('hangs', never, { timeoutMs: 30 });
    runAfterCallTasks(ctx);
    expect(pendingAfterCallTasks()).toBe(1);
    expect(await drainAfterCallTasks(1_000)).toBe(0);
  });

  it('drain gives up at maxMs and reports what is left', async () => {
    registerAfterCallTask('hangs', never, { timeoutMs: 60_000 });
    runAfterCallTasks(ctx);
    const t0 = Date.now();
    expect(await drainAfterCallTasks(40)).toBe(1);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('registering a name twice keeps one task', () => {
    registerAfterCallTask('x', async () => undefined);
    registerAfterCallTask('x', async () => undefined);
    expect(registeredAfterCallTasks()).toEqual(['x']);
  });
});

describe('runAfterCall', () => {
  it("builds the call's start time and the caller's timezone", async () => {
    const task = vi.fn(async (_c: AfterCallContext) => undefined);
    registerAfterCallTask('t', task);
    runAfterCall(
      'u1',
      's1',
      [{ role: 'user', content: 'hi' }],
      { id: 'x' },
      { getDurationSeconds: () => 120 },
      {
        contactInfo: { timezone: 'America/Denver' },
      }
    );
    await drainAfterCallTasks(1_000);
    const got = task.mock.calls[0]?.[0];
    expect(got?.timezone).toBe('America/Denver');
    expect(Math.abs(Date.now() - 120_000 - (got?.startedAt.getTime() ?? 0))).toBeLessThan(1_000);
  });
});

describe('endSession', () => {
  it('starts the registered after-call tasks once the summary is saved', async () => {
    const task = vi.fn(async (_c: AfterCallContext) => undefined);
    registerAfterCallTask('probe', task);
    const sessionId = `after-call-${Date.now()}`;
    const services = await createSessionServices(sessionId, 'user-after-call');
    const tracker = getHistoryTracker(sessionId, 'user-after-call');
    tracker.addUserTurn('My mom has knee surgery on Tuesday.');
    tracker.addAssistantTurn('Oh, I hope it goes well.');

    await services.endSession();
    await drainAfterCallTasks(2_000);

    expect(store.saveSummary).toHaveBeenCalled();
    expect(task).toHaveBeenCalledTimes(1);
    const got = task.mock.calls[0]?.[0];
    expect(got).toMatchObject({ userId: 'user-after-call', sessionId, timezone: 'America/Denver' });
    expect(got?.turns.map((t) => t.content)).toContain('My mom has knee surgery on Tuesday.');
    expect(got?.summary).toMatchObject({ keyPoints: ['Mom has knee surgery Tuesday'] });
  });
});
