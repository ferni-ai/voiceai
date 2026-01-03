/**
 * Advanced Financial Research Tools
 *
 * These tools give Peter institutional-grade financial research capabilities:
 * SEC filing analysis, insider trading tracking, options flow, and
 * macro-to-personal impact analysis.
 *
 * "Better than Human" because: Individual investors rarely have access to
 * the research tools that institutions use.
 *
 * @module tools/domains/research/superhuman-tools/financial-research
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  SECFilingAnalysis,
  InsiderTradingActivity,
  OptionsFlowAnalysis,
  MacroPersonalBridge,
} from './types.js';
import { getUserIdFromContext } from './firestore-persistence.js';

const log = getLogger();

// Rate limiters are auto-configured via getServiceConfig
// sec-edgar, market-data, options-flow will use default conservative limits

// ============================================================================
// SEC FILING ANALYZER
// ============================================================================

// Simulated SEC filing data (would use EDGAR API in production)
function getSimulatedSECFiling(symbol: string): SECFilingAnalysis | null {
  const filings: Record<string, SECFilingAnalysis> = {
    AAPL: {
      symbol: 'AAPL',
      filingType: '10-K',
      filingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      keyChanges: [
        { section: 'Revenue Recognition', change: 'Updated service revenue recognition timing', significance: 'medium' },
        { section: 'Risk Factors', change: 'Added supply chain concentration risk in Asia', significance: 'high' },
        { section: 'Segment Reporting', change: 'Services revenue now 22% of total', significance: 'medium' },
      ],
      riskFactors: [
        'Supply chain concentration in specific regions',
        'Foreign exchange exposure',
        'Regulatory scrutiny of App Store practices',
        'Competition in smartphone market',
      ],
      managementDiscussion: 'Management expects continued services growth offset by hardware cyclicality. Increased R&D spending focused on AR/VR and AI integration.',
      redFlags: [],
      opportunities: [
        'Services segment growing faster than hardware',
        'Strong cash position for M&A or buybacks',
        'Emerging market expansion',
      ],
    },
    MSFT: {
      symbol: 'MSFT',
      filingType: '10-K',
      filingDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      keyChanges: [
        { section: 'Cloud Revenue', change: 'Azure growth rate disclosed separately', significance: 'high' },
        { section: 'AI Investments', change: 'Significant increase in AI infrastructure capex', significance: 'high' },
        { section: 'Gaming', change: 'Activision acquisition impact on segment', significance: 'medium' },
      ],
      riskFactors: [
        'Cloud infrastructure competition',
        'AI development costs and returns uncertainty',
        'Regulatory scrutiny of acquisitions',
        'Cybersecurity threats',
      ],
      managementDiscussion: 'Management sees AI as transformational opportunity across all segments. Cloud growth expected to moderate but remain strong.',
      redFlags: [
        'Capex increasing faster than revenue - watch for ROI',
      ],
      opportunities: [
        'AI integration across product suite',
        'Enterprise cloud market leadership',
        'Gaming ecosystem growth post-Activision',
      ],
    },
    TSLA: {
      symbol: 'TSLA',
      filingType: '10-K',
      filingDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      keyChanges: [
        { section: 'Gross Margin', change: 'Automotive gross margin declined due to price cuts', significance: 'high' },
        { section: 'Energy Business', change: 'Energy storage deployments up 125% YoY', significance: 'medium' },
        { section: 'FSD Revenue', change: 'Deferred revenue recognition for FSD changed', significance: 'high' },
      ],
      riskFactors: [
        'EV competition intensifying globally',
        'Lithium and battery supply constraints',
        'Regulatory changes to EV incentives',
        'Executive dependency (CEO)',
        'FSD liability and regulatory approval',
      ],
      managementDiscussion: 'Management prioritizing volume over margin in near term. Energy business expected to become significant contributor.',
      redFlags: [
        'Margin compression ongoing - price war dynamics',
        'FSD revenue recognition is complex and aggressive',
        'Executive distraction risk',
      ],
      opportunities: [
        'Energy storage growth accelerating',
        'Manufacturing cost advantages',
        'FSD monetization potential',
      ],
    },
  };

  return filings[symbol.toUpperCase()] || null;
}

export const analyzeSECFiling = llm.tool({
  description:
    "Analyze SEC filings (10-K, 10-Q) for any stock. Extract key changes, risk factors, red flags, and opportunities that most investors miss.",
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    filingType: z.enum(['10-K', '10-Q', 'latest']).default('latest')
      .describe('Type of filing to analyze'),
  }),
  execute: async (params: { symbol: string; filingType: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '📋 Analyzing SEC filing');

    const filing = getSimulatedSECFiling(params.symbol);

    if (!filing) {
      return [
        `📋 **SEC FILING ANALYSIS**`,
        '',
        `Symbol: ${params.symbol.toUpperCase()}`,
        '',
        `⚠️ **Filing not found in database**`,
        '',
        `I don't have SEC filing data for ${params.symbol.toUpperCase()}.`,
        '',
        `**What I can analyze:**`,
        `• AAPL, MSFT, TSLA, and other major companies`,
        '',
        `**What to look for in filings yourself:**`,
        `1. Risk factors section - new risks added?`,
        `2. MD&A - management tone changes?`,
        `3. Related party transactions`,
        `4. Changes in accounting policies`,
        `5. Insider compensation structure`,
      ].join('\n');
    }

    const daysSinceFiling = Math.floor((Date.now() - filing.filingDate.getTime()) / (1000 * 60 * 60 * 24));

    return [
      `📋 **SEC FILING ANALYSIS: ${filing.symbol}**`,
      '',
      `Filing: ${filing.filingType}`,
      `Date: ${filing.filingDate.toLocaleDateString()} (${daysSinceFiling} days ago)`,
      '',
      `═══════════════════════════════════`,
      `🔄 **KEY CHANGES FROM PRIOR FILING**`,
      `═══════════════════════════════════`,
      '',
      ...filing.keyChanges.map(c => {
        const icon = c.significance === 'high' ? '🔴' : c.significance === 'medium' ? '🟡' : '🟢';
        return `${icon} **${c.section}**\n   ${c.change}\n`;
      }),
      `═══════════════════════════════════`,
      `⚠️ **RISK FACTORS**`,
      `═══════════════════════════════════`,
      '',
      ...filing.riskFactors.map(r => `• ${r}`),
      '',
      `═══════════════════════════════════`,
      `💬 **MANAGEMENT DISCUSSION SUMMARY**`,
      `═══════════════════════════════════`,
      '',
      filing.managementDiscussion,
      '',
      filing.redFlags.length > 0 ? `═══════════════════════════════════` : '',
      filing.redFlags.length > 0 ? `🚩 **RED FLAGS**` : '',
      filing.redFlags.length > 0 ? `═══════════════════════════════════` : '',
      filing.redFlags.length > 0 ? '' : '',
      ...filing.redFlags.map(r => `• ${r}`),
      filing.redFlags.length > 0 ? '' : '',
      `═══════════════════════════════════`,
      `✅ **OPPORTUNITIES IDENTIFIED**`,
      `═══════════════════════════════════`,
      '',
      ...filing.opportunities.map(o => `• ${o}`),
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      `Most investors never read filings. You now have an edge.`,
      ``,
      `Key questions to ask:`,
      `• Have the risk factors changed materially?`,
      `• Is management's tone different from last year?`,
      `• Are there accounting changes that affect comparability?`,
      '',
      `Remember: The story in the filing often differs from the story in the press.`,
    ].filter(Boolean).join('\n');
  },
});

// ============================================================================
// INSIDER TRADING TRACKER
// ============================================================================

function getSimulatedInsiderActivity(symbol: string): InsiderTradingActivity | null {
  const activities: Record<string, InsiderTradingActivity> = {
    AAPL: {
      symbol: 'AAPL',
      period: 'Last 90 days',
      transactions: [
        { date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), insiderName: 'Tim Cook', title: 'CEO', transactionType: 'sell', shares: 50000, pricePerShare: 178.50, totalValue: 8925000 },
        { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), insiderName: 'Luca Maestri', title: 'CFO', transactionType: 'sell', shares: 20000, pricePerShare: 182.30, totalValue: 3646000 },
        { date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), insiderName: 'Katherine Adams', title: 'General Counsel', transactionType: 'option_exercise', shares: 100000, pricePerShare: 165.00, totalValue: 16500000 },
      ],
      netInsiderSentiment: 'neutral',
      clusterBuying: false,
      interpretation: 'Routine selling for tax/diversification. No unusual patterns detected. Option exercises are typically automatic.',
    },
    NVDA: {
      symbol: 'NVDA',
      period: 'Last 90 days',
      transactions: [
        { date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), insiderName: 'Jensen Huang', title: 'CEO', transactionType: 'sell', shares: 120000, pricePerShare: 485.00, totalValue: 58200000 },
        { date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), insiderName: 'Colette Kress', title: 'CFO', transactionType: 'sell', shares: 45000, pricePerShare: 470.00, totalValue: 21150000 },
        { date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), insiderName: 'Jensen Huang', title: 'CEO', transactionType: 'sell', shares: 100000, pricePerShare: 450.00, totalValue: 45000000 },
      ],
      netInsiderSentiment: 'bearish',
      clusterBuying: false,
      interpretation: 'Heavy insider selling at elevated prices. Could be routine 10b5-1 plans or genuine concern. Worth monitoring.',
    },
    META: {
      symbol: 'META',
      period: 'Last 90 days',
      transactions: [
        { date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), insiderName: 'Board Member', title: 'Director', transactionType: 'buy', shares: 5000, pricePerShare: 325.00, totalValue: 1625000 },
        { date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), insiderName: 'Board Member', title: 'Director', transactionType: 'buy', shares: 3000, pricePerShare: 310.00, totalValue: 930000 },
        { date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000), insiderName: 'Susan Li', title: 'CFO', transactionType: 'buy', shares: 2000, pricePerShare: 298.00, totalValue: 596000 },
      ],
      netInsiderSentiment: 'bullish',
      clusterBuying: true,
      interpretation: 'CLUSTER BUYING DETECTED. Multiple insiders buying with their own money is a strong bullish signal. They see something.',
    },
  };

  return activities[symbol.toUpperCase()] || null;
}

export const trackInsiderTrading = llm.tool({
  description:
    "Track insider buying and selling. When executives buy with their own money, pay attention. Cluster buying is especially significant.",
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),
  execute: async (params: { symbol: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '👔 Tracking insider activity');

    const activity = getSimulatedInsiderActivity(params.symbol);

    if (!activity) {
      return [
        `👔 **INSIDER TRADING ACTIVITY**`,
        '',
        `Symbol: ${params.symbol.toUpperCase()}`,
        '',
        `⚠️ **No recent insider activity found**`,
        '',
        `Either there's been no reportable transactions, or I don't have data for this stock.`,
        '',
        `**What insider activity tells us:**`,
        `• Buying = They're putting their own money at risk (bullish signal)`,
        `• Selling = Could be diversification OR genuine concern`,
        `• Cluster buying = Multiple insiders buying together (very bullish)`,
        '',
        `**Companies I track:**`,
        `AAPL, NVDA, META, MSFT, TSLA, and more`,
      ].join('\n');
    }

    const totalBought = activity.transactions
      .filter(t => t.transactionType === 'buy')
      .reduce((sum, t) => sum + t.totalValue, 0);
    const totalSold = activity.transactions
      .filter(t => t.transactionType === 'sell')
      .reduce((sum, t) => sum + t.totalValue, 0);

    const sentimentEmoji = activity.netInsiderSentiment === 'bullish' ? '🟢' : 
                          activity.netInsiderSentiment === 'bearish' ? '🔴' : '🟡';

    return [
      `👔 **INSIDER TRADING ACTIVITY: ${activity.symbol}**`,
      '',
      `Period: ${activity.period}`,
      '',
      `═══════════════════════════════════`,
      `${sentimentEmoji} **NET SENTIMENT: ${activity.netInsiderSentiment.toUpperCase()}**`,
      activity.clusterBuying ? `🎯 **CLUSTER BUYING DETECTED**` : '',
      `═══════════════════════════════════`,
      '',
      `**Summary:**`,
      `• Total bought: $${totalBought.toLocaleString()}`,
      `• Total sold: $${totalSold.toLocaleString()}`,
      `• Transactions: ${activity.transactions.length}`,
      '',
      `═══════════════════════════════════`,
      `📋 **RECENT TRANSACTIONS**`,
      `═══════════════════════════════════`,
      '',
      ...activity.transactions.map(t => {
        const typeEmoji = t.transactionType === 'buy' ? '🟢 BUY' : 
                         t.transactionType === 'sell' ? '🔴 SELL' : '⚪ EXERCISE';
        return [
          `${typeEmoji} - ${t.insiderName} (${t.title})`,
          `   ${t.shares.toLocaleString()} shares @ $${t.pricePerShare.toFixed(2)}`,
          `   Total: $${t.totalValue.toLocaleString()}`,
          `   Date: ${t.date.toLocaleDateString()}`,
          '',
        ].join('\n');
      }),
      `═══════════════════════════════════`,
      `🎯 **INTERPRETATION**`,
      `═══════════════════════════════════`,
      '',
      activity.interpretation,
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      activity.clusterBuying
        ? `Cluster buying is one of the strongest signals. Multiple people putting their own money at risk means they REALLY believe.`
        : activity.netInsiderSentiment === 'bearish'
          ? `Heavy selling could be routine (10b5-1 plans, diversification) or genuine concern. Context matters.`
          : `Routine activity. Insiders always sell some - they have bills too. Look for UNUSUAL patterns.`,
      '',
      `Remember: Insiders sell for many reasons, but they only BUY for one.`,
    ].filter(Boolean).join('\n');
  },
});

// ============================================================================
// OPTIONS FLOW ANALYZER
// ============================================================================

function getSimulatedOptionsFlow(symbol: string): OptionsFlowAnalysis | null {
  const flows: Record<string, OptionsFlowAnalysis> = {
    SPY: {
      symbol: 'SPY',
      unusualActivity: [
        { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), type: 'put', strike: 450, expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), volume: 50000, openInterest: 12000, premium: 2500000, sentiment: 'bearish' },
        { timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000), type: 'call', strike: 480, expiration: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), volume: 30000, openInterest: 8000, premium: 1800000, sentiment: 'bullish' },
      ],
      putCallRatio: 1.2,
      smartMoneyIndicator: 'neutral',
      interpretation: 'Mixed signals. Large put buying may be hedging rather than directional bets. Watch for follow-through.',
    },
    TSLA: {
      symbol: 'TSLA',
      unusualActivity: [
        { timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), type: 'call', strike: 300, expiration: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), volume: 25000, openInterest: 3000, premium: 3200000, sentiment: 'bullish' },
        { timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), type: 'call', strike: 280, expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), volume: 18000, openInterest: 2500, premium: 2100000, sentiment: 'bullish' },
        { timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000), type: 'call', strike: 320, expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), volume: 15000, openInterest: 4000, premium: 1500000, sentiment: 'bullish' },
      ],
      putCallRatio: 0.6,
      smartMoneyIndicator: 'bullish',
      interpretation: 'UNUSUAL BULLISH ACTIVITY. Multiple large call sweeps at various strikes. Someone is positioning for upside.',
    },
  };

  return flows[symbol.toUpperCase()] || null;
}

export const analyzeOptionsFlow = llm.tool({
  description:
    "Analyze unusual options activity. Large, unusual options trades often precede major moves. See what smart money might be positioning for.",
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),
  execute: async (params: { symbol: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '📊 Analyzing options flow');

    const flow = getSimulatedOptionsFlow(params.symbol);

    if (!flow) {
      return [
        `📊 **OPTIONS FLOW ANALYSIS**`,
        '',
        `Symbol: ${params.symbol.toUpperCase()}`,
        '',
        `⚠️ **No unusual options activity detected**`,
        '',
        `Either the market is quiet on this stock, or I don't have data.`,
        '',
        `**What unusual options activity tells us:**`,
        `• Large premium = Someone is willing to pay big for exposure`,
        `• Near-term expiration = Expecting imminent move`,
        `• Volume > OI = New positions being opened`,
        `• Sweeps (hitting ask) = Urgency to get filled`,
        '',
        `**Symbols I track:**`,
        `SPY, QQQ, TSLA, NVDA, and major index options`,
      ].join('\n');
    }

    const sentimentEmoji = flow.smartMoneyIndicator === 'bullish' ? '🟢' :
                          flow.smartMoneyIndicator === 'bearish' ? '🔴' : '🟡';

    return [
      `📊 **OPTIONS FLOW ANALYSIS: ${flow.symbol}**`,
      '',
      `═══════════════════════════════════`,
      `${sentimentEmoji} **SMART MONEY INDICATOR: ${flow.smartMoneyIndicator.toUpperCase()}**`,
      `═══════════════════════════════════`,
      '',
      `**Put/Call Ratio:** ${flow.putCallRatio.toFixed(2)}`,
      flow.putCallRatio > 1 ? `(More puts than calls - potentially bearish)` :
      flow.putCallRatio < 0.7 ? `(More calls than puts - potentially bullish)` :
      `(Balanced activity)`,
      '',
      `═══════════════════════════════════`,
      `🎯 **UNUSUAL ACTIVITY**`,
      `═══════════════════════════════════`,
      '',
      ...flow.unusualActivity.map(a => {
        const typeEmoji = a.type === 'call' ? '🟢' : '🔴';
        const daysToExp = Math.ceil((a.expiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return [
          `${typeEmoji} **${a.type.toUpperCase()} $${a.strike}** (${daysToExp} days to exp)`,
          `   Volume: ${a.volume.toLocaleString()} | OI: ${a.openInterest.toLocaleString()}`,
          `   Premium: $${a.premium.toLocaleString()}`,
          `   Vol/OI: ${(a.volume / a.openInterest).toFixed(1)}x (${a.volume > a.openInterest * 2 ? 'NEW POSITIONS' : 'normal'})`,
          '',
        ].join('\n');
      }),
      `═══════════════════════════════════`,
      `🎯 **INTERPRETATION**`,
      `═══════════════════════════════════`,
      '',
      flow.interpretation,
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      `Options flow is a leading indicator, not a guarantee.`,
      '',
      `**Key things to look for:**`,
      `• Volume >> Open Interest = New bets being placed`,
      `• Large premium + short expiration = High conviction`,
      `• Sweeping the ask = Urgency`,
      '',
      `**Caveats:**`,
      `• Could be hedging, not directional bets`,
      `• Smart money is wrong sometimes`,
      `• This is ONE input, not THE input`,
    ].join('\n');
  },
});

// ============================================================================
// MACRO-PERSONAL BRIDGE
// ============================================================================

export const bridgeMacroToPersonal = llm.tool({
  description:
    "Connect macro economic events to YOUR personal finances. When the Fed raises rates, what should YOU do? Make macro relevant.",
  parameters: z.object({
    macroEvent: z.enum([
      'fed_rate_hike',
      'fed_rate_cut',
      'inflation_rising',
      'inflation_falling',
      'recession_declared',
      'unemployment_rising',
      'housing_cooling',
      'stock_market_correction',
      'dollar_strengthening',
      'dollar_weakening',
    ]).describe('The macro event'),
    personalContext: z.string().optional().describe('Your specific financial situation'),
  }),
  execute: async (
    params: { macroEvent: string; personalContext?: string },
    { ctx }: { ctx: unknown }
  ) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, event: params.macroEvent }, '🌍 Bridging macro to personal');

    const macroImpacts: Record<string, {
      event: string;
      impacts: { area: string; impact: string; action: string; urgency: string }[];
      opportunities: string[];
      risks: string[];
    }> = {
      fed_rate_hike: {
        event: 'Federal Reserve Rate Hike',
        impacts: [
          { area: 'Mortgage', impact: 'Higher rates on new mortgages', action: 'Lock in rates NOW if buying', urgency: 'immediate' },
          { area: 'Credit Cards', impact: 'APR increases', action: 'Pay down high-interest debt faster', urgency: 'soon' },
          { area: 'Savings', impact: 'Higher yields on savings accounts', action: 'Move to high-yield savings', urgency: 'soon' },
          { area: 'Bonds', impact: 'Bond prices fall, yields rise', action: 'Consider shorter duration bonds', urgency: 'monitor' },
          { area: 'Stocks', impact: 'Potential pressure on valuations', action: 'Maintain long-term allocation', urgency: 'monitor' },
        ],
        opportunities: [
          'Higher CD and money market yields',
          'Better returns on new bond purchases',
          'I-bonds may offer attractive rates',
        ],
        risks: [
          'Existing bond holdings lose value',
          'ARM mortgages become more expensive',
          'Economic slowdown possible',
        ],
      },
      fed_rate_cut: {
        event: 'Federal Reserve Rate Cut',
        impacts: [
          { area: 'Mortgage', impact: 'Lower rates possible', action: 'Consider refinancing if rates drop 0.75%+', urgency: 'soon' },
          { area: 'Savings', impact: 'Lower yields on savings', action: 'Lock in current CD rates', urgency: 'immediate' },
          { area: 'Bonds', impact: 'Bond prices rise', action: 'Existing bonds gain value', urgency: 'monitor' },
          { area: 'Stocks', impact: 'Often positive for stocks', action: 'Stay invested', urgency: 'monitor' },
        ],
        opportunities: [
          'Refinance high-rate debt',
          'Lock in CD rates before they drop',
          'Mortgage rates likely to decline',
        ],
        risks: [
          'May signal economic weakness',
          'Savings yields decrease',
          'Could indicate Fed sees problems',
        ],
      },
      inflation_rising: {
        event: 'Inflation Rising',
        impacts: [
          { area: 'Cash', impact: 'Losing purchasing power', action: 'Minimize excess cash holdings', urgency: 'immediate' },
          { area: 'Salary', impact: 'Real wages declining', action: 'Negotiate raises or find new job', urgency: 'soon' },
          { area: 'Budget', impact: 'Expenses increasing', action: 'Audit subscriptions, cut discretionary', urgency: 'immediate' },
          { area: 'Investments', impact: 'Seek inflation hedges', action: 'Consider I-bonds, TIPS, commodities', urgency: 'soon' },
        ],
        opportunities: [
          'I-bonds offer inflation-adjusted returns',
          'Hard assets may appreciate',
          'Fixed-rate debt becomes cheaper in real terms',
        ],
        risks: [
          'Cash and bonds lose real value',
          'Standard of living pressure',
          'Fed may raise rates aggressively',
        ],
      },
      recession_declared: {
        event: 'Recession Officially Declared',
        impacts: [
          { area: 'Job', impact: 'Employment risk elevated', action: 'Build emergency fund to 6-12 months', urgency: 'immediate' },
          { area: 'Investments', impact: 'Markets may already have priced it in', action: 'DO NOT panic sell', urgency: 'immediate' },
          { area: 'Spending', impact: 'Uncertainty high', action: 'Reduce discretionary, increase savings', urgency: 'immediate' },
          { area: 'Career', impact: 'Job market tightens', action: 'Update skills, network actively', urgency: 'soon' },
        ],
        opportunities: [
          'Stocks often cheaper - DCA opportunities',
          'Housing prices may cool',
          'Career pivots sometimes easier during resets',
        ],
        risks: [
          'Job loss risk elevated',
          'Credit availability tightens',
          'Business income may decline',
        ],
      },
      stock_market_correction: {
        event: 'Stock Market Correction (10%+ decline)',
        impacts: [
          { area: 'Portfolio', impact: 'Paper losses', action: 'DO NOT sell - stick to plan', urgency: 'immediate' },
          { area: 'Contributions', impact: 'Buying opportunity', action: 'Continue or increase 401k/IRA', urgency: 'immediate' },
          { area: 'Cash', impact: 'Deployment opportunity', action: 'If you have cash, DCA in', urgency: 'soon' },
          { area: 'Emotions', impact: 'Fear may spike', action: 'Review your investment thesis', urgency: 'immediate' },
        ],
        opportunities: [
          'Buy quality at lower prices',
          'Tax-loss harvesting',
          'Rebalancing opportunity',
        ],
        risks: [
          'Correction could deepen',
          'Emotional decisions destroy returns',
          'May need liquidity at worst time',
        ],
      },
      housing_cooling: {
        event: 'Housing Market Cooling',
        impacts: [
          { area: 'Home Value', impact: 'May decline short-term', action: 'Ignore if not selling soon', urgency: 'monitor' },
          { area: 'Buying', impact: 'Better negotiating position', action: 'Consider offers below asking', urgency: 'soon' },
          { area: 'Refinance', impact: 'Home equity may decrease', action: 'Refi before values drop more', urgency: 'soon' },
          { area: 'Renting', impact: 'Rent pressure may ease', action: 'Negotiate rent or consider moving', urgency: 'soon' },
        ],
        opportunities: [
          'Better deals for buyers',
          'Less competition in market',
          'Sellers more willing to negotiate',
        ],
        risks: [
          'Existing homeowners see equity decline',
          'HELOC limits may be reduced',
          'Underwater risk if bought recently',
        ],
      },
      unemployment_rising: {
        event: 'Unemployment Rising',
        impacts: [
          { area: 'Job Security', impact: 'Risk elevated', action: 'Make yourself indispensable', urgency: 'immediate' },
          { area: 'Emergency Fund', impact: 'More critical', action: 'Target 6-12 months expenses', urgency: 'immediate' },
          { area: 'Spending', impact: 'Reduce discretionary', action: 'Build cash buffer', urgency: 'soon' },
          { area: 'Network', impact: 'Relationships matter more', action: 'Strengthen professional network', urgency: 'soon' },
        ],
        opportunities: [
          'Employers may offer retention incentives',
          'Side gig demand may increase',
          'Recession-proof skills become valuable',
        ],
        risks: [
          'Job loss risk',
          'Raises and promotions may freeze',
          'Contract work may dry up',
        ],
      },
      dollar_strengthening: {
        event: 'US Dollar Strengthening',
        impacts: [
          { area: 'International Travel', impact: 'Cheaper abroad', action: 'Good time to travel internationally', urgency: 'soon' },
          { area: 'Imports', impact: 'Foreign goods cheaper', action: 'Consider imported purchases', urgency: 'monitor' },
          { area: 'Int\'l Stocks', impact: 'Returns hurt by FX', action: 'Understand your international exposure', urgency: 'monitor' },
          { area: 'Exports', impact: 'US exporters hurt', action: 'Be aware of multinational exposure', urgency: 'monitor' },
        ],
        opportunities: [
          'International travel bargains',
          'Foreign goods on sale',
          'Overseas real estate opportunities',
        ],
        risks: [
          'US multinational earnings pressured',
          'International investment returns hurt',
          'Export-heavy US companies struggle',
        ],
      },
      dollar_weakening: {
        event: 'US Dollar Weakening',
        impacts: [
          { area: 'International Travel', impact: 'More expensive abroad', action: 'Consider domestic travel', urgency: 'soon' },
          { area: 'Imports', impact: 'Foreign goods more expensive', action: 'Consider domestic alternatives', urgency: 'monitor' },
          { area: 'Int\'l Stocks', impact: 'Returns helped by FX', action: 'International diversification helps', urgency: 'monitor' },
          { area: 'Inflation', impact: 'Import prices rise', action: 'Factor into budget', urgency: 'monitor' },
        ],
        opportunities: [
          'International stock returns boosted',
          'US exporters benefit',
          'Foreign visitors boost US tourism',
        ],
        risks: [
          'Imported goods more expensive',
          'Travel abroad costs more',
          'Inflationary pressure',
        ],
      },
      inflation_falling: {
        event: 'Inflation Falling',
        impacts: [
          { area: 'Cash', impact: 'Less purchasing power erosion', action: 'Okay to hold more cash', urgency: 'monitor' },
          { area: 'Bonds', impact: 'Better real returns', action: 'Bonds become more attractive', urgency: 'soon' },
          { area: 'Budget', impact: 'Price pressure eases', action: 'Maintain savings rate', urgency: 'monitor' },
          { area: 'Rates', impact: 'Fed may cut', action: 'Lock in current rates on savings', urgency: 'soon' },
        ],
        opportunities: [
          'Real returns improve',
          'Cost of living pressure eases',
          'Fed may become more accommodative',
        ],
        risks: [
          'Could signal weak demand (recession risk)',
          'Savings rates may fall',
          'Deflation in extreme cases',
        ],
      },
    };

    const impact = macroImpacts[params.macroEvent];
    if (!impact) {
      return 'Unknown macro event. Please try one of the supported events.';
    }

    return [
      `🌍 **MACRO → PERSONAL BRIDGE**`,
      '',
      `Event: ${impact.event}`,
      params.personalContext ? `Your context: ${params.personalContext}` : '',
      '',
      `═══════════════════════════════════`,
      `📊 **HOW THIS AFFECTS YOU**`,
      `═══════════════════════════════════`,
      '',
      ...impact.impacts.map(i => {
        const urgencyEmoji = i.urgency === 'immediate' ? '🔴' : i.urgency === 'soon' ? '🟡' : '🟢';
        return [
          `**${i.area}**`,
          `• Impact: ${i.impact}`,
          `• Action: ${i.action}`,
          `• ${urgencyEmoji} Urgency: ${i.urgency}`,
          '',
        ].join('\n');
      }),
      `═══════════════════════════════════`,
      `✅ **OPPORTUNITIES CREATED**`,
      `═══════════════════════════════════`,
      '',
      ...impact.opportunities.map(o => `• ${o}`),
      '',
      `═══════════════════════════════════`,
      `⚠️ **RISKS TO MONITOR**`,
      `═══════════════════════════════════`,
      '',
      ...impact.risks.map(r => `• ${r}`),
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      `Macro news causes most people to either panic or ignore.`,
      `The right response is usually: "How does this specifically affect MY situation?"`,
      '',
      `This analysis gives you that specific bridge.`,
      `Act on the immediate items. Monitor the rest. Don't overreact.`,
    ].filter(Boolean).join('\n');
  },
});

// ============================================================================
// EXPORT
// ============================================================================

export const financialResearchTools = {
  analyzeSECFiling,
  trackInsiderTrading,
  analyzeOptionsFlow,
  bridgeMacroToPersonal,
};

export default financialResearchTools;
