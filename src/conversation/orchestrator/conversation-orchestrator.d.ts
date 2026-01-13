/**
 * Unified Conversation Orchestrator
 *
 * Coordinates all conversation humanization systems through a clean,
 * layered architecture:
 *
 * 1. ANALYSIS - Understand the user message
 * 2. INTELLIGENCE - Gather insights from all intelligence systems
 * 3. HUMANIZATION - Apply humanization features
 * 4. OUTPUT - Format and return the final response
 *
 * This replaces the complex, interleaved logic in humanizer.ts with
 * a clear, maintainable pipeline.
 *
 * @module @ferni/conversation/orchestrator
 */
import type { OrchestratorConfig, OrchestratorInput, OrchestratorOutput } from './types.js';
export declare class ConversationOrchestrator {
    private configOverrides;
    private sessionStartTime;
    private personaId;
    private sessionId;
    constructor(sessionId?: string, config?: Partial<OrchestratorConfig>);
    /**
     * Get the effective config, merging adapter config with overrides
     */
    private get config();
    /**
     * Set persona for persona-specific config
     */
    setPersona(personaId: string): void;
    /**
     * Orchestrate the full humanization pipeline
     */
    orchestrate(input: OrchestratorInput): Promise<OrchestratorOutput>;
    private runAnalysisPhase;
    private getDefaultAnalysis;
    private getConversationDepth;
    private runIntelligencePhase;
    private getSessionInsight;
    private getSuperhumanInsight;
    private getMoodState;
    private getEmotionalGuidance;
    private buildGuidance;
    private getDefaultIntelligence;
    private runHumanizationPhase;
    /**
     * Deterministic probability gate.
     *
     * We avoid `Math.random()` to keep behavior stable within a session/turn,
     * which feels more "human" (consistent) and makes tests reliable.
     */
    private shouldTrigger;
    private runOutputPhase;
    private applySsmlEnhancements;
    private stripSsml;
    private getComfortLevel;
    private mapRelationshipStage;
    private getTimeOfDay;
    /**
     * Reset session time
     */
    resetSession(): void;
    /**
     * Get session duration in minutes
     */
    getSessionMinutes(): number;
}
/**
 * Get or create an orchestrator for a session
 */
export declare function getConversationOrchestrator(sessionId: string, config?: Partial<OrchestratorConfig>): ConversationOrchestrator;
/**
 * Reset orchestrator for a session
 */
export declare function resetConversationOrchestrator(sessionId: string): void;
/**
 * Reset all orchestrators
 */
export declare function resetAllOrchestrators(): void;
/**
 * Get count of active orchestrators (for monitoring)
 */
export declare function getActiveOrchestratorCount(): number;
export default ConversationOrchestrator;
//# sourceMappingURL=conversation-orchestrator.d.ts.map