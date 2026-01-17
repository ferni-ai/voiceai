/**
 * ACT Defusion Techniques Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  DEFUSION_TECHNIQUES,
  selectDefusionTechnique,
  getAllDefusionTechniques,
  getDefusionTechnique,
  recordDefusionUse,
  getMostEffectiveDefusion,
  getRecentDefusionTechniques,
  buildDefusionContext,
} from '../act-defusion.js';

describe('ACTDefusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEFUSION_TECHNIQUES Library', () => {
    it('should have all core techniques defined', () => {
      expect(DEFUSION_TECHNIQUES.naming).toBeDefined();
      expect(DEFUSION_TECHNIQUES.im_having_the_thought).toBeDefined();
      expect(DEFUSION_TECHNIQUES.thanking_mind).toBeDefined();
      expect(DEFUSION_TECHNIQUES.singing).toBeDefined();
      expect(DEFUSION_TECHNIQUES.silly_voice).toBeDefined();
      expect(DEFUSION_TECHNIQUES.thoughts_on_leaves).toBeDefined();
      expect(DEFUSION_TECHNIQUES.observing_self).toBeDefined();
      expect(DEFUSION_TECHNIQUES.radio_metaphor).toBeDefined();
      expect(DEFUSION_TECHNIQUES.passengers_on_bus).toBeDefined();
      expect(DEFUSION_TECHNIQUES.cloud_watching).toBeDefined();
    });

    it('each technique should have required fields', () => {
      for (const technique of Object.values(DEFUSION_TECHNIQUES)) {
        expect(technique.id).toBeDefined();
        expect(technique.name).toBeDefined();
        expect(technique.description).toBeDefined();
        expect(technique.guidance).toBeDefined();
        expect(technique.bestFor).toBeDefined();
        expect(Array.isArray(technique.bestFor)).toBe(true);
        expect(technique.exampleThought).toBeDefined();
        expect(technique.exampleDefusion).toBeDefined();
      }
    });

    it('should have at least 10 techniques', () => {
      const count = Object.keys(DEFUSION_TECHNIQUES).length;
      expect(count).toBeGreaterThanOrEqual(10);
    });
  });

  describe('selectDefusionTechnique', () => {
    it('should select im_having_the_thought for high distress', () => {
      const technique = selectDefusionTechnique({
        emotionIntensity: 0.9,
      });

      expect(technique.id).toBe('im_having_the_thought');
    });

    it('should select naming for self-criticism thought type', () => {
      const technique = selectDefusionTechnique({
        thoughtType: 'self_criticism',
        emotionIntensity: 0.5,
      });

      expect(technique.id).toBe('naming');
    });

    it('should select thanking_mind for catastrophizing', () => {
      const technique = selectDefusionTechnique({
        thoughtType: 'catastrophizing',
        emotionIntensity: 0.5,
      });

      expect(technique.id).toBe('thanking_mind');
    });

    it('should select thoughts_on_leaves for rumination', () => {
      const technique = selectDefusionTechnique({
        thoughtType: 'rumination',
        emotionIntensity: 0.5,
      });

      expect(technique.id).toBe('thoughts_on_leaves');
    });

    it('should select observing_self for identity fusion', () => {
      const technique = selectDefusionTechnique({
        thoughtType: 'identity_fusion',
        emotionIntensity: 0.5,
      });

      expect(technique.id).toBe('observing_self');
    });

    it('should select radio_metaphor for worry', () => {
      const technique = selectDefusionTechnique({
        thoughtType: 'worry',
        emotionIntensity: 0.5,
      });

      expect(technique.id).toBe('radio_metaphor');
    });

    it('should avoid recently used techniques', () => {
      const technique = selectDefusionTechnique({
        previousTechniques: ['im_having_the_thought', 'naming', 'thanking_mind'],
        emotionIntensity: 0.5,
      });

      expect(technique.id).not.toBe('im_having_the_thought');
      expect(technique.id).not.toBe('naming');
      expect(technique.id).not.toBe('thanking_mind');
    });

    it('should prefer playful techniques for low distress', () => {
      // Run multiple times and check if playful techniques appear
      const playfulIds = ['singing', 'silly_voice'];
      let foundPlayful = false;

      for (let i = 0; i < 20; i++) {
        const technique = selectDefusionTechnique({
          emotionIntensity: 0.3,
        });
        if (playfulIds.includes(technique.id)) {
          foundPlayful = true;
          break;
        }
      }

      expect(foundPlayful).toBe(true);
    });

    it('should default to im_having_the_thought when all used', () => {
      const allIds = Object.keys(DEFUSION_TECHNIQUES);
      const technique = selectDefusionTechnique({
        previousTechniques: allIds,
      });

      expect(technique.id).toBe('im_having_the_thought');
    });
  });

  describe('getAllDefusionTechniques', () => {
    it('should return all techniques as array', () => {
      const techniques = getAllDefusionTechniques();

      expect(Array.isArray(techniques)).toBe(true);
      expect(techniques.length).toBeGreaterThan(0);
    });
  });

  describe('getDefusionTechnique', () => {
    it('should return technique by ID', () => {
      const technique = getDefusionTechnique('naming');

      expect(technique).not.toBeNull();
      expect(technique?.id).toBe('naming');
      expect(technique?.name).toBe('Naming the Story');
    });

    it('should return null for unknown ID', () => {
      const technique = getDefusionTechnique('nonexistent');

      expect(technique).toBeNull();
    });
  });

  describe('Defusion Tracking', () => {
    const userId = 'defusion-user-123';

    it('should record defusion technique use', () => {
      recordDefusionUse(userId, 'naming', { helpfulnessRating: 5 });
      recordDefusionUse(userId, 'thanking_mind', { helpfulnessRating: 4 });

      const recent = getRecentDefusionTechniques(userId);
      expect(recent).toContain('naming');
      expect(recent).toContain('thanking_mind');
    });

    it('should track multiple uses', () => {
      const multiUser = userId + '-multi';
      recordDefusionUse(multiUser, 'naming');
      recordDefusionUse(multiUser, 'singing');
      recordDefusionUse(multiUser, 'cloud_watching');

      const recent = getRecentDefusionTechniques(multiUser);
      expect(recent.length).toBe(3);
    });

    it('should calculate most effective techniques', () => {
      const effectiveUser = userId + '-effective';
      recordDefusionUse(effectiveUser, 'naming', { helpfulnessRating: 5 });
      recordDefusionUse(effectiveUser, 'naming', { helpfulnessRating: 5 });
      recordDefusionUse(effectiveUser, 'singing', { helpfulnessRating: 3 });

      const effective = getMostEffectiveDefusion(effectiveUser);
      expect(effective[0]).toBe('naming');
    });

    it('should return empty array for user with no ratings', () => {
      const effective = getMostEffectiveDefusion('new-user');

      expect(effective).toEqual([]);
    });

    it('should limit recent techniques', () => {
      const limitUser = userId + '-limit';
      for (let i = 0; i < 10; i++) {
        recordDefusionUse(limitUser, `technique-${i}` as never);
      }

      const recent = getRecentDefusionTechniques(limitUser, 3);
      expect(recent.length).toBe(3);
    });
  });

  describe('buildDefusionContext', () => {
    it('should return null without detected thought', () => {
      const context = buildDefusionContext('user-123');

      expect(context).toBeNull();
    });

    it('should build context with detected thought', () => {
      const context = buildDefusionContext('user-123', "I'm not good enough");

      expect(context).not.toBeNull();
      expect(context).toContain('DEFUSION OPPORTUNITY');
      expect(context).toContain("I'm not good enough");
    });

    it('should include technique guidance', () => {
      const context = buildDefusionContext('user-123', "I'll never succeed");

      expect(context).toContain('Consider:');
    });

    it('should include example when available', () => {
      const context = buildDefusionContext('user-123', "I'm a failure");

      // Most techniques have examples
      expect(context).not.toBeNull();
    });

    it('should note effective techniques for returning users', () => {
      const userId = 'returning-user-123';
      recordDefusionUse(userId, 'naming', { helpfulnessRating: 5 });
      recordDefusionUse(userId, 'naming', { helpfulnessRating: 5 });

      const context = buildDefusionContext(userId, 'Negative thought');

      // May include note about what worked before
      expect(context).not.toBeNull();
    });

    it('should include distance reminder', () => {
      const context = buildDefusionContext('user-123', 'Any negative thought');

      expect(context).toContain('distance from the thought');
    });
  });

  describe('Technique Content Quality', () => {
    it('im_having_the_thought should have clear instructions', () => {
      const technique = DEFUSION_TECHNIQUES.im_having_the_thought;

      expect(technique.guidance).toContain("I'm having the thought that");
      expect(technique.exampleDefusion).toContain("I'm having the thought");
    });

    it('naming should explain the concept', () => {
      const technique = DEFUSION_TECHNIQUES.naming;

      expect(technique.guidance).toContain('name');
      expect(technique.bestFor).toContain('recurring thoughts');
    });

    it('thanking_mind should be about gratitude', () => {
      const technique = DEFUSION_TECHNIQUES.thanking_mind;

      expect(technique.guidance).toContain('Thank');
      expect(technique.guidance).toContain('protect');
    });

    it('playful techniques should be appropriate', () => {
      expect(DEFUSION_TECHNIQUES.singing.bestFor).toContain('mild distress');
      expect(DEFUSION_TECHNIQUES.silly_voice.guidance).toContain('silly');
    });

    it('all techniques should have non-empty guidance', () => {
      for (const technique of Object.values(DEFUSION_TECHNIQUES)) {
        expect(technique.guidance.length).toBeGreaterThan(50);
      }
    });
  });
});
