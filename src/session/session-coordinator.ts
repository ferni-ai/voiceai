/**
 * Session Intelligence Coordinator
 *
 * Orchestrates the flow between four core modules for each conversation turn:
 *
 * 1. Memory - Retrieves relevant context from past conversations
 * 2. Intelligence - Analyzes the user message (emotion, intent, topics)
 * 3. Personality - Determines what personal moments/callbacks are relevant
 * 4. Conversation - Humanizes the response after LLM generation
 *
 * This coordinator provides a clean integration point that:
 * - Reduces coupling between modules
 * - Ensures consistent data flow
 * - Optimizes retrieval timing
 * - Provides unified session state
 *
 * @module session/session-coordinator
 */

import type { PersonaConfig } from '../personas/types.js';
import type { UserProfile } from '../types/user-profile.js';
import { createLogger } from '../utils/safe-logger.js';

// Memory module
import {
  getUnifiedEmotionalMemory,
  type UnifiedEmotionalMemory,
} from '../memory/emotional-memory-unified.js';
import type { MemoryStore, RAGContext, VectorStore } from '../memory/index.js';
import { getRAGContext } from '../memory/index.js';

// Intelligence module
import {
  buildConversationContext,
  formatContextForPrompt,
  type ContextBuilderInput,
  type ContextInjection,
} from '../intelligence/context-builders/index.js';
import { analyze, type UnifiedAnalysisResult } from '../intelligence/unified-analyzer.js';

// Personality module
import {
  findRelevantMomentSemantic,
  formatCallbackForPrompt,
  getPendingCallbacksFromProfile,
} from '../personality/memory-adapter.js';
import { analyzeMessageTiming, type TimingAnalysis } from '../personality/timing-intelligence.js';
import type { RelevanceMatch } from '../personality/types.js';

// Conversation module (post-LLM humanization)
import {
  createConversationSession,
  type ConversationSession,
  type TurnInput,
  type TurnResult,
} from '../conversation/unified-integration.js';

