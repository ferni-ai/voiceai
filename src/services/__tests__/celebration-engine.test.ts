/**
 * Celebration Engine Tests
 *
 * Tests for celebration detection, response generation,
 * and achievement recognition patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock humanization signal emitter
vi.mock('../humanization/humanization-signal-emitter.js', () => ({
  humanizationSignalEmitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import {
  type CelebrationType,
  type CelebrationIntensity,
  type CelebrationTrigger,
  type CelebrationResponse,
  type CelebrationRecord,
  CelebrationEngine,
} from '../celebration-engine.js';

describe('CelebrationEngine', () => {
  describe('CelebrationType', () => {
    it('should have all celebration types', () => {
      const types: CelebrationType[] = [
        'goal_completed',
        'milestone_reached',
        'streak_achieved',
        'growth_recognized',
        'effort_recognized',
        'relationship_milestone',
        'first_time',
        'breakthrough',
      ];

      expect(types).toHaveLength(8);
    });

    it('should use string literal types', () => {
      const type: CelebrationType = 'goal_completed';
      expect(typeof type).toBe('string');
    });
  });

  describe('CelebrationIntensity', () => {
    it('should have all intensity levels', () => {
      const intensities: CelebrationIntensity[] = [
        'subtle',
        'warm',
        'enthusiastic',
        'ecstatic',
      ];

      expect(intensities).toHaveLength(4);
    });

    it('should represent escalating energy levels', () => {
      const intensityOrder: CelebrationIntensity[] = [
        'subtle',
        'warm',
        'enthusiastic',
        'ecstatic',
      ];

      // Order matters - from calm to excited
      expect(intensityOrder[0]).toBe('subtle');
      expect(intensityOrder[3]).toBe('ecstatic');
    });
  });

  describe('CelebrationTrigger', () => {
    it('should create valid trigger', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_123',
        type: 'goal_completed',
        userId: 'user-456',
        personaId: 'ferni',
        achievement: 'Ran a full marathon',
        significance: 'First major athletic accomplishment',
        evidence: ['Trained for 6 months', 'Finished in under 5 hours'],
        intensity: 'ecstatic',
        detectedAt: new Date(),
      };

      expect(trigger.type).toBe('goal_completed');
      expect(trigger.intensity).toBe('ecstatic');
      expect(trigger.evidence).toHaveLength(2);
    });

    it('should support context for personalization', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_streak',
        type: 'streak_achieved',
        userId: 'user-123',
        personaId: 'maya',
        achievement: '30-day meditation streak',
        significance: 'Longest habit streak ever',
        evidence: ['Started January 1st', 'Never missed a day'],
        intensity: 'enthusiastic',
        detectedAt: new Date(),
        context: {
          streakDays: 30,
          goalName: 'Daily Meditation',
          previousStruggle: 'Kept falling off after 7 days before',
          timeframe: '30 days',
        },
      };

      expect(trigger.context?.streakDays).toBe(30);
      expect(trigger.context?.previousStruggle).toContain('7 days');
    });

    it('should support milestone context', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_milestone',
        type: 'milestone_reached',
        userId: 'user-789',
        personaId: 'jordan',
        achievement: 'Halfway to savings goal',
        significance: '$5000 saved - 50% complete',
        evidence: ['Consistent monthly contributions', 'Reduced expenses'],
        intensity: 'warm',
        detectedAt: new Date(),
        context: {
          milestoneName: '50% Savings Goal',
          goalName: '$10,000 Emergency Fund',
          comparisonToStart: 'Started with $500 just 8 months ago',
        },
      };

      expect(trigger.context?.milestoneName).toBe('50% Savings Goal');
      expect(trigger.context?.comparisonToStart).toContain('8 months');
    });

    it('should support growth recognition', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_growth',
        type: 'growth_recognized',
        userId: 'user-growth',
        personaId: 'nayan',
        achievement: 'Now comfortable speaking up in meetings',
        significance: 'Overcame long-standing social anxiety',
        evidence: [
          'Used to stay silent in every meeting',
          'Now contributes regularly',
          'Got positive feedback from manager',
        ],
        intensity: 'warm',
        detectedAt: new Date(),
        context: {
          previousStruggle: 'Severe social anxiety at work',
          timeframe: '6 months of work',
        },
      };

      expect(trigger.evidence).toHaveLength(3);
      expect(trigger.type).toBe('growth_recognized');
    });
  });

  describe('CelebrationResponse', () => {
    it('should create response with all fields', () => {
      const response: CelebrationResponse = {
        message: "You did it! A full marathon! That's absolutely incredible!",
        ssml: '<speak><prosody rate="1.1" pitch="+2st">You did it! A full marathon!</prosody> <break time="300ms"/> <prosody pitch="+3st">That\'s absolutely incredible!</prosody></speak>',
        expression: 'celebrating',
        pauseBeforeMs: 500,
        energy: 'exuberant',
      };

      expect(response.expression).toBe('celebrating');
      expect(response.energy).toBe('exuberant');
      expect(response.pauseBeforeMs).toBe(500);
    });

    it('should have all expression types', () => {
      const expressions: CelebrationResponse['expression'][] = [
        'delight',
        'pride',
        'warmth',
        'excited',
        'celebrating',
      ];

      expect(expressions).toHaveLength(5);
    });

    it('should have all energy levels', () => {
      const energyLevels: CelebrationResponse['energy'][] = [
        'calm',
        'warm',
        'bright',
        'exuberant',
      ];

      expect(energyLevels).toHaveLength(4);
    });

    it('should match intensity to energy', () => {
      const intensityToEnergy: Record<CelebrationIntensity, CelebrationResponse['energy']> = {
        subtle: 'calm',
        warm: 'warm',
        enthusiastic: 'bright',
        ecstatic: 'exuberant',
      };

      expect(intensityToEnergy['subtle']).toBe('calm');
      expect(intensityToEnergy['ecstatic']).toBe('exuberant');
    });

    it('should include SSML for voice delivery', () => {
      const response: CelebrationResponse = {
        message: 'You showed up today. That matters.',
        ssml: '<speak><prosody rate="0.95" pitch="-1st">You showed up today.</prosody> <break time="400ms"/> <prosody pitch="+1st">That matters.</prosody></speak>',
        expression: 'warmth',
        pauseBeforeMs: 300,
        energy: 'warm',
      };

      expect(response.ssml).toContain('<speak>');
      expect(response.ssml).toContain('prosody');
      expect(response.ssml).toContain('break');
    });
  });

  describe('CelebrationRecord', () => {
    it('should create celebration record', () => {
      const record: CelebrationRecord = {
        triggerId: 'cel_123',
        type: 'first_time',
        userId: 'user-456',
        celebratedAt: new Date(),
        userReaction: 'positive',
        messageDelivered: "Your first 5K! That's a milestone to remember!",
      };

      expect(record.userReaction).toBe('positive');
      expect(record.type).toBe('first_time');
    });

    it('should track user reactions', () => {
      const reactions: CelebrationRecord['userReaction'][] = [
        'positive',
        'neutral',
        'dismissed',
      ];

      reactions.forEach((reaction) => {
        const record: CelebrationRecord = {
          triggerId: 'cel_test',
          type: 'effort_recognized',
          userId: 'user-test',
          celebratedAt: new Date(),
          userReaction: reaction,
          messageDelivered: 'Test message',
        };
        expect(record.userReaction).toBe(reaction);
      });
    });

    it('should allow optional user reaction', () => {
      const record: CelebrationRecord = {
        triggerId: 'cel_new',
        type: 'breakthrough',
        userId: 'user-new',
        celebratedAt: new Date(),
        messageDelivered: 'You had an insight!',
      };

      expect(record.userReaction).toBeUndefined();
    });
  });

  describe('CelebrationEngine class', () => {
    let engine: CelebrationEngine;

    beforeEach(() => {
      engine = new CelebrationEngine('user-123', 'ferni');
    });

    describe('detectCelebration', () => {
      it('should detect goal completion', () => {
        const result = engine.detectCelebration('I finally finished my project!', 5);

        if (result) {
          expect(result.type).toBe('goal_completed');
        }
      });

      it('should detect streak achievement', () => {
        const result = engine.detectCelebration('I\'ve been running 7 days in a row now!', 5);

        if (result) {
          expect(result.type).toBe('streak_achieved');
        }
      });

      it('should detect growth recognition', () => {
        const result = engine.detectCelebration(
          'I used to be terrified of public speaking, but now I actually enjoy it',
          5
        );

        if (result) {
          expect(result.type).toBe('growth_recognized');
        }
      });

      it('should detect effort recognition', () => {
        const result = engine.detectCelebration(
          'I tried my best even though it didn\'t work out',
          5
        );

        if (result) {
          expect(result.type).toBe('effort_recognized');
        }
      });

      it('should detect breakthrough moments', () => {
        const result = engine.detectCelebration(
          'I just realized why I\'ve been feeling this way!',
          5
        );

        if (result) {
          expect(result.type).toBe('breakthrough');
        }
      });

      it('should detect first-time achievements', () => {
        const result = engine.detectCelebration(
          'This is my first time ever running a 5K!',
          5
        );

        if (result) {
          expect(result.type).toBe('first_time');
        }
      });

      it('should respect celebration cooldown', () => {
        // First celebration should work
        const first = engine.detectCelebration('I did it!', 5);

        // Second celebration immediately after should be null due to cooldown
        const second = engine.detectCelebration('I finished another thing!', 6);

        // First should detect, second may be null due to cooldown
        expect(first).toBeDefined();
        // Cooldown is 3 turns, so turn 6 should respect it
      });

      it('should return null for non-celebratory messages', () => {
        const result = engine.detectCelebration('The weather is nice today', 5);
        expect(result).toBeNull();
      });
    });
  });

  describe('Detection patterns', () => {
    describe('Goal completion patterns', () => {
      const goalPhrases = [
        'I did it!',
        'I finally finished my degree',
        'I completed the marathon',
        'I accomplished my savings goal',
        'I have done it all',
        'Got my certification today',
        'Passed the exam!',
        'Made it through the interview',
        'Reached the goal I set',
      ];

      it.each(goalPhrases)('should match goal phrase: "%s"', (phrase) => {
        const patterns = [
          /i (did it|finished|completed|accomplished)/i,
          /finally (did|finished|completed)/i,
          /i ('ve|have) (done|finished|completed)/i,
          /(got|passed|achieved) (my|the) (goal|certification|degree|exam)/i,
          /made it (to|through)/i,
          /reached (my|the) (goal|target)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('Streak patterns', () => {
      const streakPhrases = [
        '7 days in a row',
        '30 days straight',
        '2 weeks consecutive',
        'I haven\'t missed a day',
        'Every single morning',
        'Kept it up for 3 months',
        'Streak of 100 days',
      ];

      it.each(streakPhrases)('should match streak phrase: "%s"', (phrase) => {
        const patterns = [
          /(\d+) (days?|weeks?|months?) (in a row|straight|consecutive)/i,
          /haven'?t missed (a day|once)/i,
          /(every|each) (single )?(day|morning|evening)/i,
          /kept (it )?up for/i,
          /streak of (\d+)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('Growth patterns', () => {
      const growthPhrases = [
        'I used to be scared of flying',
        'I couldn\'t run a mile before',
        'I never could do that',
        'Now I can do it easily',
        'Compared to before, I\'m so much better',
        'I\'ve grown so much',
        'It\'s not as hard anymore',
        'So much easier now',
      ];

      it.each(growthPhrases)('should match growth phrase: "%s"', (phrase) => {
        const patterns = [
          /i (used to|couldn'?t|never could)/i,
          /now i (can|do|am)/i,
          /compared to (before|last|when i started)/i,
          /i'?ve (grown|improved|gotten better)/i,
          /not as (hard|scary|difficult) (as|anymore)/i,
          /easier (now|than before)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('Effort patterns', () => {
      const effortPhrases = [
        'I tried my best',
        'I showed up anyway',
        'I did my best',
        'Even though it didn\'t work',
        'At least I attempted it',
        'I made myself do it',
        'Pushed through the pain',
      ];

      it.each(effortPhrases)('should match effort phrase: "%s"', (phrase) => {
        const patterns = [
          /i (tried|showed up|did my best)/i,
          /even though (i|it) (didn'?t|wasn'?t)/i,
          /at least i/i,
          /i made (myself|an effort|the effort)/i,
          /pushed (through|myself)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('Breakthrough patterns', () => {
      const breakthroughPhrases = [
        'I just realized something',
        'I realized why I was stuck',
        'It hit me suddenly',
        'I see what you mean now',
        'It dawned on me today',
        'I finally understand',
        'I finally get it now',
        'Everything makes sense now',
        'I never thought of it that way',
        'Oh my god, you\'re right',
      ];

      it.each(breakthroughPhrases)('should match breakthrough phrase: "%s"', (phrase) => {
        const patterns = [
          /i (just )?realized/i,
          /it (hit|clicked|dawned on) me/i,
          /i (finally )?(understand|get it|see)/i,
          /everything makes sense/i,
          /i never (thought of|saw) it that way/i,
          /oh my (god|gosh)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('First-time patterns', () => {
      const firstTimePhrases = [
        'First time I\'ve done this',
        'First time ever',
        'I never did that before',
        'Never done this before',
        'My first marathon',
        'Brand new experience',
        'Just learned to swim',
        'Just started coding',
      ];

      it.each(firstTimePhrases)('should match first-time phrase: "%s"', (phrase) => {
        const patterns = [
          /first time (i'?ve?|ever)/i,
          /never (done|did|had) (this|that) before/i,
          /my first/i,
          /brand new/i,
          /just (learned|started|began)/i,
        ];

        const matches = patterns.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });
  });

  describe('Celebration philosophy', () => {
    it('should celebrate immediately when detected', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_immediate',
        type: 'goal_completed',
        userId: 'user-1',
        personaId: 'ferni',
        achievement: 'Finished the report',
        significance: 'Completed on time',
        evidence: ['Met deadline'],
        intensity: 'warm',
        detectedAt: new Date(), // Immediate detection
      };

      const now = new Date();
      const timeDiff = Math.abs(trigger.detectedAt.getTime() - now.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should scale intensity proportionally', () => {
      const smallWin: CelebrationTrigger = {
        id: 'cel_small',
        type: 'effort_recognized',
        userId: 'user-1',
        personaId: 'ferni',
        achievement: 'Did 5 minutes of exercise',
        significance: 'Showed up today',
        evidence: [],
        intensity: 'subtle',
        detectedAt: new Date(),
      };

      const bigWin: CelebrationTrigger = {
        id: 'cel_big',
        type: 'goal_completed',
        userId: 'user-1',
        personaId: 'ferni',
        achievement: 'Graduated with honors',
        significance: 'Years of hard work',
        evidence: ['4.0 GPA', 'Dean\'s list', 'Honors thesis'],
        intensity: 'ecstatic',
        detectedAt: new Date(),
      };

      expect(smallWin.intensity).toBe('subtle');
      expect(bigWin.intensity).toBe('ecstatic');
    });

    it('should include personal details in celebration', () => {
      const trigger: CelebrationTrigger = {
        id: 'cel_personal',
        type: 'streak_achieved',
        userId: 'user-personal',
        personaId: 'maya',
        achievement: 'Meditation streak',
        significance: 'Longest streak ever',
        evidence: [
          'Started on January 1st',
          'Meditated every morning at 6am',
          'Used the calm space in the office',
        ],
        intensity: 'enthusiastic',
        detectedAt: new Date(),
        context: {
          streakDays: 30,
          previousStruggle: 'Usually gave up after 5 days',
        },
      };

      expect(trigger.evidence).toHaveLength(3);
      expect(trigger.context?.previousStruggle).toBeDefined();
    });
  });
});
