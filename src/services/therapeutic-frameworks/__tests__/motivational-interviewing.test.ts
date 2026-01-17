/**
 * Motivational Interviewing Tests
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

// Mock persistence
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: vi.fn(() => ({
    load: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

import {
  detectChangeTalk,
  getStrongestChangeTalk,
  detectSustainTalk,
  generateOARSResponse,
  recordChangeTalk,
  getChangeTalkHistory,
  getTopChangeTalkTopics,
  analyzeAmbivalence,
  buildMIContext,
  CHANGE_TALK_PATTERNS,
  OPEN_QUESTIONS,
  AFFIRMATIONS,
  REFLECTION_TEMPLATES,
} from '../motivational-interviewing.js';

describe('MotivationalInterviewing', () => {
  const userId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Change Talk Detection', () => {
    describe('DARN-CAT Pattern Detection', () => {
      it('should detect desire statements', () => {
        const result = detectChangeTalk('I really want to quit smoking');

        expect(result.length).toBeGreaterThan(0);
        const desireResult = result.find((r) => r.type === 'desire');
        expect(desireResult).toBeDefined();
      });

      it('should detect ability statements', () => {
        const result = detectChangeTalk('I think I can do this if I try');

        expect(result.length).toBeGreaterThan(0);
        const abilityResult = result.find((r) => r.type === 'ability');
        expect(abilityResult).toBeDefined();
      });

      it('should detect reasons statements', () => {
        const result = detectChangeTalk('Because my health is important to me');

        expect(result.length).toBeGreaterThan(0);
        const reasonsResult = result.find((r) => r.type === 'reasons');
        expect(reasonsResult).toBeDefined();
      });

      it('should detect need statements', () => {
        const result = detectChangeTalk('I really need to make this change');

        expect(result.length).toBeGreaterThan(0);
        const needResult = result.find((r) => r.type === 'need');
        expect(needResult).toBeDefined();
      });

      it('should detect commitment statements', () => {
        const result = detectChangeTalk('I will start exercising tomorrow');

        expect(result.length).toBeGreaterThan(0);
        const commitmentResult = result.find((r) => r.type === 'commitment');
        expect(commitmentResult).toBeDefined();
      });

      it('should detect taking steps statements', () => {
        const result = detectChangeTalk('I already started meal prepping this week');

        expect(result.length).toBeGreaterThan(0);
        const stepsResult = result.find((r) => r.type === 'taking_steps');
        expect(stepsResult).toBeDefined();
      });

      it('should return empty array for neutral statements', () => {
        const result = detectChangeTalk('The weather is nice today');

        expect(result).toEqual([]);
      });
    });

    describe('Strength Calculation', () => {
      it('should assign higher strength to commitment', () => {
        const desire = detectChangeTalk('I want to change');
        const commitment = detectChangeTalk('I will change');

        expect(commitment[0]?.strength).toBeGreaterThan(desire[0]?.strength || 0);
      });

      it('should boost strength for emphatic language', () => {
        const normal = detectChangeTalk('I want to exercise');
        const emphatic = detectChangeTalk('I really want to exercise');

        expect(emphatic[0]?.strength).toBeGreaterThan(normal[0]?.strength || 0);
      });

      it('should include topic in result when provided', () => {
        const result = detectChangeTalk('I want to quit', 'smoking');

        expect(result[0]?.topic).toBe('smoking');
      });
    });
  });

  describe('getStrongestChangeTalk', () => {
    it('should return the highest strength type', () => {
      const instances = [
        { type: 'desire' as const, statement: 'I want', strength: 0.5, timestamp: new Date() },
        { type: 'commitment' as const, statement: 'I will', strength: 0.9, timestamp: new Date() },
        { type: 'ability' as const, statement: 'I can', strength: 0.6, timestamp: new Date() },
      ];

      const strongest = getStrongestChangeTalk(instances);

      expect(strongest).toBe('commitment');
    });

    it('should return null for empty array', () => {
      const result = getStrongestChangeTalk([]);

      expect(result).toBeNull();
    });
  });

  describe('Sustain Talk Detection', () => {
    it('should detect resistance patterns', () => {
      const result = detectSustainTalk("I can't do this, it's too hard");

      expect(result.detected).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should detect hopelessness patterns', () => {
      const result = detectSustainTalk("I've tried everything and nothing works");

      expect(result.detected).toBe(true);
    });

    it('should detect ambivalence patterns', () => {
      const result = detectSustainTalk("But I'm not sure if I'm ready");

      expect(result.detected).toBe(true);
    });

    it('should return false for positive statements', () => {
      const result = detectSustainTalk("I'm feeling hopeful today");

      expect(result.detected).toBe(false);
      expect(result.patterns).toEqual([]);
    });
  });

  describe('OARS Response Generation', () => {
    it('should generate reflection for change talk', () => {
      const changeTalk = [
        {
          type: 'desire' as const,
          statement: 'I want to exercise',
          strength: 0.7,
          timestamp: new Date(),
        },
      ];

      const response = generateOARSResponse({ changeTalk });

      expect(response.type).toBe('reflect_then_question');
      expect(response.response).toContain('want');
      expect(response.followUp).toBeDefined();
    });

    it('should generate double-sided reflection for sustain talk', () => {
      const response = generateOARSResponse({
        sustainTalk: ["I can't do this"],
      });

      expect(response.type).toBe('double_sided_reflection');
      expect(response.response).toContain('possibility');
    });

    it('should generate open question when no talk detected', () => {
      const response = generateOARSResponse({});

      expect(response.type).toBe('open_question');
    });

    it('should include strategy explanation', () => {
      const response = generateOARSResponse({
        changeTalk: [
          {
            type: 'commitment' as const,
            statement: 'I will try',
            strength: 0.9,
            timestamp: new Date(),
          },
        ],
      });

      expect(response.strategy).toBeDefined();
      expect(response.strategy.length).toBeGreaterThan(10);
    });
  });

  describe('Change Talk History', () => {
    const historyUser = 'history-user-123';

    it('should record change talk', () => {
      const instances = [
        { type: 'desire' as const, statement: 'I want', strength: 0.6, timestamp: new Date() },
      ];

      recordChangeTalk(historyUser, instances);
      const history = getChangeTalkHistory(historyUser);

      expect(history).toContainEqual(expect.objectContaining({ type: 'desire' }));
    });

    it('should track multiple instances', () => {
      const multiUser = 'multi-user-123';

      recordChangeTalk(multiUser, [
        { type: 'desire' as const, statement: 'I want', strength: 0.6, timestamp: new Date() },
      ]);
      recordChangeTalk(multiUser, [
        { type: 'ability' as const, statement: 'I can', strength: 0.5, timestamp: new Date() },
      ]);

      const history = getChangeTalkHistory(multiUser);

      expect(history.length).toBe(2);
    });

    it('should get top change talk topics', () => {
      const topicUser = 'topic-user-123';

      recordChangeTalk(topicUser, [
        {
          type: 'desire' as const,
          statement: 'I want',
          strength: 0.6,
          timestamp: new Date(),
          topic: 'exercise',
        },
        {
          type: 'desire' as const,
          statement: 'I want',
          strength: 0.6,
          timestamp: new Date(),
          topic: 'exercise',
        },
        {
          type: 'desire' as const,
          statement: 'I want',
          strength: 0.6,
          timestamp: new Date(),
          topic: 'diet',
        },
      ]);

      const topics = getTopChangeTalkTopics(topicUser, 2);

      expect(topics[0]).toBe('exercise');
    });
  });

  describe('Ambivalence Analysis', () => {
    it('should identify topics with mixed signals', () => {
      const ambUser = 'amb-user-123';

      recordChangeTalk(ambUser, [
        {
          type: 'commitment' as const,
          statement: 'I will',
          strength: 0.9,
          timestamp: new Date(),
          topic: 'exercise',
        },
        {
          type: 'desire' as const,
          statement: 'I want',
          strength: 0.4,
          timestamp: new Date(),
          topic: 'exercise',
        },
      ]);

      const ambivalent = analyzeAmbivalence(ambUser);

      expect(ambivalent).toContain('exercise');
    });

    it('should return empty for consistent topics', () => {
      const consistUser = 'consist-user-123';

      recordChangeTalk(consistUser, [
        {
          type: 'commitment' as const,
          statement: 'I will',
          strength: 0.9,
          timestamp: new Date(),
          topic: 'diet',
        },
        {
          type: 'commitment' as const,
          statement: 'I promise',
          strength: 0.95,
          timestamp: new Date(),
          topic: 'diet',
        },
      ]);

      const ambivalent = analyzeAmbivalence(consistUser);

      expect(ambivalent).not.toContain('diet');
    });
  });

  describe('buildMIContext', () => {
    it('should build context with change talk detection', () => {
      const context = buildMIContext('context-user', 'I really want to change', 'habits');

      expect(context).toContain('CHANGE TALK DETECTED');
      expect(context).toContain('MI GUIDANCE');
    });

    it('should build context with sustain talk detection', () => {
      const context = buildMIContext('context-user', "I can't do this anymore");

      expect(context).toContain('SUSTAIN TALK DETECTED');
    });

    it('should return null for neutral text', () => {
      const context = buildMIContext('context-user', 'The weather is nice');

      expect(context).toBeNull();
    });
  });

  describe('Pre-defined Content', () => {
    it('should have patterns for all change talk types', () => {
      expect(CHANGE_TALK_PATTERNS.desire.length).toBeGreaterThan(0);
      expect(CHANGE_TALK_PATTERNS.ability.length).toBeGreaterThan(0);
      expect(CHANGE_TALK_PATTERNS.reasons.length).toBeGreaterThan(0);
      expect(CHANGE_TALK_PATTERNS.need.length).toBeGreaterThan(0);
      expect(CHANGE_TALK_PATTERNS.commitment.length).toBeGreaterThan(0);
      expect(CHANGE_TALK_PATTERNS.taking_steps.length).toBeGreaterThan(0);
    });

    it('should have open questions for all types', () => {
      expect(OPEN_QUESTIONS.desire.length).toBeGreaterThan(0);
      expect(OPEN_QUESTIONS.ability.length).toBeGreaterThan(0);
      expect(OPEN_QUESTIONS.general.length).toBeGreaterThan(0);
    });

    it('should have meaningful affirmations', () => {
      expect(AFFIRMATIONS.length).toBeGreaterThan(5);
      AFFIRMATIONS.forEach((aff) => {
        expect(aff.length).toBeGreaterThan(10);
      });
    });

    it('should have reflection templates of all types', () => {
      const types = REFLECTION_TEMPLATES.map((r) => r.type);

      expect(types).toContain('simple');
      expect(types).toContain('amplified');
      expect(types).toContain('double_sided');
    });
  });
});
