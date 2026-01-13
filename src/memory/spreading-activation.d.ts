/**
 * Spreading Activation
 *
 * Implements spreading activation through the memory graph.
 * When one memory is activated (accessed/relevant), activation
 * spreads to connected memories with decay based on distance.
 *
 * This mimics how human memory works - thinking of one thing
 * naturally brings related things to mind.
 *
 * @module memory/spreading-activation
 */
import { type LinkType } from './memory-graph.js';
export interface ActivationResult {
    memoryId: string;
    activation: number;
    distance: number;
    pathTypes: LinkType[];
    reason: string;
}
export interface SpreadingConfig {
    decayFactor: number;
    maxDepth: number;
    minActivation: number;
    linkWeights: Record<LinkType, number>;
    accumulatePaths: boolean;
}
export declare class SpreadingActivationEngine {
    private config;
    constructor(config?: Partial<SpreadingConfig>);
    /**
     * Spread activation from a single source memory
     */
    spreadFromMemory(userId: string, sourceMemoryId: string, initialActivation?: number): Promise<ActivationResult[]>;
    /**
     * Spread activation from multiple sources
     */
    spreadFromMultiple(userId: string, sourceMemoryIds: string[], weights?: number[]): Promise<ActivationResult[]>;
    /**
     * Get memories activated by a topic/query
     * Uses semantic search to find initial activations, then spreads
     */
    activateByTopic(userId: string, seedMemoryIds: string[], topK?: number): Promise<ActivationResult[]>;
    /**
     * Find which memories would activate a target
     * (Reverse spreading)
     */
    findActivators(userId: string, targetMemoryId: string, maxSources?: number): Promise<ActivationResult[]>;
    private buildAdjacencyMap;
    private buildReverseAdjacencyMap;
}
export declare function getSpreadingActivation(): SpreadingActivationEngine;
export declare function resetSpreadingActivation(): void;
declare const _default: {
    SpreadingActivationEngine: typeof SpreadingActivationEngine;
    getSpreadingActivation: typeof getSpreadingActivation;
    resetSpreadingActivation: typeof resetSpreadingActivation;
};
export default _default;
//# sourceMappingURL=spreading-activation.d.ts.map