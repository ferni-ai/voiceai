/**
 * Services Type Definitions
 *
 * Core interfaces for the services layer.
 * Separated for clean imports without circular dependencies.
 */

import type { ContextManager, PromptContext } from '../context/index.js';
import type { OpenThread } from '../intelligence/tracking/cross-session.js';
import type {
  CommunicationMirroringEngine,
  ConversationAnalysis,
  ConversationPatternAnalyzer,
  ConversationState,
  CrossSessionThreader,
  DynamicUserContext,
  EmotionalMemoryEngine,
  EmotionResult,
  FinancialJourneyTracker,
  // Human-level interaction engines
  HumorCalibrationEngine,
  IntentResult,
  ProactiveInsightEngine,
  ResponseQualityTracker,
  StoryPreferenceEngine,
  // Superhuman Memory
  SuperhumanContext,
  UserLearningEngine,
  VoicePaceAdapter,
} from '../intelligence/index.js';
import type { InsightGenerationResult } from '../intelligence/proactive-insight-engine.js';
import type { FirestoreVectorStore } from '../memory/firestore-vector-store.js';
import type { ConversationHistoryTracker, MemoryStore, VectorStore } from '../memory/index.js';
import type { SpeechContext } from '../speech/index.js';
import type { HandoffState } from './handoff/handoff-state.js';
import type { UserProfile } from '../types/user-profile.js';
import type { HumanizingStateUpdate } from './humanizing-state.js';

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

  // Session Priming (cross-session continuity)
  sessionPriming?: {
    suggestedOpener: string;
    openThreads: Array<{ topic: string; urgency: 'high' | 'medium' | 'low' }>;
    pendingFollowUps: Array<{ topic: string; dueDate?: string }>;
    emotionalContext?: { trend: string; lastEmotion?: string };
    relationshipContext?: { stage: string; sessionsCount: number };
    naturalGreetingHints: string[];
  };

  // Superhuman Memory Context - "Better than Human" proactive intelligence
  superhumanContext?: SuperhumanContext;

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
    /** Story ID if a story was told in the previous response */
    storyId?: string;
    /** Question pattern if a breakthrough question was asked */
    questionAsked?: string;
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

  // Superhuman Memory Methods
  /** Get superhuman memory context with proactive insights */
  getSuperhumanContext: () => SuperhumanContext | undefined;
  /** Refresh superhuman context with current conversation state */
  refreshSuperhumanContext: (options?: {
    detectedEmotion?: string;
    detectedStressLevel?: number;
    currentTopic?: string;
  }) => void;
  /** Mark a superhuman insight as delivered */
  markSuperhumanInsightDelivered: (insightId: string) => void;
  /** Get superhuman memory prompt injection (formatted for LLM) */
  getSuperhumanPromptInjection: () => string;
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
  productivityStore: import('./stores/productivity-store.js').default;
  backgroundTasks: import('./scheduling/background-tasks.js').default;
  collectiveLearning: import('./memory/collective-learning-store.js').CollectiveLearningStore;
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
  /** User's name from onboarding or auth - persisted to Firestore on profile creation */
  userName?: string;
  isReturningUser?: boolean;
  personaSpeech?: import('../personas/types.js').SpeechCharacteristics;
  personaEnergy?: number;
  personaId?: string;
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export type {
  ConversationAnalysis,
  ConversationState,
  DynamicUserContext,
  EmotionResult,
  HumanizingStateUpdate,
  IntentResult,
  PromptContext,
  SpeechContext,
  UserProfile,
};
