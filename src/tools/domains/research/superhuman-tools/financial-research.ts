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
import { getUserIdFromContext } from './firestore-persistence.js';

const log = getLogger();

// Rate limiters are auto-configured via getServiceConfig
// sec-edgar, market-data, options-flow will use default conservative limits

// ============================================================================
// LIVE FILING, INSIDER AND OPTIONS DATA (not connected)
// ============================================================================
// No live provider is wired for these yet. The tools say so and point to the
// public source, rather than inventing filings, trades or flows for a ticker.

const EDGAR_SEARCH_URL = 'https://www.sec.gov/edgar/search/';

export const analyzeSECFiling = llm.tool({
  description:
    "Explain how to read a company's SEC filings (10-K, 10-Q). Live filing text is not connected, so this points to EDGAR instead of summarizing a filing.",
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    filingType: z
      .enum(['10-K', '10-Q', 'latest'])
      .default('latest')
      .describe('Type of filing to analyze'),
  }),
  execute: async (params: { symbol: string; filingType: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '📋 SEC filing requested; no live filing source');
    const symbol = params.symbol.toUpperCase();
    return [
      `I can't read live SEC filings right now, so I won't summarize ${symbol}'s ${params.filingType} filing.`,
      `You can read it free on SEC EDGAR (${EDGAR_SEARCH_URL}) by searching the ticker.`,
      '',
      `When you read it, look at:`,
      `1. Risk factors: are there new risks?`,
      `2. MD&A: has management's tone changed?`,
      `3. Related-party transactions`,
      `4. Changes in accounting policies`,
      `5. Executive pay structure`,
    ].join('\n');
  },
});

export const trackInsiderTrading = llm.tool({
  description:
    'Explain where to see insider buying and selling (SEC Form 4). Live insider data is not connected, so this points to EDGAR instead of listing trades.',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),
  execute: async (params: { symbol: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '🧾 Insider activity requested; no live source');
    const symbol = params.symbol.toUpperCase();
    return [
      `I can't see live insider trading filings right now, so I don't know what ${symbol}'s executives have traded.`,
      `Insider transactions are reported on SEC Form 4. You can search them free on EDGAR (${EDGAR_SEARCH_URL}).`,
      '',
      `Keep in mind that insiders trade for many reasons, such as taxes or diversification, so one transaction tells you little on its own.`,
    ].join('\n');
  },
});

export const analyzeOptionsFlow = llm.tool({
  description:
    'Explain how to read unusual options activity. Live options flow is not connected, so this says so instead of reporting where traders are positioned.',
  parameters: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),
  execute: async (params: { symbol: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, symbol: params.symbol }, '📊 Options flow requested; no live source');
    const symbol = params.symbol.toUpperCase();
    return [
      `I can't see live options activity for ${symbol} right now, so I won't say where traders are positioned.`,
      `Your broker's options chain shows volume and open interest for each strike.`,
      '',
      `Unusual volume can come from hedging as easily as from a directional bet, so treat it as one input among many.`,
    ].join('\n');
  },
});

// ============================================================================
// MACRO-PERSONAL BRIDGE
// ============================================================================

