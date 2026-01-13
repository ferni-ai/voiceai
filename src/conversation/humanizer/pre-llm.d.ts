/**
 * Pre-LLM Processing
 *
 * Handles processing before the LLM generates a response:
 * - User message analysis
 * - Context guidance generation
 * - Pre-response actions (backchannels, silence handling)
 *
 * @module @ferni/conversation/humanizer/pre-llm
 */
import type { SessionIntelligenceInsight } from '../session-intelligence.js';
import type { ContextGuidance, HumanizationContext, PreResponseActions } from './types.js';
/**
 * Processes user messages before LLM response generation
 */
export declare class PreLlmProcessor {
    private personaId;
    private sessionId;
    private listening;
    private memory;
    private emotional;
    private dynamics;
    private questions;
    constructor(personaId: string, sessionId: string);
    /**
     * Process incoming user message
     * Records context and returns pre-response actions
     */
    processUserMessage(context: HumanizationContext): PreResponseActions;
    /**
     * Generate context guidance for LLM prompt injection
     */
    generateContextGuidance(context: HumanizationContext, sessionInsight: SessionIntelligenceInsight | null): ContextGuidance[];
    /**
     * Add session intelligence guidance to the list
     */
    private addSessionIntelligenceGuidance;
    /**
     * Format context guidance for prompt injection
     */
    formatGuidanceForPrompt(guidance: ContextGuidance[]): string;
    /**
     * Get memory reference for conversation context
     */
    getMemory(): import("../conversational-memory.js").ConversationalMemoryEngine;
    /**
     * Get dynamics engine
     */
    getDynamics(): import("../response-dynamics.js").ResponseDynamicsEngine;
    /**
     * Reset all state
     */
    reset(): void;
}
//# sourceMappingURL=pre-llm.d.ts.map