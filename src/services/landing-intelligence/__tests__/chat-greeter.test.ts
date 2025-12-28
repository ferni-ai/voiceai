/**
 * Chat Greeter Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted to declare mock before hoisting
const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

// Mock dependencies before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Gemini client
vi.mock('../gemini-client.js', () => ({
  generateText: mockGenerateText,
}));

import {
  generateChatGreeting,
  getGreetingTiming,
  type ChatGreetingContext,
} from '../chat-greeter.js';

describe('ChatGreeter', () => {
  const createContext = (overrides: Partial<ChatGreetingContext> = {}): ChatGreetingContext => ({
    currentSection: 'hero',
    timeOnPage: 10,
    scrollDepth: 20,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue("Questions? I'm here.");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateChatGreeting', () => {
    describe('Section-specific Greetings', () => {
      it('should return hero section greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ currentSection: 'hero' }));

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return pricing section greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ currentSection: 'pricing' }));

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return FAQ section greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ currentSection: 'faq' }));

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return team section greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ currentSection: 'team' }));

        expect(greeting.length).toBeGreaterThan(0);
      });
    });

    describe('Time-based Greetings', () => {
      it('should return late-night greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ timeMode: 'late-night' }));

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return morning greeting', async () => {
        const greeting = await generateChatGreeting(
          createContext({ timeMode: 'morning', currentSection: 'unknown' })
        );

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return evening greeting', async () => {
        const greeting = await generateChatGreeting(
          createContext({ timeMode: 'evening', currentSection: 'unknown' })
        );

        expect(greeting.length).toBeGreaterThan(0);
      });
    });

    describe('Behavioral Greetings', () => {
      it('should prioritize CTA hesitation greeting', async () => {
        const greeting = await generateChatGreeting(createContext({ ctaHesitation: true }));

        expect(greeting).toMatch(/hesitat|pressure|time|decid/i);
      });

      it('should return returning visitor greeting', async () => {
        const greeting = await generateChatGreeting(
          createContext({ isReturning: true, visitCount: 3 })
        );

        expect(greeting).toMatch(/back|again|return/i);
      });
    });

    describe('AI-powered Greetings', () => {
      it('should use AI for high-confidence personalization', async () => {
        mockGenerateText.mockResolvedValue('Custom AI greeting');

        const greeting = await generateChatGreeting(
          createContext({
            intent: {
              primaryConcern: 'career',
              confidence: 0.9,
              buyingStage: 'consideration',
              emotionalState: 'hopeful',
              recommendedContent: [],
              suggestedAction: 'engage',
              reasoning: 'test',
            },
            timeOnPage: 60,
          })
        );

        expect(mockGenerateText).toHaveBeenCalled();
      });

      it('should use prebuilt for low confidence', async () => {
        const greeting = await generateChatGreeting(
          createContext({
            intent: {
              primaryConcern: 'curiosity',
              confidence: 0.3,
              buyingStage: 'awareness',
              emotionalState: 'calm',
              recommendedContent: [],
              suggestedAction: 'engage',
              reasoning: 'test',
            },
            timeOnPage: 60,
          })
        );

        expect(mockGenerateText).not.toHaveBeenCalled();
      });

      it('should propagate AI error when AI call fails', async () => {
        mockGenerateText.mockRejectedValue(new Error('AI failed'));

        // The implementation does not have try-catch, so error propagates
        await expect(
          generateChatGreeting(
            createContext({
              intent: {
                primaryConcern: 'career',
                confidence: 0.9,
                buyingStage: 'decision',
                emotionalState: 'urgent',
                recommendedContent: [],
                suggestedAction: 'engage',
                reasoning: 'test',
              },
              timeOnPage: 60,
            })
          )
        ).rejects.toThrow('AI failed');
      });
    });

    describe('Default Behavior', () => {
      it('should return default greeting for unknown section', async () => {
        const greeting = await generateChatGreeting(
          createContext({ currentSection: 'unknown-section' })
        );

        expect(greeting.length).toBeGreaterThan(0);
      });

      it('should return greeting even with minimal context', async () => {
        const greeting = await generateChatGreeting({
          currentSection: '',
          timeOnPage: 0,
          scrollDepth: 0,
        });

        expect(greeting.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getGreetingTiming', () => {
    describe('Should Not Show', () => {
      it('should not show within first 5 seconds', () => {
        const timing = getGreetingTiming(createContext({ timeOnPage: 3 }));

        expect(timing.shouldShow).toBe(false);
        expect(timing.reason).toContain('early');
      });
    });

    describe('Priority Triggers', () => {
      it('should show quickly on CTA hesitation', () => {
        const timing = getGreetingTiming(createContext({ ctaHesitation: true, timeOnPage: 10 }));

        expect(timing.shouldShow).toBe(true);
        expect(timing.delay).toBe(500);
        expect(timing.reason).toContain('hesitation');
      });

      it('should show for returning visitors', () => {
        const timing = getGreetingTiming(
          createContext({ isReturning: true, visitCount: 3, timeOnPage: 10 })
        );

        expect(timing.shouldShow).toBe(true);
        expect(timing.delay).toBeLessThan(5000);
        expect(timing.reason).toContain('Returning');
      });

      it('should show for late-night with engagement', () => {
        const timing = getGreetingTiming(
          createContext({ timeMode: 'late-night', scrollDepth: 30, timeOnPage: 10 })
        );

        expect(timing.shouldShow).toBe(true);
        expect(timing.reason).toContain('Late night');
      });
    });

    describe('Engagement Triggers', () => {
      it('should show after significant scroll depth', () => {
        const timing = getGreetingTiming(createContext({ scrollDepth: 60 }));

        expect(timing.shouldShow).toBe(true);
        expect(timing.reason).toContain('scroll');
      });

      it('should show on pricing section', () => {
        const timing = getGreetingTiming(createContext({ currentSection: 'pricing' }));

        expect(timing.shouldShow).toBe(true);
        expect(timing.reason).toContain('decision');
      });

      it('should show on FAQ section', () => {
        const timing = getGreetingTiming(createContext({ currentSection: 'faq' }));

        expect(timing.shouldShow).toBe(true);
      });

      it('should show on proof section', () => {
        const timing = getGreetingTiming(createContext({ currentSection: 'proof' }));

        expect(timing.shouldShow).toBe(true);
      });
    });

    describe('Time-based Triggers', () => {
      it('should show after 20 seconds on page', () => {
        const timing = getGreetingTiming(createContext({ timeOnPage: 25, scrollDepth: 10 }));

        expect(timing.shouldShow).toBe(true);
        expect(timing.reason).toContain('Time-based');
      });

      it('should not show before time threshold with low engagement', () => {
        const timing = getGreetingTiming(
          createContext({ timeOnPage: 10, scrollDepth: 5, currentSection: 'hero' })
        );

        expect(timing.shouldShow).toBe(false);
      });
    });

    describe('Delay Values', () => {
      it('should have shortest delay for CTA hesitation', () => {
        const timing = getGreetingTiming(createContext({ ctaHesitation: true, timeOnPage: 10 }));

        expect(timing.delay).toBe(500);
      });

      it('should have longer delay for time-based trigger', () => {
        const timing = getGreetingTiming(createContext({ timeOnPage: 25, scrollDepth: 10 }));

        expect(timing.delay).toBe(5000);
      });
    });
  });

  describe('Greeting Quality', () => {
    it('should produce concise greetings', async () => {
      const sections = ['hero', 'pricing', 'team', 'faq'];

      for (const section of sections) {
        const greeting = await generateChatGreeting(createContext({ currentSection: section }));

        // All greetings should be under 60 characters
        expect(greeting.length).toBeLessThan(60);
      }
    });

    it('should not include placeholder text', async () => {
      const greeting = await generateChatGreeting(createContext());

      expect(greeting).not.toContain('TODO');
      expect(greeting).not.toContain('placeholder');
      expect(greeting).not.toContain('undefined');
    });
  });
});
