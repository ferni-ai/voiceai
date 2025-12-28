/**
 * Session Services Mock Infrastructure
 *
 * Comprehensive mocks for all session services used in voice agent testing.
 * Provides a complete mock implementation of SessionServices with all sub-services.
 *
 * @module agents/__tests__/mocks/services-mock
 */

import { vi, type Mock } from 'vitest';

// ============================================================================
// TYPES
// ============================================================================

export interface MockEmotionAnalysis {
  primary: string;
  secondary?: string | null;
  intensity: number;
  distressLevel: number;
  confidence: number;
  valence?: 'positive' | 'neutral' | 'negative';
  markers?: string[];
  suggestedTone?: string;
}

export interface MockConversationAnalysis {
  topics: { detected: string[]; confidence: number };
  intent: { type: string; confidence: number };
  sentiment: { score: number; label: string };
  entities: string[];
  complexity: number;
  isQuestion: boolean;
  hasCrisisIndicators: boolean;
  keywords: string[];
  emotion: MockEmotionAnalysis;
  state: {
    userNeedsSupport: boolean;
    isVenting: boolean;
    needsAcknowledgment: boolean;
    emotionalDepth: number;
  };
  contextForPrompt: string;
  suggestedTone: string;
  priorityFocus: string;
}

export interface MockSessionServicesOptions {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  isReturningUser?: boolean;
  relationshipTurns?: number;
}

// ============================================================================
// MOCK ANALYSIS FACTORY
// ============================================================================

/**
 * Create a mock conversation analysis result
 */
export function createMockAnalysis(
  overrides: Partial<MockConversationAnalysis> = {}
): MockConversationAnalysis {
  return {
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
    contextForPrompt: 'Test context for prompt',
    suggestedTone: 'warm',
    priorityFocus: 'general',
    ...overrides,
  };
}

/**
 * Create mock emotion analysis
 */
export function createMockEmotionAnalysis(
  emotion = 'neutral',
  intensity = 0.5,
  distressLevel = 0
): MockEmotionAnalysis {
  return {
    primary: emotion,
    secondary: null,
    intensity,
    distressLevel,
    confidence: 0.8,
    valence: intensity > 0.5 ? 'positive' : 'neutral',
    markers: [],
    suggestedTone: 'warm',
  };
}

// ============================================================================
// MOCK SUB-SERVICES
// ============================================================================

/**
 * Create mock topic tracker
 */
export function createMockTopicTracker(): Record<string, Mock> {
  return {
    getCurrentTopic: vi.fn(() => 'general'),
    getPreviousTopic: vi.fn(() => undefined),
    recordTopic: vi.fn(),
    getTopicHistory: vi.fn(() => []),
    hasTopicChanged: vi.fn(() => false),
  };
}

/**
 * Create mock emotional memory
 */
export function createMockEmotionalMemory(): Record<string, Mock> {
  return {
    recordEmotion: vi.fn(),
    getEmotionalContext: vi.fn(() => ({
      primary: 'neutral',
      intensity: 0.5,
      trajectory: 'stable',
    })),
    getEmotionalHistory: vi.fn(() => []),
    getTrajectory: vi.fn(() => 'stable'),
  };
}

/**
 * Create mock emotion detector
 */
export function createMockEmotionDetector(): Record<string, Mock> {
  return {
    detect: vi.fn(() => createMockEmotionAnalysis()),
    detectFromVoice: vi.fn(() => createMockEmotionAnalysis()),
    detectMismatch: vi.fn(() => ({ hasMismatch: false })),
  };
}

/**
 * Create mock learning engine
 */
export function createMockLearningEngine(): Record<string, Mock> {
  return {
    recordInteraction: vi.fn(),
    getPreferences: vi.fn(() => ({})),
    getUserPatterns: vi.fn(() => ({})),
    recordFeedback: vi.fn(),
  };
}

/**
 * Create mock history tracker
 */
export function createMockHistoryTracker(): Record<string, Mock> {
  const turns: { role: string; content: string; timestamp: number }[] = [];

  return {
    addTurn: vi.fn((role: string, content: string) => {
      turns.push({ role, content, timestamp: Date.now() });
    }),
    getRecentTurns: vi.fn((count = 10) => turns.slice(-count)),
    getSimpleTurns: vi.fn(() => turns.map((t) => ({ role: t.role, content: t.content }))),
    getTurnCount: vi.fn(() => turns.length),
    getLastUserMessage: vi.fn(() => {
      const userTurns = turns.filter((t) => t.role === 'user');
      return userTurns[userTurns.length - 1]?.content || null;
    }),
    getLastAssistantMessage: vi.fn(() => {
      const assistantTurns = turns.filter((t) => t.role === 'assistant');
      return assistantTurns[assistantTurns.length - 1]?.content || null;
    }),
    clearHistory: vi.fn(() => {
      turns.length = 0;
    }),
  };
}

/**
 * Create mock conversation state
 */
export function createMockConversationState(): Record<string, Mock> {
  return {
    recordMessage: vi.fn(),
    getState: vi.fn(() => ({
      turnCount: 0,
      lastTopic: undefined,
      emotionalState: 'neutral',
    })),
    updateState: vi.fn(),
  };
}

