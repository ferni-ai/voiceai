/**
 * MINOR_CARE=on: session cleanup (cleanup-handler.ts) hands no persisting
 * writer the real userId for a caller who said they're under 18 and isn't a
 * verified owner. The real handleSessionCleanup runs; only the writers are
 * faked, and each is checked to still get the real userId for a verified owner
 * and with the flag off. Presence and outreach suppression (sessionLifecycle)
 * keep the real userId in every case.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  trust: vi.fn(async () => undefined),
  finalize: vi.fn(async () => undefined),
  discard: vi.fn(),
  humanization: vi.fn(async () => ({ saved: false, items: [] })),
  naturalness: vi.fn(async () => undefined),
  arc: vi.fn(async () => undefined),
  music: vi.fn(async () => undefined),
  predictive: vi.fn(),
  aggregate: vi.fn(async () => undefined),
  sessionEnded: vi.fn(async () => ({ cleaned: [], errors: [] })),
  emitEnd: vi.fn(),
  lifecycle: vi.fn(async () => undefined),
  socialGraph: vi.fn(async () => undefined),
  resonance: vi.fn(async () => undefined),
  purge: vi.fn(),
}));
vi.mock('../../agents/voice-agent/minor-care-purge.js', () => ({ purgeHeldUser: w.purge }));
vi.mock('../../services/trust-systems/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  onSessionEnd: w.trust,
}));
vi.mock('../../intelligence/capability-learning.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  finalizeSessionLearning: w.finalize,
  discardSessionLearning: w.discard,
}));
vi.mock('../../conversation/humanization/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistOnSessionEnd: w.humanization,
}));
vi.mock('../../speech/naturalness/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistNaturalnessData: w.naturalness,
}));
vi.mock('../../intelligence/context-builders/relationship/arc/storage.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  incrementSessionStats: w.arc,
}));
vi.mock('../../audio/music-learning-persistence.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  flushMusicLearning: w.music,
}));
vi.mock('../../agents/integrations/predictive-intelligence-integration.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  cleanupPredictiveIntelligence: w.predictive,
}));
vi.mock('../../intelligence/context-routing/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFeedbackAggregator: () => ({ aggregateFromTracker: w.aggregate }),
}));
vi.mock('../../services/session-data-manager.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getSessionDataManager: () => ({ sessionEnded: w.sessionEnded }),
}));
vi.mock('../../services/async-events/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  emitConversationEnd: w.emitEnd,
}));
vi.mock('../../services/session/session-lifecycle-hooks.js', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    sessionLifecycle: { ...(real.sessionLifecycle as object), onEnd: w.lifecycle },
  };
});
vi.mock('../../services/session/session-end-cleanup.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  persistSocialGraphOnEnd: w.socialGraph,
}));
vi.mock('../../personas/shared/personality-resonance-store.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  flushResonanceProfile: w.resonance,
}));

import {
  handleSessionCleanup,
  type CleanupContext,
} from '../../agents/voice-agent/cleanup-handler.js';
import { noteCallerWords, resetMinorCare, setVerifiedOwnerCheck } from '../minor-care.js';
import type { SessionServices } from '../../services/types.js';
import type { PersonaConfig } from '../../personas/types.js';

type Case = 'held' | 'owner' | 'off';
const BUDGET_MS = 60_000;
let n = 0;

/** Run the real cleanup for a caller who said "I'm 16 years old", in the given state. */
async function cleanup(c: Case): Promise<{ sessionId: string; userId: string }> {
  const sessionId = `cleanup-${c}-${++n}`;
  const userId = `user-${sessionId}`;
  vi.stubEnv('MINOR_CARE', c === 'off' ? 'off' : 'on');
  vi.stubEnv('USE_SMART_CONTEXT_ROUTING', 'true');
  if (c === 'owner') setVerifiedOwnerCheck((id) => id === sessionId);
  noteCallerWords(sessionId, "I'm 16 years old and kind of bored");
  const ctx: CleanupContext = {
    sessionId,
    userId,
    services: {
      endSession: vi.fn(async () => undefined),
      sessionStartTime: Date.now() - 60_000,
    } as unknown as SessionServices,
    sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
    voiceHumanization: null,
    autoOptimizer: { endSession: vi.fn() },
  };
  await handleSessionCleanup(ctx, BUDGET_MS);
  return { sessionId, userId };
}

