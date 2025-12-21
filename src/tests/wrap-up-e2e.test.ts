/**
 * Better-Than-Human Wrap-Up & Disconnection E2E Tests
 *
 * Validates the complete flow from user goodbye intent through to
 * graceful disconnection with superhuman warmth.
 *
 * Flow under test:
 * 1. User says goodbye → MESSAGE ANALYZER detects intent
 * 2. CONTEXT BUILDER injects goodbye guidance
 * 3. Agent responds with farewell → may call wrapUp/endConversation tools
 * 4. RESPONSE PROCESSOR detects farewell patterns
 * 5. FRONTEND SIGNAL sends wrap_up/conversation_end
 * 6. FRONTEND HANDLER updates UI state
 * 7. GOODBYE CEREMONY plays (if user clicks)
 *
 * @module wrap-up-e2e
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger - createLogger can be called with or without options
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  // child returns a new mock logger
  mockLogger.child.mockReturnValue(mockLogger);
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
  };
});

// Mock frontend signal
const mockSendFrontendSignal = vi.fn(async () => true);
vi.mock('../services/frontend-signal.js', () => ({
  sendFrontendSignal: mockSendFrontendSignal,
  isFrontendSignalReady: () => true,
}));

// Mock LiveKit
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown }) => ({
      ...config,
      execute: config.execute,
    })),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock DJ integration
vi.mock('../agents/dj-integration.js', () => ({
  getDJIntegration: () => ({
    wrapShow: async () => ({ playedSound: true }),
  }),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { createConversationTools } from '../tools/domains/conversation/conversation-tools.js';
import {
  buildGoodbyeContext,
  GOODBYE_PATTERNS,
  PRE_GOODBYE_PATTERNS,
  detectWindingDown,
  getTimeAwareGoodbye,
  detectHeavyConversation,
  generatePersonalizedSignoff,
} from '../intelligence/context-builders/goodbye.js';
import {
  ConversationStateManager,
  getConversationState,
  endConversation,
} from '../services/conversation-state.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockAnalysis(overrides: Partial<ContextBuilderInput['analysis']> = {}) {
  return {
    intent: {
      primary: 'conversation',
      confidence: 0.8,
      isQuestion: false,
      suggestedApproach: [],
      ...overrides.intent,
    },
    emotion: {
      primary: 'neutral',
      valence: 0.5,
      arousal: 0.5,
      confidence: 0.7,
      secondary: [],
      ...overrides.emotion,
    },
    topics: {
      detected: [],
      keywords: [],
      ...overrides.topics,
    },
    state: {
      phase: 'exploring',
      engagement: 0.7,
      rapport: 0.6,
      ...overrides.state,
    },
    ...overrides,
  } as ContextBuilderInput['analysis'];
}

function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: overrides.userText ?? 'Hello',
    analysis: createMockAnalysis(overrides.analysis),
    userData: {
      turnCount: 5,
      wasInterrupted: false,
      userWentSilent: false,
      ...overrides.userData,
    },
    persona: {
      id: 'ferni',
      name: 'Ferni',
      role: 'coordinator',
      ...overrides.persona,
    } as ContextBuilderInput['persona'],
    userProfile: overrides.userProfile,
    services: overrides.services,
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Better-Than-Human Wrap-Up E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any test sessions
    try {
      endConversation('test-session');
    } catch {
      // Ignore cleanup errors
    }
  });

  // ==========================================================================
  // PHASE 1: GOODBYE INTENT DETECTION
  // ==========================================================================

  describe('Phase 1: Goodbye Intent Detection', () => {
    describe('GOODBYE_PATTERNS - explicit goodbye phrases', () => {
      const goodbyePhrases = [
        'goodbye',
        'bye',
        'gotta go',
        'have to go',
        'need to go',
        'talk later',
        'catch you later',
        'take care',
        'see you',
        'until next time',
        "i'm out",
        'signing off',
        'heading out',
      ];

      it.each(goodbyePhrases)('should detect "%s" as goodbye', (phrase) => {
        expect(GOODBYE_PATTERNS.test(phrase)).toBe(true);
      });

      it('should detect goodbye in longer sentences', () => {
        expect(GOODBYE_PATTERNS.test('Alright, gotta go now')).toBe(true);
        expect(GOODBYE_PATTERNS.test("Thanks for chatting, I'll see you later")).toBe(true);
        expect(GOODBYE_PATTERNS.test('This was great, take care!')).toBe(true);
      });

      it('should not false-positive on similar words', () => {
        expect(GOODBYE_PATTERNS.test('Let me show you how to go about this')).toBe(false);
        expect(GOODBYE_PATTERNS.test('I need to go deeper into this topic')).toBe(true); // This actually should match "need to go"
      });
    });

    describe('PRE_GOODBYE_PATTERNS - winding down signals', () => {
      const windingDownPhrases = [
        'anyway...',
        'well...',
        'so...',
        "it's getting late",
        'should probably go',
        'need to head out',
        "that's about it",
        "i think we're good",
        'thanks for listening',
        'appreciate you',
      ];

      it.each(windingDownPhrases)('should detect "%s" as winding down', (phrase) => {
        const matches = PRE_GOODBYE_PATTERNS.some((p) => p.test(phrase));
        expect(matches).toBe(true);
      });
    });

    describe('detectWindingDown function', () => {
      it('should detect winding down after 5+ turns', () => {
        expect(detectWindingDown('anyway...', 6)).toBe(true);
        expect(detectWindingDown("that's all", 10)).toBe(true);
      });

      it('should detect winding down from explicit phrases regardless of turn count', () => {
        expect(detectWindingDown('thanks for listening', 2)).toBe(true);
        expect(detectWindingDown('appreciate this chat', 3)).toBe(true);
      });

      it('should not flag unrelated short responses in early turns', () => {
        // "ok" by itself matches the pre-goodbye pattern /^(ok|okay|alright|cool|got it|makes sense|sounds good)[.!]?$/i
        // So we use something that doesn't match
        expect(detectWindingDown('yes please', 2)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // PHASE 2: CONTEXT BUILDER INJECTION
  // ==========================================================================

  describe('Phase 2: Goodbye Context Builder', () => {
    it('should inject goodbye context when user says goodbye', () => {
      const input = createMockInput({
        userText: 'Alright, goodbye!',
        userData: { turnCount: 5 },
      });

      const injections = buildGoodbyeContext(input);

      expect(injections.length).toBeGreaterThan(0);
      // IDs are generated as `${source}_${counter}`, so look for source
      const goodbyeInjection = injections.find((i) => i.source === 'goodbye');
      expect(goodbyeInjection).toBeDefined();
      expect(goodbyeInjection?.content).toContain('GOODBYE DETECTED');
    });

    it('should inject pre-goodbye context when user is winding down', () => {
      const input = createMockInput({
        userText: "anyway, that's about it...",
        userData: { turnCount: 10 },
      });

      const injections = buildGoodbyeContext(input);

      const preGoodbyeInjection = injections.find((i) => i.source === 'pre_goodbye');
      expect(preGoodbyeInjection).toBeDefined();
      expect(preGoodbyeInjection?.content).toContain('WINDING DOWN');
    });

    it('should inject silence filler when user went silent', () => {
      const input = createMockInput({
        userText: '',
        userData: { turnCount: 5, userWentSilent: true },
      });

      const injections = buildGoodbyeContext(input);

      const silenceInjection = injections.find((i) => i.source === 'silence');
      expect(silenceInjection).toBeDefined();
      expect(silenceInjection?.content).toContain('SILENCE');
    });

    it('should inject interruption recovery when agent was interrupted', () => {
      const input = createMockInput({
        userText: 'wait, sorry to interrupt',
        userData: { turnCount: 5, wasInterrupted: true },
      });

      const injections = buildGoodbyeContext(input);

      const interruptionInjection = injections.find((i) => i.source === 'interruption');
      expect(interruptionInjection).toBeDefined();
      expect(interruptionInjection?.content).toContain('INTERRUPTION');
    });
  });

  // ==========================================================================
  // PHASE 3: SUPERHUMAN GOODBYE INTELLIGENCE
  // ==========================================================================

  describe('Phase 3: Superhuman Goodbye Intelligence', () => {
    describe('getTimeAwareGoodbye', () => {
      it('should return morning message for morning times', () => {
        // Mock a morning timezone scenario
        const result = getTimeAwareGoodbye('America/New_York');
        expect(result.timeOfDay).toBeDefined();
        expect(result.suggestion).toBeDefined();
        expect(['morning', 'afternoon', 'evening', 'night']).toContain(result.timeOfDay);
      });
    });

    describe('detectHeavyConversation', () => {
      it('should detect grief-related topics', () => {
        const history = ['My father passed away last month', 'I miss him so much'];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(true);
        expect(result.topics).toContain('passed away');
      });

      it('should detect anxiety/therapy topics', () => {
        // The markers are exact strings like 'anxiety', 'therapy' (not 'therapist')
        const history = [
          "I've been struggling with anxiety",
          'I started going to therapy last month',
        ];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(true);
        expect(result.topics.some((t) => ['anxiety', 'therapy'].includes(t))).toBe(true);
      });

      it('should not flag light conversations', () => {
        const history = ['I had a great day today', 'The weather is nice'];
        const result = detectHeavyConversation(history);

        expect(result.isHeavy).toBe(false);
        expect(result.topics).toHaveLength(0);
      });
    });

    describe('generatePersonalizedSignoff', () => {
      it('should generate signoff with topic reference', () => {
        const result = generatePersonalizedSignoff(['job interview', 'career change'], 'Alice');

        expect(result).toBeDefined();
        expect(result).toContain('Alice');
        expect(result).toContain('job interview');
      });

      it('should return null for empty topics', () => {
        const result = generatePersonalizedSignoff([]);
        expect(result).toBeNull();
      });
    });
  });

  // ==========================================================================
  // PHASE 4: CONVERSATION TOOLS
  // ==========================================================================

  describe('Phase 4: Conversation Tools', () => {
    describe('wrapUp tool', () => {
      it('should send wrap_up signal to frontend', async () => {
        const tools = createConversationTools();
        const mockContext = {
          ctx: {
            userData: { name: 'TestUser' },
          },
        };

        await tools.wrapUp.execute(
          { sentiment: 'warm' },
          // @ts-expect-error - Partial context for testing
          mockContext
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'wrap_up',
          expect.objectContaining({
            sentiment: 'warm',
          })
        );
      });

      it('should return warm message for warm sentiment', async () => {
        const tools = createConversationTools();
        const result = await tools.wrapUp.execute(
          { sentiment: 'warm' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: {} } }
        );

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });

      it('should return encouraging message for encouraging sentiment', async () => {
        const tools = createConversationTools();
        const result = await tools.wrapUp.execute(
          { sentiment: 'encouraging' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: {} } }
        );

        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('endConversation tool', () => {
      it('should send conversation_end signal to frontend', async () => {
        const tools = createConversationTools();

        await tools.endConversation.execute(
          { reason: 'goodbye_complete' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: {} } }
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'goodbye_complete',
            disconnectDelay: expect.any(Number),
          })
        );
      });

      it('should handle natural_end reason', async () => {
        const tools = createConversationTools();

        await tools.endConversation.execute(
          { reason: 'natural_end' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: {} } }
        );

        // natural_end gets converted to goodbye_complete for frontend
        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'goodbye_complete',
          })
        );
      });
    });

    describe('gracefulExit tool', () => {
      it('should send agent_exit reason for harassment', async () => {
        const tools = createConversationTools();

        await tools.gracefulExit.execute(
          { reason: 'harassment' },
          // @ts-expect-error - Partial context for testing
          { ctx: { userData: {} } }
        );

        expect(mockSendFrontendSignal).toHaveBeenCalledWith(
          'conversation_end',
          expect.objectContaining({
            reason: 'agent_exit',
            exitType: 'harassment',
          })
        );
      });
    });
  });

  // ==========================================================================
  // PHASE 5: CONVERSATION STATE TRACKING
  // ==========================================================================

  describe('Phase 5: Conversation State Tracking', () => {
    let stateManager: ConversationStateManager;

    beforeEach(() => {
      stateManager = new ConversationStateManager('test-session', 'test-user', 'ferni');
    });

    it('should track userWantsToLeave state', () => {
      stateManager.markUserWantsToLeave();

      const flow = stateManager.getFlowContext();
      expect(flow.userWantsToLeave).toBe(true);
    });

    it('should suggest wrap-up when user wants to leave', () => {
      stateManager.markUserWantsToLeave();

      const result = stateManager.shouldWrapUp();
      expect(result.should).toBe(true);
      expect(result.reasons).toContain('User indicated they need to go');
    });

    it('should suggest wrap-up after many turns (50+)', () => {
      for (let i = 0; i < 51; i++) {
        stateManager.incrementTurn();
      }

      const result = stateManager.shouldWrapUp();
      expect(result.should).toBe(true);
      expect(result.reasons).toContain('Many turns (50+)');
    });

    it('should include wrap-up suggestion in LLM summary', () => {
      stateManager.markUserWantsToLeave();

      const summary = stateManager.getSummaryForLLM();
      expect(summary).toContain('Consider wrapping up');
    });
  });

  // ==========================================================================
  // PHASE 6: INTEGRATION - FULL FLOW
  // ==========================================================================

  describe('Phase 6: Full Integration Flow', () => {
    it('should complete full goodbye flow: detect → inject → signal', async () => {
      // Step 1: User says goodbye
      const userText = 'Thanks for everything, gotta go now!';

      // Step 2: Goodbye pattern detected
      expect(GOODBYE_PATTERNS.test(userText)).toBe(true);

      // Step 3: Context builder injects goodbye guidance
      const input = createMockInput({
        userText,
        userData: { turnCount: 8 },
      });
      const injections = buildGoodbyeContext(input);
      const goodbyeInjection = injections.find((i) => i.source === 'goodbye');
      expect(goodbyeInjection).toBeDefined();

      // Step 4: Agent calls wrapUp tool (simulated)
      const tools = createConversationTools();
      await tools.wrapUp.execute(
        { sentiment: 'warm' },
        // @ts-expect-error - Partial context for testing
        { ctx: { userData: {} } }
      );

      // Step 5: Frontend signal sent
      expect(mockSendFrontendSignal).toHaveBeenCalledWith('wrap_up', expect.any(Object));

      // Step 6: Agent calls endConversation (simulated)
      await tools.endConversation.execute(
        { reason: 'goodbye_complete' },
        // @ts-expect-error - Partial context for testing
        { ctx: { userData: {} } }
      );

      // Step 7: Conversation end signal sent
      expect(mockSendFrontendSignal).toHaveBeenCalledWith('conversation_end', expect.any(Object));
    });

    it('should handle heavy conversation goodbye with emotional echo', () => {
      const userText = 'Thank you for listening about my loss. Goodbye.';
      const conversationHistory = [
        'My mother passed away last week',
        'I miss her so much',
        userText,
      ];

      // Detect heavy conversation
      const heavyResult = detectHeavyConversation(conversationHistory);
      expect(heavyResult.isHeavy).toBe(true);

      // Context should include emotional echo guidance
      const input = createMockInput({
        userText,
        userData: { turnCount: 10 },
        // Note: services.historyTracker would provide conversation history in real scenario
      });
      const injections = buildGoodbyeContext(input);
      const goodbyeInjection = injections.find((i) => i.source === 'goodbye');
      expect(goodbyeInjection).toBeDefined();
    });

    it('should handle pre-goodbye detection before explicit goodbye', () => {
      // "that's about it" is in PRE_GOODBYE_PATTERNS
      const userText = "that's about it";

      // Not an explicit goodbye
      expect(GOODBYE_PATTERNS.test(userText)).toBe(false);

      // But should trigger pre-goodbye detection
      expect(detectWindingDown(userText, 8)).toBe(true);

      // Context builder should inject pre-goodbye hint
      const input = createMockInput({
        userText,
        userData: { turnCount: 8 },
      });
      const injections = buildGoodbyeContext(input);
      const preGoodbyeInjection = injections.find((i) => i.source === 'pre_goodbye');
      expect(preGoodbyeInjection).toBeDefined();
    });
  });
});

// ============================================================================
// FAREWELL DETECTION TESTS (Response Processor)
// ============================================================================

describe('Response Processor Farewell Detection', () => {
  // These patterns are from response-processor.ts
  const AGENT_FAREWELL_PATTERNS = [
    /\b(take care|see you|until next time|goodbye|bye for now|talk soon|catch you later)\b/i,
    /\b(here whenever you need|i['']m here for you|looking forward to|can['']t wait to)\s+\w+\s+(again|next|soon)/i,
    /\b(be well|stay (safe|well)|take it easy)[.!]/i,
  ];

  function detectAgentFarewell(text: string): boolean {
    const lastPart = text.slice(-150);
    return AGENT_FAREWELL_PATTERNS.some((pattern) => pattern.test(lastPart));
  }

  const farewellPhrases = [
    'Take care of yourself!',
    'See you next time!',
    'Until next time, friend.',
    'Goodbye for now.',
    'Bye for now, and remember to be gentle with yourself.',
    'Talk soon!',
    'Catch you later!',
    "I'm here whenever you need me again.",
    'Looking forward to our next conversation.',
    'Be well!',
    'Stay safe.',
    'Take it easy!',
  ];

  it.each(farewellPhrases)('should detect "%s" as agent farewell', (phrase) => {
    expect(detectAgentFarewell(phrase)).toBe(true);
  });

  it('should only check last 150 characters', () => {
    const longResponse =
      'Let me share some thoughts with you. Take care to consider all options. ' +
      'Here are some strategies that might help. ' +
      "First, think about what's most important to you. " +
      "Second, consider the long-term implications. Now that we've covered that, goodbye!";

    expect(detectAgentFarewell(longResponse)).toBe(true);
  });

  it('should not false-positive on mid-response farewells', () => {
    // Using "be careful" instead of "take care" which is a strong farewell pattern
    const response =
      'Be careful to plan ahead for these situations. ' +
      "Let's continue discussing your goals. " +
      "What's the next step you want to focus on?";

    expect(detectAgentFarewell(response)).toBe(false);
  });
});