/**
 * Create mock proactive insight engine
 */
export function createMockProactiveInsightEngine(): Record<string, Mock> {
  return {
    recordInteraction: vi.fn(),
    getInsights: vi.fn(() => []),
    suggestTopic: vi.fn(() => null),
  };
}

/**
 * Create mock cross-session threader
 */
export function createMockCrossSessionThreader(): Record<string, Mock> {
  return {
    recordThread: vi.fn(),
    getOpenThreads: vi.fn(() => []),
    resolveThread: vi.fn(),
  };
}

/**
 * Create mock response quality tracker
 */
export function createMockResponseQualityTracker(): Record<string, Mock> {
  return {
    recordResponse: vi.fn(),
    getQualityScore: vi.fn(() => 0.8),
    getRecommendations: vi.fn(() => []),
  };
}

/**
 * Create mock humor calibration
 */
export function createMockHumorCalibration(): Record<string, Mock> {
  return {
    shouldUseHumor: vi.fn(() => false),
    getHumorGuidance: vi.fn(() => ({
      shouldAttempt: false,
      type: null,
      avoid: [],
    })),
    recordHumorResponse: vi.fn(),
  };
}

/**
 * Create mock story preference
 */
export function createMockStoryPreference(): Record<string, Mock> {
  return {
    getPreference: vi.fn(() => null),
    recordStoryTold: vi.fn(),
    getStoryHistory: vi.fn(() => []),
  };
}

/**
 * Create mock voice pace adapter
 */
export function createMockVoicePaceAdapter(): Record<string, Mock> {
  return {
    getRecommendedPace: vi.fn(() => 'moderate'),
    getPaceContext: vi.fn(() => ({
      userPace: 'moderate',
      recommendedPace: 'moderate',
      paceGuidance: 'Match user pace',
    })),
    recordUserPace: vi.fn(),
  };
}

/**
 * Create mock conversation pattern analyzer
 */
export function createMockConversationPatternAnalyzer(): Record<string, Mock> {
  return {
    analyze: vi.fn(() => ({
      patterns: [],
      recommendations: [],
    })),
    recordPattern: vi.fn(),
  };
}

/**
 * Create mock communication mirroring
 */
export function createMockCommunicationMirroring(): Record<string, Mock> {
  return {
    getMirroringAdvice: vi.fn(() => null),
    recordUserStyle: vi.fn(),
  };
}

// ============================================================================
// COMPLETE MOCK SESSION SERVICES
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Mock session services type - use Record for flexibility in tests
 */
export type MockSessionServices = {
  sessionId: string;
  userId: string;
  personaId: string;
  analyze: any;
  addTurn: any;
  getRecentTurns: any;
  topicTracker: any;
  emotionalMemory: any;
  emotionDetector: any;
  learningEngine: any;
  historyTracker: any;
  conversationState: any;
  proactiveInsightEngine: any;
  crossSessionThreader: any;
  responseQualityTracker: any;
  humorCalibration: any;
  storyPreference: any;
  voicePaceAdapter: any;
  conversationPatternAnalyzer: any;
  communicationMirroring: any;
  updateHumanizingState: any;
  recordEasterEgg: any;
  isReturningUser: boolean;
  relationshipTurns: number;
  reset: any;
};

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Create complete mock session services
 */
export function createMockSessionServices(
  options: MockSessionServicesOptions = {}
): MockSessionServices {
  const {
    userId = 'test-user-123',
    sessionId = 'test-session-456',
    personaId = 'ferni',
    isReturningUser = false,
    relationshipTurns = 0,
  } = options;

  return {
    // Core identifiers
    sessionId,
    userId,
    personaId,

    // Analysis
    analyze: vi.fn(() => createMockAnalysis()),

    // Turn management
    addTurn: vi.fn(),
    getRecentTurns: vi.fn(() => []),

    // Sub-services
    topicTracker: createMockTopicTracker(),
    emotionalMemory: createMockEmotionalMemory(),
    emotionDetector: createMockEmotionDetector(),
    learningEngine: createMockLearningEngine(),
    historyTracker: createMockHistoryTracker(),
    conversationState: createMockConversationState(),
    proactiveInsightEngine: createMockProactiveInsightEngine(),
    crossSessionThreader: createMockCrossSessionThreader(),
    responseQualityTracker: createMockResponseQualityTracker(),
    humorCalibration: createMockHumorCalibration(),
    storyPreference: createMockStoryPreference(),
    voicePaceAdapter: createMockVoicePaceAdapter(),
    conversationPatternAnalyzer: createMockConversationPatternAnalyzer(),
    communicationMirroring: createMockCommunicationMirroring(),

    // State management
    updateHumanizingState: vi.fn(),
    recordEasterEgg: vi.fn(),

    // User data
    isReturningUser,
    relationshipTurns,

    // Utility methods
    reset: vi.fn(),
  };
}

// ============================================================================
// MOCK USER DATA
// ============================================================================

