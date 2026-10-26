/**
 * A breakthrough turn must not put the caller's words into community learning.
 *
 * Community insights are shared by every caller (Firestore community_insights/global,
 * other callers' prompt hints, an observability endpoint). Before this fix,
 * recordAllLearningData() stored 100 chars of a prompt injection (which can carry
 * the caller's memories) as the "question pattern", 200 chars of what the caller
 * said as its context, and the first word of a topics injection as its topic.
 * Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index.js', () => ({ recordTrustSystemsData: vi.fn(async () => undefined) }));
vi.mock('../../../intelligence/context-builders/intelligence/temporal-intelligence.js', () => ({
  learnTemporalPattern: vi.fn(async () => undefined),
}));
vi.mock('../../../intelligence/context-builders/relationship/deep-relationship.js', () => ({
  recordSharedMoment: vi.fn(async () => undefined),
}));
vi.mock('../../../intelligence/capability-learning.js', () => ({
  onUserEngagedWithCapability: vi.fn(),
  getRecentlySurfacedDomains: vi.fn(() => []),
}));
vi.mock('../../../audio/music-player.js', () => ({
  getMusicPlayer: vi.fn(() => ({ getState: () => ({ isPlaying: false }) })),
}));
vi.mock('../../../services/trust-systems/our-songs.js', () => ({
  detectSignificantMoment: vi.fn(() => null),
  recordOurSong: vi.fn(async () => undefined),
}));
vi.mock('../../../services/superhuman/user-corrections.js', () => ({
  userCorrections: {
    autoRecord: vi.fn(async () => null),
    recordImplicitPreference: vi.fn(async () => null),
  },
}));
// The real collective-learning code, without loading the whole intelligence barrel;
// the breakthrough call is wrapped so the test can see what turn-learning hands it
vi.mock('../../../intelligence/index.js', async () => {
  const real = await import('../../../intelligence/collective/integration.js');
  return {
    ...real,
    recordBreakthroughForLearning: vi.fn(real.recordBreakthroughForLearning),
  };
});

import { recordAllLearningData, type LearningContext } from '../turn-learning.js';
import { recordBreakthroughForLearning } from '../../../intelligence/index.js';
import { flushLearningSignals } from '../../../intelligence/collective/integration.js';
import {
  getCommunityInsights,
  resetCommunityInsights,
} from '../../../intelligence/collective/community-insights.js';
import { QUESTION_SHAPES } from '../../../intelligence/collective/community-labels.js';

const PHRASES = ['zanzibarquokka', 'periwinkleotter', 'marmaladeheron', 'cobaltpangolin'];

function breakthroughTurn(): LearningContext {
  return {
    userId: 'synthetic-user-B2',
    sessionId: 'synthetic-session-1',
    personaId: 'ferni',
    turnCount: 6, // a multiple of 3, so the breakthrough branch runs
    userText: 'oh wow, i finally get it now, marmaladeheron was right all along',
    emotionalResult: { primary: 'joy', intensity: 0.9, distressLevel: 0 },
    injections: [
      {
        category: 'memory',
        content:
          '[MEMORY: their friend zanzibarquokka helped with the periwinkleotter move] Ask how that went?',
      },
      { category: 'topics', content: 'cobaltpangolin and the move' },
    ],
    turnResult: { emotional: { primary: 'joy', intensity: 0.9 }, context: {} },
  };
}

describe('recordAllLearningData on a breakthrough turn', () => {
  beforeEach(async () => {
    vi.mocked(recordBreakthroughForLearning).mockClear();
    resetCommunityInsights();
    await flushLearningSignals();
  });

  it('records the breakthrough as labels only, with none of the caller’s words', async () => {
    await recordAllLearningData(breakthroughTurn());
    const flushed = await flushLearningSignals();
    expect(flushed.breakthroughs).toBe(1); // the breakthrough really was recorded

    // What turn-learning hands to collective learning is already labels only
    expect(recordBreakthroughForLearning).toHaveBeenCalledTimes(1);
    const handedOver = JSON.stringify(vi.mocked(recordBreakthroughForLearning).mock.calls[0]);
    for (const phrase of PHRASES) expect(handedOver).not.toContain(phrase);

    const { effectiveQuestions } = getCommunityInsights().exportInsights();
    expect(effectiveQuestions).toHaveLength(1);
    const [q] = effectiveQuestions;
    expect(QUESTION_SHAPES).toContain(q.questionPattern);
    expect(q.topic).toBe('general');
    expect(q.bestContexts).toEqual(['breakthrough']);

    const stored = JSON.stringify(getCommunityInsights().exportInsights());
    for (const phrase of PHRASES) expect(stored).not.toContain(phrase);
  });
});
