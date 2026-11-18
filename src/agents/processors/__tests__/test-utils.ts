/**
 * Test Utilities for Turn Processor Integration Tests
 *
 * Provides comprehensive mocking for the turn processor's dependencies.
 */

import { vi } from 'vitest';
import type {
  TurnContext,
  TurnProcessorResult,
  EmotionalState,
  ResponseGuidance,
  ContextInjection,
} from '../types.js';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

/**
 * Create a mock analysis result
 */
export const createMockAnalysis = (overrides = {}) => ({
  topics: { detected: ['general'], confidence: 0.8 },
  intent: { type: 'inform', confidence: 0.7 },
  sentiment: { score: 0.5, label: 'neutral' },
  entities: [],
  complexity: 0.3,
  isQuestion: false,
  hasCrisisIndicators: false,
  keywords: ['test'],
  emotion: {
    primary: 'neutral',
    secondary: null,
    intensity: 0.5,
    distressLevel: 0,
    confidence: 0.8,
  },
  state: {
    userNeedsSupport: false,
    isVenting: false,
    needsAcknowledgment: false,
    emotionalDepth: 0.3,
  },
  // Required by ConversationAnalysis
  contextForPrompt: 'Test context for prompt',
  suggestedTone: 'warm',
  priorityFocus: 'general',
  ...overrides,
});

/**
 * Create mock session services
 */

export const createMockServices = (overrides = {}): Record<string, unknown> => ({
  sessionId: 'test-session-123',
  userId: 'test-user-456',
  analyze: vi.fn(() => createMockAnalysis()),
  addTurn: vi.fn(),
  getRecentTurns: vi.fn(() => []),
  topicTracker: {
    getCurrentTopic: vi.fn(() => 'general'),
    getPreviousTopic: vi.fn(() => 'general'),
    recordTopic: vi.fn(),
  },
  emotionalMemory: {
    recordEmotion: vi.fn(),
    getEmotionalContext: vi.fn(() => ({
      primary: 'neutral',
      intensity: 0.5,
    })),
  },
  emotionDetector: {
    detect: vi.fn(() => ({
      primary: 'neutral',
      secondary: null,
      intensity: 0.5,
      confidence: 0.8,
    })),
  },
  learningEngine: {
    recordInteraction: vi.fn(),
    getPreferences: vi.fn(() => ({})),
  },
  historyTracker: {
    addTurn: vi.fn(),
    getRecentTurns: vi.fn(() => []),
    getSimpleTurns: vi.fn(() => []),
    getTurnCount: vi.fn(() => 1),
    getLastUserMessage: vi.fn(() => null),
    getLastAssistantMessage: vi.fn(() => null),
  },
  conversationState: {
    recordMessage: vi.fn(),
    getState: vi.fn(() => ({})),
  },
  proactiveInsightEngine: {
    recordInteraction: vi.fn(),
  },
  crossSessionThreader: {
    recordThread: vi.fn(),
  },
  responseQualityTracker: {
    recordResponse: vi.fn(),
  },
  humorCalibration: {
    shouldUseHumor: vi.fn(() => false),
    getHumorGuidance: vi.fn(() => ({
      shouldAttempt: false,
      type: null,
      avoid: [],
    })),
  },
  storyPreference: {
    getPreference: vi.fn(() => null),
  },
  voicePaceAdapter: {
    getRecommendedPace: vi.fn(() => 'moderate'),
    getPaceContext: vi.fn(() => ({
      userPace: 'moderate',
      recommendedPace: 'moderate',
      paceGuidance: 'Match user pace',
    })),
  },
  conversationPatternAnalyzer: {
    analyze: vi.fn(() => ({})),
  },
  communicationMirroring: {
    getMirroringAdvice: vi.fn(() => null),
  },
  // Additional service methods
  updateHumanizingState: vi.fn(),
  recordEasterEgg: vi.fn(),
  ...overrides,
});

/**
 * Create a mock persona configuration
 */
export const createMockPersona = (overrides = {}) => ({
  id: 'ferni',
  name: 'Ferni',
  description: 'A warm life coach',
  systemPrompt: 'You are Ferni, a warm and supportive life coach.',
  voice: {
    id: 'ferni-voice',
    name: 'Ferni Voice',
  },
  speechCharacteristics: {
    pace: 'moderate',
    warmth: 0.8,
    energy: 0.6,
  },
  ...overrides,
});

/**
 * Create mock user data
 */
export const createMockUserData = (overrides = {}) => ({
  userId: 'test-user-456',
  sessionId: 'test-session-123',
  voiceEmotion: null,
  turnCount: 1,
  lastTopic: undefined,
  bundleRuntimeState: {
    relationshipTurns: 10,
    currentMode: 'listening',
    storiesToldThisSession: [],
  },
  ...overrides,
});

/**
 * Create a mock chat context (llm.ChatContext)
 */
export const createMockChatContext = (): Record<string, unknown> => ({
  addMessage: vi.fn(),
  messages: [],
});

/**
 * Create a mock logger
 */
export const createMockLogger = (): Record<string, unknown> => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

/**
 * Create a complete mock TurnContext
 */
export const createMockTurnContext = (overrides: Partial<TurnContext> = {}): TurnContext => ({
  turnCtx: createMockChatContext() as unknown as TurnContext['turnCtx'],
  userText: 'Hello, how are you?',
  persona: createMockPersona() as unknown as TurnContext['persona'],
  services: createMockServices() as unknown as TurnContext['services'],
  userData: createMockUserData() as unknown as TurnContext['userData'],
  logger: createMockLogger() as unknown as TurnContext['logger'],
  ...overrides,
});

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock TurnProcessorResult for testing downstream functions
 */
export const createMockTurnProcessorResult = (
  overrides: Partial<TurnProcessorResult> = {}
): TurnProcessorResult => ({
  analysis: {
    analysis: createMockAnalysis() as unknown as TurnProcessorResult['analysis']['analysis'],
    currentTopic: 'general',
    previousTopic: undefined,
    topicChanged: false,
  },
  context: {
    injections: [],
    elapsedMs: 10,
  },
  emotional: {
    primary: 'neutral',
    intensity: 0.5,
    distressLevel: 0,
    trajectory: 'stable',
  },
  response: {
    length: { min: 20, max: 100, guidance: 'Normal response' },
  },
  identity: {
    needsReinforcement: false,
    activeAgentId: 'ferni',
    sessionPersonaId: 'ferni',
  },
  ...overrides,
});

/**
 * Wait for all pending promises/timers
 */
export const flushPromises = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Create an emotional user message scenario
 */
export const createEmotionalScenario = (
  emotion: string,
  intensity: number
): { analysis: ReturnType<typeof createMockAnalysis>; services: Record<string, unknown> } => {
  const analysis = createMockAnalysis({
    emotion: {
      primary: emotion,
      secondary: null,
      intensity,
      distressLevel: emotion === 'sad' || emotion === 'anxious' ? intensity * 0.8 : 0,
      confidence: 0.9,
    },
    state: {
      userNeedsSupport: intensity > 0.7,
      isVenting: emotion === 'frustrated',
      needsAcknowledgment: true,
      emotionalDepth: intensity,
    },
  });

  return {
    analysis,
    services: createMockServices({ analyze: vi.fn(() => analysis) }),
  };
};