afterEach(() => {
  resetMinorCare();
  vi.unstubAllEnvs();
});

describe('cleanup-handler: held caller under 18', { timeout: BUDGET_MS + 10_000 }, () => {
  let run: { sessionId: string; userId: string };
  /** Each writer's calls, copied once: the config resets mocks before every test. */
  let seen: Record<keyof typeof w, unknown[][]>;
  beforeAll(async () => {
    for (const fn of Object.values(w)) fn.mockClear();
    run = await cleanup('held');
    seen = Object.fromEntries(
      Object.entries(w).map(([k, fn]) => [k, fn.mock.calls.map((call) => [...call])])
    ) as typeof seen;
  }, BUDGET_MS + 10_000);

  it.each<[string, keyof typeof w]>([
    ['trust profiles', 'trust'],
    ['capability learning (aggregate)', 'finalize'],
    ['humanization and comfort state', 'humanization'],
    ['voice patterns (naturalness, keyed by session)', 'naturalness'],
    ['relationship arc stats', 'arc'],
    ['music learning', 'music'],
    ['smart routing feedback', 'aggregate'],
    ['social graph (#1897)', 'socialGraph'],
    ['personality resonance (#1897)', 'resonance'],
  ])('%s: not called', (_name, key) => {
    expect(seen[key]).toEqual([]);
  });

  it('every per-user store purges the user, last (minor-care-purge.ts)', () => {
    expect(seen.purge).toEqual([[run.userId]]);
  });

  it('capability tracking is discarded instead', () => {
    expect(seen.discard).toEqual([[`${run.userId}-${run.sessionId}`]]);
  });

  it('ML, superhuman and embedding flush (predictive cleanup): no userId', () => {
    expect(seen.predictive).toEqual([[run.sessionId, undefined]]);
  });

  it('conversation:end event (trust and predictions workers persist on it): anonymous', () => {
    expect(seen.emitEnd).toEqual([[expect.objectContaining({ userId: 'anonymous' })]]);
  });

  it('session data caches (persona memories save first): dropped unsaved', () => {
    expect(seen.sessionEnded).toEqual([[run.userId, { save: false }]]);
  });

  it('presence and outreach suppression keep the real id (affinity gated in onSessionEnd)', () => {
    expect(seen.lifecycle).toEqual([[run.userId, run.sessionId, expect.anything()]]);
  });
});

describe.each<Case>(['owner', 'off'])(
  'cleanup-handler: %s still persists',
  { timeout: BUDGET_MS + 10_000 },
  (c) => {
    it('each writer gets the real userId', async () => {
      for (const fn of Object.values(w)) fn.mockClear();
      const { sessionId, userId } = await cleanup(c);
      expect(w.trust).toHaveBeenCalledWith(userId);
      expect(w.finalize).toHaveBeenCalledWith(`${userId}-${sessionId}`, userId);
      expect(w.discard).not.toHaveBeenCalled();
      expect(w.humanization).toHaveBeenCalledWith(userId, sessionId);
      expect(w.naturalness).toHaveBeenCalledWith(sessionId);
      expect(w.arc).toHaveBeenCalledWith(userId, expect.any(Number));
      expect(w.music).toHaveBeenCalledWith(userId);
      expect(w.aggregate).toHaveBeenCalledWith(sessionId, userId, expect.anything());
      expect(w.socialGraph).toHaveBeenCalledWith(userId);
      expect(w.resonance).toHaveBeenCalledWith(userId);
      expect(w.predictive).toHaveBeenCalledWith(sessionId, userId);
      expect(w.emitEnd).toHaveBeenCalledWith(expect.objectContaining({ userId }));
      expect(w.sessionEnded).toHaveBeenCalledWith(userId, { save: true });
      expect(w.lifecycle).toHaveBeenCalledWith(userId, sessionId, expect.anything());
      expect(w.purge).not.toHaveBeenCalled();
    });
  }
);
