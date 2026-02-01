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
      'getDailyFinancialBriefing',
      'Daily Financial Briefing',
      'Get your personalized daily briefing with market updates, portfolio insights, FIRE progress, and action items.',
      persistentTools.getDailyFinancialBriefing,
      { tags: ['quant', 'briefing', 'proactive', 'daily', 'financial'] }
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
      'Predict how you might react to market events based on your history and patterns from similar investors. Forewarned is forearmed.',
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
      'Find out what financial topic you should learn next based on your goals and knowledge gaps. Personalized curriculum.',
      superhumanTools.getNextLesson,
      { tags: ['superhuman', 'learning', 'education', 'personalization'] }
    ),

    // ============================================================================
    // N=1 PERSONAL ANALYTICS (9 tools)
    // ============================================================================
    wrapLegacyTool(
      'recordDecision',
      'Record Decision',
      'Record a decision you made. Peter will track patterns to show you when you make your best and worst decisions.',
      superhumanTools.recordDecision,
      { tags: ['superhuman', 'n1-analytics', 'decisions', 'patterns'] }
    ),
    wrapLegacyTool(
      'recordDecisionOutcome',
      'Record Decision Outcome',
      'Record the outcome of a past decision. This helps Peter learn when you make your best decisions.',
      superhumanTools.recordDecisionOutcome,
      { tags: ['superhuman', 'n1-analytics', 'decisions', 'patterns'] }
    ),
    wrapLegacyTool(
      'analyzeDecisionQuality',
      'Analyze Decision Quality',
      'Analyze patterns in your decision quality. Find out WHEN you make your best decisions - time of day, day of week, sleep levels. Something no human friend could track.',
      superhumanTools.analyzeDecisionQuality,
      { tags: ['superhuman', 'n1-analytics', 'decisions', 'patterns'] }
    ),
    wrapLegacyTool(
      'recordSleepData',
      'Record Sleep',
      'Record your sleep data. Peter will correlate this with your spending, mood, productivity, and decisions to find YOUR patterns.',
      superhumanTools.recordSleepData,
      { tags: ['superhuman', 'n1-analytics', 'sleep', 'correlations'] }
    ),
    wrapLegacyTool(
      'analyzeSleepCorrelations',
      'Analyze Sleep Correlations',
      "Analyze how your sleep correlates with spending, decisions, and productivity. Reveals patterns you'd never notice yourself.",
      superhumanTools.analyzeSleepCorrelations,
      { tags: ['superhuman', 'n1-analytics', 'sleep', 'correlations'] }
    ),
    wrapLegacyTool(
      'recordEnergyLevel',
      'Record Energy Level',
      'Record your current energy level. Over time, Peter will learn to PREDICT your energy throughout the day.',
      superhumanTools.recordEnergyLevel,
      { tags: ['superhuman', 'n1-analytics', 'energy', 'prediction'] }
    ),
    wrapLegacyTool(
      'predictEnergy',
      'Predict Energy',
      'Predict your energy levels for today based on your patterns. Know your peaks and valleys BEFORE they happen.',
      superhumanTools.predictEnergy,
      { tags: ['superhuman', 'n1-analytics', 'energy', 'prediction'] }
    ),
    wrapLegacyTool(
      'analyzePeakPerformance',
      'Analyze Peak Performance',
      'Map YOUR personal peak performance times for creative work, analytical work, decisions, and communication. No generic advice - this is YOUR data.',
      superhumanTools.analyzePeakPerformance,
      { tags: ['superhuman', 'n1-analytics', 'performance', 'scheduling'] }
    ),
    wrapLegacyTool(
      'calculateLifestyleImpact',
      'Calculate Lifestyle Impact',
      'Predict how a lifestyle change will ripple through your life. See the cascade effects BEFORE you make the change.',
      superhumanTools.calculateLifestyleImpact,
      { tags: ['superhuman', 'n1-analytics', 'lifestyle', 'prediction'] }
    ),

    // ============================================================================
    // RESEARCH SYNTHESIS (5 tools)
    // ============================================================================
    wrapLegacyTool(
      'scoreEvidenceQuality',
      'Score Evidence Quality',
      'Score the quality of evidence behind any claim. Separate fact from anecdote from opinion.',
      superhumanTools.scoreEvidenceQuality,
      { tags: ['superhuman', 'research', 'evidence', 'critical-thinking'] }
    ),
    wrapLegacyTool(
      'synthesizeResearch',
      'Synthesize Research',
      'Synthesize research on any topic in seconds. Get the real consensus, not pop science headlines.',
      superhumanTools.synthesizeResearch,
      { tags: ['superhuman', 'research', 'synthesis', 'evidence'] }
    ),
    wrapLegacyTool(
      'findCounterArguments',
      'Find Counter Arguments',
      'Find counter-arguments to any claim. Combat confirmation bias by seeing the other side.',
      superhumanTools.findCounterArguments,
      { tags: ['superhuman', 'research', 'critical-thinking', 'bias'] }
    ),
    wrapLegacyTool(
      'verifyClaim',
      'Verify Claim',
      'Verify any claim against evidence. Get a truth rating from verified to false.',
      superhumanTools.verifyClaim,
      { tags: ['superhuman', 'research', 'fact-check', 'evidence'] }
    ),
    wrapLegacyTool(
      'getBaseRate',
      'Get Base Rate',
      'Get the base rate for any situation. Combat probability blindness with real statistics.',
      superhumanTools.getBaseRate,
      { tags: ['superhuman', 'research', 'statistics', 'probability'] }
    ),

    // ============================================================================
    // PREDICTIVE MODELING (7 tools)
    // ============================================================================
    wrapLegacyTool(
      'recordGoalProgress',
      'Record Goal Progress',
      'Record progress on a goal for predictive modeling.',
      superhumanTools.recordGoalProgress,
      { tags: ['superhuman', 'predictive', 'goals', 'tracking'] }
    ),
    wrapLegacyTool(
      'predictGoalSuccess',
      'Predict Goal Success',
      'Predict the probability of achieving a goal based on YOUR patterns and similar goals.',
      superhumanTools.predictGoalSuccess,
      { tags: ['superhuman', 'predictive', 'goals', 'probability'] }
    ),
    wrapLegacyTool(
      'projectBehavioralTrajectory',
      'Project Behavioral Trajectory',
      'Project where you are heading based on current behaviors. See your future self.',
      superhumanTools.projectBehavioralTrajectory,
      { tags: ['superhuman', 'predictive', 'behavior', 'trajectory'] }
    ),
    wrapLegacyTool(
      'recordHabit',
      'Record Habit',
      'Record a habit for survival analysis.',
      superhumanTools.recordHabit,
      { tags: ['superhuman', 'predictive', 'habits', 'tracking'] }
    ),
    wrapLegacyTool(
      'analyzeHabitSurvival',
      'Analyze Habit Survival',
      'Predict habit survival probability based on YOUR history. Know which habits will stick.',
      superhumanTools.analyzeHabitSurvival,
      { tags: ['superhuman', 'predictive', 'habits', 'probability'] }
    ),
    wrapLegacyTool(
      'analyzeCounterfactual',
      'Analyze Counterfactual',
      'Analyze what would have happened if you made a different choice. Learn from alternate timelines.',
      superhumanTools.analyzeCounterfactual,
      { tags: ['superhuman', 'predictive', 'counterfactual', 'analysis'] }
    ),
    wrapLegacyTool(
      'predictLifeEventImpact',
      'Predict Life Event Impact',
      'Predict how a life event will impact your life across multiple dimensions.',
      superhumanTools.predictLifeEventImpact,
      { tags: ['superhuman', 'predictive', 'life-events', 'impact'] }
    ),

    // ============================================================================
    // FINANCIAL RESEARCH (4 tools)
    // ============================================================================
    wrapLegacyTool(
      'analyzeSECFiling',
      'Analyze SEC Filing',
      'Analyze SEC filings for any public company. Find what management is really saying.',
      superhumanTools.analyzeSECFiling,
      { tags: ['superhuman', 'financial-research', 'sec', 'analysis'] }
    ),
    wrapLegacyTool(
      'trackInsiderTrading',
      'Track Insider Trading',
      'Track insider buying and selling patterns. See what executives are doing with their own money.',
      superhumanTools.trackInsiderTrading,
      { tags: ['superhuman', 'financial-research', 'insider', 'trading'] }
    ),
    wrapLegacyTool(
      'analyzeOptionsFlow',
      'Analyze Options Flow',
      'Analyze institutional options flow. See where smart money is betting.',
      superhumanTools.analyzeOptionsFlow,
      { tags: ['superhuman', 'financial-research', 'options', 'institutional'] }
    ),
    wrapLegacyTool(
      'bridgeMacroToPersonal',
      'Bridge Macro to Personal',
      'Connect macroeconomic events to YOUR personal finances. Make macro relevant.',
      superhumanTools.bridgeMacroToPersonal,
      { tags: ['superhuman', 'financial-research', 'macro', 'personal'] }
    ),

    // ============================================================================
    // EXPERIMENTATION (9 tools)
    // ============================================================================
    wrapLegacyTool(
      'designExperiment',
      'Design Experiment',
      'Design a personal A/B test with proper experimental methodology. Test if an intervention actually works for YOU.',
      superhumanTools.designExperiment,
      { tags: ['superhuman', 'experimentation', 'ab-test', 'scientific-method'] }
    ),
    wrapLegacyTool(
      'recordExperimentData',
      'Record Experiment Data',
      'Record data for an ongoing experiment.',
      superhumanTools.recordExperimentData,
      { tags: ['superhuman', 'experimentation', 'data', 'tracking'] }
    ),
    wrapLegacyTool(
      'analyzeExperiment',
      'Analyze Experiment',
      'Analyze experiment results with statistical rigor. Know if results are real or noise.',
      superhumanTools.analyzeExperiment,
      { tags: ['superhuman', 'experimentation', 'analysis', 'statistics'] }
    ),
    wrapLegacyTool(
      'createBelief',
      'Create Belief',
      'Create a belief to track with Bayesian updating. Watch your confidence evolve with evidence.',
      superhumanTools.createBelief,
      { tags: ['superhuman', 'experimentation', 'bayesian', 'beliefs'] }
    ),
    wrapLegacyTool(
      'updateBelief',
      'Update Belief',
      'Update a belief with new evidence using Bayesian reasoning.',
      superhumanTools.updateBelief,
      { tags: ['superhuman', 'experimentation', 'bayesian', 'beliefs'] }
    ),
    wrapLegacyTool(
      'trackHypothesis',
      'Track Hypothesis',
      'Track a hypothesis about your life.',
      superhumanTools.trackHypothesis,
      { tags: ['superhuman', 'experimentation', 'hypothesis', 'tracking'] }
    ),
    wrapLegacyTool(
      'updateHypothesis',
      'Update Hypothesis',
      'Update hypothesis status based on evidence.',
      superhumanTools.updateHypothesis,
      { tags: ['superhuman', 'experimentation', 'hypothesis', 'evidence'] }
    ),
    wrapLegacyTool(
      'detectConfounds',
      'Detect Confounds',
      'Detect potential confounding variables in any correlation you notice.',
      superhumanTools.detectConfounds,
      { tags: ['superhuman', 'experimentation', 'confounds', 'causation'] }
    ),
    wrapLegacyTool(
      'calculateEffectSize',
      'Calculate Effect Size',
      'Calculate effect size for any intervention. Know if a change is meaningful, not just statistically significant.',
      superhumanTools.calculateEffectSize,
      { tags: ['superhuman', 'experimentation', 'effect-size', 'statistics'] }
    ),

    // ============================================================================
    // EXTERNAL DATA (5 tools)
    // ============================================================================
    wrapLegacyTool(
      'getLocalEconomics',
      'Get Local Economics',
      'Get local economic indicators for your area. See how YOUR local economy is doing.',
      superhumanTools.getLocalEconomics,
      { tags: ['superhuman', 'external-data', 'economics', 'local'] }
    ),
    wrapLegacyTool(
      'synthesizeIndustryTrends',
      'Synthesize Industry Trends',
      'Synthesize trends for any industry. Know where sectors are heading.',
      superhumanTools.synthesizeIndustryTrends,
      { tags: ['superhuman', 'external-data', 'industry', 'trends'] }
    ),
    wrapLegacyTool(
      'analyzeNewsSentiment',
      'Analyze News Sentiment',
      'Analyze news sentiment for any topic. Cut through noise to see the real narrative.',
      superhumanTools.analyzeNewsSentiment,
      { tags: ['superhuman', 'external-data', 'news', 'sentiment'] }
    ),
    wrapLegacyTool(
      'recordSpending',
      'Record Spending',
      'Record spending for personal inflation calculation.',
      superhumanTools.recordSpending,
      { tags: ['superhuman', 'external-data', 'spending', 'inflation'] }
    ),
    wrapLegacyTool(
      'calculatePersonalInflation',
      'Calculate Personal Inflation',
      'Calculate YOUR personal inflation rate. See how inflation actually affects YOU.',
      superhumanTools.calculatePersonalInflation,
      { tags: ['superhuman', 'external-data', 'inflation', 'personal'] }
    ),

    // ============================================================================
    // NETWORK ANALYTICS (6 tools)
    // ============================================================================
    wrapLegacyTool(
      'trackRelationship',
      'Track Relationship',
      'Track a relationship to analyze patterns over time. Build your relationship map.',
      superhumanTools.trackRelationship,
      { tags: ['superhuman', 'network', 'relationships', 'tracking'] }
    ),
    wrapLegacyTool(
      'logInteraction',
      'Log Interaction',
      'Log an interaction with someone in your network.',
      superhumanTools.logInteraction,
      { tags: ['superhuman', 'network', 'interactions', 'tracking'] }
    ),
    wrapLegacyTool(
      'analyzeCommunicationPatterns',
      'Analyze Communication Patterns',
      'Analyze your communication patterns. See who you turn to for what.',
      superhumanTools.analyzeCommunicationPatterns,
      { tags: ['superhuman', 'network', 'communication', 'patterns'] }
    ),
    wrapLegacyTool(
      'scoreRelationshipHealth',
      'Score Relationship Health',
      'Score the health of your relationships objectively. Catch declining relationships early.',
      superhumanTools.scoreRelationshipHealth,
      { tags: ['superhuman', 'network', 'relationships', 'health'] }
    ),
    wrapLegacyTool(
      'mapInfluence',
      'Map Influence',
      'Map who influences your decisions in different areas. Understand your influence network.',
      superhumanTools.mapInfluence,
      { tags: ['superhuman', 'network', 'influence', 'decisions'] }
    ),
    wrapLegacyTool(
      'analyzeNetworkGaps',
      'Analyze Network Gaps',
      'Analyze gaps in your network. Find what types of people you need but lack.',
      superhumanTools.analyzeNetworkGaps,
      { tags: ['superhuman', 'network', 'gaps', 'optimization'] }
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
      description:
        'Explain any financial concept with examples and connections to related concepts. Perfect for learning.',
      domain: 'research',
      tags: ['knowledge', 'education', 'concepts'],
      create: (_ctx: ToolContext) => {
        return {
          description: 'Explain any financial concept with examples and connections',
          parameters: {
            type: 'object',
            properties: { concept: { type: 'string', description: 'The concept to explain' } },
          },
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

            const lines = [`📚 **${node.name}**`, '', `📖 ${node.definition}`, ''];

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
      description:
        'Get a personalized learning path from basics to advanced topics based on what you already know.',
      domain: 'research',
      tags: ['knowledge', 'education', 'learning-path'],
      create: (_ctx: ToolContext) => {
        return {
          description: 'Get a learning path from basics to advanced',
          parameters: {
            type: 'object',
            properties: {
              targetConcept: { type: 'string', description: 'What you want to understand' },
              currentLevel: {
                type: 'string',
                enum: ['beginner', 'intermediate', 'advanced'],
                description: 'Your current level',
              },
            },
          },
          execute: async ({
            targetConcept,
            currentLevel,
          }: {
            targetConcept: string;
            currentLevel: 'beginner' | 'intermediate' | 'advanced';
          }) => {
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
              lines.push(
                `  ${rec.context.difficulty === 'beginner' ? '🌱' : rec.context.difficulty === 'intermediate' ? '📈' : '🎓'} ${rec.name}`
              );
            }

            return lines.join('\n');
          },
        };
      },
    },
  ];
}

