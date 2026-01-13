/**
 * Research Task Executor
 *
 * Handles background research tasks typically initiated by Peter.
 * Performs web searches, fact-checking, and analysis tasks
 * asynchronously and reports results back when complete.
 *
 * "BETTER THAN HUMAN" - Peter can research while you sleep.
 */
import type { ResultPriority } from '../result-types.js';
export interface ResearchRequest {
    userId: string;
    sessionId?: string;
    query: string;
    type: 'stock_analysis' | 'fact_check' | 'deep_dive' | 'market_research' | 'general';
    depth: 'quick' | 'standard' | 'comprehensive';
    context?: string;
    priority?: ResultPriority;
    initiatedBy?: string;
}
export interface ResearchFinding {
    title: string;
    summary: string;
    source?: string;
    url?: string;
    confidence?: number;
    relevance?: number;
}
export interface ResearchResult {
    query: string;
    findings: ResearchFinding[];
    summary: string;
    methodology?: string;
    completedAt: string;
}
/**
 * Execute a research task in the background
 *
 * This function:
 * 1. Performs the research (web search, analysis, etc.)
 * 2. Compiles findings into a summary
 * 3. Stores the result via unified result capture
 * 4. Notifies the user when complete
 */
export declare function executeResearchTask(request: ResearchRequest): Promise<ResearchResult>;
/**
 * Queue a research task for background execution
 *
 * This can be called from tools to schedule research that will
 * complete even if the user disconnects.
 */
export declare function queueResearchTask(request: ResearchRequest): Promise<string>;
//# sourceMappingURL=research-executor.d.ts.map