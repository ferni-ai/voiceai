/**
 * Mock Infrastructure Index
 *
 * Central export point for all voice agent testing mocks.
 * Import from this file for comprehensive mock setup.
 *
 * @example
 * ```typescript
 * import {
 *   createMockJobContext,
 *   createMockLLMClient,
 *   createMockSessionServices,
 *   setupAllMocks,
 * } from './mocks/index.js';
 *
 * // Setup all mocks before imports
 * setupAllMocks();
 *
 * // Use mock factories in tests
 * const ctx = createMockJobContext('job-123');
 * const llm = createMockLLMClient();
 * const services = createMockSessionServices();
 * ```
 *
 * @module agents/__tests__/mocks
 */

// ============================================================================
// LIVEKIT MOCKS
// ============================================================================

export {
  createMockAudioTrack,
  createMockJobContext,
  createMockJobProcess,
  createMockLocalParticipant,
  // Factories
  createMockParticipant,
  createMockRemoteParticipant,
  createMockRoomWithUser,
  createMockVoicePipelineAgent,
  // Classes
  MockRoom,
  MockVoicePipelineAgent,
  // Setup
  setupLiveKitMocks,
  type MockJobContext,
  type MockJobProcess,
  // Types
  type MockParticipant,
  type MockRoomOptions,
  type MockTrack,
  type MockVoicePipelineOptions,
} from './livekit-mock.js';

// ============================================================================
// LLM MOCKS
// ============================================================================

export {
  // Factories
  createMockChatContext,
  createMockLLMClient,
  createMockLLMStream,
  createMockTimeoutStream,
  getMockResponseForEmotion,
  // Classes
  MockLLMClient,
  // Constants
  mockResponses,
  // Setup
  setupGoogleGenAIMocks,
  setupLiveKitGoogleMocks,
  type MockChatContext,
  type MockChatMessage,
  // Types
  type MockLLMOptions,
  type MockStreamChunk,
} from './llm-mock.js';

// ============================================================================
// TTS MOCKS
// ============================================================================

export {
  // Factories
  createMockAudioFrame,
  createMockAudioFrames,
  createMockCartesiaTTS,
  createMockTTSClient,
  getMockTTSForPersona,
  MockCartesiaTTS,
  // Classes
  MockTTSClient,
  // Constants
  mockVoiceCharacteristics,
  setupSileroMocks,
  // Setup
  setupTTSMocks,
  type MockAudioFrame,
  type MockSynthesisResult,
  type MockTTSEvent,
  // Types
  type MockTTSOptions,
} from './tts-mock.js';

// ============================================================================
// SERVICES MOCKS
// ============================================================================

export {
  // Factories
  createMockAnalysis,
  createMockEmotionalMemory,
  createMockEmotionAnalysis,
  createMockEmotionDetector,
  createMockHistoryTracker,
  createMockPersona,
  createMockSessionServices,
  createMockTopicTracker,
  createMockUserData,
  // Setup
  setupServicesMocks,
  type MockConversationAnalysis,
  // Types
  type MockEmotionAnalysis,
  type MockSessionServices,
  type MockSessionServicesOptions,
} from './services-mock.js';

// ============================================================================
// UNIFIED SETUP
// ============================================================================

import { vi } from 'vitest';
import { setupLiveKitMocks } from './livekit-mock.js';
import type { MockLLMClient } from './llm-mock.js';
import { setupGoogleGenAIMocks, setupLiveKitGoogleMocks } from './llm-mock.js';
import { createMockSessionServices, setupServicesMocks } from './services-mock.js';
import type { MockTTSClient } from './tts-mock.js';
import { setupSileroMocks, setupTTSMocks } from './tts-mock.js';

export interface SetupAllMocksOptions {
  /** Custom LLM client to use */
  llmClient?: MockLLMClient;
  /** Custom TTS client to use */
  ttsClient?: MockTTSClient;
  /** Custom session services configuration */
  servicesOptions?: Parameters<typeof createMockSessionServices>[0];
}

