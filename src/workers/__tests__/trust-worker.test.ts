/**
 * Trust Worker Tests
 *
 * Tests the trust worker's integration with trust systems.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrustWorker } from '../trust-worker.js';

// Mock the trust system imports
vi.mock('../../services/trust-systems/reading-between-lines.js', () => ({
  getUnsaidProfile: vi.fn().mockReturnValue({
    userId: 'test-user',
    avoidedTopics: [{ topic: 'family', avoidanceCount: 2 }],
    falseFines: [],
    deflectionPatterns: [],
  }),
  getAvoidedTopics: vi.fn().mockReturnValue(['family', 'work']),
  recordDidShare: vi.fn(),
}));

vi.mock('../../services/trust-systems/growth-reflection.js', () => ({
  getGrowthPatterns: vi.fn().mockReturnValue([
    {
      id: 'pattern-1',
      type: 'emotional_regulation',
      significance: 'notable',
      confidence: 0.8,
    },
  ]),
  getUnreflectedGrowth: vi.fn().mockReturnValue([
    {
      id: 'pattern-2',
      type: 'perspective_shift',
      significance: 'transformative',
      reflectedBack: false,
    },
  ]),
  generateGrowthReflection: vi.fn().mockReturnValue({
    pattern: {
      id: 'pattern-2',
      type: 'perspective_shift',
      significance: 'transformative',
    },
    reflection: 'You seem to be handling things better now.',
    timing: 'now',
    ssml: '<speak>You seem to be handling things better now.</speak>',
  }),
}));

vi.mock('../../services/trust-systems/small-wins.js', () => ({
  getUncelebratedWins: vi.fn().mockReturnValue([
    {
      id: 'win-1',
      type: 'courage_moment',
      description: 'Had difficult conversation',
      celebrated: false,
    },
  ]),
  getPendingIntentions: vi.fn().mockReturnValue([
    {
      id: 'intent-1',
      intention: 'Call mom',
      status: 'pending',
    },
  ]),
  generateCelebration: vi.fn().mockReturnValue({
    approach: 'gentle',
    message: "That took courage. I'm proud of you.",
  }),
}));

vi.mock('../../services/trust-systems/thinking-of-you.js', () => ({
  getDueMoments: vi.fn().mockReturnValue([
    {
      id: 'moment-1',
      type: 'follow_up',
      topic: 'job interview',
    },
  ]),
}));

vi.mock('../../services/trust-systems/persistence.js', () => ({
  saveTrustProfiles: vi.fn().mockResolvedValue({ saved: 5, failed: 0 }),
  periodicSync: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import {
  getUnsaidProfile,
  getAvoidedTopics,
  recordDidShare,
} from '../../services/trust-systems/reading-between-lines.js';
import {
  getGrowthPatterns,
  getUnreflectedGrowth,
  generateGrowthReflection,
} from '../../services/trust-systems/growth-reflection.js';
import {
  getUncelebratedWins,
  getPendingIntentions,
  generateCelebration,
} from '../../services/trust-systems/small-wins.js';
import { getDueMoments } from '../../services/trust-systems/thinking-of-you.js';
import { saveTrustProfiles, periodicSync } from '../../services/trust-systems/persistence.js';

describe('TrustWorker', () => {
  let worker: TrustWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new TrustWorker();
  });

  afterEach(async () => {
    await worker.stop();
  });

  describe('process method', () => {
    it('should skip events without userId', async () => {
      const payload = {
        type: 'trust:update' as const,
        userId: undefined,
        personaId: 'ferni',
        data: { trustDelta: 0.1 },
        timestamp: new Date(),
      };

      // Access protected method via any
      await (worker as any).process(payload);

      // Should not call any trust systems
      expect(recordDidShare).not.toHaveBeenCalled();
      expect(periodicSync).not.toHaveBeenCalled();
    });

    it('should handle trust:update events', async () => {
      const payload = {
        type: 'trust:update' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: { trustDelta: 0.1, didShare: true, reason: 'opened up' },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(recordDidShare).toHaveBeenCalledWith('test-user');
      expect(periodicSync).toHaveBeenCalledWith('test-user');
    });

    it('should handle trust:milestone events', async () => {
      const payload = {
        type: 'trust:milestone' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: { milestone: 'first_deep_share' },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(getUncelebratedWins).toHaveBeenCalledWith('test-user');
      expect(generateCelebration).toHaveBeenCalled();
      expect(getDueMoments).toHaveBeenCalledWith('test-user');
      expect(saveTrustProfiles).toHaveBeenCalledWith('test-user');
    });

    it('should handle relationship:stage-change events', async () => {
      const payload = {
        type: 'relationship:stage-change' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: { from: 'new_acquaintance', to: 'trusted_friend' },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      expect(getGrowthPatterns).toHaveBeenCalledWith('test-user');
      expect(getUnreflectedGrowth).toHaveBeenCalledWith('test-user');
      expect(generateGrowthReflection).toHaveBeenCalled();
      expect(saveTrustProfiles).toHaveBeenCalledWith('test-user');
    });

    it('should handle conversation:end events', async () => {
      const payload = {
        type: 'conversation:end' as const,
        userId: 'test-user',
        personaId: 'ferni',
        data: { turnCount: 15, durationMs: 900000 },
        timestamp: new Date(),
      };

      await (worker as any).process(payload);

      // Should gather insights from all trust systems
      expect(getUnsaidProfile).toHaveBeenCalledWith('test-user');
      expect(getAvoidedTopics).toHaveBeenCalledWith('test-user');
      expect(getUncelebratedWins).toHaveBeenCalledWith('test-user');
      expect(getPendingIntentions).toHaveBeenCalledWith('test-user');
      expect(getDueMoments).toHaveBeenCalledWith('test-user');
      expect(saveTrustProfiles).toHaveBeenCalledWith('test-user');
    });
  });

  describe('event type handling', () => {
    it('should handle unrecognized event types gracefully', async () => {
      const payload = {
        type: 'unknown:event' as any,
        userId: 'test-user',
        personaId: 'ferni',
        data: {},
        timestamp: new Date(),
      };

      // Should not throw
      await expect((worker as any).process(payload)).resolves.not.toThrow();

      // Should not call any trust system functions
      expect(saveTrustProfiles).not.toHaveBeenCalled();
    });
  });
});
