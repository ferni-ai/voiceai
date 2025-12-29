/**
 * Research Domain Tool Executor
 *
 * Handles research-related tools: analyzeStock, findStocks, marketData,
 * analyzePatterns, technicalIndicators, calculateFIRE, and more.
 *
 * Peter's domain for stock research, market analysis, and quant tools.
 *
 * @module agents/shared/tool-executors/research-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ResearchExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Stock Analysis
  'analyzestock',
  'findstocks',
  // Market Data
  'marketdata',
  'marketawareness',
  'getstockquote',
  'getmarketsummary',
  // Insights
  'analyzepatterns',
  'behavioralinsights',
  'insightbriefing',
  'proactiveinsights',
  // Quant Tools - Market
  'technicalindicators',
  'riskanalysis',
  // Quant Tools - Personal Finance
  'analyzesavingsrate',
  'calculatefire',
  'retirementreadiness',
  // Quant Tools - Coaching
  'behavioralscore',
  'peercomparison',
] as const;

/**
 * Execute research-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  log.info({ fn, userId: ctx.userId }, '📊 Executing research tool');

  try {
    // Dynamically import the research domain to get actual tool implementations
    const { getToolDefinitions } = await import('../../../tools/domains/research/index.js');
    const toolDefs = await getToolDefinitions();

    // Map lowercase function names to tool IDs
    const toolIdMap: Record<string, string> = {
      analyzestock: 'analyzeStock',
      findstocks: 'findStocks',
      marketdata: 'marketData',
      marketawareness: 'marketAwareness',
      getstockquote: 'marketData',
      getmarketsummary: 'marketData',
      analyzepatterns: 'analyzePatterns',
      behavioralinsights: 'behavioralInsights',
      insightbriefing: 'insightBriefing',
      proactiveinsights: 'proactiveInsights',
      technicalindicators: 'technicalIndicators',
      riskanalysis: 'riskAnalysis',
      analyzesavingsrate: 'analyzeSavingsRate',
      calculatefire: 'calculateFIRE',
      retirementreadiness: 'retirementReadiness',
      behavioralscore: 'behavioralScore',
      peercomparison: 'peerComparison',
    };

    const toolId = toolIdMap[fnLower];
    const toolDef = toolDefs.find((t) => t.id === toolId);

    if (!toolDef) {
      log.warn({ fn, toolId }, '⚠️ Research tool definition not found');
      return `I'd love to help with that analysis, but I'm having trouble accessing my research tools right now.`;
    }

    // Create the tool with context
    const tool = toolDef.create({
      userId: ctx.userId || 'anonymous',
      agentId: ctx.personaId || 'peter',
      agentDisplayName: 'Peter',
      services: {
        has: () => false,
        get: () => {
          throw new Error('Not available');
        },
        getOptional: () => undefined,
      },
    });

    // Execute the tool
    const result = await tool.execute(args);

    log.info({ fn, success: true }, '✅ Research tool executed');

    // Format the result for voice output
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      // Return structured message if present
      if (r.message) return r.message;
      if (r.summary) return r.summary;
      if (r.analysis) return r.analysis;
      if (r.result) return r.result;
      // For stock data, format nicely
      if (r.ticker && r.price) {
        const change = typeof r.change === 'number' ? r.change : 0;
        return `${r.ticker} is currently at $${r.price}${change ? ` (${change > 0 ? '+' : ''}${change}%)` : ''}.`;
      }
      return JSON.stringify(result);
    }

    return result;
  } catch (err) {
    log.error({ fn, error: String(err) }, '❌ Research tool failed');
    return `I ran into an issue with that research query. Let me know if you'd like to try again.`;
  }
}

export const researchExecutor: DomainExecutor = {
  domain: 'research',
  handles: HANDLED_TOOLS,
  execute,
};

export default researchExecutor;