export const bridgeMacroToPersonal = llm.tool({
  description:
    'Connect macro economic events to YOUR personal finances. When the Fed raises rates, what should YOU do? Make macro relevant.',
  parameters: z.object({
    macroEvent: z
      .enum([
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
      ])
      .describe('The macro event'),
    personalContext: z.string().optional().describe('Your specific financial situation'),
  }),
  execute: async (
    params: { macroEvent: string; personalContext?: string },
    { ctx }: { ctx: unknown }
  ) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, event: params.macroEvent }, '🌍 Bridging macro to personal');

    const macroImpacts: Record<
      string,
      {
        event: string;
        impacts: { area: string; impact: string; action: string; urgency: string }[];
        opportunities: string[];
        risks: string[];
      }
    > = {
      fed_rate_hike: {
        event: 'Federal Reserve Rate Hike',
        impacts: [
          {
            area: 'Mortgage',
            impact: 'Higher rates on new mortgages',
            action: 'Lock in rates NOW if buying',
            urgency: 'immediate',
          },
          {
            area: 'Credit Cards',
            impact: 'APR increases',
            action: 'Pay down high-interest debt faster',
            urgency: 'soon',
          },
          {
            area: 'Savings',
            impact: 'Higher yields on savings accounts',
            action: 'Move to high-yield savings',
            urgency: 'soon',
          },
          {
            area: 'Bonds',
            impact: 'Bond prices fall, yields rise',
            action: 'Consider shorter duration bonds',
            urgency: 'monitor',
          },
          {
            area: 'Stocks',
            impact: 'Potential pressure on valuations',
            action: 'Maintain long-term allocation',
            urgency: 'monitor',
          },
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
          {
            area: 'Mortgage',
            impact: 'Lower rates possible',
            action: 'Consider refinancing if rates drop 0.75%+',
            urgency: 'soon',
          },
          {
            area: 'Savings',
            impact: 'Lower yields on savings',
            action: 'Lock in current CD rates',
            urgency: 'immediate',
          },
          {
            area: 'Bonds',
            impact: 'Bond prices rise',
            action: 'Existing bonds gain value',
            urgency: 'monitor',
          },
          {
            area: 'Stocks',
            impact: 'Often positive for stocks',
            action: 'Stay invested',
            urgency: 'monitor',
          },
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
          {
            area: 'Cash',
            impact: 'Losing purchasing power',
            action: 'Minimize excess cash holdings',
            urgency: 'immediate',
          },
          {
            area: 'Salary',
            impact: 'Real wages declining',
            action: 'Negotiate raises or find new job',
            urgency: 'soon',
          },
          {
            area: 'Budget',
            impact: 'Expenses increasing',
            action: 'Audit subscriptions, cut discretionary',
            urgency: 'immediate',
          },
          {
            area: 'Investments',
            impact: 'Seek inflation hedges',
            action: 'Consider I-bonds, TIPS, commodities',
            urgency: 'soon',
          },
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
          {
            area: 'Job',
            impact: 'Employment risk elevated',
            action: 'Build emergency fund to 6-12 months',
            urgency: 'immediate',
          },
          {
            area: 'Investments',
            impact: 'Markets may already have priced it in',
            action: 'DO NOT panic sell',
            urgency: 'immediate',
          },
          {
            area: 'Spending',
            impact: 'Uncertainty high',
            action: 'Reduce discretionary, increase savings',
            urgency: 'immediate',
          },
          {
            area: 'Career',
            impact: 'Job market tightens',
            action: 'Update skills, network actively',
            urgency: 'soon',
          },
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
          {
            area: 'Portfolio',
            impact: 'Paper losses',
            action: 'DO NOT sell - stick to plan',
            urgency: 'immediate',
          },
          {
            area: 'Contributions',
            impact: 'Buying opportunity',
            action: 'Continue or increase 401k/IRA',
            urgency: 'immediate',
          },
          {
            area: 'Cash',
            impact: 'Deployment opportunity',
            action: 'If you have cash, DCA in',
            urgency: 'soon',
          },
          {
            area: 'Emotions',
            impact: 'Fear may spike',
            action: 'Review your investment thesis',
            urgency: 'immediate',
          },
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
          {
            area: 'Home Value',
            impact: 'May decline short-term',
            action: 'Ignore if not selling soon',
            urgency: 'monitor',
          },
          {
            area: 'Buying',
            impact: 'Better negotiating position',
            action: 'Consider offers below asking',
            urgency: 'soon',
          },
          {
            area: 'Refinance',
            impact: 'Home equity may decrease',
            action: 'Refi before values drop more',
            urgency: 'soon',
          },
          {
            area: 'Renting',
            impact: 'Rent pressure may ease',
            action: 'Negotiate rent or consider moving',
            urgency: 'soon',
          },
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
          {
            area: 'Job Security',
            impact: 'Risk elevated',
            action: 'Make yourself indispensable',
            urgency: 'immediate',
          },
          {
            area: 'Emergency Fund',
            impact: 'More critical',
            action: 'Target 6-12 months expenses',
            urgency: 'immediate',
          },
          {
            area: 'Spending',
            impact: 'Reduce discretionary',
            action: 'Build cash buffer',
            urgency: 'soon',
          },
          {
            area: 'Network',
            impact: 'Relationships matter more',
            action: 'Strengthen professional network',
            urgency: 'soon',
          },
        ],
        opportunities: [
          'Employers may offer retention incentives',
          'Side gig demand may increase',
          'Recession-proof skills become valuable',
        ],
        risks: ['Job loss risk', 'Raises and promotions may freeze', 'Contract work may dry up'],
      },
      dollar_strengthening: {
        event: 'US Dollar Strengthening',
        impacts: [
          {
            area: 'International Travel',
            impact: 'Cheaper abroad',
            action: 'Good time to travel internationally',
            urgency: 'soon',
          },
          {
            area: 'Imports',
            impact: 'Foreign goods cheaper',
            action: 'Consider imported purchases',
            urgency: 'monitor',
          },
          {
            area: "Int'l Stocks",
            impact: 'Returns hurt by FX',
            action: 'Understand your international exposure',
            urgency: 'monitor',
          },
          {
            area: 'Exports',
            impact: 'US exporters hurt',
            action: 'Be aware of multinational exposure',
            urgency: 'monitor',
          },
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
          {
            area: 'International Travel',
            impact: 'More expensive abroad',
            action: 'Consider domestic travel',
            urgency: 'soon',
          },
          {
            area: 'Imports',
            impact: 'Foreign goods more expensive',
            action: 'Consider domestic alternatives',
            urgency: 'monitor',
          },
          {
            area: "Int'l Stocks",
            impact: 'Returns helped by FX',
            action: 'International diversification helps',
            urgency: 'monitor',
          },
          {
            area: 'Inflation',
            impact: 'Import prices rise',
            action: 'Factor into budget',
            urgency: 'monitor',
          },
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
          {
            area: 'Cash',
            impact: 'Less purchasing power erosion',
            action: 'Okay to hold more cash',
            urgency: 'monitor',
          },
          {
            area: 'Bonds',
            impact: 'Better real returns',
            action: 'Bonds become more attractive',
            urgency: 'soon',
          },
          {
            area: 'Budget',
            impact: 'Price pressure eases',
            action: 'Maintain savings rate',
            urgency: 'monitor',
          },
          {
            area: 'Rates',
            impact: 'Fed may cut',
            action: 'Lock in current rates on savings',
            urgency: 'soon',
          },
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
      ...impact.impacts.map((i) => {
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
      ...impact.opportunities.map((o) => `• ${o}`),
      '',
      `═══════════════════════════════════`,
      `⚠️ **RISKS TO MONITOR**`,
      `═══════════════════════════════════`,
      '',
      ...impact.risks.map((r) => `• ${r}`),
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
    ]
      .filter(Boolean)
      .join('\n');
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
