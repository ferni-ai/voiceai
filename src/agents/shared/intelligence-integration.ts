/**
 * Intelligence Integration for Voice Agent
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module integrates the persona intelligence systems into the voice agent:
 * - Loads/saves relationship memory from Firestore
 * - Detects moments automatically during conversation
 * - Injects relationship context into prompts
 * - Runs predictive analysis
 *
 * Usage in voice agent:
 *   const intelligence = await initializeIntelligence(personaId, userId);
 *   intelligence.startSession();
 *   // During conversation:
 *   await intelligence.processMessage(userMessage, aiResponse);
 *   // Get prompt injection:
 *   const injection = intelligence.getPromptInjection();
 *   // End session:
 *   await intelligence.endSession(mood, energy, topics);
 */

import { getLogger } from '../../utils/safe-logger.js';

// Import intelligence systems
import {
  detectMoments,
  type DetectedMoment,
  type MomentDetectionContext,
} from '../../personas/moment-detection.js';
import {
  PersonaIntelligenceEngine,
  getPersonaIntelligence,
} from '../../personas/persona-intelligence.js';
import {
  analyzePredictively,
  type PatternMatchContext,
  type PredictiveAnalysis,
} from '../../personas/predictive-intelligence.js';
import {
  loadRelationshipMemory,
  saveRelationshipMemory,
  type RelationshipMemory,
} from '../../personas/relationship-memory/index.js';
import type { SharedMomentType } from '../../personas/relationship-memory/types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface IntelligenceConfig {
  /** Enable automatic moment detection */
  autoDetectMoments: boolean;
  /** Enable predictive analysis */
  enablePredictive: boolean;
  /** Enable relationship memory persistence */
  enablePersistence: boolean;
  /** Minimum confidence to record a moment */
  momentConfidenceThreshold: number;
  /** Save memory after each session */
  saveOnSessionEnd: boolean;
}

export interface SessionState {
  sessionNumber: number;
  messagesProcessed: number;
  momentsDetected: DetectedMoment[];
  topicsDiscussed: string[];
  overallMood: 'positive' | 'neutral' | 'struggling' | 'crisis';
  energyLevel: 'high' | 'medium' | 'low';
  hasSharedVulnerability: boolean;
}

export interface MessageProcessResult {
  moments: DetectedMoment[];
  predictive: PredictiveAnalysis | null;
  shouldAcknowledgeMoment: boolean;
  suggestedResponse?: string;
}

// ============================================================================
// INTELLIGENCE INTEGRATION CLASS
// ============================================================================

/**
 * Unified intelligence integration for voice agent sessions
 */
export class IntelligenceIntegration {
  private personaId: string;
  private userId: string;
  private config: IntelligenceConfig;
  private engine: PersonaIntelligenceEngine;
  private sessionState: SessionState;
  private initialized = false;

