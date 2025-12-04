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
// PETER JOHN STOCK ANALYSIS TOOLS
// ============================================================================

function getStockAnalysisToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPeterLynchTools();

  return [
    wrapLegacyTool(
      'analyzeStock',
      'Analyze Stock',
      'Analyze a stock using Peter John\'s framework',
      legacyTools.analyzeStock,
      { tags: ['stocks', 'analysis', 'peter-john'], requiredServices: ['finnhub'] }
    ),
    wrapLegacyTool(
      'findStockCategory',
      'Find Stock Category',
      'Categorize a stock (slow grower, stalwart, fast grower, cyclical, turnaround, asset play)',
      legacyTools.findStockCategory,
      { tags: ['stocks', 'category', 'peter-john'] }
    ),
    wrapLegacyTool(
      'calculatePEGRatio',
      'Calculate PEG Ratio',
      'Calculate the Price-to-Earnings-Growth ratio for a stock',
      legacyTools.calculatePEGRatio,
      { tags: ['stocks', 'valuation', 'peg'] }
    ),
    wrapLegacyTool(
      'findTenBaggers',
      'Find Ten Baggers',
      'Search for potential 10x return stocks using Peter John\'s criteria',
      legacyTools.findTenBaggers,
      { tags: ['stocks', 'growth', 'ten-bagger'] }
    ),
    wrapLegacyTool(
      'explainStockCategory',
      'Explain Stock Category',
      'Explain what a stock category means and how to invest in it',
      legacyTools.explainStockCategory,
      { tags: ['stocks', 'education', 'categories'] }
    ),
  ];
}

// ============================================================================
// MARKET DATA TOOLS
// ============================================================================

function getMarketDataToolDefinitions(): ToolDefinition[] {
  const legacyTools = createMarketDataTools();

  return [
    wrapLegacyTool(
      'getStockQuote',
      'Get Stock Quote',
      'Get the current price and basic data for a stock',
      legacyTools.getStockQuote,
      { tags: ['stocks', 'quote', 'price'], requiredServices: ['alpha-vantage'] }
    ),
    wrapLegacyTool(
      'getMarketSummary',
      'Get Market Summary',
      'Get a summary of market conditions and major indices',
      legacyTools.getMarketSummary,
      { tags: ['market', 'summary', 'indices'] }
    ),
    wrapLegacyTool(
      'getCurrentDateTime',
      'Get Current Date Time',
      'Get the current date and time with market status',
      legacyTools.getCurrentDateTime,
      { tags: ['time', 'market-hours'] }
    ),
  ];
}

// ============================================================================
// INSIGHTS TOOLS
// ============================================================================

function getInsightsToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPeterInsightsTools();

  return [
    wrapLegacyTool(
      'synthesizeInsights',
      'Synthesize Insights',
      'Synthesize insights from multiple data sources',
      legacyTools.synthesizeInsights,
      { tags: ['insights', 'synthesis', 'analysis'] }
    ),
    wrapLegacyTool(
      'spotAnomalies',
      'Spot Anomalies',
      'Identify unusual patterns or anomalies in data',
      legacyTools.spotAnomalies,
      { tags: ['insights', 'anomalies', 'patterns'] }
    ),
    wrapLegacyTool(
      'findCorrelation',
      'Find Correlation',
      'Find correlations between different data points',
      legacyTools.findCorrelation,
      { tags: ['insights', 'correlation', 'analysis'] }
    ),
    wrapLegacyTool(
      'projectTrends',
      'Project Trends',
      'Project future trends based on historical patterns',
      legacyTools.projectTrends,
      { tags: ['insights', 'trends', 'forecasting'] }
    ),
    wrapLegacyTool(
      'generateBehavioralInsight',
      'Generate Behavioral Insight',
      'Generate insights about user behavior patterns',
      legacyTools.generateBehavioralInsight,
      { tags: ['insights', 'behavior', 'psychology'] }
    ),
    wrapLegacyTool(
      'createInsightBriefing',
      'Create Insight Briefing',
      'Create a comprehensive insight briefing',
      legacyTools.createInsightBriefing,
      { tags: ['insights', 'briefing', 'summary'] }
    ),
    wrapLegacyTool(
      'findTheLever',
      'Find the Lever',
      'Identify the key lever or factor driving outcomes',
      legacyTools.findTheLever,
      { tags: ['insights', 'leverage', 'analysis'] }
    ),
    wrapLegacyTool(
      'runProactiveInsightScan',
      'Run Proactive Insight Scan',
      'Proactively scan for insights and opportunities',
      legacyTools.runProactiveInsightScan,
      { tags: ['insights', 'proactive', 'scan'] }
    ),
    wrapLegacyTool(
      'detectBehavioralBias',
      'Detect Behavioral Bias',
      'Detect behavioral biases that might affect decisions',
      legacyTools.detectBehavioralBias,
      { tags: ['insights', 'bias', 'psychology'] }
    ),
    wrapLegacyTool(
      'generateInsightsDashboard',
      'Generate Insights Dashboard',
      'Generate a dashboard of key insights',
      legacyTools.generateInsightsDashboard,
      { tags: ['insights', 'dashboard', 'visualization'] }
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

