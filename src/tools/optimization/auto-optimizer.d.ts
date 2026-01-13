/**
 * Auto Tool Optimizer
 *
 * The brain of the automated tool optimization system.
 * Continuously learns from user interactions and automatically:
 *
 * 1. Collects feedback (explicit and implicit)
 * 2. Analyzes interaction patterns
 * 3. Generates recommendations
 * 4. Runs experiments to validate recommendations
 * 5. Auto-implements proven improvements
 *
 * This creates a continuous improvement loop for tool quality.
 */
import { type ConversationContext } from './feedback-collector.js';
import { type Recommendation } from './recommendation-engine.js';
export interface OptimizerConfig {
    /** Enable automatic recommendation generation */
    enableAutoRecommendations: boolean;
    /** Enable automatic experiment creation */
    enableAutoExperiments: boolean;
    /** Enable automatic implementation of low-risk changes */
    enableAutoImplementation: boolean;
    /** Minimum data points before generating recommendations */
    minDataPoints: number;
    /** How often to run analysis (ms) */
    analysisIntervalMs: number;
    /** Maximum concurrent experiments */
    maxConcurrentExperiments: number;
}
export interface OptimizationReport {
    timestamp: Date;
    summary: {
        feedbackCollected: number;
        patternsIdentified: number;
        recommendationsGenerated: number;
        experimentsRunning: number;
        autoImplemented: number;
    };
    topRecommendations: Recommendation[];
    activeExperiments: string[];
    recentChanges: string[];
}
export interface OptimizationCycle {
    startTime: Date;
    endTime?: Date;
    feedbackProcessed: number;
    patternsFound: number;
    recommendationsCreated: number;
    experimentsStarted: number;
    status: 'running' | 'completed' | 'failed';
    error?: string;
}
export declare class AutoToolOptimizer {
    private config;
    private isRunning;
    private analysisTimer;
    private cycles;
    private recentChanges;
    constructor(config?: Partial<OptimizerConfig>);
    /**
     * Start the auto-optimizer
     */
    start(): void;
    /**
     * Stop the auto-optimizer
     */
    stop(): void;
    /**
     * Process a user message for feedback and patterns
     * Call this on every user turn
     */
    processUserMessage(message: string, context: ConversationContext, lastToolId?: string): void;
    /**
     * Record a tool execution
     * Call this after every tool call
     */
    recordToolExecution(sessionId: string, toolId: string, success: boolean, latencyMs: number): void;
    /**
     * Start a session
     */
    startSession(sessionId: string, userId: string, agentId: string): void;
    /**
     * End a session
     */
    endSession(sessionId: string): void;
    /**
     * Run a full optimization cycle
     */
    runOptimizationCycle(): Promise<OptimizationCycle>;
    /**
     * Automatically create experiments from recommendations
     */
    private autoCreateExperiments;
    private createExperimentFromRec;
    /**
     * Process experiment results and graduate winners
     */
    private processExperimentResults;
    private analyzeExperimentResults;
    /**
     * Get optimization status report
     */
    getReport(): OptimizationReport;
    /**
     * Generate full optimization report
     */
    generateFullReport(): string;
    /**
     * Get optimizer status
     */
    getStatus(): {
        isRunning: boolean;
        config: OptimizerConfig;
        cycleCount: number;
    };
}
export declare const autoOptimizer: AutoToolOptimizer;
export default autoOptimizer;
//# sourceMappingURL=auto-optimizer.d.ts.map