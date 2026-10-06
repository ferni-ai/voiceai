/**
 * The live superhuman builder's reads: they start together, and the joy pool
 * is read once per user per TTL (live-superhuman-reads.ts).
 *
 * Each network read is a fake that records when it starts and resolves only
 * when the test says so, so these tests check order and counts, not timing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const started: string[] = [];
let pending: Record<string, Deferred<unknown>> = {};
function read<T>(name: string): Promise<T> {
  started.push(name);
  const d = deferred<unknown>();
  pending[name] = d;
  return d.promise as Promise<T>;
}

/** Joy pool lookups not yet answered; a test answers all of them at once. */
let joyLookups: Array<Deferred<unknown>> = [];
const buildJoyPool = vi.fn((_userId: string) => {
  started.push('joyPool');
  const d = deferred<unknown>();
  joyLookups.push(d);
  return d.promise;
});

vi.mock('../../../services/superhuman/commitment-keeper-e2e.js', () => ({
  checkProgressE2E: vi.fn(async () => ({ progressDetected: false, shouldCelebrate: false })),
  detectCommitmentE2E: vi.fn(async () => null),
}));
vi.mock('../../../services/superhuman/semantic-intelligence/cross-session-threading.js', () => ({
  crossSessionThreading: { buildContext: vi.fn(async () => read<string>('semantic')) },
}));
vi.mock('../../../services/superhuman/semantic-intelligence/emotional-trajectories.js', () => ({
  buildEmotionalTrajectoryContext: vi.fn(async () => read<string>('trajectory')),
}));
vi.mock('../../../intelligence/triggers/recall-trigger-engine.js', () => ({
  detectRecallTriggers: vi.fn(async () => read<unknown>('recall')),
}));
vi.mock('../../../memory/emotional/joy-amplification.js', () => ({
  buildJoyPool: (userId: string) => buildJoyPool(userId),
  shouldAmplifyJoy: vi.fn(() => ({
    shouldAmplify: true,
    selectedMemory: { content: 'the day they finished the marathon' },
    deliveryPhrase: 'Remember the marathon?',
  })),
}));

const { buildLiveSuperhumanInjections } = await import('../live-superhuman-injections.js');
const { startLiveSuperhumanReads, clearJoyPoolCache } = await import('../live-superhuman-reads.js');

const POOL = {
  userId: 'u1',
  memories: [{ id: 'm1', content: 'marathon' }],
  lastUpdated: new Date(),
};

/** A turn on which every read applies: turn 15 is a multiple of 3 and of 5. */
function turn(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    sessionId: 's1',
    userText: 'work was okay today',
    emotionalState: { primary: 'sad', intensity: 0.8, valence: -0.3, distressLevel: 0.2 },
    analysis: { intent: 'statement', emotion: 'neutral', confidence: 0.9, topics: [] },
    turnCount: 15,
    totalConversations: 10,
    ...overrides,
  } as unknown as Parameters<typeof buildLiveSuperhumanInjections>[0];
}

/** Answers every outstanding joy pool lookup, once at least one has started. */
async function settleJoyPool(value: unknown, fail = false) {
  await vi.waitFor(() => expect(joyLookups.length).toBeGreaterThan(0));
  for (const d of joyLookups) {
    if (fail) d.reject(new Error('vertex 503'));
    else d.resolve(value);
  }
  joyLookups = [];
}

beforeEach(() => {
  started.length = 0;
  pending = {};
  joyLookups = [];
  buildJoyPool.mockClear();
  clearJoyPoolCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildLiveSuperhumanInjections reads', () => {
  it('starts every read before any of them has answered', async () => {
    const result = buildLiveSuperhumanInjections(turn());

    // The old builder awaited each read before starting the next, so only the
    // first one ever started while it was unanswered.
    await vi.waitFor(() =>
      expect([...started].sort()).toEqual(['joyPool', 'recall', 'semantic', 'trajectory'])
    );

    pending.semantic.resolve('they mentioned the move last month');
    pending.trajectory.resolve('trending calmer');
    pending.recall.resolve({
      shouldSurface: true,
      bestTrigger: {
        type: 'anniversary',
        suggestion: 'one year ago',
        confidence: 0.9,
        priority: 70,
      },
    });
    await settleJoyPool(POOL);

    const { injections } = await result;
    // Same injections, in the same order, as when the reads ran one at a time.
    expect(injections.map((i) => i.category)).toEqual([
      'superhuman_semantic',
      'superhuman_trajectory',
      'superhuman_recall',
      'superhuman_joy',
    ]);
  });

  it('starts no read on a turn where none applies', async () => {
    const result = await buildLiveSuperhumanInjections(
      turn({
        turnCount: 1,
        totalConversations: undefined,
        emotionalState: { primary: 'calm', intensity: 0.3, valence: 0.2, distressLevel: 0 },
      })
    );
    expect(started).toEqual([]);
    expect(result.injections.map((i) => i.category)).not.toContain('superhuman_joy');
  });
});

describe('joy pool cache', () => {
  it('builds a user’s joy pool once across turns, and separately per user', async () => {
    const first = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(POOL);
    expect(await first).toMatchObject({ shouldAmplify: true });

    // A cached pool answers at once; a new lookup would wait for this test.
    const second = await Promise.race([
      startLiveSuperhumanReads(turn()).joy,
      new Promise((resolve) => {
        setTimeout(() => resolve('still waiting'), 200);
      }),
    ]);
    expect(second).toMatchObject({ shouldAmplify: true });
    expect(buildJoyPool).toHaveBeenCalledTimes(1);

    const other = startLiveSuperhumanReads(turn({ userId: 'u2' })).joy;
    await settleJoyPool(null);
    expect(await other).toBeNull();
    expect(buildJoyPool).toHaveBeenCalledTimes(2);
  });

  it('shares one lookup between turns that overlap it', async () => {
    const a = startLiveSuperhumanReads(turn()).joy;
    const b = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(POOL);
    await Promise.all([a, b]);
    expect(buildJoyPool).toHaveBeenCalledTimes(1);
  });

  it('keeps a pool with memories 5 minutes and an empty one 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));

    const found = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(POOL);
    await found;
    const empty = startLiveSuperhumanReads(turn({ userId: 'u2' })).joy;
    await settleJoyPool(null);
    await empty;
    expect(buildJoyPool).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-10-05T12:00:31Z'));
    void startLiveSuperhumanReads(turn()).joy; // still cached
    const retried = startLiveSuperhumanReads(turn({ userId: 'u2' })).joy;
    await settleJoyPool(null);
    await retried;
    expect(buildJoyPool.mock.calls.map(([userId]) => userId)).toEqual(['u1', 'u2', 'u2']);

    vi.setSystemTime(new Date('2026-10-05T12:05:01Z'));
    const rebuilt = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(POOL);
    await rebuilt;
    expect(buildJoyPool.mock.calls.map(([userId]) => userId)).toEqual(['u1', 'u2', 'u2', 'u1']);
  });

  it('does not keep a lookup that failed', async () => {
    const failed = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(null, true);
    expect(await failed).toBeNull();

    const next = startLiveSuperhumanReads(turn()).joy;
    await settleJoyPool(POOL);
    expect(await next).toMatchObject({ shouldAmplify: true });
    expect(buildJoyPool).toHaveBeenCalledTimes(2);
  });
});
