/**
 * Research Task Executor
 *
 * Handles background research tasks typically initiated by Peter.
 * Performs web searches, fact-checking, and analysis tasks
 * asynchronously and reports results back when complete.
 *
 * "BETTER THAN HUMAN" - Peter can research while you sleep.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { ResultPriority } from '../result-types.js';

const log = createLogger({ module: 'ResearchExecutor' });

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// RESEARCH EXECUTION
// ============================================================================

/**
 * Execute a research task in the background
 *
 * This function:
 * 1. Performs the research (web search, analysis, etc.)
 * 2. Compiles findings into a summary
 * 3. Stores the result via unified result capture
 * 4. Notifies the user when complete
 */
export const RESEARCH_UNAVAILABLE_SUMMARY =
  "I can't research things in the background right now, so I have no findings to share.";

/**
 * No research source is connected: a request gets no findings and nothing is
 * captured for later delivery. This used to wait a moment and then store
 * placeholder findings with made-up sources ("Web Search", "Market Data") as
 * completed research.
 */
export async function executeResearchTask(request: ResearchRequest): Promise<ResearchResult> {
  log.info(
    { userId: request.userId, type: request.type },
    'Research requested; no research source is connected'
  );

  return {
    query: request.query,
    findings: [],
    summary: RESEARCH_UNAVAILABLE_SUMMARY,
    completedAt: new Date().toISOString(),
  };
}

// Types are exported at definition