const log = createLogger({ module: 'SessionCoordinator' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionCoordinatorConfig {
  userId: string;
  sessionId: string;
  personaId: string;
  persona: PersonaConfig;
  userProfile: UserProfile | null;
  memoryStore?: MemoryStore;
  vectorStore?: VectorStore;
  isReturningUser?: boolean;
}

export interface PreTurnContext {
  /** Memory-related context */
  memory: {
    relevantMemories: RAGContext | null;
    emotionalState: ReturnType<UnifiedEmotionalMemory['getState']>;
  };
  /** Intelligence analysis of user message */
  analysis: UnifiedAnalysisResult;
  /** Personality injections */
  personality: {
    relevantMoment: RelevanceMatch | null;
    pendingCallbacks: string[];
    timingGuidance: TimingAnalysis | null;
  };
  /** Context builder injections for LLM */
  contextInjections: ContextInjection[];
  /** Formatted context string for LLM prompt */
  formattedContext: string;
  /** Processing time */
  processingTimeMs: number;
}

export interface PostTurnContext {
  /** Humanized response */
  humanizedResponse: string;
  /** Turn result from conversation module */
  turnResult: TurnResult | null;
  /** Processing time */
  processingTimeMs: number;
}

// ============================================================================
// SESSION COORDINATOR
// ============================================================================

/**
 * Coordinates memory, intelligence, personality, and conversation modules
 */
export class SessionCoordinator {
  private userId: string;
  private sessionId: string;
  private personaId: string;
  private persona: PersonaConfig;
  private userProfile: UserProfile | null;
  private memoryStore?: MemoryStore;
  private vectorStore?: VectorStore;
  private isReturningUser: boolean;

  private emotionalMemory: UnifiedEmotionalMemory;
  private conversationSession: ConversationSession | null = null;
  private turnCount = 0;

  constructor(config: SessionCoordinatorConfig) {
    this.userId = config.userId;
    this.sessionId = config.sessionId;
    this.personaId = config.personaId;
    this.persona = config.persona;
    this.userProfile = config.userProfile;
    this.memoryStore = config.memoryStore;
    this.vectorStore = config.vectorStore;
    this.isReturningUser = config.isReturningUser ?? false;

    // Initialize emotional memory
    this.emotionalMemory = getUnifiedEmotionalMemory({
      userId: this.userId,
      personaId: this.personaId,
    });
    this.emotionalMemory.startSession(this.sessionId);

    log.debug(
      { userId: this.userId, sessionId: this.sessionId, personaId: this.personaId },
      'SessionCoordinator initialized'
    );
  }

  // ============================================================================
  // PRE-TURN PROCESSING (Before LLM)
  // ============================================================================

  /**
   * Process user message before sending to LLM
   *
   * Orchestrates:
   * 1. Memory retrieval (relevant past context)
   * 2. Intelligence analysis (emotion, intent, topics)
   * 3. Personality injection (callbacks, relevant moments)
   * 4. Context building (all injections formatted)
   */
  async processPreTurn(userMessage: string): Promise<PreTurnContext> {
    const startTime = Date.now();
    this.turnCount++;

    // 1. Memory Retrieval (parallel with analysis)
    const memoryPromise = this.retrieveMemoryContext(userMessage);

    // 2. Intelligence Analysis
    const analysis = await analyze({
      message: userMessage,
      userId: this.userId,
      sessionId: this.sessionId,
      userProfile: this.userProfile,
      isReturningUser: this.isReturningUser,
      turnNumber: this.turnCount,
    });

    // Wait for memory
    const relevantMemories = await memoryPromise;

    // 3. Personality Injection
    const personality = await this.getPersonalityContext(userMessage, analysis);

    // 4. Context Building
    const builderInput: ContextBuilderInput = {
      userText: userMessage,
      analysis: {
        emotion: {
          primary: analysis.emotion.primary,
          intensity: analysis.emotion.intensity,
          distressLevel: analysis.emotion.distressLevel,
          valence:
            analysis.emotion.valence > 0
              ? 'positive'
              : analysis.emotion.valence < 0
                ? 'negative'
                : 'neutral',
          needsSupport: analysis.signals.needsSupport,
          confidence: analysis.emotion.confidence,
        },
        intent: analysis.intent,
        topics: analysis.topics,
        state: analysis.state,
      },
      services: {
        sessionId: this.sessionId,
        userId: this.userId,
        sessionStartTime: Date.now(),
        userProfile: this.userProfile,
      },
      userData: {
        turnCount: this.turnCount,
        isReturningUser: this.isReturningUser,
        userName: this.userProfile?.name,
      },
      userProfile: this.userProfile,
      persona: this.persona,
    };

    const contextInjections = await buildConversationContext(builderInput);

    // Add personality injections
    if (personality.pendingCallbacks.length > 0) {
      contextInjections.push({
        id: 'personality_callback',
        source: 'personality',
        content: personality.pendingCallbacks[0],
        priority: 'high',
        category: 'personality',
      });
    }

    if (personality.relevantMoment) {
      contextInjections.push({
        id: 'personality_moment',
        source: 'personality',
        content: `[✨ PERSONAL MOMENT OPPORTUNITY] ${personality.relevantMoment.suggestedTransition}`,
        priority: 'standard',
        category: 'personality',
      });
    }

    // Update emotional memory with analysis
    if (analysis.emotion.primary !== 'neutral') {
      this.emotionalMemory.recordUserEmotion(
        analysis.emotion.primary,
        analysis.topics.detected[0] || 'general',
        userMessage.slice(0, 100),
        userMessage,
        analysis.emotion.intensity > 0.7
          ? 'strong'
          : analysis.emotion.intensity > 0.4
            ? 'moderate'
            : 'mild'
      );
    }

    // Format for LLM
    const formattedContext = formatContextForPrompt(contextInjections, {
      highEmotionMode: analysis.useHighEmotionMode,
    });

    const processingTimeMs = Date.now() - startTime;

    log.debug(
      {
        turnCount: this.turnCount,
        emotion: analysis.emotion.primary,
        injectionCount: contextInjections.length,
        processingTimeMs,
      },
      'Pre-turn processing complete'
    );

    return {
      memory: {
        relevantMemories,
        emotionalState: this.emotionalMemory.getState(),
      },
      analysis,
      personality,
      contextInjections,
      formattedContext,
      processingTimeMs,
    };
  }

  // ============================================================================
  // POST-TURN PROCESSING (After LLM)
  // ============================================================================

  /**
   * Process LLM response for humanization
   *
   * Orchestrates:
   * 1. Conversation humanization (naturalness, pacing, etc.)
   * 2. Bonding event recording
   */
  async processPostTurn(
    llmResponse: string,
    preTurnContext: PreTurnContext
  ): Promise<PostTurnContext> {
    const startTime = Date.now();

    // Ensure conversation session exists
    if (!this.conversationSession) {
      this.conversationSession = createConversationSession({
        sessionId: this.sessionId,
        userId: this.userId,
        personaId: this.personaId,
      });
    }

    // Process through conversation humanization
    let turnResult: TurnResult | null = null;
    let humanizedResponse = llmResponse;

    try {
      const turnInput: TurnInput = {
        userMessage: '', // User message from pre-turn (passed separately)
        rawResponse: llmResponse,
        userEmotion: preTurnContext.analysis.emotion.primary,
        topic: preTurnContext.analysis.topics.detected[0],
        wasPersonalSharing: preTurnContext.analysis.signals.isPersonalSharing,
      };

      turnResult = await this.conversationSession.processTurn(turnInput);
      humanizedResponse = turnResult.text || llmResponse;
    } catch (error) {
      log.warn({ error }, 'Humanization failed, using raw response');
    }

    // Record bonding events based on conversation content
    if (preTurnContext.analysis.signals.isPersonalSharing) {
      this.emotionalMemory.recordBondEvent('vulnerability_shared', {
        topic: preTurnContext.analysis.topics.detected[0],
      });
    }

    const processingTimeMs = Date.now() - startTime;

    log.debug(
      {
        originalLength: llmResponse.length,
        humanizedLength: humanizedResponse.length,
        processingTimeMs,
      },
      'Post-turn processing complete'
    );

    return {
      humanizedResponse,
      turnResult,
      processingTimeMs,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async retrieveMemoryContext(userMessage: string): Promise<RAGContext | null> {
    if (!this.vectorStore) return null;

    try {
      const context = await getRAGContext(userMessage, {
        userId: this.userId,
        topK: 5,
        minScore: 0.3,
      });
      return context;
    } catch (error) {
      log.warn({ error }, 'Memory retrieval failed');
      return null;
    }
  }

  private async getPersonalityContext(
    userMessage: string,
    analysis: UnifiedAnalysisResult
  ): Promise<PreTurnContext['personality']> {
    // Get pending callbacks
    let pendingCallbacks: string[] = [];
    if (this.userProfile && this.turnCount <= 3) {
      const callbacks = getPendingCallbacksFromProfile(this.userProfile);
      pendingCallbacks = callbacks.map((cb) => formatCallbackForPrompt(cb));
    }

    // Analyze timing for personal moment sharing
    const timingGuidance = analyzeMessageTiming(userMessage, {
      wordCount: userMessage.split(/\s+/).length,
      emotionalIntensity: analysis.emotion.intensity,
    });

    // Find relevant personal moment if timing is appropriate
    let relevantMoment: RelevanceMatch | null = null;
    if (timingGuidance.personalMomentAppropriate) {
      relevantMoment = await findRelevantMomentSemantic(this.personaId, userMessage, {
        relationshipStage: 'acquaintance',
        minSimilarity: 0.5,
      });
    }

    return {
      relevantMoment,
      pendingCallbacks,
      timingGuidance,
    };
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * End the session and cleanup
   */
  endSession(): void {
    this.emotionalMemory.endSession();

    if (this.conversationSession) {
      // Conversation session cleanup is handled by unified-integration
    }

    log.debug(
      { turnCount: this.turnCount, sessionId: this.sessionId },
      'SessionCoordinator session ended'
    );
  }

  /**
   * Get current session state
   */
  getSessionState() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      personaId: this.personaId,
      turnCount: this.turnCount,
      emotionalState: this.emotionalMemory.getState(),
      relationshipStage: this.emotionalMemory.getRelationshipStage(),
    };
  }

  /**
   * Record a bonding event manually
   */
  recordBondEvent(
    event: Parameters<UnifiedEmotionalMemory['recordBondEvent']>[0],
    context?: Parameters<UnifiedEmotionalMemory['recordBondEvent']>[1]
  ): void {
    this.emotionalMemory.recordBondEvent(event, context);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const coordinators = new Map<string, SessionCoordinator>();

/**
 * Get or create a session coordinator
 */
export function getSessionCoordinator(config: SessionCoordinatorConfig): SessionCoordinator {
  const key = config.sessionId;

  if (!coordinators.has(key)) {
    coordinators.set(key, new SessionCoordinator(config));
  }

  return coordinators.get(key)!;
}

/**
 * Remove a session coordinator
 */
export function removeSessionCoordinator(sessionId: string): void {
  const coordinator = coordinators.get(sessionId);
  if (coordinator) {
    coordinator.endSession();
    coordinators.delete(sessionId);
  }
}

/**
 * Clear all session coordinators
 */
export function clearAllSessionCoordinators(): void {
  coordinators.forEach((coordinator) => {
    coordinator.endSession();
  });
  coordinators.clear();
}

export default {
  SessionCoordinator,
  getSessionCoordinator,
  removeSessionCoordinator,
  clearAllSessionCoordinators,
};
