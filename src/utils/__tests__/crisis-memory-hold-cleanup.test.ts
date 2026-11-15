/**
 * Session teardown (cleanup-handler.ts) after a crisis read: the call-end writers get no userId, so
 * the short-term buffer is not promoted (memory/dynamic onSessionEnd) and nothing per-user is
 * kept, and nothing is purged (a crisis hold deletes nothing). A read still running at hangup is
 * waited for. An ordinary call still promotes. The real handleSessionCleanup runs; the call-end
 * writers are faked as in minor-care-cleanup.test.ts, so nothing persists anywhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const w = vi.hoisted(() => ({
  promote: vi.fn(async () => undefined),
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
vi.mock('../../memory/dynamic/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  onSessionEnd: w.promote,
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
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../services/safety/crisis-call-risk.js';
import { bindSessionUser, memoryHeld, resetMinorCare, userHeld } from '../minor-care.js';
import { holdForSexualTopic, resetSexualTopicHold } from '../sexual-topic-hold.js';
import type { SessionServices } from '../../services/types.js';
import type { PersonaConfig } from '../../personas/types.js';

const BUDGET_MS = 60_000;
let n = 0;

function call(): { sessionId: string; userId: string } {
  n++;
  const sessionId = `crisis-cleanup-${n}`;
  const userId = `user-${sessionId}`;
  bindSessionUser(sessionId, userId);
  return { sessionId, userId };
}

async function cleanup(sessionId: string, userId: string): Promise<void> {
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
}

beforeEach(() => {
  for (const fn of Object.values(w)) fn.mockClear();
  resetCrisisCallRisk();
});
afterEach(() => {
  resetCrisisCallRisk();
  resetMinorCare();
  resetSexualTopicHold();
  vi.unstubAllEnvs();
});

describe('cleanup-handler after a crisis read', { timeout: BUDGET_MS + 10_000 }, () => {
  it('no promotion, no per-user write, no purge; the end event is anonymous', async () => {
    const { sessionId, userId } = call();
    noteCrisisRisk(sessionId);
    expect(memoryHeld(sessionId)).toBe(true);
    await cleanup(sessionId, userId);
    expect(w.promote).not.toHaveBeenCalled();
    expect(w.trust).not.toHaveBeenCalled();
    expect(w.purge).not.toHaveBeenCalled();
    expect(w.emitEnd).toHaveBeenCalledWith(expect.objectContaining({ userId: 'anonymous' }));
  });

  it('a read still running at hangup that finds risk: waited for, then no promotion', async () => {
    const { sessionId, userId } = call();
    let finish: (v: { risk: string } | null) => void = () => undefined;
    const read = new Promise<{ risk: string } | null>((resolve) => {
      finish = resolve;
    });
    trackCrisisRead(sessionId, 'invented words of the last turn', read);
    expect(memoryHeld(sessionId)).toBe(false);
    const ending = cleanup(sessionId, userId);
    setTimeout(() => finish({ risk: 'crisis' }), 1000); // long after the writes would start
    await ending;
    expect(memoryHeld(sessionId)).toBe(true);
    expect(w.promote).not.toHaveBeenCalled();
  });

  it('a call not held, its caller held on another call (userHeld): no promotion', async () => {
    vi.stubEnv('SEXUAL_TOPIC_BOUNDARY', 'on');
    const { sessionId, userId } = call();
    holdForSexualTopic(`${sessionId}-other`, userId);
    expect([memoryHeld(sessionId), userHeld(userId)]).toEqual([false, true]);
    await cleanup(sessionId, userId);
    expect(w.promote).not.toHaveBeenCalled();
    expect(w.trust).not.toHaveBeenCalled();
  });

  it('an ordinary call still promotes with the real userId', async () => {
    const { sessionId, userId } = call();
    trackCrisisRead(sessionId, 'invented ordinary words', Promise.resolve({ risk: 'none' }));
    await cleanup(sessionId, userId);
    expect(memoryHeld(sessionId)).toBe(false);
    expect(w.promote).toHaveBeenCalledWith(sessionId, userId);
    expect(w.trust).toHaveBeenCalledWith(userId);
    expect(w.emitEnd).toHaveBeenCalledWith(expect.objectContaining({ userId }));
  });
});
