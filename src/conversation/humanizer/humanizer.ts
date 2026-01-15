/**
 * Conversation Humanizer - Main Orchestrator
 *
 * Coordinates all humanizing features to create natural conversations.
 * This is a facade that composes PreLlmProcessor and PostLlmProcessor.
 *
 * ⚠️ MIGRATION NOTICE:
 * For POST-LLM humanization in the voice agent, use the unified API instead:
 *
 * ```typescript
 * // New unified API (preferred for voice agent)
 * import {
 *   initConversationSession,
 *   humanizeAgentResponse,
 *   cleanupConversationSession,
 * } from './agents/integrations/conversation-session-integration.js';
 * ```
 *
 * This file is still used for:
 * - PRE-LLM context building (processUserMessage, getPreResponseActions)
 * - Context builders (conversation-humanizing.ts)
 * - Legacy integrations
 *
 * @see unified-integration.ts for the new unified POST-LLM API
 * @module @ferni/conversation/humanizer
 */

import { createLogger } from '../../utils/safe-logger.js';

import { PreLlmProcessor } from './pre-llm.js';
import { PostLlmProcessor } from './post-llm.js';
import type {
  ContextGuidance,
  HumanizationContext,
  HumanizedResponse,
  PreResponseActions,
} from './types.js';

const log = createLogger({ module: 'ConversationHumanizer' });

// ============================================================================
// CONVERSATION HUMANIZER
// ============================================================================

/**
 * Main humanizer class that coordinates pre-LLM and post-LLM processing
 */
export class ConversationHumanizer {
  private personaId: string;
  private sessionId: string;
  private userId?: string;
  private sessionCount: number;
  private sessionStartTime: number;

  private preLlm: PreLlmProcessor;
  private postLlm: PostLlmProcessor;