/**
 * Setup all mocks for voice agent testing
 *
 * Call this at the top of your test file, BEFORE any imports of the modules being tested.
 *
 * @example
 * ```typescript
 * // At the top of your test file
 * import { setupAllMocks } from './mocks/index.js';
 * setupAllMocks();
 *
 * // Then import modules to test (mocks are already in place)
 * import { processTurn } from '../processors/turn-processor.js';
 * ```
 */
export function setupAllMocks(options: SetupAllMocksOptions = {}): void {
  const { llmClient, ttsClient, servicesOptions } = options;

  // LiveKit SDK
  setupLiveKitMocks();

  // Google GenAI and LiveKit Google plugin
  setupGoogleGenAIMocks(llmClient);
  setupLiveKitGoogleMocks(llmClient);

  // TTS providers
  setupTTSMocks(ttsClient);
  setupSileroMocks();

  // Session services
  const services = servicesOptions ? createMockSessionServices(servicesOptions) : undefined;
  setupServicesMocks(services);

  // Additional internal mocks
  setupInternalMocks();
}

/**
 * Setup mocks for internal modules
 */
function setupInternalMocks(): void {
  // Handoff tools
  vi.mock('../../../tools/handoff/index.js', () => ({
    getAgentContext: vi.fn(() => 'You are Ferni, a warm and supportive life coach.'),
    getCurrentAgent: vi.fn(() => 'ferni'),
    updateUserContextForHandoff: vi.fn(),
  }));

  // Conversation engines
  vi.mock('../../../conversation/index.js', () => ({
    getConversationHumanizer: vi.fn(() => ({
      getHumanizingGuidance: vi.fn(() => null),
      processUserMessage: vi.fn(() => ({
        topicTransition: null,
        acknowledgment: null,
        catchphrase: null,
      })),
    })),
    getConversationRhythmTracker: vi.fn(() => ({
      recordTurn: vi.fn(),
      getRecommendation: vi.fn(() => null),
    })),
    getEmotionalArcTracker: vi.fn(() => ({
      recordEmotion: vi.fn(),
      getArc: vi.fn(() => ({
        currentEmotion: 'neutral',
        trajectory: 'stable',
        intensity: 0.5,
      })),
      getTrajectory: vi.fn(() => 'stable'),
      getTransitionPhrase: vi.fn(() => null),
      getResponseRecommendation: vi.fn(() => ({
        guidance: 'Be warm and supportive',
        approach: 'empathetic',
      })),
    })),
    getEngagementScorer: vi.fn(() => ({
      scoreEngagement: vi.fn(() => 0.7),
    })),
    getNarrativeArcTracker: vi.fn(() => ({
      recordEvent: vi.fn(),
      suggestNextBeat: vi.fn(() => null),
    })),
    getResponseDynamicsEngine: vi.fn(() => ({
      analyzeResponse: vi.fn(() => ({ suggestedLength: { min: 20, max: 100 } })),
      getRecommendedLength: vi.fn(() => ({ min: 20, max: 100, guidance: 'Normal response' })),
      recordMessage: vi.fn(),
      getLengthGuidance: vi.fn(() => ({ min: 20, max: 100, guidance: 'Normal response' })),
      getTopicTransition: vi.fn(() => null),
      getPacingAnalysis: vi.fn(() => ({
        userPacing: 'moderate',
        recommendedPacing: 'moderate',
      })),
    })),
    getSilencePresenceEngine: vi.fn(() => ({
      shouldUseSilence: vi.fn(() => false),
    })),
    getStoryTimingEngine: vi.fn(() => ({
      checkStoryOpportunity: vi.fn(() => null),
      evaluateStoryTiming: vi.fn(() => ({
        shouldTell: false,
        story: null,
      })),
    })),
  }));

  // Humanizing context
  vi.mock('../../../intelligence/context-builders/humanizing.js', () => ({
    buildHumanizingContext: vi.fn(() => ({
      shouldMoodShift: false,
      moodShift: null,
      summary: 'Test humanizing summary',
    })),
    formatHumanizingForPrompt: vi.fn(() => 'Humanizing prompt'),
    getHumanizingSummary: vi.fn(() => 'Test summary'),
    getMoodShift: vi.fn(() => null),
    shouldMoodShift: vi.fn(() => false),
  }));

  vi.mock('../../../intelligence/context-builders/humanizing-debug.js', () => ({
    logHumanizingResult: vi.fn(),
    logValidation: vi.fn(),
  }));

  vi.mock('../../../intelligence/context-builders/conversation-humanizing.js', () => ({
    buildConversationHumanizingContext: vi.fn(() => ({})),
    formatConversationHumanizingForPrompt: vi.fn(() => ''),
  }));

  // Speech modules
  vi.mock('../../../speech/response-naturalness.js', () => ({
    getResponseEnhancements: vi.fn(() => ({
      acknowledgment: null,
      catchphrase: null,
    })),
  }));

  vi.mock('../../../speech/emotion-matching.js', () => ({
    getEmotionGuidance: vi.fn(() => ({
      emotion: 'neutral',
      intensity: 0.5,
    })),
  }));

  vi.mock('../../../speech/text-voice-mismatch.js', () => ({
    buildMismatchGuidance: vi.fn(() => ''),
    detectMismatch: vi.fn(() => ({
      hasMismatch: false,
      textEmotion: 'neutral',
      voiceEmotion: 'neutral',
      confidence: 0,
    })),
    recordMismatchInsight: vi.fn(),
  }));

  vi.mock('../../../speech/adaptive-ssml.js', () => ({
    detectVocalCues: vi.fn(() => ({})),
  }));

  // Injection builders
  vi.mock('../../processors/injection-builders.js', () => ({
    buildAdvancedHumanizationInjections: vi.fn(() => ({
      injections: [],
      emotionForTTS: null,
      breathGroupPacing: null,
      rhythmVariation: null,
    })),
    buildAmbientAwarenessInjections: vi.fn(() => []),
    buildBoundaryCheckInjections: vi.fn(() => []),
    buildConversationDynamicsInjections: vi.fn(() => []),
    buildCrossPersonaInsightsInjection: vi.fn(() => []),
    buildHealthAwarenessInjections: vi.fn(() => []),
    buildHumanLevelInjections: vi.fn(() => []),
    buildLifeCoachingInjections: vi.fn(() => []),
    buildSafetyInjections: vi.fn(() => []),
    buildScientificCoachingInjections: vi.fn(() => []),
    buildTrustSystemsInjections: vi.fn(() => []),
  }));

  // Session state
  vi.mock('../../session/session-state.js', () => ({
    extractPersonalThemes: vi.fn(() => []),
    createInitialSessionState: vi.fn(() => ({
      sessionId: 'test-session',
      personaId: 'ferni',
      user: { isReturningUser: false },
      conversation: { turnCount: 0 },
    })),
    createSessionStateManager: vi.fn(() => ({
      getState: vi.fn(() => ({})),
      incrementTurn: vi.fn(),
      setLastUserMessage: vi.fn(),
      setEmotionAnalysis: vi.fn(),
      setTopic: vi.fn(),
    })),
  }));

  // E2E diagnostics
  vi.mock('../../shared/e2e-diagnostics.js', () => ({
    e2e: {
      workerStarting: vi.fn(),
      workerReady: vi.fn(),
      jobReceived: vi.fn(),
      jobAccepted: vi.fn(),
      sessionConnected: vi.fn(),
      sessionStarted: vi.fn(),
      sessionEnded: vi.fn(),
      custom: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      healthCheck: vi.fn(() => ({})),
      logSummary: vi.fn(),
    },
    startHealthLogging: vi.fn(),
    stopHealthLogging: vi.fn(),
  }));
}

/**
 * Reset all mocks between tests
 */
export function resetAllMocks(): void {
  vi.clearAllMocks();
}

/**
 * Restore all mocks after tests
 */
export function restoreAllMocks(): void {
  vi.restoreAllMocks();
}
