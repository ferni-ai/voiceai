/**
 * Research Domain Tools
 *
 * Tools for stock research, market analysis, insights, and quant analysis.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: research
 * TOOLS:
 *   Stock Analysis: analyzeStock, findStocks
 *   Market Data: marketData, marketAwareness
 *   Insights: analyzePatterns, behavioralInsights, insightBriefing, proactiveInsights
 *   Market Quant: technicalIndicators, riskAnalysis
 *   Personal Finance Quant: analyzeSavingsRate, calculateFIRE, retirementReadiness
 *   Coaching Quant: behavioralScore, peerComparison
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import tool creators
import { createResearchTools } from './research-tools.js';
import { createInsightsAnalysisTools } from './insights-analysis.js';
import { createMarketDataTools } from '../finance/market-data.js';
import { createQuantTools } from './quant-tools.js';

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
  const legacyTools = createResearchTools();

  return [
    wrapLegacyTool(
      'analyzeStock',
      'Analyze Stock',
      'Deep analysis of any stock using Peter Lynch\'s framework. Includes: P/E ratio, PEG ratio, growth rate, category classification (slow grower, stalwart, fast grower, cyclical, turnaround, asset play), and "the story" - why this company will succeed. Just provide a ticker symbol like AAPL, COST, or TSLA.',
      legacyTools.analyzeStock,
      {
        tags: ['stocks', 'analysis', 'valuation', 'peg', 'category'],
        requiredServices: ['finnhub'],
      }
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
      {
        tags: ['stocks', 'quote', 'price', 'market', 'indices'],
        requiredServices: ['alpha-vantage'],
      }
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
  const legacyTools = createInsightsAnalysisTools();

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
// QUANT TOOLS (Peter's Superpowers!)
// ============================================================================

function getQuantToolDefinitions(): ToolDefinition[] {
  const quantTools = createQuantTools();

  return [
    // Market Quant
    wrapLegacyTool(
      'technicalIndicators',
      'Technical Indicators',
      'Calculate technical indicators: RSI (overbought/oversold), MACD (momentum), moving averages (trend), Bollinger Bands (volatility). Essential for timing analysis.',
      quantTools.technicalIndicators,
      { tags: ['quant', 'technical', 'rsi', 'macd', 'bollinger', 'moving-average'] }
    ),
    wrapLegacyTool(
      'riskAnalysis',
      'Risk Analysis',
      'Calculate risk metrics: Beta, Sharpe Ratio, Volatility, Max Drawdown, Value at Risk (VaR). Essential for understanding investment risk.',
      quantTools.riskAnalysis,
      { tags: ['quant', 'risk', 'beta', 'sharpe', 'volatility', 'var'] }
    ),
    // Personal Finance Quant
    wrapLegacyTool(
      'analyzeSavingsRate',
      'Analyze Savings Rate',
      'Calculate your savings rate with personalized advice. Shows where you stand and how to improve.',
      quantTools.analyzeSavingsRate,
      { tags: ['quant', 'personal-finance', 'savings', 'budget'] }
    ),
    wrapLegacyTool(
      'calculateFIRE',
      'Calculate FIRE Number',
      'Calculate your Financial Independence number. Shows regular FIRE, Lean FIRE, Fat FIRE, and Coast FIRE targets.',
      quantTools.calculateFIRE,
      { tags: ['quant', 'personal-finance', 'fire', 'retirement', 'independence'] }
    ),
    wrapLegacyTool(
      'retirementReadiness',
      'Retirement Readiness',
      'Calculate your retirement readiness score. Projects savings, estimates retirement income, and gives recommendations.',
      quantTools.retirementReadiness,
      { tags: ['quant', 'personal-finance', 'retirement', 'projection'] }
    ),
    // Coaching Quant
    wrapLegacyTool(
      'behavioralScore',
      'Behavioral Finance Score',
      'Analyze financial behavior patterns. Scores emotional control, discipline, and patience. Identifies strengths and improvements.',
      quantTools.behavioralScore,
      { tags: ['quant', 'coaching', 'behavior', 'psychology', 'score'] }
    ),
    wrapLegacyTool(
      'peerComparison',
      'Peer Comparison',
      'Compare your finances to others in your age group. Shows percentiles for savings, net worth, debt, and emergency fund.',
      quantTools.peerComparison,
      { tags: ['quant', 'coaching', 'peer', 'benchmark', 'comparison'] }
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
  ...getQuantToolDefinitions(),
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
  getQuantToolDefinitions,
};

export default getToolDefinitions;
