/**
 * Services Type Definitions
 *
 * Core interfaces for the services layer.
 * Separated for clean imports without circular dependencies.
 */

import type { UserProfile } from '../types/user-profile.js';
import type { MemoryStore, VectorStore, ConversationHistoryTracker } from '../memory/index.js';
import type { FirestoreVectorStore } from '../memory/firestore-vector-store.js';
import type { ContextManager, PromptContext } from '../context/index.js';
import type { SpeechContext } from '../speech/index.js';
import type {
  ConversationAnalysis,
  EmotionResult,
  IntentResult,
  ConversationState,
  DynamicUserContext,
  ResponseQualityTracker,
  ConversationPatternAnalyzer,
  ProactiveInsightEngine,
  FinancialJourneyTracker,
  CrossSessionThreader,
  VoicePaceAdapter,
  UserLearningEngine,
  // Human-level interaction engines
  HumorCalibrationEngine,
  StoryPreferenceEngine,
  CommunicationMirroringEngine,
  EmotionalMemoryEngine,
} from '../intelligence/index.js';
import type { InsightGenerationResult } from '../intelligence/proactive-insight-engine.js';
import type { OpenThread } from '../intelligence/cross-session-threader.js';
import type { HumanizingStateUpdate } from './humanizing-state.js';
import type { HandoffState } from '../tools/handoff-state.js';

// ============================================================================
// SESSION SERVICES
// ============================================================================

/**
 * Session services - created per conversation
 */
export interface SessionServices {
  sessionId: string;
  userId?: string;
  personaId?: string; // Current persona ID for persona-specific memory retrieval
  sessionStartTime: number; // Timestamp when session started
  realtimeConversationId?: string; // Firestore conversation ID for real-time turn persistence

  // Handoff State (per-session, not global)
  // Fixes BUG #1-4: Global state cross-session contamination
  handoffState: HandoffState;

  // Profile & Memory
  userProfile: UserProfile | null;
  historyTracker: ConversationHistoryTracker;
  contextManager: ContextManager;
  learningEngine: UserLearningEngine;

  // Advanced Intelligence Engines
  responseQualityTracker: ResponseQualityTracker;
  patternAnalyzer: ConversationPatternAnalyzer;
  proactiveEngine: ProactiveInsightEngine;
  journeyTracker: FinancialJourneyTracker;
  crossSessionThreader: CrossSessionThreader;
  voicePaceAdapter: VoicePaceAdapter;

  // Human-Level Interaction Engines
  humorCalibration: HumorCalibrationEngine;
  storyPreference: StoryPreferenceEngine;
  communicationMirroring: CommunicationMirroringEngine;
  emotionalMemory: EmotionalMemoryEngine;

  // Methods
  analyze: (message: string) => ConversationAnalysis;
  addTurn: (role: 'user' | 'assistant', content: string, durationMs?: number) => void;
  getPromptContext: () => PromptContext;
  getDynamicContext: () => DynamicUserContext;
  getEnhancedPromptContext: () => string;
  getSpeechContext: (text?: string, userEmotion?: string) => SpeechContext;
  tagWithSsml: (text: string) => string;
  searchKnowledge: (query: string) => Promise<string | null>;
  searchPastConversations: (query: string) => Promise<string | null>;
  trackResponseQuality: (
    response: string,
    userReaction: 'positive' | 'neutral' | 'negative'
  ) => void;
  /**
   * Record a full response quality signal for advanced learning
   * This is the preferred method for tracking agent response effectiveness
   */
  recordResponseSignal: (params: {
    agentResponse: string;
    userResponse: string;
    topic: string;
    conversationPhase: string;
    emotion?: { primary: string; intensity: number };
  }) => void;
  captureInsight: (type: string, key: string, value: unknown, confidence: number) => void;
  getProactiveInsights: () => Promise<InsightGenerationResult & { suggestedInsightId?: string }>;
  /** Mark a proactive insight as delivered (for tracking) */
  markInsightDelivered: (insightId: string) => void;
  getOpenThreads: () => OpenThread[];
  /** Get a natural conversation starter from open threads */
  getThreadConversationStarter: () => string | null;
  /** Get thread context formatted for prompt injection */
  getThreadContextForPrompt: () => string;
  saveProfile: () => Promise<void>;
  updateHumanizingState: (update: HumanizingStateUpdate) => void;
  endSession: () => Promise<void>;
}

// ============================================================================
// GLOBAL SERVICES
// ============================================================================

/**
 * Global services - shared across sessions
 */
export interface GlobalServices {
  store: MemoryStore;
  vectorStore: VectorStore | FirestoreVectorStore;
  productivityStore: import('./productivity-store.js').default;
  backgroundTasks: import('./background-tasks.js').default;
  collectiveLearning: import('./collective-learning-store.js').CollectiveLearningStore;
  initialized: boolean;
}

// ============================================================================
// SESSION CREATION OPTIONS
// ============================================================================

/**
 * Options for creating a new session
 */
export interface CreateSessionOptions {
  sessionId: string;
  userId?: string;
  isReturningUser?: boolean;
  personaSpeech?: import('../personas/types.js').SpeechCharacteristics;
  personaEnergy?: number;
  personaId?: string;
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export type {
  UserProfile,
  ConversationAnalysis,
  EmotionResult,
  IntentResult,
  ConversationState,
  PromptContext,
  SpeechContext,
  DynamicUserContext,
  HumanizingStateUpdate,
};