/**
 * Create mock user data (context from job metadata)
 */
export function createMockUserData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    voiceEmotion: null,
    turnCount: 0,
    lastTopic: undefined,
    isReturningUser: false,
    bundleRuntimeState: {
      relationshipTurns: 0,
      currentMode: 'listening',
      storiesToldThisSession: [],
    },
    extensibilitySessionPrompt: undefined,
    ...overrides,
  };
}

// ============================================================================
// MOCK PERSONA CONFIG
// ============================================================================

/**
 * Create mock persona configuration
 */
export function createMockPersona(
  personaId = 'ferni',
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const personas: Record<string, Record<string, unknown>> = {
    ferni: {
      id: 'ferni',
      name: 'Ferni',
      description: 'A warm life coach',
      systemPrompt: 'You are Ferni, a warm and supportive life coach.',
      voice: { id: 'ferni-voice', name: 'Ferni Voice' },
      speechCharacteristics: { pace: 'moderate', warmth: 0.8, energy: 0.6 },
    },
    peter: {
      id: 'peter',
      name: 'Peter',
      description: 'A thoughtful researcher',
      systemPrompt: 'You are Peter, a curious and analytical researcher.',
      voice: { id: 'peter-voice', name: 'Peter Voice' },
      speechCharacteristics: { pace: 'slower', warmth: 0.6, energy: 0.4 },
    },
    alex: {
      id: 'alex',
      name: 'Alex',
      description: 'An energetic communicator',
      systemPrompt: 'You are Alex, an upbeat communications expert.',
      voice: { id: 'alex-voice', name: 'Alex Voice' },
      speechCharacteristics: { pace: 'faster', warmth: 0.7, energy: 0.9 },
    },
    maya: {
      id: 'maya',
      name: 'Maya',
      description: 'A calm habits coach',
      systemPrompt: 'You are Maya, a patient habits and routines specialist.',
      voice: { id: 'maya-voice', name: 'Maya Voice' },
      speechCharacteristics: { pace: 'slower', warmth: 0.8, energy: 0.3 },
    },
    jordan: {
      id: 'jordan',
      name: 'Jordan',
      description: 'A practical planner',
      systemPrompt: 'You are Jordan, an organized event planner.',
      voice: { id: 'jordan-voice', name: 'Jordan Voice' },
      speechCharacteristics: { pace: 'moderate', warmth: 0.6, energy: 0.7 },
    },
    nayan: {
      id: 'nayan',
      name: 'Nayan',
      description: 'A wise philosopher',
      systemPrompt: 'You are Nayan, a thoughtful wisdom guide.',
      voice: { id: 'nayan-voice', name: 'Nayan Voice' },
      speechCharacteristics: { pace: 'slower', warmth: 0.7, energy: 0.2 },
    },
  };

  const basePersona = personas[personaId] || personas.ferni;
  return { ...basePersona, ...overrides };
}

// ============================================================================
// SERVICES MODULE MOCK SETUP
// ============================================================================

/**
 * Setup services module mocks for vi.mock()
 */
export function setupServicesMocks(services?: ReturnType<typeof createMockSessionServices>): void {
  const mockServices = services || createMockSessionServices();

  // Session services
  vi.mock('../../../services/index.js', () => ({
    createSessionServices: vi.fn(() => mockServices),
    getSessionServices: vi.fn(() => mockServices),
  }));

  // Diagnostic logger
  vi.mock('../../../services/diagnostic-logger.js', () => ({
    diag: {
      user: vi.fn(),
      session: vi.fn(),
      state: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
  }));

  // Trust systems
  vi.mock('../../../services/trust-systems/unified-persistence.js', () => ({
    recordHealthTrend: vi.fn(),
    recordInsight: vi.fn(),
    loadUserTrustData: vi.fn().mockResolvedValue({}),
  }));

  // Cross-persona insights
  vi.mock('../../../services/cross-persona-insights.js', () => ({
    loadInsights: vi.fn().mockResolvedValue([]),
    formatInsightsForPrompt: vi.fn(() => ''),
    recordInsight: vi.fn(),
  }));

  // Health awareness
  vi.mock('../../../services/health-awareness/voice-biometrics.js', () => ({
    analyzeVoiceHealth: vi.fn().mockResolvedValue({}),
  }));

  // Identity
  vi.mock('../../../services/identity/human-first-2fa.js', () => ({
    processUserMessage: vi.fn().mockResolvedValue({}),
  }));

  // Outreach
  vi.mock('../../../services/outreach/conversation-extractor.js', () => ({
    extractAndProcess: vi.fn().mockResolvedValue(undefined),
  }));

  // Self-healing
  vi.mock('../../../services/self-healing/index.js', () => ({
    initSelfHealing: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn(),
    getCircuitState: vi.fn(() => 'closed'),
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createMockAnalysis,
  createMockEmotionAnalysis,
  createMockSessionServices,
  createMockUserData,
  createMockPersona,
  createMockTopicTracker,
  createMockEmotionalMemory,
  createMockEmotionDetector,
  createMockHistoryTracker,
  setupServicesMocks,
};
