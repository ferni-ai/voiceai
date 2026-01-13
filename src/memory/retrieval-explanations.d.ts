/**
 * Retrieval Explanations
 *
 * Generates natural language explanations for why memories are surfaced.
 * Makes the AI's memory feel transparent and trustworthy.
 *
 * Philosophy: When Ferni references something from the past, the user
 * should feel understood, not surveilled. The explanation should feel
 * like a caring friend connecting the dots, not an algorithm outputting
 * a match score.
 *
 * "I remember you mentioned this last month when we talked about your
 * daughter's college plans" feels human. "Retrieved memory ID 4523 with
 * 0.87 similarity score" does not.
 */
import type { RetrievalContext, RetrievedMemory } from './advanced-retrieval.js';
import type { ConsolidatedMemory } from './memory-consolidator.js';
/**
 * An explained memory with natural language reasoning
 */
export interface ExplainedMemory extends RetrievedMemory {
    /** Natural language explanation of why this memory surfaced */
    naturalExplanation: string;
    /** How strongly this memory connects to the current context */
    connectionStrength: 'strong' | 'moderate' | 'subtle';
    /** What type of connection this is */
    connectionType: ConnectionType;
    /** Suggested natural reference for the AI to use */
    suggestedReference: string;
}
/**
 * Types of memory connections
 */
export type ConnectionType = 'topic_match' | 'emotional_echo' | 'person_related' | 'commitment' | 'continuation' | 'pattern' | 'milestone' | 'time_based';
export declare class RetrievalExplainer {
    /**
     * Generate a natural explanation for why a memory was retrieved
     */
    explain(memory: RetrievedMemory, context: RetrievalContext): ExplainedMemory;
    /**
     * Explain multiple memories
     */
    explainAll(memories: RetrievedMemory[], context: RetrievalContext): ExplainedMemory[];
    /**
     * Generate explanation for a consolidated memory
     */
    explainConsolidated(consolidated: ConsolidatedMemory, context: RetrievalContext): {
        explanation: string;
        reference: string;
    };
    /**
     * Determine the type of connection
     */
    private determineConnectionType;
    /**
     * Determine how strong the connection is
     */
    private determineConnectionStrength;
    /**
     * Generate natural explanation
     */
    private generateExplanation;
    /**
     * Generate a natural reference for the AI to use
     */
    private generateReference;
    /**
     * Get human-readable time ago
     */
    private getTimeAgo;
    /**
     * Get duration description
     */
    private getDuration;
    /**
     * Get time span for consolidated memory
     */
    private getTimeSpan;
    /**
     * Extract summary from content
     */
    private extractSummary;
    /**
     * Extract action from content (for commitments)
     */
    private extractAction;
    /**
     * Select a random template from array
     */
    private selectTemplate;
}
/**
 * Get the default explainer
 */
export declare function getRetrievalExplainer(): RetrievalExplainer;
/**
 * Reset the explainer (for testing)
 */
export declare function resetRetrievalExplainer(): void;
declare const _default: {
    RetrievalExplainer: typeof RetrievalExplainer;
    getRetrievalExplainer: typeof getRetrievalExplainer;
    resetRetrievalExplainer: typeof resetRetrievalExplainer;
};
export default _default;
//# sourceMappingURL=retrieval-explanations.d.ts.map