/**
 * PersonaPlex Full Integration Tests
 *
 * Tests the complete integration with all Ferni systems:
 * - Session management
 * - Context builders
 * - Tool execution
 * - Memory integration
 * - Humanization translation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// MOCKS
// =============================================================================

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// Mock persona loader
vi.mock('../../../personas/bundles/loader.js', () => ({
  loadPersonaBundle: vi.fn().mockResolvedValue({
    id: 'ferni',
    displayName: 'Ferni',
    identity: {
      systemPrompt: 'You are Ferni, a wise life coach.',
      tagline: 'Your AI life coach',
      values: ['empathy', 'growth', 'authenticity'],
    },
    content: {
      behaviors: {
        catchphrases: [{ phrase: 'I hear you' }],
        greetings: [{ text: 'Hey! What\'s on your mind?' }],
        backchannels: [{ text: 'Mmhmm' }, { text: 'Yeah' }],
      },
    },
  }),
}));

// Mock cognitive profiles
vi.mock('../../../personas/cognitive/cognitive-profiles.js', () => ({
  getCognitiveProfile: vi.fn().mockReturnValue({
    communicationStyle: 'warm',
    emotionalExpression: 'expressive',
    thinkingStyle: 'exploratory',
    energyLevel: 'moderate',
  }),
}));

// Mock context builders
vi.mock('../../../intelligence/context-builders/index.js', () => ({
  buildConversationContext: vi.fn().mockResolvedValue([
    { source: 'memory', content: 'User mentioned job stress' },
  ]),
}));

vi.mock('../../../intelligence/context-builders/behavioral/orchestrator.js', () => ({
  buildIntegratedContext: vi.fn().mockResolvedValue({
    tone: 'supportive',
    style: 'exploratory',
  }),
}));

// Mock tools
vi.mock('../../../tools/orchestrator/voice-agent-integration.js', () => ({
  getToolsForAgent: vi.fn().mockResolvedValue({
    tools: {
      getCalendarEvents: { execute: vi.fn().mockResolvedValue('No events today') },
      playMusic: { execute: vi.fn().mockResolvedValue('Playing jazz') },
    },
    meta: { source: 'unified', totalTools: 2 },
  }),
}));

// Mock memory
vi.mock('../../../memory/dynamic/fast-capture.js', () => ({
  fastCapture: vi.fn().mockResolvedValue({
    entities: [{ name: 'work', type: 'topic' }],
    facts: ['User is stressed about work'],
  }),
}));

vi.mock('../../../memory/dynamic/stm-buffer.js', () => ({
  getOrCreateSTMBuffer: vi.fn().mockReturnValue({
    add: vi.fn(),
    promoteToLongTerm: vi.fn(),
  }),
}));

vi.mock('../../../memory/dynamic/dynamic-memory-context.js', () => ({
  getMemoryContext: vi.fn().mockResolvedValue('User mentioned job stress last week'),
}));

vi.mock('../../../memory/dynamic/turn-recorder.js', () => ({
  recordTurn: vi.fn().mockResolvedValue(undefined),
}));

// Mock humanization
vi.mock('../../../conversation/humanization-engine.js', () => ({
  createHumanizationEngine: vi.fn().mockReturnValue({
    getSignals: vi.fn().mockResolvedValue({
      tone: 'warm',
      pacing: 'normal',
    }),
  }),
  HumanizationEngine: vi.fn(),
}));

vi.mock('../../../speech/backchanneling/backchannel-engine.js', () => ({
  getBackchannelResponse: vi.fn().mockReturnValue({
    shouldUse: true,
    phrase: 'I hear you',
  }),
}));

vi.mock('../../../speech/backchanneling/listening-signals.js', () => ({
  getListeningSignals: vi.fn().mockReturnValue(['That sounds tough']),
}));

// Mock analysis
vi.mock('../../../intelligence/detectors/analysis-engine.js', () => ({
  AnalysisEngine: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({
      emotion: 'stressed',
      intensity: 0.7,
      topics: ['work', 'career'],
    }),
  })),
}));

// Mock handoff
vi.mock('../../../handoff/handoff-manager.js', () => ({
  HandoffManager: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../handoff/handoff-triggers.js', () => ({
  evaluateHandoffTrigger: vi.fn().mockResolvedValue({
    shouldHandoff: false,
  }),
}));

// Mock DJ controller
vi.mock('../../../audio/dj-controller.js', () => ({
  getDJController: vi.fn().mockReturnValue({
    dispatch: vi.fn(),
  }),
}));

// Mock PersonaPlex client
vi.mock('../client.js', () => ({
  createPersonaPlexClient: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    updatePrompt: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
    on: vi.fn(),
  }),
  PersonaPlexClient: vi.fn(),
}));

vi.mock('../config.js', () => ({
  getVoiceEmbeddingPath: vi.fn().mockReturnValue({ path: 'ferni.pt', isCustom: true }),
  getFallbackVoice: vi.fn().mockReturnValue('NATM1'),
}));

// =============================================================================
// IMPORTS (after mocks)
// =============================================================================

import {
  PersonaPlexSessionManager,
  createPersonaPlexSession,
} from '../session/session-manager.js';

import {
  translateSSMLToText,
  getTimeBasedVoiceGuidance,
} from '../humanization/ssml-to-text.js';

import {
  PersonaPlexToolExecutor,
  createToolExecutor,
} from '../tools/tool-executor.js';

// =============================================================================
// SESSION MANAGER TESTS
// =============================================================================

describe('PersonaPlexSessionManager', () => {
  let mockServices: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServices = {
      has: () => false,
      get: () => { throw new Error('Not available'); },
      getOptional: () => undefined,
    };
  });

  describe('initialization', () => {
    it('should create a session manager', () => {
      const session = createPersonaPlexSession({
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        services: mockServices,
      });

      expect(session).toBeInstanceOf(PersonaPlexSessionManager);
      expect(session.sessionId).toBe('test-session');
    });

    it('should initialize with all systems', async () => {
      const session = createPersonaPlexSession({
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        services: mockServices,
        enableMusic: true,
        enableHandoffs: true,
      });

      await session.initialize();

      expect(session.currentPersona).toBeDefined();
      expect(session.currentPersona?.id).toBe('ferni');
    });
  });

  describe('turn processing', () => {
    it('should process a turn with full context', async () => {
      const session = createPersonaPlexSession({
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        services: mockServices,
      });

      await session.initialize();

      const turnContext = await session.processTurn('I\'m feeling stressed about work');

      expect(turnContext).toBeDefined();
      expect(turnContext.userTranscript).toBe('I\'m feeling stressed about work');
      expect(turnContext.analysis).toBeDefined();
      expect(turnContext.memoryContext).toBeDefined();
      expect(turnContext.behavioralSignals).toBeDefined();
      expect(turnContext.fullPrompt).toBeDefined();
    });

    it('should increment turn count', async () => {
      const session = createPersonaPlexSession({
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        services: mockServices,
      });

      await session.initialize();

      expect(session.turnCount).toBe(0);

      await session.processTurn('Hello');
      expect(session.turnCount).toBe(1);

      await session.processTurn('How are you?');
      expect(session.turnCount).toBe(2);
    });
  });

  describe('prompt building', () => {
    it('should build comprehensive prompts', async () => {
      const session = createPersonaPlexSession({
        sessionId: 'test-session',
        userId: 'test-user',
        personaId: 'ferni',
        services: mockServices,
      });

      await session.initialize();
      const turnContext = await session.processTurn('Tell me about yourself');

      // Should include core sections
      expect(turnContext.fullPrompt).toContain('Ferni');
      expect(turnContext.fullPrompt).toContain('SUPERHUMAN');
      expect(turnContext.fullPrompt).toContain('CONVERSATION PRINCIPLES');
    });
  });
});

// =============================================================================
// SSML TRANSLATION TESTS
// =============================================================================

describe('SSML to Text Translation', () => {
  // Mock the imported functions
  vi.mock('../../../speech/prosody/prosody-profiles.js', () => ({
    getProsodyProfile: vi.fn().mockReturnValue({
      rate: 'medium',
      pitch: 'medium',
      volume: 'medium',
    }),
  }));

  vi.mock('../../../speech/prosody/emotional-prosody.js', () => ({
    getEmotionalProsody: vi.fn().mockReturnValue({
      contour: 'varied',
      breathiness: 0.3,
    }),
  }));

  vi.mock('../../../speech/anticipation/anticipatory-cues.js', () => ({
    getAnticipatoryCues: vi.fn().mockReturnValue({
      shouldAnticipate: false,
    }),
  }));

  vi.mock('../../../speech/natural/natural-speech-patterns.js', () => ({
    getNaturalSpeechPatterns: vi.fn().mockReturnValue({
      useContractions: true,
      fillers: ['um', 'you know'],
      hedging: true,
      allowIncomplete: true,
    }),
  }));

  vi.mock('../../../speech/breathing/breathing-patterns.js', () => ({
    getBreathingPattern: vi.fn().mockReturnValue({
      pauseFrequency: 'normal',
      rhythm: 'calm',
    }),
  }));

  describe('translateSSMLToText', () => {
    it('should translate emotional state to voice guidance', async () => {
      const result = await translateSSMLToText({
        userEmotion: 'sad',
        intensity: 0.8,
        personaId: 'ferni',
        turnCount: 3,
        trustLevel: 7,
      });

      expect(result).toBeDefined();
      expect(result.voiceGuidance).toBeDefined();
      expect(result.voiceGuidance.length).toBeGreaterThan(0);
      expect(result.components).toBeDefined();
    });

    it('should include emotional guidance', async () => {
      const result = await translateSSMLToText({
        userEmotion: 'anxious',
        personaId: 'ferni',
        turnCount: 1,
      });

      expect(result.components.emotion).toContain('calm');
    });

    it('should include listening signals', async () => {
      const result = await translateSSMLToText({
        userEmotion: 'sad',
        intensity: 0.9,
        personaId: 'ferni',
        turnCount: 5,
      });

      expect(result.components.listening).toBeDefined();
    });
  });

  describe('getTimeBasedVoiceGuidance', () => {
    it('should return morning guidance', () => {
      const guidance = getTimeBasedVoiceGuidance(7);
      expect(guidance).toContain('Morning');
    });

    it('should return late night guidance', () => {
      const guidance = getTimeBasedVoiceGuidance(23);
      expect(guidance).toContain('Late night');
    });

    it('should return afternoon guidance', () => {
      const guidance = getTimeBasedVoiceGuidance(15);
      expect(guidance).toContain('Afternoon');
    });
  });
});

// =============================================================================
// TOOL EXECUTOR TESTS
// =============================================================================

describe('PersonaPlexToolExecutor', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      userId: 'test-user',
      sessionId: 'test-session',
      personaId: 'ferni',
      lastUserTranscript: 'Play some jazz',
      services: {
        has: () => false,
        get: () => { throw new Error('Not available'); },
        getOptional: () => undefined,
      },
    };
  });

  describe('trigger detection', () => {
    it('should detect music play triggers', () => {
      const executor = createToolExecutor(mockContext);

      const triggers = executor.detectTriggers('I\'ll play some relaxing music for you');

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers[0].toolId).toBe('playMusic');
    });

    it('should detect calendar triggers', () => {
      const executor = createToolExecutor(mockContext);

      const triggers = executor.detectTriggers('Let me check your calendar');

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers[0].toolId).toBe('getCalendarEvents');
    });

    it('should detect weather triggers', () => {
      const executor = createToolExecutor(mockContext);

      const triggers = executor.detectTriggers('Let me check the weather for you');

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers[0].toolId).toBe('getWeather');
    });

    it('should detect handoff triggers', () => {
      const executor = createToolExecutor(mockContext);

      const triggers = executor.detectTriggers('Let me bring in Maya to help with that');

      expect(triggers.length).toBeGreaterThan(0);
      expect(triggers[0].toolId).toBe('handoff');
      expect(triggers[0].params.targetPersonaId).toBe('maya');
    });

    it('should not detect triggers in normal speech', () => {
      const executor = createToolExecutor(mockContext);

      const triggers = executor.detectTriggers('That sounds like a great idea!');

      expect(triggers.length).toBe(0);
    });
  });

  describe('context building', () => {
    it('should build tool result context', () => {
      const executor = createToolExecutor(mockContext);

      // Simulate some execution history
      (executor as any).executionHistory = [
        { toolId: 'getWeather', success: true, result: 'Sunny, 72°F', executionTimeMs: 100 },
      ];

      const context = executor.buildToolResultContext();

      expect(context).toContain('RECENT TOOL RESULTS');
      expect(context).toContain('getWeather');
      expect(context).toContain('Sunny');
    });

    it('should return empty string when no results', () => {
      const executor = createToolExecutor(mockContext);

      const context = executor.buildToolResultContext();

      expect(context).toBe('');
    });
  });

  describe('custom triggers', () => {
    it('should allow adding custom triggers', () => {
      const executor = createToolExecutor(mockContext);

      executor.addTrigger({
        pattern: /let me check your meditation streak/i,
        toolId: 'getMeditationStreak',
        extractParams: () => ({}),
      });

      expect(executor.triggerCount).toBeGreaterThan(0);

      const triggers = executor.detectTriggers('Let me check your meditation streak');
      expect(triggers.length).toBe(1);
      expect(triggers[0].toolId).toBe('getMeditationStreak');
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Full Integration', () => {
  it('should handle a complete conversation flow', async () => {
    const mockServices = {
      has: () => false,
      get: () => { throw new Error('Not available'); },
      getOptional: () => undefined,
    };

    // 1. Create session
    const session = createPersonaPlexSession({
      sessionId: 'integration-test',
      userId: 'test-user',
      personaId: 'ferni',
      services: mockServices,
      enableMusic: true,
      enableHandoffs: true,
    });

    // 2. Initialize
    await session.initialize();
    expect(session.currentPersona?.id).toBe('ferni');

    // 3. Process first turn
    const turn1 = await session.processTurn('Hi Ferni, I\'m feeling stressed about work');
    expect(turn1.analysis?.emotion).toBe('stressed');
    expect(turn1.fullPrompt).toContain('Ferni');

    // 4. Process second turn
    const turn2 = await session.processTurn('What should I do?');
    expect(session.turnCount).toBe(2);

    // 5. Cleanup
    await session.cleanup();
  });

  it('should translate SSML for emotional context', async () => {
    const translation = await translateSSMLToText({
      userEmotion: 'vulnerable',
      intensity: 0.9,
      personaId: 'ferni',
      turnCount: 5,
      trustLevel: 8,
      isSensitiveTopic: true,
    });

    // Should have guidance for handling vulnerability
    expect(translation.voiceGuidance).toBeDefined();
    expect(translation.components.emotion).toBeDefined();
    expect(translation.components.timing).toBeDefined();
  });
});
