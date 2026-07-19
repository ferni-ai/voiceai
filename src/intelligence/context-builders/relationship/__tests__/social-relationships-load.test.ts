import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above imports; vi.hoisted() lets us declare
// the mock fns before that hoist point so the factory can reference them.
const {
  loadGraphFromFirestore,
  generateSocialInsights,
  extractNames,
  recordMention,
  generateSuperhumanMoment,
  getImportantPeople,
} = vi.hoisted(() => ({
  loadGraphFromFirestore: vi.fn(async () => undefined),
  generateSocialInsights: vi.fn(() => [
    {
      type: 'pattern',
      personName: 'Sarah',
      insight: 'You often light up when Sarah comes up',
      urgency: 'medium',
      suggestion: null,
    },
  ]),
  extractNames: vi.fn(() => []),
  recordMention: vi.fn(),
  generateSuperhumanMoment: vi.fn(() => null),
  getImportantPeople: vi.fn(() => []),
}));

vi.mock('../../../../services/social-graph/index.js', () => ({
  loadGraphFromFirestore,
  generateSocialInsights,
  extractNames,
  recordMention,
  generateSuperhumanMoment,
  getImportantPeople,
}));

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Import after mocks — may need to avoid registerContextBuilder side effects
vi.mock('../../index.js', () => ({
  registerContextBuilder: vi.fn(),
}));

import { socialRelationshipsBuilder } from '../social-relationships.js';

describe('socialRelationshipsBuilder load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads graph from Firestore before generating insights', async () => {
    const injections = await socialRelationshipsBuilder.build({
      services: { userId: 'user-1', sessionId: 'sess-1' },
      userData: {},
      userText: 'hello',
      analysis: {
        emotion: { primary: 'neutral', intensity: 0.2 },
        topics: { detected: [] },
      },
    } as never);

    expect(loadGraphFromFirestore).toHaveBeenCalledWith('user-1');
    expect(injections.some((i) => i.content.includes('Sarah'))).toBe(true);
  });
});
