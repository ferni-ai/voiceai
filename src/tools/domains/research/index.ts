/**
 * Research Domain Tools
 *
 * Tools for stock research, market analysis, and insights.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: research
 * TOOLS:
 *   Stock Analysis: analyzeStock, findStockCategory, calculatePEGRatio, findTenBaggers
 *   Market Data: getStockQuote, getMarketSummary
 *   Insights: synthesizeInsights, spotAnomalies, findCorrelation, projectTrends
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import tool creators
import { createResearchTools } from '../../research-tools.js';
import { createInsightsAnalysisTools } from '../../insights-analysis.js';
import { createMarketDataTools } from '../../market-data.js';

// Legacy aliases
const createPeterLynchTools = createResearchTools;
const createPeterInsightsTools = createInsightsAnalysisTools;

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'research',
    tags: ['research', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// PETER JOHN STOCK ANALYSIS TOOLS (Consolidated: 5 → 2 tools)
// ============================================================================

function getStockAnalysisToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPeterLynchTools();

  return [
    wrapLegacyTool(
      'analyzeStock',
      'Analyze Stock',
      'Deep analysis of any stock using Peter Lynch\'s framework. Includes: P/E ratio, PEG ratio, growth rate, category classification (slow grower, stalwart, fast grower, cyclical, turnaround, asset play), and "the story" - why this company will succeed. Just provide a ticker symbol like AAPL, COST, or TSLA.',
      legacyTools.analyzeStock,
      { tags: ['stocks', 'analysis', 'valuation', 'peg', 'category'], requiredServices: ['finnhub'] }
    ),
    wrapLegacyTool(
      'findStocks',
      'Find Stocks',
      'Discover stocks matching specific criteria. Modes: "category" (find slow growers, stalwarts, fast growers, cyclicals, turnarounds, asset plays), "ten-baggers" (potential 10x returns), or "sector" (by industry). Great for building a diversified portfolio.',
      legacyTools.findTenBaggers,
      { tags: ['stocks', 'discovery', 'ten-bagger', 'category', 'search'] }
    ),
  ];
}

// ============================================================================
// MARKET DATA TOOLS (Consolidated: 3 → 2 tools)
// ============================================================================

function getMarketDataToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMarketDataTools();

  return [
    wrapLegacyTool(
      'marketData',
      'Market Data',
      'Get real-time market information. Modes: "quote" (current price for any stock ticker), "summary" (major indices like S&P 500, Dow, NASDAQ), or "status" (are markets open? when do they close?). Essential for staying informed about market conditions.',
      legacyTools.getStockQuote,
      { tags: ['stocks', 'quote', 'price', 'market', 'indices'], requiredServices: ['alpha-vantage'] }
    ),
    wrapLegacyTool(
      'marketAwareness',
      'Market Awareness',
      'Get current date/time with market context: what day of week, is market open, hours until close/open, any market holidays. Helps with timing for trades and financial planning.',
      legacyTools.getCurrentDateTime,
      { tags: ['time', 'market-hours', 'awareness', 'context'] }
    ),
  ];
}

// ============================================================================
// INSIGHTS TOOLS (Consolidated: 10 → 4 tools)
// ============================================================================

function getInsightsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPeterInsightsTools();

  return [
    wrapLegacyTool(
      'analyzePatterns',
      'Analyze Patterns',
      'Find patterns, anomalies, correlations, and trends in data. Modes: "anomalies" (unusual patterns), "correlations" (relationships between factors), "trends" (project future based on history), or "lever" (key factor driving outcomes). Essential for data-driven decisions.',
      legacyTools.synthesizeInsights,
      { tags: ['insights', 'patterns', 'anomalies', 'correlations', 'trends'] }
    ),
    wrapLegacyTool(
      'behavioralInsights',
      'Behavioral Insights',
      'Understand behavior patterns and psychological factors. Modes: "patterns" (how you typically behave), "biases" (cognitive biases affecting decisions like loss aversion, recency bias), or "recommendations" (personalized suggestions based on behavior).',
      legacyTools.generateBehavioralInsight,
      { tags: ['insights', 'behavior', 'psychology', 'bias'] }
    ),
    wrapLegacyTool(
      'insightBriefing',
      'Insight Briefing',
      'Generate a comprehensive briefing or dashboard of key insights. Synthesizes multiple data sources into actionable summary. Great for: morning briefings, weekly reviews, decision prep.',
      legacyTools.createInsightBriefing,
      { tags: ['insights', 'briefing', 'dashboard', 'summary'] }
    ),
    wrapLegacyTool(
      'proactiveInsights',
      'Proactive Insights',
      'Automatically scan for opportunities, risks, and actionable insights you should know about. Runs in background and surfaces what matters most. Topics: finances, goals, habits, relationships, or "all".',
      legacyTools.runProactiveInsightScan,
      { tags: ['insights', 'proactive', 'scan', 'opportunities'] }
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const researchTools: ToolDefinition[] = [
  ...getStockAnalysisToolDefinitions(),
  ...getMarketDataToolDefinitions(),
  ...getInsightsToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'research',
  researchTools
);

export {
  getStockAnalysisToolDefinitions,
  getMarketDataToolDefinitions,
  getInsightsToolDefinitions,
};

export default getToolDefinitions;

