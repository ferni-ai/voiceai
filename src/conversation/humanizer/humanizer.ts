/**
 * Conversation Humanizer - Main Orchestrator
 *
 * Pre-LLM humanization: records each user message and turns what the
 * conversation has built up into guidance for the prompt. This is a facade over
 * PreLlmProcessor.
 *
 * Nothing humanizes the reply text after the LLM on live calls; how a reply
 * sounds is decided on the TTS path (src/speech/tts-gateway/).
 *
 * Used by:
 * - response-guidance-builder.ts (processUserMessage)
 * - Context builders (conversation-humanizing.ts)
 *
 * @module @ferni/conversation/humanizer
 */

import { createLogger } from '../../utils/safe-logger.js';

import { PreLlmProcessor } from './pre-llm.js';
import type { ContextGuidance, HumanizationContext, PreResponseActions } from './types.js';

const log = createLogger({ module: 'ConversationHumanizer' });

// ============================================================================
// CONVERSATION HUMANIZER
// ============================================================================

/**
 * Main humanizer class that coordinates pre-LLM processing
 */
export class ConversationHumanizer {
  private personaId: string;
  private sessionId: string;

  private preLlm: PreLlmProcessor;

  constructor(personaId: string, sessionId?: string) {
    this.personaId = personaId;
    this.sessionId = sessionId || `humanizer-${personaId}-${Date.now()}`;
    this.preLlm = new PreLlmProcessor(this.personaId, this.sessionId);

    log.debug({ personaId, sessionId: this.sessionId }, 'ConversationHumanizer initialized');
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Set the session ID for session-scoped state
   */
  setSessionContext(sessionId: string): void {
    this.sessionId = sessionId;
    this.preLlm = new PreLlmProcessor(this.personaId, sessionId);

    log.debug({ sessionId }, 'Session context updated');
  }

  /**
   * Change persona
   */
  setPersona(personaId: string): void {
    this.personaId = personaId;
    this.preLlm = new PreLlmProcessor(personaId, this.sessionId);
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
    return this.preLlm.generateContextGuidance(context);
  }

  /**
   * Format context guidance for prompt injection
   */
  formatGuidanceForPrompt(guidance: ContextGuidance[]): string {
    return this.preLlm.formatGuidanceForPrompt(guidance);
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

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