  constructor(personaId: string, sessionId?: string, userId?: string, sessionCount?: number) {
    this.personaId = personaId;
    this.sessionId = sessionId || `humanizer-${personaId}-${Date.now()}`;
    this.userId = userId;
    this.sessionCount = sessionCount || 0;
    this.sessionStartTime = Date.now();

    // Initialize processors
    this.preLlm = new PreLlmProcessor(this.personaId, this.sessionId);
    this.postLlm = new PostLlmProcessor(
      this.personaId,
      this.sessionId,
      this.userId,
      this.sessionCount,
      this.sessionStartTime
    );

    log.debug(
      { personaId, sessionId: this.sessionId, sessionCount: this.sessionCount },
      'ConversationHumanizer initialized'
    );
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Set session and user IDs for session intelligence
   */
  setSessionContext(sessionId: string, userId?: string): void {
    this.sessionId = sessionId;
    this.userId = userId;

    // Recreate processors with new context
    this.preLlm = new PreLlmProcessor(this.personaId, sessionId);
    this.postLlm = new PostLlmProcessor(
      this.personaId,
      sessionId,
      userId,
      this.sessionCount,
      this.sessionStartTime
    );

    log.debug({ sessionId, userId }, 'Session context updated');
  }

  /**
   * Set session count (for Better Than Human capabilities)
   */
  setSessionCount(count: number): void {
    this.sessionCount = count;
  }

  /**
   * Get session duration in minutes
   */
  getSessionMinutes(): number {
    return this.postLlm.getSessionMinutes();
  }

  /**
   * Reset session start time (for new sessions)
   */
  resetSession(): void {
    this.sessionStartTime = Date.now();
    log.debug({ personaId: this.personaId }, 'Session timer reset');
  }

  /**
   * Change persona
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
    this.preLlm = new PreLlmProcessor(personaId, this.sessionId);
    this.postLlm = new PostLlmProcessor(
      personaId,
      this.sessionId,
      this.userId,
      this.sessionCount,
      this.sessionStartTime
    );
  }

  // =========================================================================
  // PRE-LLM PROCESSING
  // =========================================================================

  /**
   * Process incoming user message
   * Records context and returns pre-response actions
   */
  processUserMessage(context: HumanizationContext): PreResponseActions {
    return this.preLlm.processUserMessage(context);
  }

  /**
   * Generate context guidance for LLM prompt injection
   */
  generateContextGuidance(context: HumanizationContext): ContextGuidance[] {
    return this.preLlm.generateContextGuidance(context, this.postLlm.getLastSessionInsight());
  }

  /**
   * Format context guidance for prompt injection
   */
  formatGuidanceForPrompt(guidance: ContextGuidance[]): string {
    return this.preLlm.formatGuidanceForPrompt(guidance);
  }

  // =========================================================================
  // POST-LLM PROCESSING
  // =========================================================================

  /**
   * Humanize a response (sync version - basic features)
   */
  humanizeResponse(rawResponse: string, context: HumanizationContext): HumanizedResponse {
    return this.postLlm.humanizeResponse(rawResponse, context);
  }

  /**
   * Humanize a response with full deep humanization (async)
   *
   * @deprecated For voice agent POST-LLM humanization, use the unified API instead
   */
  async humanizeResponseAsync(
    rawResponse: string,
    context: HumanizationContext
  ): Promise<HumanizedResponse> {
    return this.postLlm.humanizeResponseAsync(rawResponse, context);
  }

  // =========================================================================
  // INSIGHT ACCESSORS
  // =========================================================================

  /**
   * Get the last session insight (for external use)
   */
  getLastSessionInsight() {
    return this.postLlm.getLastSessionInsight();
  }

  /**
   * Get the last Better Than Human insight (for external use)
   */
  getLastBetterThanHumanInsight() {
    return this.postLlm.getLastBetterThanHumanInsight();
  }

  /**
   * Get the current conversation mood
   */
  getMood() {
    return this.postLlm.getMood();
  }

  // =========================================================================
  // REACTION TRACKING
  // =========================================================================

  /**
   * Record user reaction to a memory callback
   */
  recordUserReactionToCallback(userResponseLength: number, wasEngaged: boolean): void {
    this.postLlm.recordUserReactionToCallback(userResponseLength, wasEngaged);
  }

  /**
   * Record backchannel reaction
   */
  recordBackchannelReaction(wasPositive: boolean): void {
    this.postLlm.recordBackchannelReaction(wasPositive);
  }

  /**
   * Check if last response had a memory callback
   */
  wasLastResponseCallback(): boolean {
    return this.postLlm.wasLastResponseCallback();
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Get a thinking phrase when processing
   */
  getThinkingPhrase(
    type: 'processing' | 'recalling' | 'considering' | 'uncertain' = 'processing',
    turnNumber?: number
  ): { text: string; ssml: string } {
    return this.postLlm.getThinkingPhrase(type, turnNumber);
  }

  /**
   * Generate an echo question from user statement
   */
  generateEchoQuestion(userStatement: string): { text: string; ssml: string } {
    const memory = this.preLlm.getMemory();
    // Delegate to the questions engine via memory
    const question = {
      text: `So you're saying ${userStatement.slice(0, 50)}...?`,
      ssml: `So you're saying ${userStatement.slice(0, 50)}...?`,
    };
    return question;
  }

  /**
   * Get a conversation callback for circling back to a topic
   */
  getCircleBackPhrase(topic: string): string {
    return this.preLlm.getMemory().generateCircleBack(topic);
  }

  /**
   * Get unresolved conversation threads
   */
  getUnresolvedThreads(): string[] {
    return this.preLlm
      .getMemory()
      .getUnresolvedThreads()
      .map((t) => t.topic);
  }

  /**
   * Mark a topic as resolved
   */
  resolveThread(topic: string): void {
    this.preLlm.getMemory().resolveThread(topic);
  }

  /**
   * Get conversation summary for persistence
   */
  getConversationSummary() {
    return this.preLlm.getMemory().getConversationSummary();
  }

  /**
   * Reset all state for new conversation
   */
  reset(): void {
    this.preLlm.reset();
    this.postLlm.reset();
    log.debug('ConversationHumanizer reset');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

const humanizers = new Map<string, ConversationHumanizer>();

export function getConversationHumanizer(personaId: string): ConversationHumanizer {
  let humanizer = humanizers.get(personaId);
  if (!humanizer) {
    humanizer = new ConversationHumanizer(personaId);
    humanizers.set(personaId, humanizer);
  }
  return humanizer;
}

export function resetConversationHumanizer(personaId?: string): void {
  if (personaId) {
    const humanizer = humanizers.get(personaId);
    if (humanizer) {
      humanizer.reset();
    }
    humanizers.delete(personaId);
  } else {
    for (const humanizer of humanizers.values()) {
      humanizer.reset();
    }
    humanizers.clear();
  }
}

export default ConversationHumanizer;
