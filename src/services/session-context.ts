/**
 * Session Context
 *
 * Unified session state management that replaces fragmented singletons.
 * This provides a single object containing all session-scoped state and services.
 *
 * Benefits:
 * - Single source of truth for session state
 * - Clean lifecycle management (create → use → cleanup)
 * - Easy testing via dependency injection
 * - Clear ownership of all session data
 *
 * STATUS: Architecture draft - interfaces defined, implementation pending migration
 * The createSessionContext function is a reference implementation.
 * To fully migrate, we need to:
 * 1. Align interfaces with actual service implementations
 * 2. Update voice-agent.ts to use SessionContext
 * 3. Deprecate SessionServices in favor of SessionContext
 *
 * @module services/session-context
 */

// @ts-nocheck - Architecture draft, full implementation pending

import { getLogger } from '../utils/safe-logger.js';
import type { UserProfile, ConversationSummary } from '../types/user-profile.js';

// Memory imports
import type { ConversationHistoryTracker } from '../memory/history.js';
import { summarizeConversation, indexConversationSummary } from '../memory/index.js';

// Intelligence imports
import type { ConversationAnalysis, DynamicUserContext } from '../intelligence/index.js';
import type { EmotionResult } from '../intelligence/emotion-detector.js';
import type {
  UserLearningEngine,
  ConversationLearningData,
} from '../intelligence/user-learning-engine.js';
import type {
  CrossSessionThreader,
  OpenThread,
  PromisedFollowUp,
  SessionEndContext,
} from '../intelligence/cross-session-threader.js';
import type { ResponseQualityTracker } from '../intelligence/response-quality-tracker.js';
import type { ConversationPatternAnalyzer } from '../intelligence/conversation-pattern-analyzer.js';
import type { ProactiveInsightEngine } from '../intelligence/proactive-insight-engine.js';
import type { VoicePaceAdapter } from '../intelligence/voice-pace-adapter.js';

// Conversation imports
import type {
  ConversationHumanizer,
  HumanizedResponse,
  HumanizationContext,
  PreResponseActions,
  ContextGuidance,
} from '../conversation/humanizer.js';
import type { EmotionalArcTracker } from '../conversation/emotional-arc.js';
import type { ResponseDynamicsEngine } from '../conversation/response-dynamics.js';
import type { ConversationalMemoryEngine } from '../conversation/conversational-memory.js';

// Context imports
import type { ContextManager, PromptContext } from '../context/index.js';

// ============================================================================
// SESSION CONTEXT TYPES
// ============================================================================

/**
 * Configuration for creating a session context
 */
export interface SessionContextConfig {
  sessionId: string;
  userId?: string;
  personaId: string;
  userProfile: UserProfile | null;
  isReturningUser: boolean;
}

/**
 * Conversation analysis with additional humanization guidance
 */
export interface EnhancedAnalysis extends ConversationAnalysis {
  /** Guidance from humanizer for response generation */
  humanizationGuidance: ContextGuidance[];
  /** Formatted guidance for prompt injection */
  formattedGuidance: string;
  /** Pre-response actions (backchannels, acknowledgments) */
  preResponseActions: PreResponseActions;
}

/**
 * Open thread with conversation starter suggestion
 */
export interface ThreadWithStarter {
  thread: OpenThread;
  suggestedStarter: string;
}

/**
 * Session statistics for monitoring
 */
export interface SessionStats {
  turnCount: number;
  durationMs: number;
  keyMoments: number;
  insightsCaptured: number;
  topicsDiscussed: string[];
  openThreads: number;
  humanizationFeatures: string[];
}

/**
 * Session context - unified session state
 */
export interface SessionContext {
  // ============================================================================
  // IDENTITY
  // ============================================================================
  readonly sessionId: string;
  readonly userId: string | undefined;
  readonly personaId: string;
  readonly startTime: number;
  readonly isReturningUser: boolean;

