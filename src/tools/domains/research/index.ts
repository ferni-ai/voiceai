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
import { createQuantTools, createPersistentQuantTools } from './quant-tools.js';
import { superhumanTools } from './superhuman-tools/index.js';
import { getKnowledgeGraph, initializeKnowledgeGraph } from './knowledge-graph/index.js';
import { PeerBenchmarks } from './global-intelligence/peer-benchmarks.js';

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
// PERSISTENT QUANT TOOLS (Firestore-backed)
// ============================================================================

function getPersistentQuantToolDefinitions(): ToolDefinition[] {
  const persistentTools = createPersistentQuantTools();

  return [
    wrapLegacyTool(
      'saveFinancialProfile',
      'Save Financial Profile',
      'Save your financial profile (income, expenses, age, retirement goals) for personalized analysis and tracking.',
      persistentTools.saveFinancialProfile,
      { tags: ['quant', 'profile', 'persistent', 'setup'] }
    ),
    wrapLegacyTool(
      'addToPortfolio',
      'Add Portfolio Holding',
      'Add a stock or fund to your tracked portfolio for ongoing analysis and alerts.',
      persistentTools.addToPortfolio,
      { tags: ['quant', 'portfolio', 'persistent', 'tracking'] }
    ),
    wrapLegacyTool(
      'viewPortfolio',
      'View Portfolio',
      'View your tracked portfolio holdings with cost basis and account breakdown.',
      persistentTools.viewPortfolio,
      { tags: ['quant', 'portfolio', 'persistent', 'view'] }
    ),
    wrapLegacyTool(
      'getDailyBriefing',
      'Daily Financial Briefing',
      'Get your personalized daily briefing with market updates, portfolio insights, FIRE progress, and action items.',
      persistentTools.getDailyBriefing,
      { tags: ['quant', 'briefing', 'proactive', 'daily'] }
    ),
    wrapLegacyTool(
      'recordBehavior',
      'Record Financial Behavior',
      'Track emotional or impulsive financial decisions (panic sells, timing attempts, impulse purchases) for behavioral coaching.',
      persistentTools.recordBehavior,
      { tags: ['quant', 'behavior', 'coaching', 'tracking'] }
    ),
    wrapLegacyTool(
      'recordFIREProgress',
      'Record FIRE Progress',
      'Record your current net worth and track FIRE progress over time with milestone celebrations.',
      persistentTools.recordFIREProgress,
      { tags: ['quant', 'fire', 'progress', 'tracking', 'milestone'] }
    ),
  ];
}

// ============================================================================
// SUPERHUMAN TOOLS (Peter's Big Brain Powers!)
// ============================================================================

function getSuperhumanToolDefinitions(): ToolDefinition[] {
  return [
    // Investment Thesis Memory
    wrapLegacyTool(
      'saveInvestmentThesis',
      'Save Investment Thesis',
      "Save why you bought a stock. I'll remind you of this when the market gets volatile - your future self will thank you.",
      superhumanTools.saveInvestmentThesis,
      { tags: ['superhuman', 'thesis', 'memory', 'behavioral'] }
    ),
    wrapLegacyTool(
      'remindThesis',
      'Remind Investment Thesis',
      "Recall why you bought a stock. Essential during market drops when emotions run high. I'll show you your original thinking.",
      superhumanTools.remindThesis,
      { tags: ['superhuman', 'thesis', 'memory', 'behavioral'] }
    ),

    // Goal Tracking
    wrapLegacyTool(
      'createFinancialGoal',
      'Create Financial Goal',
      "Create a financial goal (emergency fund, retirement, purchase, etc). I'll track progress and celebrate milestones with you!",
      superhumanTools.createFinancialGoal,
      { tags: ['superhuman', 'goals', 'tracking', 'milestones'] }
    ),
    wrapLegacyTool(
      'updateGoalProgress',
      'Update Goal Progress',
      "Update your progress on a financial goal. I'll celebrate when you hit milestones!",
      superhumanTools.updateGoalProgress,
      { tags: ['superhuman', 'goals', 'tracking', 'milestones'] }
    ),

    // Behavioral Prediction
    wrapLegacyTool(
      'predictBehavior',
      'Predict Market Behavior',
      "Predict how you might react to market events based on your history and patterns from similar investors. Forewarned is forearmed.",
      superhumanTools.predictBehavior,
      { tags: ['superhuman', 'behavior', 'prediction', 'coaching'] }
    ),

    // Life Events
    wrapLegacyTool(
      'recordLifeEvent',
      'Record Life Event',
      "Record a significant life event (job change, new baby, inheritance, etc). I'll adjust my advice based on your changing circumstances.",
      superhumanTools.recordLifeEvent,
      { tags: ['superhuman', 'life-event', 'context', 'personalization'] }
    ),

    // Knowledge Learning
    wrapLegacyTool(
      'getNextLesson',
      'Get Next Lesson',
      "Find out what financial topic you should learn next based on your goals and knowledge gaps. Personalized curriculum.",
      superhumanTools.getNextLesson,
      { tags: ['superhuman', 'learning', 'education', 'personalization'] }
    ),
  ];
}

