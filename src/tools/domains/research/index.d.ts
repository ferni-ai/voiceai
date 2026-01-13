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
import type { ToolDefinition } from '../../registry/types.js';
declare function getStockAnalysisToolDefinitions(): ToolDefinition[];
declare function getMarketDataToolDefinitions(): ToolDefinition[];
declare function getInsightsToolDefinitions(): ToolDefinition[];
declare function getQuantToolDefinitions(): ToolDefinition[];
declare function getPersistentQuantToolDefinitions(): ToolDefinition[];
declare function getSuperhumanToolDefinitions(): ToolDefinition[];
declare function getKnowledgeGraphToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getStockAnalysisToolDefinitions, getMarketDataToolDefinitions, getInsightsToolDefinitions, getQuantToolDefinitions, getPersistentQuantToolDefinitions, getSuperhumanToolDefinitions, getKnowledgeGraphToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map