/**
 * Tool Chain Predictor
 *
 * Predicts multi-step tool sequences based on:
 * 1. Co-occurrence patterns (A often followed by B)
 * 2. Goal decomposition (complex intent → tool sequence)
 * 3. Dependency analysis (B requires output from A)
 *
 * Example: "Plan my morning routine"
 * → weather_check → calendar_list → music_play → habit_suggest
 *
 * @module tools/semantic-router/advanced/tool-chain-predictor
 */
interface ToolMatch {
    toolId: string;
    confidence: number;
}
interface SemanticToolDefinition {
    id: string;
}
interface ToolChain {
    steps: Array<{
        toolId: string;
        args?: Record<string, unknown>;
        dependsOn: number[];
        optional?: boolean;
    }>;
    executionStrategy: 'sequential' | 'parallel' | 'conditional';
    estimatedDuration: number;
    confidence: number;
}
export declare class ToolChainPredictor {
    private patterns;
    private coOccurrence;
    private userHistory;
    private recentExecutions;
    constructor();
    /**
     * Predict tool chain for a complex intent
     */
    predict(intent: string, primaryTool: ToolMatch, availableTools: SemanticToolDefinition[], userId?: string): Promise<ToolChain | null>;
    /**
     * Record tool execution for learning
     */
    recordExecution(toolId: string, userId: string, context?: string): void;
    /**
     * Get likely next tools based on current execution
     */
    getLikelyNext(toolId: string, k?: number): Array<{
        toolId: string;
        probability: number;
    }>;
    private initializePatterns;
    private matchPattern;
    private updateCoOccurrence;
    private predictNextFromCoOccurrence;
    private updateUserHistory;
    private getUserPatterns;
    private buildChainFromSignals;
}
export declare function getChainPredictor(): ToolChainPredictor;
export {};
//# sourceMappingURL=tool-chain-predictor.d.ts.map