// ============================================================================
// BACKGROUND RESEARCH TOOLS (Peter's "While You Were Away" Powers)
// ============================================================================

function getBackgroundResearchToolDefinitions(): ToolDefinition[] {
  return [
    {
      id: 'backgroundResearch',
      name: 'Background Research',
      description:
        'Start background research that continues even when the user disconnects. Perfect for: "Research NVDA while I\'m away", "Find out about X and let me know later", "Dig into this topic in the background". Results are delivered when the user reconnects.',
      domain: 'research',
      tags: ['background', 'async', 'research', 'while-you-were-away'],
      create: (ctx: ToolContext) => {
        return {
          description:
            'Start deep research in the background. Results are saved and delivered when the user returns. Use for research that takes time.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'What to research (stock symbol, topic, question, company)',
              },
              researchType: {
                type: 'string',
                enum: ['stock_analysis', 'fact_check', 'deep_dive', 'market_research', 'general'],
                description: 'Type of research to perform',
              },
              depth: {
                type: 'string',
                enum: ['quick', 'standard', 'comprehensive'],
                description: 'How deep to go (default: standard)',
              },
              urgency: {
                type: 'string',
                enum: ['when_ready', 'asap', 'next_session'],
                description: 'When to deliver results (default: when_ready)',
              },
            },
            required: ['query', 'researchType'],
          },
          execute: async ({
            query,
            researchType,
            depth = 'standard',
            urgency = 'when_ready',
          }: {
            query: string;
            researchType:
              | 'stock_analysis'
              | 'fact_check'
              | 'deep_dive'
              | 'market_research'
              | 'general';
            depth?: 'quick' | 'standard' | 'comprehensive';
            urgency?: 'when_ready' | 'asap' | 'next_session';
          }) => {
            try {
              const { queueResearchTask } =
                await import('../../../services/background-agents/index.js');

              const taskId = await queueResearchTask({
                userId: ctx.userId || 'anonymous',
                query,
                type: researchType,
                depth,
                initiatedBy: 'peter',
                sessionId: ctx.sessionId,
                context: urgency !== 'when_ready' ? `Delivery: ${urgency}` : undefined,
              });

              return `**Background Research Started** 🔍

I'm on it! I'll research "${query}" in the background.

**Research Type:** ${researchType.replace(/_/g, ' ')}
**Depth:** ${depth}
**Task ID:** ${taskId.slice(0, 8)}...

I'll keep working on this even if you disconnect. When you come back, I'll have findings ready to share!`;
            } catch (error) {
              return `I couldn't start the background research right now. Let me do this research in real-time instead...`;
            }
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
  ...getBackgroundResearchToolDefinitions(),
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
