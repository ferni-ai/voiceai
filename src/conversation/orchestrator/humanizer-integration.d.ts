/**
 * Humanizer Integration
 *
 * Provides a bridge between the new ConversationOrchestrator and the
 * existing ConversationHumanizer API. This allows gradual migration
 * while maintaining backward compatibility.
 *
 * Usage:
 *   import { createOrchestratedHumanizer } from './orchestrator/humanizer-integration.js';
 *
 *   const humanizer = createOrchestratedHumanizer(sessionId, personaId);
 *   const result = await humanizer.humanizeResponseAsync(response, context);
 *
 * @module @ferni/conversation/orchestrator/humanizer-integration
 */
import type { HumanizedResponse, HumanizationContext as LegacyContext } from '../humanizer.js';
import { orchestratorConfig } from './config-adapter.js';
import { getConversationOrchestrator } from './conversation-orchestrator.js';
/**
 * Extended context that includes orchestrator-specific fields
 */
export interface ExtendedHumanizationContext extends LegacyContext {
    sessionId?: string;
    userId?: string;
    sessionCount?: number;
    rawResponse?: string;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    sessionData?: Record<string, unknown>;
}
/**
 * Extended response with orchestrator metadata
 */
export interface ExtendedHumanizedResponse extends HumanizedResponse {
    orchestratorMetadata?: {
        timing: Record<string, number>;
        confidence: Record<string, number>;
        appliedFeatures: string[];
        skippedFeatures?: Array<{
            name: string;
            reason: string;
        }>;
    };
}
/**
 * Orchestrated humanizer interface (drop-in replacement for ConversationHumanizer)
 */
export interface OrchestratedHumanizer {
    /**
     * Humanize a response (async, uses full orchestrator)
     */
    humanizeResponseAsync(response: string, context: ExtendedHumanizationContext): Promise<ExtendedHumanizedResponse>;
    /**
     * Set persona for persona-specific config
     */
    setPersona(personaId: string): void;
    /**
     * Set session context
     */
    setSessionContext(sessionId: string, userId?: string): void;
    /**
     * Get session minutes
     */
    getSessionMinutes(): number;
    /**
     * Reset the humanizer
     */
    reset(): void;
    /**
     * Log metrics summary
     */
    logMetrics(): void;
    /**
     * Get the underlying orchestrator
     */
    getOrchestrator(): ReturnType<typeof getConversationOrchestrator>;
}
/**
 * Create an orchestrated humanizer that uses the new ConversationOrchestrator
 * but provides the same API as ConversationHumanizer.
 *
 * This enables gradual migration by allowing you to swap implementations.
 */
export declare function createOrchestratedHumanizer(sessionId: string, personaId: string, userId?: string): OrchestratedHumanizer;
/**
 * Create a humanizer that can be used as a drop-in replacement.
 * Automatically determines whether to use orchestrator based on feature flag.
 */
export declare function createHumanizer(sessionId: string, personaId: string, userId?: string, options?: {
    useOrchestrator?: boolean;
    preset?: Parameters<typeof orchestratorConfig.applyPreset>[0];
}): OrchestratedHumanizer;
/**
 * Get or create an orchestrated humanizer (singleton per session)
 */
export declare function getOrchestratedHumanizer(sessionId: string, personaId: string, userId?: string): OrchestratedHumanizer;
/**
 * Reset orchestrated humanizer for a session
 */
export declare function resetOrchestratedHumanizer(sessionId: string, personaId?: string): void;
/**
 * Reset all orchestrated humanizers
 */
export declare function resetAllOrchestratedHumanizers(): void;
//# sourceMappingURL=humanizer-integration.d.ts.map