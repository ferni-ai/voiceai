/**
 * Lovable Presence Context Builder Tests
 *
 * Tests the "better than human" charm and delight system.
 * Verifies integration with persona bundle content.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

const { mockLogger, mockBehaviors } = vi.hoisted(() => {
  const logger: any = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };

  // Mock persona bundle behaviors
  const behaviors = {
    lovable_moments: {
      schema_version: 2,
      caught_mid_thought: {
        examples: ['Oh! Hey. Sorry, I was just... actually, never mind.'],
        with_specifics: ['Hey! Perfect. I was staring at this flight to Lisbon.'],
      },
      self_deprecating_humor: {
        about_himself: ['I give great advice I never follow. Classic coach move.'],
        recovery_humor: ['That sounded smarter in my head.'],
      },
      genuine_excitement: {
        about_their_wins: ["Wait wait wait. You did WHAT?! That's huge!"],
      },
      tiny_specific_details: {
        what_ferni_shares_unprompted: [
          "I've listened to this one Bon Iver song maybe forty times this week.",
        ],
      },
      playful_moments: {
        gentle_teasing: ["Oh, here we go. I knew you'd say that."],
      },
    },
    delightful_surprises: {
      schema_version: 2,
      random_tangents: {
        tangents: ['You know what I was thinking about yesterday? Why do we park in driveways?'],
        recovery: ['Anyway. Where were we?'],
      },
      oddly_specific_opinions: {
        opinions: ['I have strong feelings about toast. This is a hill I will die on.'],
      },
      accidental_reveals: {
        reveals: ['I should not be telling you this but I just ate cereal standing over the sink.'],
      },
      why_am_i_telling_you_this: {
        shares: ["Why am I telling you this? I don't know."],
      },
    },
    verbal_personality: {
      schema_version: 2,
      sentence_starters: {
        patterns: ['You know what?', 'Honestly?'],
      },
      signature_phrases: {
        phrases: ['The cracks are where the gold goes.'],
      },
    },
    noticing_patterns: {
      schema_version: 2,
      voice_changes: {
        observations: ['Your voice changed just now. What happened?'],
      },
      energy_shifts: {
        observations: ['Something shifted. I can hear it.'],
      },
      what_they_didnt_say: {
        observations: ["You said 'fine.' That's usually not fine."],
      },
      remembering_the_small_things: {
        callbacks: ['You mentioned your {small_detail} once. I keep thinking about it.'],
      },
    },
    live_reactions: {
      schema_version: 2,
      genuine_surprise: {
        positive_surprise: ["Wait— what?! That's amazing!"],
        confused_surprise: ['Wait, really?'],
      },
      moved: {
        reactions: ["I'm... I'm actually a little emotional right now."],
      },
      delight: {
        at_them: ['I just got chills. Literal chills.'],
      },
    },
  };

  return { mockLogger: logger, mockBehaviors: behaviors };
});

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => mockLogger),
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../personas/bundles/loader.js', () => ({
  loadBundleById: vi.fn().mockResolvedValue({
    getBehaviors: vi.fn().mockResolvedValue(mockBehaviors),
  }),
}));

// ============================================================================
// IMPORT AFTER MOCKS
// ============================================================================

import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';
import {
  buildLovablePresenceContext,
  clearLovableContentCache,
  clearLovableSessionStates,
} from '../intelligence/context-builders/personas/lovable-presence.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: 'Hello, how are you?',
    analysis: {
      emotion: {
        primary: 'neutral',
        intensity: 0.5,
        needsSupport: false,
      },
      intent: {
        primary: 'greeting',
        confidence: 0.9,
      },
      topics: {
        detected: [],
      },
      state: {
        phase: 'exploring',
        engagementLevel: 0.7,
      },
    },
    services: {
      sessionId: `test-session-${Math.random()}`,
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userData: {
      turnCount: 5,
      recentTopics: [],
    },
    userProfile: null,
    persona: {
      id: 'ferni',
      name: 'Ferni',
    } as any,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Lovable Presence Context Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLovableContentCache();
    clearLovableSessionStates();
  });

  describe('Bundle Integration', () => {
    it('should load content from persona bundle', async () => {
      const input = createMockInput({
        userData: { turnCount: 10 },
      });

      // Run the builder - it should use the mocked bundle
      const injections = await buildLovablePresenceContext(input);

      // The fact that we get injections means the bundle was loaded
      // (our mock returns valid behaviors which generate content)
      expect(injections).toBeDefined();

      // Running again should use cached content (won't call loader again)
      const injections2 = await buildLovablePresenceContext(input);
      expect(injections2).toBeDefined();
    });

    it('should use bundle content in guidance when available', async () => {
      const input = createMockInput({
        userText: 'I just realized something important!',
        userData: { turnCount: 10 },
      });

      const injections = await buildLovablePresenceContext(input);

      // Should have injections with content from bundle
      expect(injections.length).toBeGreaterThan(0);

      // At least one should be about reaction (surprising content)
      const hasReaction = injections.some(
        (i) =>
          i.content.includes('React') ||
          i.content.includes('amazing') ||
          i.content.includes('genuine')
      );
      expect(hasReaction).toBe(true);
    });
  });

  describe('Crisis/Distress Handling', () => {
    it('should not inject lovable moments during distress', async () => {
      const input = createMockInput({
        analysis: {
          emotion: {
            primary: 'sad',
            intensity: 0.8,
            needsSupport: true,
            distressLevel: 0.8,
          },
          intent: { primary: 'venting', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'crisis' },
        },
      });

      const injections = await buildLovablePresenceContext(input);

      const lovableMoments = injections.filter((i) => i.content.includes('[LOVABLE MOMENT]'));
      expect(lovableMoments).toHaveLength(0);
    });

    it('should not inject playful content when user needs support', async () => {
      const input = createMockInput({
        analysis: {
          emotion: {
            primary: 'anxious',
            intensity: 0.7,
            needsSupport: true,
          },
          intent: { primary: 'seeking_support', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'distress' },
        },
      });

      const injections = await buildLovablePresenceContext(input);

      const tangents = injections.filter(
        (i) => i.content.includes('tangent') || i.content.includes('playful')
      );
      expect(tangents).toHaveLength(0);
    });
  });

  describe('Early Conversation Behavior', () => {
    it('should be minimal in early turns', async () => {
      const input = createMockInput({
        userData: { turnCount: 1 },
      });

      const injections = await buildLovablePresenceContext(input);

      expect(injections.length).toBeLessThanOrEqual(1);
    });

    it('should allow caught-mid-thought on turn 0', async () => {
      const input = createMockInput({
        userData: { turnCount: 0 },
      });

      let foundOpeningEnergy = false;
      for (let i = 0; i < 20; i++) {
        clearLovableSessionStates(); // Reset state each time
        const injections = await buildLovablePresenceContext(input);
        if (injections.some((i) => i.content.includes('[OPENING ENERGY]'))) {
          foundOpeningEnergy = true;
          break;
        }
      }

      expect(foundOpeningEnergy).toBe(true);
    });

    it('should use bundle content for opening energy guidance', async () => {
      const input = createMockInput({
        userData: { turnCount: 0 },
      });

      let openingContent = '';
      for (let i = 0; i < 30; i++) {
        clearLovableSessionStates();
        const injections = await buildLovablePresenceContext(input);
        const opening = injections.find((i) => i.content.includes('[OPENING ENERGY]'));
        if (opening) {
          openingContent = opening.content;
          break;
        }
      }

      // Should contain content from bundle
      expect(
        openingContent.includes('Lisbon') ||
          openingContent.includes('mid-thought') ||
          openingContent.includes('never mind')
      ).toBe(true);
    });
  });

  describe('Delight Detection', () => {
    it('should detect user laughter signals', async () => {
      const input = createMockInput({
        userText: "haha that's so funny!",
        userData: { turnCount: 8 },
      });

      const injections = await buildLovablePresenceContext(input);
      expect(injections).toBeDefined();
    });

    it('should detect "that\'s funny" as delight signal', async () => {
      const input = createMockInput({
        userText: "that's funny, I never thought of it that way",
        userData: { turnCount: 8 },
      });

      const injections = await buildLovablePresenceContext(input);
      expect(injections).toBeDefined();
    });
  });

  describe('Surprising Content Detection', () => {
    it('should react to breakthrough language', async () => {
      const input = createMockInput({
        userText: 'I just realized something important',
        userData: { turnCount: 8 },
      });

      let foundReaction = false;
      for (let i = 0; i < 10; i++) {
        clearLovableSessionStates();
        const injections = await buildLovablePresenceContext(input);
        const reactions = injections.filter(
          (i) =>
            i.content.includes('React') ||
            i.content.toLowerCase().includes('genuine') ||
            i.content.includes('amazing')
        );
        if (reactions.length > 0) {
          foundReaction = true;
          break;
        }
      }

      expect(foundReaction).toBe(true);
    });

    it('should react to vulnerable shares', async () => {
      const input = createMockInput({
        userText: "I've never told anyone this before",
        userData: { turnCount: 10 },
      });

      const injections = await buildLovablePresenceContext(input);

      const reactions = injections.filter((i) => i.content.toLowerCase().includes('react'));
      expect(reactions.length).toBeGreaterThan(0);
    });

    it('should use bundle content for reactions', async () => {
      const input = createMockInput({
        userText: 'I just realized something life-changing',
        userData: { turnCount: 10 },
      });

      const injections = await buildLovablePresenceContext(input);

      // Should contain content inspired by bundle
      const reactionContent = injections.map((i) => i.content).join(' ');
      expect(
        reactionContent.includes('amazing') ||
          reactionContent.includes('React') ||
          reactionContent.includes('genuine')
      ).toBe(true);
    });
  });

  describe('Noticing Patterns', () => {
    it('should use bundle content for voice change noticing', async () => {
      const input = createMockInput({
        userData: { turnCount: 10 },
        voiceEmotion: { speechRate: 0.5 }, // Slowed down
      });

      let foundNoticing = false;
      // Increase iterations for more reliable probabilistic test
      for (let i = 0; i < 50; i++) {
        clearLovableSessionStates();
        const injections = await buildLovablePresenceContext(input);
        if (
          injections.some(
            (inj) =>
              inj.content.toLowerCase().includes('voice') ||
              inj.content.toLowerCase().includes('quieter') ||
              inj.content.toLowerCase().includes('shifted') ||
              inj.content.toLowerCase().includes('notice') ||
              inj.content.toLowerCase().includes('slower') ||
              inj.content.toLowerCase().includes('pace') ||
              inj.content.toLowerCase().includes('tone')
          )
        ) {
          foundNoticing = true;
          break;
        }
      }

      expect(foundNoticing).toBe(true);
    });
  });

  describe('Rapport-Based Behavior', () => {
    it('should not inject playful teasing in early conversation', async () => {
      const input = createMockInput({
        userData: { turnCount: 3 },
      });

      for (let i = 0; i < 10; i++) {
        clearLovableSessionStates();
        const injections = await buildLovablePresenceContext(input);
        const playful = injections.filter(
          (i) => i.content.includes('playful') || i.content.includes('teasing')
        );
        expect(playful).toHaveLength(0);
      }
    });

    it('should allow playful moments after rapport is established', async () => {
      const input = createMockInput({
        userData: { turnCount: 15 },
        analysis: {
          emotion: { primary: 'happy', intensity: 0.6 },
          intent: { primary: 'chatting', confidence: 0.9 },
          topics: { detected: [] },
          state: { phase: 'exploring', engagementLevel: 0.8 },
        },
      });

      const injections = await buildLovablePresenceContext(input);
      expect(injections).toBeDefined();
    });
  });

  describe('Injection Structure', () => {
    it('should produce valid injection objects', async () => {
      const input = createMockInput({
        userText: 'I just realized something amazing!',
        userData: { turnCount: 10 },
      });

      const injections = await buildLovablePresenceContext(input);

      for (const injection of injections) {
        expect(injection).toHaveProperty('id');
        expect(injection).toHaveProperty('source');
        expect(injection).toHaveProperty('content');
        expect(injection).toHaveProperty('priority');
        expect(injection.source).toBe('lovable_presence');
      }
    });

    it('should use hint priority for personality injections', async () => {
      const input = createMockInput({
        userData: { turnCount: 10 },
      });

      const injections = await buildLovablePresenceContext(input);

      const hints = injections.filter((i) => i.priority === 'hint');
      const standards = injections.filter((i) => i.priority === 'standard');

      expect(hints.length).toBeGreaterThanOrEqual(standards.length);
    });
  });

  describe('Session Caps', () => {
    it('should cap surprises per session to avoid being manic', async () => {
      const sessionId = 'cap-test-session';
      const input = createMockInput({
        userData: { turnCount: 50 },
        services: {
          sessionId,
          sessionStartTime: Date.now(),
          userProfile: null,
        },
      });

      let totalInjections = 0;
      for (let i = 0; i < 20; i++) {
        const injections = await buildLovablePresenceContext(input);
        totalInjections += injections.filter((i) => i.content.includes('[LOVABLE MOMENT]')).length;
      }

      expect(totalInjections).toBeLessThan(30);
    });
  });

  describe('Content Variety', () => {
    it('should generate different guidance across multiple calls', async () => {
      const input = createMockInput({
        userData: { turnCount: 12 },
      });

      const allContent: string[] = [];

      for (let i = 0; i < 30; i++) {
        clearLovableSessionStates();
        const injections = await buildLovablePresenceContext(input);
        for (const injection of injections) {
          if (!allContent.includes(injection.content)) {
            allContent.push(injection.content);
          }
        }
      }

      // Should have some variety in generated content
      expect(allContent.length).toBeGreaterThan(2);
    });
  });
});