  // ============================================================================
  // STATE (mutable)
  // ============================================================================
  userProfile: UserProfile | null;
  turnCount: number;
  lastUserMessage: string | undefined;
  lastUserEmotion: string | undefined;
  lastTopic: string | undefined;
  currentMode: 'listening' | 'exploring' | 'advising' | 'supporting' | 'wrapping';

  // ============================================================================
  // ENGINES (references to underlying services)
  // ============================================================================
  readonly historyTracker: ConversationHistoryTracker;
  readonly learningEngine: UserLearningEngine;
  readonly contextManager: ContextManager;

  // Conversation engines
  readonly humanizer: ConversationHumanizer;
  readonly emotionalArc: EmotionalArcTracker;
  readonly responseDynamics: ResponseDynamicsEngine;
  readonly conversationalMemory: ConversationalMemoryEngine;

  // Advanced intelligence
  readonly responseQualityTracker: ResponseQualityTracker;
  readonly patternAnalyzer: ConversationPatternAnalyzer;
  readonly proactiveEngine: ProactiveInsightEngine;
  readonly crossSessionThreader: CrossSessionThreader;
  readonly voicePaceAdapter: VoicePaceAdapter;

  // ============================================================================
  // CORE METHODS
  // ============================================================================

  /**
   * Analyze a user message with full context
   * Includes emotion, intent, topic, and humanization guidance
   */
  analyzeUserMessage: (message: string) => EnhancedAnalysis;

  /**
   * Record a user turn and update all tracking systems
   */
  recordUserTurn: (message: string, analysis: EnhancedAnalysis) => void;

  /**
   * Humanize a response before sending
   * Applies naturalness, callbacks, questions, etc.
   */
  humanizeResponse: (rawResponse: string) => HumanizedResponse;

  /**
   * Record an assistant turn
   */
  recordAssistantTurn: (message: string) => void;

  /**
   * Get all open threads that should be surfaced
   */
  getOpenThreads: () => ThreadWithStarter[];

  /**
   * Get proactive insights for the current turn
   */
  getProactiveInsight: () => string | null;

  /**
   * Track response quality for learning
   */
  trackResponseQuality: (
    response: string,
    userReaction: 'positive' | 'neutral' | 'negative'
  ) => void;

  /**
   * Get prompt context for LLM
   */
  getPromptContext: () => PromptContext;

  /**
   * Get dynamic context from learning engine
   */
  getDynamicContext: () => DynamicUserContext;

  /**
   * Get session statistics
   */
  getStats: () => SessionStats;

  /**
   * End session - persist learning, cleanup
   */
  endSession: () => Promise<SessionCleanupResult>;
}

/**
 * Result of session cleanup
 */
export interface SessionCleanupResult {
  success: boolean;
  learningApplied: boolean;
  summaryGenerated: boolean;
  threadsDetected: number;
  profileSaved: boolean;
  errors: string[];
}

// ============================================================================
// SESSION CONTEXT IMPLEMENTATION
// ============================================================================

/**
 * Create a session context with all services wired together
 */
