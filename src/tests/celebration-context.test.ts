/**
 * Celebration Context Builder Tests
 *
 * Tests for detecting and celebrating:
 * - Financial milestones
 * - Good news
 * - Aha moments / breakthroughs
 * - Decisions and commitments
 * - Response quality tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  buildCelebrationContext,
  MILESTONE_PATTERNS,
  GOOD_NEWS_PATTERNS,
} from '../intelligence/context-builders/emotional/celebration.js';

import type {
  ContextBuilderInput,
  ContextInjection,
} from '../intelligence/context-builders/types.js';

// Mock the logger - needs to mock both exports
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
  };
  return {
    getLogger: vi.fn(() => mockLogger),
    createLogger: vi.fn(() => mockLogger),
  };
});

// Mock theatrical personas
vi.mock('../personas/theatrical.js', () => ({
  getCelebration: vi.fn((personaId: string, type: string) => {
    return `<speak>Congratulations from ${personaId}!</speak>`;
  }),
}));

// ============================================================================
// HELPERS
// ============================================================================

function createInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: '',
    analysis: {
      emotion: {
        primary: 'happy',
        intensity: 0.7,
        valence: 'positive',
      },
      intent: {
        primary: 'share',
        confidence: 0.8,
      },
      topics: {
        detected: [],
      },
      state: {
        phase: 'active',
      },
    },
    services: {
      sessionId: 'test-session',
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userData: {
      userName: 'Test User',
    },
    userProfile: null,
    persona: {
      id: 'ferni',
      displayName: 'Ferni',
    },
    ...overrides,
  } as ContextBuilderInput;
}

// ============================================================================
// MILESTONE PATTERN TESTS
// ============================================================================

describe('MILESTONE_PATTERNS', () => {
  it('should detect "paid off" mentions', () => {
    expect(MILESTONE_PATTERNS.some((p) => p.test('I finally paid off my student loans!'))).toBe(
      true
    );
    expect(MILESTONE_PATTERNS.some((p) => p.test('Just became debt free!'))).toBe(true);
  });

  it('should detect savings milestones', () => {
    expect(MILESTONE_PATTERNS.some((p) => p.test('I finally saved $10,000!'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Reached my emergency fund goal'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Fully funded my 401k'))).toBe(true);
  });

  it('should detect financial amounts', () => {
    expect(MILESTONE_PATTERNS.some((p) => p.test('I hit $100k in my portfolio'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('First $10k milestone!'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Reached six figures!'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Hit my first million'))).toBe(true);
  });

  it('should detect investment beginnings', () => {
    expect(MILESTONE_PATTERNS.some((p) => p.test('I started investing today'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Made my first investment!'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Just opened account at Fidelity'))).toBe(true);
    expect(MILESTONE_PATTERNS.some((p) => p.test('Made my first contribution'))).toBe(true);
  });

  it('should not match unrelated text', () => {
    expect(MILESTONE_PATTERNS.some((p) => p.test('What should I do next?'))).toBe(false);
    expect(MILESTONE_PATTERNS.some((p) => p.test('The weather is nice today'))).toBe(false);
  });
});

describe('GOOD_NEWS_PATTERNS', () => {
  it('should detect good news phrases', () => {
    expect(GOOD_NEWS_PATTERNS.test('I have great news!')).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test('Guess what happened?')).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test("You won't believe this")).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test('I did it!')).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test('It worked!')).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test("I'm so happy")).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test("I'm thrilled")).toBe(true);
    expect(GOOD_NEWS_PATTERNS.test("I'm over the moon")).toBe(true);
  });

  it('should not match neutral text', () => {
    expect(GOOD_NEWS_PATTERNS.test('How are you doing?')).toBe(false);
    expect(GOOD_NEWS_PATTERNS.test('Tell me about ETFs')).toBe(false);
  });
});

// ============================================================================
// CELEBRATION CONTEXT BUILDER TESTS
// ============================================================================

describe('buildCelebrationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('milestone detection', () => {
    it('should create injection for financial milestone with positive emotion', () => {
      const input = createInput({
        userText: 'I finally paid off my student loans!',
        analysis: {
          emotion: { primary: 'happy', intensity: 0.8, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: ['debt'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      expect(result.length).toBeGreaterThan(0);
      const milestoneInjection = result.find((i) => i.source === 'milestone');
      expect(milestoneInjection).toBeDefined();
      expect(milestoneInjection?.content).toContain('CELEBRATE');
    });

    it('should not create milestone injection without positive valence', () => {
      const input = createInput({
        userText: 'I want to pay off my student loans',
        analysis: {
          emotion: { primary: 'neutral', intensity: 0.5, valence: 'neutral' },
          intent: { primary: 'question', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const milestoneInjection = result.find((i) => i.source === 'milestone');
      expect(milestoneInjection).toBeUndefined();
    });
  });

  describe('good news detection', () => {
    it('should create injection for good news with high intensity', () => {
      const input = createInput({
        userText: 'I have great news! I got the job!',
        analysis: {
          emotion: { primary: 'excited', intensity: 0.9, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: ['career'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      const goodNewsInjection = result.find((i) => i.source === 'good_news');
      expect(goodNewsInjection).toBeDefined();
      expect(goodNewsInjection?.content).toContain('CELEBRATE');
    });

    it('should not create good news injection with low intensity', () => {
      const input = createInput({
        userText: 'I have good news',
        analysis: {
          emotion: { primary: 'happy', intensity: 0.3, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.5 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const goodNewsInjection = result.find((i) => i.source === 'good_news');
      expect(goodNewsInjection).toBeUndefined();
    });
  });

  describe('aha moment detection', () => {
    it('should detect aha moments', () => {
      const input = createInput({
        userText: 'Oh! Now I get it! That makes so much sense!',
        analysis: {
          emotion: { primary: 'enlightened', intensity: 0.7, valence: 'positive' },
          intent: { primary: 'understand', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      const ahaInjection = result.find((i) => i.source === 'aha_moment');
      expect(ahaInjection).toBeDefined();
      expect(ahaInjection?.content).toContain('INSIGHT');
    });

    it('should detect realization patterns', () => {
      const input = createInput({
        userText: "Wait, so that's why compound interest is so powerful?",
        analysis: {
          emotion: { primary: 'curious', intensity: 0.6, valence: 'neutral' },
          intent: { primary: 'clarify', confidence: 0.8 },
          topics: { detected: ['investing'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const ahaInjection = result.find((i) => i.source === 'aha_moment');
      expect(ahaInjection).toBeDefined();
    });

    it('should not trigger aha moment with negative valence', () => {
      const input = createInput({
        userText: "Oh... I didn't realize I was losing money",
        analysis: {
          emotion: { primary: 'sad', intensity: 0.7, valence: 'negative' },
          intent: { primary: 'share', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const ahaInjection = result.find((i) => i.source === 'aha_moment');
      expect(ahaInjection).toBeUndefined();
    });
  });

  describe('decision detection', () => {
    it('should detect commitment statements', () => {
      const input = createInput({
        userText: "I've decided to start investing every month",
        analysis: {
          emotion: { primary: 'determined', intensity: 0.7, valence: 'positive' },
          intent: { primary: 'decide', confidence: 0.9 },
          topics: { detected: ['investing'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      const decisionInjection = result.find((i) => i.source === 'achievement');
      expect(decisionInjection).toBeDefined();
      expect(decisionInjection?.content).toContain('DECISION');
    });

    it('should detect "going to do" patterns', () => {
      const input = createInput({
        userText: "I'm going to do it - I'm opening an IRA today",
        analysis: {
          emotion: { primary: 'confident', intensity: 0.8, valence: 'positive' },
          intent: { primary: 'decide', confidence: 0.9 },
          topics: { detected: ['retirement'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const decisionInjection = result.find((i) => i.source === 'achievement');
      expect(decisionInjection).toBeDefined();
    });

    it('should detect "let\'s do it" commitment', () => {
      const input = createInput({
        userText: "Let's do it! I'm in!",
        analysis: {
          emotion: { primary: 'excited', intensity: 0.8, valence: 'positive' },
          intent: { primary: 'agree', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);
      const decisionInjection = result.find((i) => i.source === 'achievement');
      expect(decisionInjection).toBeDefined();
    });
  });

  describe('response quality tracking', () => {
    it('should track positive reaction', () => {
      const mockTrack = vi.fn();
      const input = createInput({
        userText: 'Thanks, that really helps!',
        services: {
          sessionId: 'test',
          sessionStartTime: Date.now(),
          userProfile: null,
          trackResponseQuality: mockTrack,
        } as unknown as ContextBuilderInput['services'],
      });

      const result = buildCelebrationContext(input);

      expect(mockTrack).toHaveBeenCalledWith('Thanks, that really helps!', 'positive');
      const qualityInjection = result.find((i) => i.source === 'quality_positive');
      expect(qualityInjection).toBeDefined();
    });

    it('should track negative reaction', () => {
      const mockTrack = vi.fn();
      const input = createInput({
        userText: "That's not what I asked for",
        analysis: {
          emotion: { primary: 'frustrated', intensity: 0.6, valence: 'negative' },
          intent: { primary: 'correct', confidence: 0.8 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        services: {
          sessionId: 'test',
          sessionStartTime: Date.now(),
          userProfile: null,
          trackResponseQuality: mockTrack,
        } as unknown as ContextBuilderInput['services'],
      });

      const result = buildCelebrationContext(input);

      expect(mockTrack).toHaveBeenCalledWith("That's not what I asked for", 'negative');
      const qualityInjection = result.find((i) => i.source === 'quality_negative');
      expect(qualityInjection).toBeDefined();
    });
  });

  describe('persona-specific celebrations', () => {
    it('should include persona example in milestone injection', () => {
      const input = createInput({
        userText: 'I finally paid off all my debt!',
        analysis: {
          emotion: { primary: 'happy', intensity: 0.9, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        persona: { id: 'ferni', displayName: 'Ferni' },
      });

      const result = buildCelebrationContext(input);
      const milestoneInjection = result.find((i) => i.source === 'milestone');

      expect(milestoneInjection).toBeDefined();
      expect(milestoneInjection?.content).toContain('EXAMPLE');
      expect(milestoneInjection?.content).toContain('Congratulations');
    });

    it('should handle missing persona gracefully', () => {
      const input = createInput({
        userText: 'I finally paid off all my debt!',
        analysis: {
          emotion: { primary: 'happy', intensity: 0.9, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'active' },
        },
        persona: undefined,
      });

      const result = buildCelebrationContext(input);

      // Should still work without persona
      const milestoneInjection = result.find((i) => i.source === 'milestone');
      expect(milestoneInjection).toBeDefined();
    });
  });

  describe('multiple detection scenarios', () => {
    it('should return multiple injections when multiple patterns match', () => {
      const input = createInput({
        userText: "I did it! I finally hit $100k in my portfolio! I'm so happy!",
        analysis: {
          emotion: { primary: 'ecstatic', intensity: 0.95, valence: 'positive' },
          intent: { primary: 'share', confidence: 0.95 },
          topics: { detected: ['investing'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      // Should detect milestone and good news
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for neutral conversation', () => {
      const input = createInput({
        userText: 'Tell me about index funds',
        analysis: {
          emotion: { primary: 'curious', intensity: 0.5, valence: 'neutral' },
          intent: { primary: 'question', confidence: 0.9 },
          topics: { detected: ['investing'] },
          state: { phase: 'active' },
        },
      });

      const result = buildCelebrationContext(input);

      // Should have no celebration injections
      const celebrationSources = ['milestone', 'good_news', 'aha_moment', 'achievement'];
      const celebrationInjections = result.filter((i) => celebrationSources.includes(i.source));
      expect(celebrationInjections).toHaveLength(0);
    });
  });
});
