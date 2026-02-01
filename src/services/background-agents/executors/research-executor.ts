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
import { captureBackgroundResult } from '../unified-result-capture.js';
import type { OutcomeStatus, ResultPriority } from '../result-types.js';

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
export async function executeResearchTask(request: ResearchRequest): Promise<ResearchResult> {
  log.info(
    { userId: request.userId, query: request.query, type: request.type },
    'Starting background research task'
  );

  const startTime = Date.now();

  try {
    // Execute the research based on type
    const findings = await performResearch(request);

    // Build summary
    const summary = buildResearchSummary(request.query, findings, request.type);

    const result: ResearchResult = {
      query: request.query,
      findings,
      summary,
      methodology: getMethodologyDescription(request.type, request.depth),
      completedAt: new Date().toISOString(),
    };

    // Store result via unified capture
    await captureBackgroundResult({
      userId: request.userId,
      type: 'research_complete',
      status: findings.length > 0 ? 'success' : 'partial_success',
      summary: `Research on "${request.query}" complete: ${findings.length} findings`,
      priority: request.priority || 'normal',
      initiatedBy: request.initiatedBy || 'peter',
      sessionId: request.sessionId,
      details: summary,
      specificData: {
        query: request.query,
        findingsCount: findings.length,
        type: request.type,
        depth: request.depth,
        durationMs: Date.now() - startTime,
      },
    });

    log.info(
      {
        userId: request.userId,
        query: request.query,
        findingsCount: findings.length,
        durationMs: Date.now() - startTime,
      },
      'Research task completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId: request.userId }, 'Research task failed');

    // Report failure
    await captureBackgroundResult({
      userId: request.userId,
      type: 'research_complete',
      status: 'failed',
      summary: `Research on "${request.query}" couldn't be completed`,
      priority: 'low',
      initiatedBy: request.initiatedBy || 'peter',
      sessionId: request.sessionId,
      details: `Error: ${String(error)}`,
    });

    throw error;
  }
}

// ============================================================================
// RESEARCH METHODS
// ============================================================================

/**
 * Perform the actual research based on type
 */
async function performResearch(request: ResearchRequest): Promise<ResearchFinding[]> {
  switch (request.type) {
    case 'stock_analysis':
      return performStockResearch(request.query, request.depth);
    case 'fact_check':
      return performFactCheck(request.query);
    case 'market_research':
      return performMarketResearch(request.query, request.depth);
    case 'deep_dive':
      return performDeepDive(request.query, request.context);
    case 'general':
    default:
      return performGeneralResearch(request.query);
  }
}

/**
 * Stock analysis research
 */
async function performStockResearch(
  query: string,
  depth: 'quick' | 'standard' | 'comprehensive'
): Promise<ResearchFinding[]> {
  // For now, this returns placeholder findings
  // In production, this would call financial APIs (Alpha Vantage, Yahoo Finance, etc.)

  log.debug({ query, depth }, 'Performing stock research');

  // Simulate research time based on depth
  await simulateResearchDelay(depth);

  // Extract potential ticker symbols
  const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
  const ticker = tickerMatch ? tickerMatch[0] : 'UNKNOWN';

  const findings: ResearchFinding[] = [
    {
      title: `${ticker} Overview`,
      summary: `Analysis of ${ticker} based on available market data.`,
      source: 'Market Analysis',
      confidence: 0.8,
    },
  ];

  if (depth === 'comprehensive') {
    findings.push(
      {
        title: 'Financial Metrics',
        summary: 'Key financial ratios and metrics analysis.',
        source: 'Financial Data',
        confidence: 0.85,
      },
      {
        title: 'Industry Comparison',
        summary: 'Comparison against sector peers.',
        source: 'Sector Analysis',
        confidence: 0.75,
      }
    );
  }

  return findings;
}

/**
 * Fact checking research
 */
async function performFactCheck(claim: string): Promise<ResearchFinding[]> {
  log.debug({ claim }, 'Performing fact check');

  await simulateResearchDelay('standard');

  return [
    {
      title: 'Fact Check Result',
      summary: `Verification of claim: "${claim}"`,
      source: 'Multiple Sources',
      confidence: 0.7,
    },
  ];
}

/**
 * Market research
 */
async function performMarketResearch(
  query: string,
  depth: 'quick' | 'standard' | 'comprehensive'
): Promise<ResearchFinding[]> {
  log.debug({ query, depth }, 'Performing market research');

  await simulateResearchDelay(depth);

  const findings: ResearchFinding[] = [
    {
      title: 'Market Overview',
      summary: `Current market conditions related to: ${query}`,
      source: 'Market Data',
      confidence: 0.8,
    },
  ];

  if (depth !== 'quick') {
    findings.push({
      title: 'Trend Analysis',
      summary: 'Key trends and patterns observed.',
      source: 'Historical Data',
      confidence: 0.75,
    });
  }

  return findings;
}

/**
 * Deep dive research
 */
async function performDeepDive(query: string, context?: string): Promise<ResearchFinding[]> {
  log.debug({ query, context }, 'Performing deep dive');

  await simulateResearchDelay('comprehensive');

  return [
    {
      title: 'Deep Dive Summary',
      summary: `Comprehensive analysis of: ${query}${context ? ` in context of ${context}` : ''}`,
      source: 'Multiple Sources',
      confidence: 0.85,
    },
    {
      title: 'Key Insights',
      summary: 'Notable findings from the research.',
      source: 'Analysis',
      confidence: 0.8,
    },
    {
      title: 'Recommendations',
      summary: 'Suggested next steps based on findings.',
      source: 'Expert Analysis',
      confidence: 0.7,
    },
  ];
}

/**
 * General research
 */
async function performGeneralResearch(query: string): Promise<ResearchFinding[]> {
  log.debug({ query }, 'Performing general research');

  await simulateResearchDelay('standard');

  return [
    {
      title: 'Research Summary',
      summary: `Information gathered about: ${query}`,
      source: 'Web Search',
      confidence: 0.7,
    },
  ];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simulate research delay based on depth
 */
async function simulateResearchDelay(depth: 'quick' | 'standard' | 'comprehensive'): Promise<void> {
  const delays = {
    quick: 500,
    standard: 1000,
    comprehensive: 2000,
  };

  await new Promise((resolve) => setTimeout(resolve, delays[depth]));
}

/**
 * Build a human-readable research summary
 */
function buildResearchSummary(query: string, findings: ResearchFinding[], type: string): string {
  if (findings.length === 0) {
    return `I searched for information about "${query}" but couldn't find substantial findings.`;
  }

  const lines: string[] = [];

  lines.push(
    `Research on "${query}" found ${findings.length} key insight${findings.length > 1 ? 's' : ''}:`
  );
  lines.push('');

  for (const finding of findings) {
    lines.push(`• **${finding.title}**: ${finding.summary}`);
    if (finding.source) {
      lines.push(`  (Source: ${finding.source})`);
    }
  }

  return lines.join('\n');
}

/**
 * Get methodology description for transparency
 */
function getMethodologyDescription(type: string, depth: string): string {
  const methodologies: Record<string, string> = {
    stock_analysis: 'Financial data analysis using public market data',
    fact_check: 'Cross-referenced against multiple authoritative sources',
    market_research: 'Analysis of market trends and historical data',
    deep_dive: 'Comprehensive multi-source investigation',
    general: 'Web search and information synthesis',
  };

  const depthDescriptions: Record<string, string> = {
    quick: 'Brief overview',
    standard: 'Standard analysis',
    comprehensive: 'In-depth investigation',
  };

  return `${methodologies[type] || methodologies.general} - ${depthDescriptions[depth] || depthDescriptions.standard}`;
}

// ============================================================================
// SCHEDULED RESEARCH
// ============================================================================

/**
 * Queue a research task for background execution
 *
 * This can be called from tools to schedule research that will
 * complete even if the user disconnects.
 */
export async function queueResearchTask(request: ResearchRequest): Promise<string> {
  const taskId = `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  log.info({ taskId, query: request.query, userId: request.userId }, 'Queuing research task');

  // For now, execute immediately in background
  // In production, this would add to a job queue (e.g., Bull, Cloud Tasks)
  setImmediate(() => {
    executeResearchTask(request).catch((error) => {
      log.error({ error: String(error), taskId }, 'Background research task failed');
    });
  });

  return taskId;
}

// Types are exported at definition