  constructor(
    personaId: string,
    userId: string,
    existingMemory?: RelationshipMemory,
    config?: Partial<IntelligenceConfig>
  ) {
    this.personaId = personaId;
    this.userId = userId;

    // Default config
    this.config = {
      autoDetectMoments: true,
      enablePredictive: true,
      enablePersistence: true,
      momentConfidenceThreshold: 0.6,
      saveOnSessionEnd: true,
      ...config,
    };

    // Initialize engine
    this.engine = getPersonaIntelligence(personaId, userId, existingMemory);

    // Initialize session state
    this.sessionState = {
      sessionNumber: existingMemory?.totalSessions || 0,
      messagesProcessed: 0,
      momentsDetected: [],
      topicsDiscussed: [],
      overallMood: 'neutral',
      energyLevel: 'medium',
      hasSharedVulnerability: (existingMemory?.sharedMoments || []).some(
        (m) => m.type === 'first_vulnerability'
      ),
    };

    this.initialized = true;
    log.debug({ personaId, userId }, 'IntelligenceIntegration initialized');
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Start the intelligence session
   */
  startSession(): void {
    this.engine.startSession();
    this.sessionState.sessionNumber++;
    this.sessionState.messagesProcessed = 0;
    this.sessionState.momentsDetected = [];
    this.sessionState.topicsDiscussed = [];
    this.sessionState.overallMood = 'neutral';

    log.debug(
      {
        personaId: this.personaId,
        userId: this.userId,
        sessionNumber: this.sessionState.sessionNumber,
      },
      'Intelligence session started'
    );
  }

  /**
   * End the session and optionally persist memory
   */
  async endSession(
    mood?: 'positive' | 'neutral' | 'struggling' | 'crisis',
    energy?: 'high' | 'medium' | 'low',
    topics?: string[]
  ): Promise<void> {
    const finalMood = mood || this.sessionState.overallMood;
    const finalEnergy = energy || this.sessionState.energyLevel;
    const finalTopics = topics || this.sessionState.topicsDiscussed;

    // End engine session
    this.engine.endSession(finalMood, finalEnergy, finalTopics);

    // Persist memory if enabled
    if (this.config.enablePersistence && this.config.saveOnSessionEnd) {
      try {
        const memory = this.engine.getRelationshipMemory();
        await saveRelationshipMemory(memory);
        log.info(
          { personaId: this.personaId, userId: this.userId, stage: memory.stage },
          'Relationship memory saved'
        );
      } catch (error) {
        log.error(
          { error, personaId: this.personaId, userId: this.userId },
          'Failed to save relationship memory'
        );
      }
    }

    log.debug(
      {
        personaId: this.personaId,
        userId: this.userId,
        mood: finalMood,
        moments: this.sessionState.momentsDetected.length,
        messages: this.sessionState.messagesProcessed,
      },
      'Intelligence session ended'
    );
  }

  // ============================================================================
  // MESSAGE PROCESSING
  // ============================================================================

  /**
   * Process a user message and detect moments/patterns
   */
  async processMessage(
    userMessage: string,
    aiResponse?: string,
    topic?: string
  ): Promise<MessageProcessResult> {
    this.sessionState.messagesProcessed++;

    // Add topic if provided
    if (topic && !this.sessionState.topicsDiscussed.includes(topic)) {
      this.sessionState.topicsDiscussed.push(topic);
    }

    const result: MessageProcessResult = {
      moments: [],
      predictive: null,
      shouldAcknowledgeMoment: false,
    };

    // Detect moments
    if (this.config.autoDetectMoments) {
      const momentContext: MomentDetectionContext = {
        userMessage,
        aiResponse,
        topic,
        sessionNumber: this.sessionState.sessionNumber,
        hasSharedVulnerabilityBefore: this.sessionState.hasSharedVulnerability,
      };

      const moments = detectMoments(momentContext);
      result.moments = moments.filter((m) => m.confidence >= this.config.momentConfidenceThreshold);

      // Record detected moments
      for (const moment of result.moments) {
        this.recordMoment(moment);
        this.sessionState.momentsDetected.push(moment);

        // Track first vulnerability
        if (moment.type === 'first_vulnerability') {
          this.sessionState.hasSharedVulnerability = true;
        }

        // Update mood based on moment type
        this.updateMoodFromMoment(moment);
      }

      // Should we acknowledge the moment?
      if (result.moments.length > 0) {
        const topMoment = result.moments[0];
        result.shouldAcknowledgeMoment = topMoment.significance > 0.7;
      }
    }

    // Run predictive analysis
    if (this.config.enablePredictive) {
      const predictiveContext: PatternMatchContext = {
        currentMessage: userMessage,
        timestamp: new Date(),
        dayOfWeek: new Date().getDay(),
        hour: new Date().getHours(),
        relationshipMemory: this.engine.getRelationshipMemory(),
        recentTopics: this.sessionState.topicsDiscussed,
        emotionalTrajectory: this.engine.getRelationshipMemory().emotionalTrajectory,
        sessionNumber: this.sessionState.sessionNumber,
      };

      result.predictive = await analyzePredictively(this.personaId, predictiveContext);

      // Check for high-priority concerns
      if (result.predictive.concerns.some((c) => c.severity === 'high')) {
        this.sessionState.overallMood = 'crisis';
        if (result.predictive.concerns[0]?.responses?.[0]) {
          result.suggestedResponse = result.predictive.concerns[0].responses[0];
        }
      }
    }

    return result;
  }

  /**
   * Record a detected moment to the engine
   */
  private recordMoment(moment: DetectedMoment): void {
    this.engine.recordMoment(moment.type as SharedMomentType, moment.summary, {
      topic: moment.topic,
      userPhrase: moment.userPhrase,
      significance: moment.significance,
      tags: moment.tags,
    });
  }

  /**
   * Update session mood based on detected moment
   */
  private updateMoodFromMoment(moment: DetectedMoment): void {
    switch (moment.type) {
      case 'crisis_support':
        this.sessionState.overallMood = 'crisis';
        break;
      case 'celebration':
      case 'laughter':
        if (this.sessionState.overallMood !== 'crisis') {
          this.sessionState.overallMood = 'positive';
        }
        break;
      case 'first_vulnerability':
      case 'breakthrough':
        if (this.sessionState.overallMood === 'neutral') {
          this.sessionState.overallMood = 'positive';
        }
        break;
    }
  }

  // ============================================================================
  // PROMPT INJECTION
  // ============================================================================

  /**
   * Get prompt injection for LLM
   */
  getPromptInjection(currentTopic?: string): string {
    const injection = this.engine.buildPromptInjection(currentTopic);
    return injection.combined;
  }

  /**
   * Get relationship context summary
   */
  getRelationshipSummary(): {
    stage: string;
    trustScore: number;
    totalSessions: number;
    trajectory: string;
  } {
    const memory = this.engine.getRelationshipMemory();
    return {
      stage: memory.stage,
      trustScore: memory.trustScore,
      totalSessions: memory.totalSessions,
      trajectory: memory.emotionalTrajectory.trendDirection,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get persona-appropriate question
   */
  getQuestion(type: 'starter' | 'deep_dive' = 'starter'): string | undefined {
    return this.engine.getQuestion(type);
  }

  /**
   * Get disagreement phrase
   */
  getDisagreement(intensity: 'mild' | 'moderate' | 'strong' = 'mild'): string | undefined {
    return this.engine.getDisagreement(intensity);
  }

  /**
   * Get silence response
   */
  getSilenceResponse(durationMs: number): string | undefined {
    return this.engine.getSilenceResponse(durationMs);
  }

  /**
   * Get team reference
   */
  getTeamReference(aboutPersona: string): string | undefined {
    return this.engine.getTeamRef(aboutPersona);
  }

  /**
   * Generate handoff note
   */
  generateHandoff(toPersona: string, topic: string): string {
    const emotionalState =
      this.sessionState.overallMood === 'crisis'
        ? 'high_emotion'
        : this.sessionState.overallMood === 'positive'
          ? 'excited'
          : this.sessionState.overallMood === 'struggling'
            ? 'struggling'
            : 'neutral';
    return this.engine.generateHandoff(toPersona, topic, emotionalState);
  }

  /**
   * Record a callback attempt
   */
  recordCallback(
    reference: string,
    type: 'moment' | 'topic' | 'joke' | 'goal' | 'person' | 'story',
    userResponse: 'positive' | 'engaged' | 'neutral' | 'confused' | 'ignored'
  ): void {
    this.engine.recordCallbackAttempt(reference, type, userResponse, true, 'conversation');
  }

  /**
   * Get the underlying engine (for advanced usage)
   */
  getEngine(): PersonaIntelligenceEngine {
    return this.engine;
  }

  /**
   * Get current session state
   */
  getSessionState(): SessionState {
    return { ...this.sessionState };
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Initialize intelligence integration for a voice session
 *
 * @param personaId - The persona ID (e.g., 'ferni')
 * @param userId - The user's ID
 * @param config - Optional configuration overrides
 * @returns Initialized intelligence integration
 *
 * @example
 * ```typescript
 * const intelligence = await initializeIntelligence('ferni', userId);
 * intelligence.startSession();
 *
 * // Process each user message
 * const result = await intelligence.processMessage(userMessage);
 * if (result.shouldAcknowledgeMoment) {
 *   // Acknowledge the moment in response
 * }
 *
 * // Get prompt injection
 * const injection = intelligence.getPromptInjection(currentTopic);
 *
 * // End session
 * await intelligence.endSession('positive', 'high', ['career', 'goals']);
 * ```
 */
export async function initializeIntelligence(
  personaId: string,
  userId: string,
  config?: Partial<IntelligenceConfig>
): Promise<IntelligenceIntegration> {
  // Try to load existing relationship memory
  let existingMemory: RelationshipMemory | null = null;

  if (config?.enablePersistence !== false) {
    try {
      existingMemory = await loadRelationshipMemory(userId, personaId);
      if (existingMemory) {
        log.info(
          {
            personaId,
            userId,
            stage: existingMemory.stage,
            sessions: existingMemory.totalSessions,
          },
          'Loaded existing relationship memory'
        );
      }
    } catch (error) {
      log.warn({ error, personaId, userId }, 'Failed to load relationship memory, starting fresh');
    }
  }

  const integration = new IntelligenceIntegration(
    personaId,
    userId,
    existingMemory || undefined,
    config
  );

  return integration;
}

/**
 * Quick function to get prompt injection without full initialization
 * Useful for one-off prompt enhancement
 */
export async function getQuickPromptInjection(
  personaId: string,
  userId: string,
  currentTopic?: string
): Promise<string> {
  const intelligence = await initializeIntelligence(personaId, userId, {
    autoDetectMoments: false,
    enablePredictive: false,
    enablePersistence: true,
    saveOnSessionEnd: false,
    momentConfidenceThreshold: 0.6,
  });

  return intelligence.getPromptInjection(currentTopic);
}

export default IntelligenceIntegration;