// ============================================================================
// KNOWLEDGE GRAPH TOOLS (Peter's Financial Brain)
// ============================================================================

function getKnowledgeGraphToolDefinitions(): ToolDefinition[] {
  return [
    {
      id: 'explainConcept',
      name: 'Explain Financial Concept',
      description: 'Explain any financial concept with examples and connections to related concepts. Perfect for learning.',
      domain: 'research',
      tags: ['knowledge', 'education', 'concepts'],
      create: (_ctx: ToolContext) => {
        return {
          description: 'Explain any financial concept with examples and connections',
          parameters: { type: 'object', properties: { concept: { type: 'string', description: 'The concept to explain' } } },
          execute: async ({ concept }: { concept: string }) => {
            const graph = getKnowledgeGraph();
            if (graph.getAllNodes().length === 0) {
              await initializeKnowledgeGraph();
            }

            const nodes = graph.searchNodes(concept);
            if (nodes.length === 0) {
              return `I don't have "${concept}" in my knowledge graph yet. Would you like me to research it?`;
            }

            const node = nodes[0];
            const related = graph.getRelatedNodes(node.id).slice(0, 3);

            const lines = [
              `📚 **${node.name}**`,
              '',
              `📖 ${node.definition}`,
              '',
            ];

            if (node.examples && node.examples.length > 0) {
              lines.push('**Examples:**');
              for (const ex of node.examples.slice(0, 2)) {
                lines.push(`  • ${ex}`);
              }
              lines.push('');
            }

            if (node.commonMisunderstandings && node.commonMisunderstandings.length > 0) {
              lines.push('**Common Misunderstandings:**');
              for (const m of node.commonMisunderstandings.slice(0, 2)) {
                lines.push(`  ⚠️ ${m}`);
              }
              lines.push('');
            }

            if (related.length > 0) {
              lines.push('**Related Concepts:**');
              for (const r of related) {
                lines.push(`  → ${r.name}`);
              }
            }

            return lines.join('\n');
          },
        };
      },
    },
    {
      id: 'getLearningPath',
      name: 'Get Learning Path',
      description: 'Get a personalized learning path from basics to advanced topics based on what you already know.',
      domain: 'research',
      tags: ['knowledge', 'education', 'learning-path'],
      create: (_ctx: ToolContext) => {
        return {
          description: 'Get a learning path from basics to advanced',
          parameters: {
            type: 'object',
            properties: {
              targetConcept: { type: 'string', description: 'What you want to understand' },
              currentLevel: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'], description: 'Your current level' },
            },
          },
          execute: async ({ targetConcept, currentLevel }: { targetConcept: string; currentLevel: 'beginner' | 'intermediate' | 'advanced' }) => {
            const graph = getKnowledgeGraph();
            if (graph.getAllNodes().length === 0) {
              await initializeKnowledgeGraph();
            }

            const targetNodes = graph.searchNodes(targetConcept);
            if (targetNodes.length === 0) {
              return `I couldn't find "${targetConcept}" in my knowledge graph.`;
            }

            const target = targetNodes[0];
            const recommendations = graph.getRecommendations([], currentLevel);

            const lines = [
              `📚 **Learning Path to: ${target.name}**`,
              '',
              `Current Level: ${currentLevel}`,
              '',
              '**Recommended Topics:**',
            ];

            for (const rec of recommendations.slice(0, 5)) {
              lines.push(`  ${rec.context.difficulty === 'beginner' ? '🌱' : rec.context.difficulty === 'intermediate' ? '📈' : '🎓'} ${rec.name}`);
            }

            return lines.join('\n');
          },
        };
      },
    },
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
  ...getPersistentQuantToolDefinitions(),
  ...getSuperhumanToolDefinitions(),
  ...getKnowledgeGraphToolDefinitions(),
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
  getPersistentQuantToolDefinitions,
  getSuperhumanToolDefinitions,
  getKnowledgeGraphToolDefinitions,
};

export default getToolDefinitions;
