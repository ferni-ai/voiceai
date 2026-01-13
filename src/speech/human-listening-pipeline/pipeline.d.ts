/**
 * Human Listening Pipeline
 *
 * Main pipeline class that orchestrates all human-like listening capabilities.
 */
import type { HumanListeningContext, HumanListeningResult, QuickAnalysisResult } from './types.js';
/**
 * Unified pipeline that integrates all human-like listening capabilities
 */
export declare class HumanListeningPipeline {
    private sessionId;
    constructor(sessionId: string);
    /**
     * Process a complete turn through all analyzers
     */
    analyze(context: HumanListeningContext): Promise<HumanListeningResult>;
    /**
     * Quick analysis for real-time use (text only, faster)
     * @param text - The user's transcript text
     * @param turnNumber - Current turn number (used for context-aware analysis)
     */
    quickAnalyze(text: string, turnNumber: number): QuickAnalysisResult;
    /**
     * Build LLM context from most recent analysis
     */
    buildLLMContext(): string | null;
    /**
     * Reset all analyzers
     */
    reset(): void;
}
export default HumanListeningPipeline;
//# sourceMappingURL=pipeline.d.ts.map