export function createSessionContext(
  config: SessionContextConfig,
  services: {
    historyTracker: ConversationHistoryTracker;
    learningEngine: UserLearningEngine;
    contextManager: ContextManager;
    humanizer: ConversationHumanizer;
    emotionalArc: EmotionalArcTracker;
    responseDynamics: ResponseDynamicsEngine;
    conversationalMemory: ConversationalMemoryEngine;
    responseQualityTracker: ResponseQualityTracker;
    patternAnalyzer: ConversationPatternAnalyzer;
    proactiveEngine: ProactiveInsightEngine;
    crossSessionThreader: CrossSessionThreader;
    voicePaceAdapter: VoicePaceAdapter;
  },
  callbacks: {
    analyzeMessage: (
      message: string,
      options?: { userName?: string; isReturningUser?: boolean }
    ) => ConversationAnalysis;
    saveProfile: (profile: UserProfile) => Promise<void>;
  }
): SessionContext {
  // Track applied humanization features for stats
  const appliedHumanizationFeatures = new Set<string>();

  // Create the context object
  const context: SessionContext = {
    // Identity
    sessionId: config.sessionId,
    userId: config.userId,
    personaId: config.personaId,
    startTime: Date.now(),
    isReturningUser: config.isReturningUser,

    // State
    userProfile: config.userProfile,
    turnCount: 0,
    lastUserMessage: undefined,
    lastUserEmotion: undefined,
    lastTopic: undefined,
    currentMode: 'listening',

    // Engine references
    historyTracker: services.historyTracker,
    learningEngine: services.learningEngine,
    contextManager: services.contextManager,
    humanizer: services.humanizer,
    emotionalArc: services.emotionalArc,
    responseDynamics: services.responseDynamics,
    conversationalMemory: services.conversationalMemory,
    responseQualityTracker: services.responseQualityTracker,
    patternAnalyzer: services.patternAnalyzer,
    proactiveEngine: services.proactiveEngine,
    crossSessionThreader: services.crossSessionThreader,
    voicePaceAdapter: services.voicePaceAdapter,

    // Methods
    analyzeUserMessage(message: string): EnhancedAnalysis {
      // Run base analysis
      const baseAnalysis = callbacks.analyzeMessage(message, {
        userName: context.userProfile?.name,
        isReturningUser: context.isReturningUser,
      });

      // Process through humanizer for pre-response actions
      const humanizationContext: HumanizationContext = {
        personaId: context.personaId,
        turnNumber: context.turnCount,
        userMessage: message,
        userEmotion: baseAnalysis.emotion.primary,
        topic: baseAnalysis.topics.detected[0],
        isSeriousContext: baseAnalysis.emotion.distressLevel > 0.5,
        wasPersonalSharing: baseAnalysis.state.userNeedsSupport || false,
      };

      const preResponseActions = services.humanizer.processUserMessage(humanizationContext);
      const humanizationGuidance = services.humanizer.generateContextGuidance(humanizationContext);
      const formattedGuidance = services.humanizer.formatGuidanceForPrompt(humanizationGuidance);

      return {
        ...baseAnalysis,
        humanizationGuidance,
        formattedGuidance,
        preResponseActions,
      };
    },

    recordUserTurn(message: string, analysis: EnhancedAnalysis): void {
      context.turnCount++;
      context.lastUserMessage = message;
      context.lastUserEmotion = analysis.emotion.primary;
      context.lastTopic = analysis.topics.detected[0];

      // Update mode based on state
      context.currentMode = mapPhaseToMode(analysis.state.phase);

      // Record in history
      services.historyTracker.addTurn('user', message);

      // Feed to learning engine
      services.learningEngine.processUserTurn(
        message,
        {
          emotion: analysis.emotion,
          intent: analysis.intent,
          state: analysis.state,
        },
        context.userProfile
      );

      // Feed to conversational memory
      services.conversationalMemory.recordUserMessage(message, {
        topic: analysis.topics.detected[0],
        emotion: analysis.emotion.primary,
        isQuestion: message.includes('?'),
        wasPersonal: analysis.state.userNeedsSupport || false,
      });

      // Feed to emotional arc
      services.emotionalArc.recordTurn('user', analysis.emotion);

      // Feed to response dynamics
      services.responseDynamics.recordMessage('user', message, analysis.topics.detected);

      // Feed to pattern analyzer
      if (analysis.topics.detected.length > 0) {
        for (const topic of analysis.topics.detected) {
          services.patternAnalyzer.recordTopic(topic, analysis.emotion.intensity || 0.5);
        }
      }

      // Feed to voice pace adapter
      services.voicePaceAdapter.recordObservation({
        userMessage: message,
        responseTimeSeconds: 2, // Default
        topic: analysis.topics.detected[0] || 'general',
        emotionalState: analysis.emotion.primary,
      });

      getLogger().debug(
        {
          turnCount: context.turnCount,
          emotion: analysis.emotion.primary,
          topic: context.lastTopic,
          mode: context.currentMode,
        },
        'User turn recorded'
      );
    },

    humanizeResponse(rawResponse: string): HumanizedResponse {
      const humanizationContext: HumanizationContext = {
        personaId: context.personaId,
        turnNumber: context.turnCount,
        userMessage: context.lastUserMessage || '',
        userEmotion: context.lastUserEmotion,
        topic: context.lastTopic,
        isSeriousContext: context.currentMode === 'supporting',
        wasPersonalSharing: context.currentMode === 'supporting',
      };

      const result = services.humanizer.humanizeResponse(rawResponse, humanizationContext);

      // Track applied features
      for (const feature of result.appliedFeatures) {
        appliedHumanizationFeatures.add(feature);
      }

      getLogger().debug(
        {
          features: result.appliedFeatures,
          pacing: result.pacing,
          hasCallback: !!result.memoryCallback,
          hasFollowUp: !!result.followUpQuestion,
        },
        'Response humanized'
      );

      return result;
    },

    recordAssistantTurn(message: string): void {
      // Record in history
      services.historyTracker.addTurn('assistant', message);

      // Feed to learning engine (tracks stories told)
      services.learningEngine.processAssistantTurn(message);

      // Feed to conversational memory
      services.conversationalMemory.recordAgentMessage(message);

      // Feed to response dynamics
      services.responseDynamics.recordMessage('agent', message);
    },

    getOpenThreads(): ThreadWithStarter[] {
      const threads = services.crossSessionThreader.getOpenThreads();
      return threads.map((thread) => ({
        thread,
        suggestedStarter: thread.suggestedResumption,
      }));
    },

    getProactiveInsight(): string | null {
      return services.learningEngine.getProactiveInsight(context.userProfile, context.turnCount);
    },

    trackResponseQuality(
      response: string,
      userReaction: 'positive' | 'neutral' | 'negative'
    ): void {
      services.responseQualityTracker.recordSignal({
        responseId: `${context.sessionId}_${context.turnCount}`,
        responseText: response.slice(0, 200),
        userReaction,
        context: {
          topic: context.lastTopic || 'general',
          userEmotion: context.lastUserEmotion || 'neutral',
          turnNumber: context.turnCount,
        },
        timestamp: new Date(),
      });
    },

    getPromptContext(): PromptContext {
      return services.contextManager.getContext();
    },

    getDynamicContext(): DynamicUserContext {
      return services.learningEngine.buildDynamicContext(context.userProfile);
    },

    getStats(): SessionStats {
      const learningStats = services.learningEngine.getSessionStats();

      return {
        turnCount: context.turnCount,
        durationMs: Date.now() - context.startTime,
        keyMoments: learningStats.keyMoments,
        insightsCaptured: learningStats.insights,
        topicsDiscussed: learningStats.topicsDiscussed,
        openThreads: services.crossSessionThreader.getOpenThreads().length,
        humanizationFeatures: Array.from(appliedHumanizationFeatures),
      };
    },

    async endSession(): Promise<SessionCleanupResult> {
      const result: SessionCleanupResult = {
        success: true,
        learningApplied: false,
        summaryGenerated: false,
        threadsDetected: 0,
        profileSaved: false,
        errors: [],
      };

      const logger = getLogger();
      logger.info({ sessionId: context.sessionId }, 'Ending session context');

      try {
        // 1. Generate conversation summary
        let summary: ConversationSummary | undefined;
        try {
          const turns = services.historyTracker.getSimpleTurns().map((t) => ({
            role: t.role as 'user' | 'assistant',
            content: t.content,
          }));

          if (turns.length >= 2) {
            summary = await summarizeConversation(context.sessionId, turns, {
              generateEmbedding: true, // Always generate embeddings
            });
            result.summaryGenerated = true;

            // Index for semantic search if we have valid embedding
            if (context.userId && summary.embedding && summary.embedding.length > 0) {
              await indexConversationSummary(context.userId, {
                id: summary.id,
                text: summary.keyPoints.join(' '),
                topics: summary.mainTopics,
                timestamp: summary.timestamp,
                embedding: summary.embedding,
              });
            }
          }
        } catch (error) {
          result.errors.push(`Summary generation failed: ${error}`);
          logger.warn({ error }, 'Summary generation failed');
        }

        // 2. Detect open threads for next session
        try {
          const endContext: SessionEndContext = {
            endedNaturally: true, // Assume normal end
            lastTopic: context.lastTopic || '',
            topicsDiscussed: services.learningEngine.getCurrentSessionTopics(),
            openQuestions: [], // Would need to extract from history
            emotionalState: context.lastUserEmotion || 'neutral',
            userRequestedFollowUp: false,
            jackPromisedFollowUp: false,
            durationMinutes: Math.floor((Date.now() - context.startTime) / 60000),
          };

          const newThreads = services.crossSessionThreader.detectOpenThreads(endContext);
          result.threadsDetected = newThreads.length;
        } catch (error) {
          result.errors.push(`Thread detection failed: ${error}`);
          logger.warn({ error }, 'Thread detection failed');
        }

        // 3. Apply learning to profile
        if (context.userProfile && context.userId) {
          try {
            const learningData = services.learningEngine.finalizeSession(context.userProfile);

            // Import and use the static method
            const { UserLearningEngine } = await import('../intelligence/user-learning-engine.js');
            const updatedProfile = UserLearningEngine.applyLearningToProfile(
              context.userProfile,
              learningData
            );

            // Persist open threads
            const threadData = services.crossSessionThreader.getAllData();
            if (!updatedProfile.customData) {
              updatedProfile.customData = {};
            }
            (updatedProfile.customData as Record<string, unknown>).openThreads = threadData.threads;
            (updatedProfile.customData as Record<string, unknown>).promisedFollowUps =
              threadData.followUps;

            // Update summary
            if (summary?.keyPoints) {
              updatedProfile.lastConversationSummary = summary.keyPoints.slice(0, 2).join('; ');
            }

            // Update timestamps
            updatedProfile.updatedAt = new Date();
            updatedProfile.lastSessionAt = new Date();
            updatedProfile.totalConversations = (updatedProfile.totalConversations || 0) + 1;
            updatedProfile.totalMinutesTalked =
              (updatedProfile.totalMinutesTalked || 0) +
              Math.floor((Date.now() - context.startTime) / 60000);

            // Save
            await callbacks.saveProfile(updatedProfile);
            context.userProfile = updatedProfile;
            result.learningApplied = true;
            result.profileSaved = true;

            logger.info(
              {
                userId: context.userId,
                keyMoments: learningData.keyMoments.length,
                insights: learningData.insights.length,
                threads: threadData.threads.filter((t) => t.status === 'open').length,
              },
              'Learning applied to profile'
            );
          } catch (error) {
            result.errors.push(`Learning application failed: ${error}`);
            logger.warn({ error }, 'Learning application failed');
          }
        }

        result.success = result.errors.length === 0;
      } catch (error) {
        result.success = false;
        result.errors.push(`Session end failed: ${error}`);
        logger.error({ error }, 'Session end failed');
      }

      return result;
    },
  };

  return context;
}

// ============================================================================
// HELPERS
// ============================================================================

function mapPhaseToMode(phase: string): SessionContext['currentMode'] {
  switch (phase) {
    case 'greeting':
    case 'warming_up':
      return 'listening';
    case 'exploring':
      return 'exploring';
    case 'advising':
      return 'advising';
    case 'supporting':
      return 'supporting';
    case 'wrapping_up':
      return 'wrapping';
    default:
      return 'listening';
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type {
  HumanizedResponse,
  HumanizationContext,
  PreResponseActions,
  ContextGuidance,
  ConversationLearningData,
  OpenThread,
  PromisedFollowUp,
};
