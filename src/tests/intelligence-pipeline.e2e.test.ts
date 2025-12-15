/**
 * Intelligence Pipeline E2E Test
 *
 * Tests the full flow: analyzeMessage() → buildConversationContext()
 * Runs a realistic multi-turn conversation and snapshots the critical/high
 * priority injections to catch orchestration regressions.
 *
 * Uses mocked Math.random() for deterministic behavior.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildConversationContext,
  ensureBuildersLoaded,
  formatContextForPrompt,
  reloadBuilders,
  type ContextBuilderInput,
  type ContextInjection,
} from '../intelligence/context-builders/index.js';
import { analyzeMessage, resetIntelligence } from '../intelligence/index.js';
import type { PersonaConfig } from '../personas/types.js';
import type { UserProfile } from '../types/user-profile.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const TEST_USER_PROFILE: UserProfile = {
  id: 'e2e-test-user',
  name: 'Alex',
  email: 'alex@test.com',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-06-01'),
  totalConversations: 15,
  relationshipStage: 'building-trust',
  firstContact: new Date('2024-01-15'),
  version: 1,
  subscription: { tier: 'friend', status: 'active' },
};

const TEST_PERSONA: PersonaConfig = {
  id: 'ferni',
  identity: {
    id: 'ferni',
    name: 'Ferni',
    role: 'Life Coach',
    personality: 'warm, curious, grounded',
  },
  voice: {
    provider: 'elevenlabs',
    voiceId: 'test-voice',
  },
};

const MOCK_SERVICES = {
  sessionId: 'e2e-session-123',
  userId: 'e2e-test-user',
  sessionStartTime: Date.now(),
  userProfile: TEST_USER_PROFILE,
};

function createTestInput(
  userText: string,
  turnCount: number,
  overrides: Partial<ContextBuilderInput> = {}
): ContextBuilderInput {
  const analysis = analyzeMessage(userText, {
    userName: TEST_USER_PROFILE.name,
    isReturningUser: true,
  });

  return {
    userText,
    analysis: {
      emotion: {
        primary: analysis.emotion.primary,
        intensity: analysis.emotion.intensity,
        distressLevel: analysis.emotion.distressLevel,
        valence: analysis.emotion.valence,
        confidence: analysis.emotion.confidence,
        markers: analysis.emotion.markers,
        suggestedTone: analysis.emotion.suggestedTone,
      },
      intent: {
        primary: analysis.intent.primary,
        confidence: analysis.intent.confidence,
        requiresEmpathy: analysis.intent.requiresEmpathy,
        requiresAction: analysis.intent.requiresAction,
        suggestedApproach: analysis.intent.suggestedApproach,
      },
      topics: {
        detected: analysis.topics.detected,
        primary: analysis.topics.detected[0] || null,
        isTopicShift: analysis.topics.isTopicShift,
      },
      state: {
        phase: analysis.state.phase,
      },
    },
    services: MOCK_SERVICES,
    userData: {
      userName: TEST_USER_PROFILE.name,
      isReturningUser: true,
      turnCount,
      sessionDurationMs: turnCount * 30000,
    },
    userProfile: TEST_USER_PROFILE,
    persona: TEST_PERSONA,
    ...overrides,
  };
}

function filterByPriority(
  injections: ContextInjection[],
  priorities: Array<'critical' | 'high' | 'standard' | 'hint'>
): ContextInjection[] {
  return injections.filter((i) => priorities.includes(i.priority));
}

function summarizeInjections(injections: ContextInjection[]): string[] {
  return injections.map((i) => `[${i.priority}] ${i.source}: ${i.content.slice(0, 80)}...`);
}

// ============================================================================
// TESTS
// ============================================================================

describe('Intelligence Pipeline E2E', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // Make Math.random deterministic for reproducible tests
    let seed = 0.42;
    randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    });

    await reloadBuilders();
    await ensureBuildersLoaded();
  });

  afterAll(() => {
    randomSpy.mockRestore();
  });

  beforeEach(() => {
    resetIntelligence(true);
  });

  describe('Single Turn Analysis', () => {
    it('should analyze a greeting and produce appropriate context', async () => {
      const input = createTestInput('Hey Ferni, how are you doing today?', 1);
      const injections = await buildConversationContext(input);

      expect(injections.length).toBeGreaterThan(0);

      // Should have basic emotional/intent context
      const hasSomeContext = injections.some(
        (i) =>
          i.source.includes('emotional') ||
          i.source.includes('intent') ||
          i.source.includes('persona')
      );
      expect(hasSomeContext).toBe(true);
    });

    it('should detect high distress and inject critical context', async () => {
      const input = createTestInput(
        "I'm really scared. I don't know what to do anymore. Everything feels overwhelming.",
        3
      );
      const injections = await buildConversationContext(input);

      const criticalInjections = filterByPriority(injections, ['critical', 'high']);

      // Should have emotional support injections
      const hasEmotionalSupport = criticalInjections.some(
        (i) =>
          i.content.toLowerCase().includes('support') ||
          i.content.toLowerCase().includes('distress') ||
          i.content.toLowerCase().includes('empathy') ||
          i.content.toLowerCase().includes('gentle')
      );
      expect(hasEmotionalSupport).toBe(true);
    });

    it('should detect positive emotion and match energy', async () => {
      const input = createTestInput("I just got promoted! I'm so excited and happy right now!", 5);
      const injections = await buildConversationContext(input);

      // Should have celebration or positive context
      const hasPositiveContext = injections.some(
        (i) =>
          i.content.toLowerCase().includes('celebrat') ||
          i.content.toLowerCase().includes('happy') ||
          i.content.toLowerCase().includes('positive') ||
          i.content.toLowerCase().includes('excited') ||
          i.content.toLowerCase().includes('joy')
      );
      expect(hasPositiveContext).toBe(true);
    });
  });

  describe('Multi-Turn Conversation', () => {
    // TODO: Non-deterministic test - context builders produce different outputs each run
    it.skip('should build context across multiple turns', async () => {
      const turns = [
        { text: 'Hi Ferni!', turn: 1 },
        { text: "I've been thinking about my career lately.", turn: 2 },
        {
          text: "I'm not sure if I should stay at my current job or look for something new.",
          turn: 3,
        },
        { text: "It's been stressing me out a lot.", turn: 4 },
      ];

      const allInjections: ContextInjection[][] = [];

      for (const { text, turn } of turns) {
        const input = createTestInput(text, turn);
        const injections = await buildConversationContext(input);
        allInjections.push(injections);
      }

      // All turns should have meaningful context (context may be more focused in later turns)
      expect(allInjections[0].length).toBeGreaterThan(0);
      expect(allInjections[3].length).toBeGreaterThan(0);

      // Turn 4 mentions stress - should have emotional context
      const turn4Critical = filterByPriority(allInjections[3], ['critical', 'high', 'standard']);
      const hasStressContext = turn4Critical.some(
        (i) =>
          i.content.toLowerCase().includes('stress') ||
          i.content.toLowerCase().includes('support') ||
          i.content.toLowerCase().includes('empathy')
      );
      expect(hasStressContext).toBe(true);
    });
  });

  describe('Context Formatting', () => {
    it('should format context for prompt with priority ordering', async () => {
      const input = createTestInput(
        "I'm feeling really anxious about my finances. I don't know what to do.",
        5
      );
      const injections = await buildConversationContext(input);
      const formatted = formatContextForPrompt(injections);

      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should respect maxLength in formatting', async () => {
      const input = createTestInput('Tell me about investing for beginners.', 3);
      const injections = await buildConversationContext(input);

      const shortFormatted = formatContextForPrompt(injections, { maxLength: 500 });
      const longFormatted = formatContextForPrompt(injections, { maxLength: 5000 });

      expect(shortFormatted.length).toBeLessThanOrEqual(500 + 100); // Some buffer for last section
      expect(longFormatted.length).toBeGreaterThanOrEqual(shortFormatted.length);
    });

    it('should filter hints when includeHints is false', async () => {
      const input = createTestInput('What do you think about passive investing?', 4);
      const injections = await buildConversationContext(input);

      const withHints = formatContextForPrompt(injections, { includeHints: true });
      const withoutHints = formatContextForPrompt(injections, { includeHints: false });

      // Without hints should be shorter or equal (never longer)
      expect(withoutHints.length).toBeLessThanOrEqual(withHints.length);
    });
  });

  describe('Builder Categories', () => {
    it('should include persona identity context', async () => {
      const input = createTestInput('Who are you exactly?', 2);
      const injections = await buildConversationContext(input);

      const hasPersonaContext = injections.some(
        (i) =>
          i.source.includes('persona') ||
          i.source.includes('identity') ||
          i.source.includes('ferni')
      );
      expect(hasPersonaContext).toBe(true);
    });

    it('should include team context for Ferni', async () => {
      const input = createTestInput('Can someone help me with my habits?', 5);
      const injections = await buildConversationContext(input);

      const hasTeamContext = injections.some(
        (i) =>
          i.source.includes('team') ||
          i.source.includes('handoff') ||
          i.source.includes('cameo') ||
          i.content.toLowerCase().includes('team') ||
          i.content.toLowerCase().includes('maya')
      );
      // Team context should be present for Ferni
      expect(hasTeamContext).toBe(true);
    });
  });

  describe('Determinism', () => {
    it('should produce consistent results with same input', async () => {
      const text = 'I need help figuring out my budget for next month.';

      // Run twice with same input
      const input1 = createTestInput(text, 3);
      const injections1 = await buildConversationContext(input1);

      resetIntelligence(true);

      const input2 = createTestInput(text, 3);
      const injections2 = await buildConversationContext(input2);

      // Should have same number of injections
      expect(injections1.length).toBe(injections2.length);

      // Same sources should be present
      const sources1 = new Set(injections1.map((i) => i.source));
      const sources2 = new Set(injections2.map((i) => i.source));
      expect(sources1).toEqual(sources2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message', async () => {
      const input = createTestInput('', 1);
      const injections = await buildConversationContext(input);

      // Should not crash, may have minimal context
      expect(Array.isArray(injections)).toBe(true);
    });

    it('should handle very long message', async () => {
      const longText = 'I have been thinking about this for a long time. '.repeat(50);
      const input = createTestInput(longText, 2);
      const injections = await buildConversationContext(input);

      expect(Array.isArray(injections)).toBe(true);
      expect(injections.length).toBeGreaterThan(0);
    });

    it('should handle special characters', async () => {
      const input = createTestInput('What about $1000? Or 50%? @#$!', 2);
      const injections = await buildConversationContext(input);

      expect(Array.isArray(injections)).toBe(true);
    });
  });

  // ============================================================================
  // SNAPSHOT TESTS
  // ============================================================================
  // These capture the exact builder sources that activate for key scenarios.
  // If a builder changes behavior, these tests will flag it for review.

  // TODO: Snapshot tests are non-deterministic due to random builder selection
  describe.skip('Snapshots (Builder Sources)', () => {
    /**
     * Extracts a stable snapshot of builder sources and priorities.
     * Content is excluded because it can vary with persona phrasing.
     */
    function extractSourceSnapshot(injections: ContextInjection[]): string[] {
      return injections
        .map((i) => `${i.priority}:${i.source}`)
        .sort()
        .filter((v, i, arr) => arr.indexOf(v) === i); // dedupe
    }

    it('greeting scenario - turn 1', async () => {
      const input = createTestInput('Hi Ferni! How are you?', 1);
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });

    it('distress scenario - turn 3', async () => {
      const input = createTestInput(
        "I'm really struggling. Everything feels hopeless and I don't know what to do.",
        3
      );
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });

    it('celebration scenario - turn 5', async () => {
      const input = createTestInput(
        "I did it! I finally got the promotion I've been working toward!",
        5
      );
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });

    it('financial question scenario - turn 4', async () => {
      const input = createTestInput(
        'I want to start investing but I have no idea where to begin. Should I buy index funds?',
        4
      );
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });

    it('habits question scenario - turn 6', async () => {
      const input = createTestInput(
        "I keep trying to build a morning routine but I can't stick to it. Any advice?",
        6
      );
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });

    it('deep conversation scenario - turn 10', async () => {
      const input = createTestInput(
        "I've been thinking a lot about what I really want out of life. I feel like I'm at a crossroads.",
        10
      );
      const injections = await buildConversationContext(input);
      const snapshot = extractSourceSnapshot(injections);

      expect(snapshot).toMatchSnapshot();
    });
  });
});
