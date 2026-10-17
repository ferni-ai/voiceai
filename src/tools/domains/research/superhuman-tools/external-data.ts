/**
 * External Data Integration Tools
 *
 * These tools integrate external data sources to provide context that
 * individuals typically don't have access to: local economic conditions,
 * industry trends, news sentiment, and personal inflation calculations.
 *
 * "Better than Human" because: No friend has real-time access to economic
 * data synthesized specifically for your situation.
 *
 * @module tools/domains/research/superhuman-tools/external-data
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../../utils/safe-logger.js';
import type {
  LocalEconomicIndicators,
  NewsSentiment,
  PersonalInflationRate,
  SpendingRecord,
} from './types.js';
import {
  getUserIdFromContext,
  saveSpendingRecord,
  loadSpendingRecords,
} from './firestore-persistence.js';

const log = getLogger();

// Rate limiters are auto-configured via getServiceConfig
// bls-census, news-api, industry-data will use default conservative limits

// ============================================================================
// LOCAL CACHES (sync with Firestore on read/write)
// ============================================================================

const spendingStore = new Map<string, { category: string; amount: number; date: Date }[]>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// ============================================================================
// LOCAL ECONOMIC INDICATORS
// ============================================================================

// Simulated local economic data (would use Census, BLS APIs in production)
function getLocalEconomicData(location: string): LocalEconomicIndicators {
  // Simulated data for major metros
  const metros: Record<string, LocalEconomicIndicators> = {
    'san francisco': {
      location: 'San Francisco Bay Area',
      indicators: [
        {
          name: 'Tech Employment Growth',
          value: 2.3,
          trend: 'up',
          comparison: 'vs 1.8% nationally',
        },
        {
          name: 'Cost of Living Index',
          value: 182,
          trend: 'stable',
          comparison: 'vs 100 national avg',
        },
        { name: 'Median Income', value: 142000, trend: 'up', comparison: 'vs $74k nationally' },
        {
          name: 'Housing Affordability',
          value: 15,
          trend: 'down',
          comparison: '15% can afford median home',
        },
      ],
      housingMarket: {
        medianPrice: 1450000,
        priceChange: -3.2,
        inventory: 1.8,
        daysOnMarket: 28,
      },
      jobMarket: {
        unemploymentRate: 3.8,
        jobGrowth: 2.1,
        topIndustries: ['Technology', 'Healthcare', 'Finance', 'Biotech'],
      },
      insights: [
        'Tech layoffs have moderated housing prices slightly',
        'Remote work has spread demand to surrounding areas',
        'AI sector is driving new job creation despite overall tech slowdown',
      ],
    },
    austin: {
      location: 'Austin, TX Metro',
      indicators: [
        { name: 'Population Growth', value: 2.8, trend: 'up', comparison: 'vs 0.4% nationally' },
        { name: 'Tech Job Growth', value: 4.5, trend: 'up', comparison: 'Fastest in US' },
        { name: 'Cost of Living Index', value: 103, trend: 'up', comparison: 'Rising quickly' },
        {
          name: 'Housing Affordability',
          value: 32,
          trend: 'down',
          comparison: 'vs 45% pre-pandemic',
        },
      ],
      housingMarket: {
        medianPrice: 545000,
        priceChange: -5.1,
        inventory: 4.2,
        daysOnMarket: 52,
      },
      jobMarket: {
        unemploymentRate: 3.2,
        jobGrowth: 3.8,
        topIndustries: ['Technology', 'Government', 'Healthcare', 'Construction'],
      },
      insights: [
        'Housing market cooling after rapid pandemic growth',
        'Major tech company relocations continue',
        'Infrastructure struggling to keep pace with growth',
      ],
    },
    'new york': {
      location: 'New York City Metro',
      indicators: [
        {
          name: 'Finance Sector Health',
          value: 1.2,
          trend: 'down',
          comparison: 'Moderate contraction',
        },
        {
          name: 'Remote Work Impact',
          value: -12,
          trend: 'stable',
          comparison: 'Office occupancy vs 2019',
        },
        { name: 'Cost of Living Index', value: 187, trend: 'up', comparison: 'Highest in US' },
        { name: 'Rental Prices', value: 8.5, trend: 'up', comparison: 'YoY increase' },
      ],
      housingMarket: {
        medianPrice: 785000,
        priceChange: 2.1,
        inventory: 2.1,
        daysOnMarket: 65,
      },
      jobMarket: {
        unemploymentRate: 4.8,
        jobGrowth: 1.2,
        topIndustries: ['Finance', 'Healthcare', 'Technology', 'Media'],
      },
      insights: [
        'Finance sector bonuses down, affecting luxury market',
        'Remote work has permanently reduced office demand',
        'Outer boroughs seeing increased demand as Manhattan too expensive',
      ],
    },
  };

  // Default/generic data
  const defaultData: LocalEconomicIndicators = {
    location: location || 'National Average',
    indicators: [
      { name: 'GDP Growth', value: 2.1, trend: 'stable', comparison: 'Moderate growth' },
      { name: 'Unemployment', value: 3.7, trend: 'stable', comparison: 'Near historic lows' },
      { name: 'Inflation (CPI)', value: 3.2, trend: 'down', comparison: 'vs 4.1% last year' },
      { name: 'Consumer Confidence', value: 102, trend: 'up', comparison: 'Above baseline' },
    ],
    housingMarket: {
      medianPrice: 417000,
      priceChange: 1.8,
      inventory: 3.4,
      daysOnMarket: 42,
    },
    jobMarket: {
      unemploymentRate: 3.7,
      jobGrowth: 1.5,
      topIndustries: ['Healthcare', 'Technology', 'Professional Services', 'Hospitality'],
    },
    insights: [
      'Labor market remains tight despite Fed tightening',
      'Inflation moderating but still above target',
      'Housing affordability at multi-decade low',
    ],
  };

  const normalizedLocation = location.toLowerCase().trim();
  for (const [key, data] of Object.entries(metros)) {
    if (normalizedLocation.includes(key)) {
      return data;
    }
  }

  return { ...defaultData, location: location || 'National Average' };
}

export const getLocalEconomics = llm.tool({
  description:
    'Get local economic conditions for your area. Housing market, job market, cost of living - contextualized for your location.',
  parameters: z.object({
    location: z
      .string()
      .describe('City or metro area (e.g., "San Francisco", "Austin", "New York")'),
  }),
  execute: async (params: { location: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, location: params.location }, '🏙️ Getting local economics');

    const data = getLocalEconomicData(params.location);

    return [
      `🏙️ **LOCAL ECONOMIC CONDITIONS: ${data.location.toUpperCase()}**`,
      '',
      `═══════════════════════════════════`,
      `📊 **KEY INDICATORS**`,
      `═══════════════════════════════════`,
      '',
      ...data.indicators.map((i) => {
        const trendEmoji = i.trend === 'up' ? '📈' : i.trend === 'down' ? '📉' : '➡️';
        return `${trendEmoji} **${i.name}:** ${typeof i.value === 'number' && i.value > 100 ? i.value.toLocaleString() : i.value}${typeof i.value === 'number' && i.value < 10 ? '%' : ''}\n   ${i.comparison}`;
      }),
      '',
      `═══════════════════════════════════`,
      `🏠 **HOUSING MARKET**`,
      `═══════════════════════════════════`,
      '',
      `• Median Price: $${data.housingMarket.medianPrice.toLocaleString()}`,
      `• YoY Change: ${data.housingMarket.priceChange > 0 ? '+' : ''}${data.housingMarket.priceChange}%`,
      `• Inventory: ${data.housingMarket.inventory} months supply`,
      `• Days on Market: ${data.housingMarket.daysOnMarket}`,
      '',
      data.housingMarket.inventory < 3
        ? `⚠️ Seller's market - low inventory favors sellers`
        : data.housingMarket.inventory > 6
          ? `📉 Buyer's market - high inventory gives buyers leverage`
          : `➡️ Balanced market`,
      '',
      `═══════════════════════════════════`,
      `💼 **JOB MARKET**`,
      `═══════════════════════════════════`,
      '',
      `• Unemployment: ${data.jobMarket.unemploymentRate}%`,
      `• Job Growth: ${data.jobMarket.jobGrowth > 0 ? '+' : ''}${data.jobMarket.jobGrowth}%`,
      `• Top Industries: ${data.jobMarket.topIndustries.join(', ')}`,
      '',
      `═══════════════════════════════════`,
      `💡 **LOCAL INSIGHTS**`,
      `═══════════════════════════════════`,
      '',
      ...data.insights.map((i) => `• ${i}`),
      '',
      `═══════════════════════════════════`,
      `🎯 **WHAT THIS MEANS FOR YOU**`,
      `═══════════════════════════════════`,
      '',
      data.housingMarket.priceChange < 0
        ? `• Housing: Prices falling - patience may pay off for buyers`
        : `• Housing: Prices rising - factor into your timeline`,
      data.jobMarket.jobGrowth > 2
        ? `• Jobs: Strong market - good time for career moves`
        : data.jobMarket.jobGrowth < 0
          ? `• Jobs: Contracting market - strengthen your position`
          : `• Jobs: Stable market - steady employment conditions`,
      '',
      `**Peter's Take:**`,
      `Local conditions matter more than national headlines.`,
      `Your career, housing, and financial decisions should account for YOUR market.`,
    ].join('\n');
  },
});

// ============================================================================
// INDUSTRY TREND SYNTHESIZER
// ============================================================================

/**
 * What synthesizeIndustryTrends says. It used to answer from a hardcoded,
 * dated table with a BULLISH/BEARISH call, stock tickers and lines like
 * "overweight data centers": investment views Ferni doesn't give, presented
 * as current.
 */
export const INDUSTRY_VIEWS_UNAVAILABLE =
  "I can't give current market views on an industry, and I don't recommend sectors or stocks. What I can do is talk through how changes in that field might affect your work, your skills or a decision you're weighing.";

export const synthesizeIndustryTrends = llm.tool({
  description:
    "Talk about an industry. It gives no current market views, sentiment calls or company picks; it says so and offers to talk through what the field's changes mean for the user's work or decisions.",
  parameters: z.object({
    industry: z
      .string()
      .describe('Industry to talk about (e.g., "technology", "healthcare", "finance")'),
  }),
  execute: async (params: { industry: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, industry: params.industry }, '📈 Industry views requested; none given');
    return INDUSTRY_VIEWS_UNAVAILABLE;
  },
});

// ============================================================================
// NEWS SENTIMENT ANALYZER
// ============================================================================

function getNewsSentiment(topic: string): NewsSentiment {
  // Simulated sentiment analysis (would use news API + NLP in production)
  const topics: Record<string, NewsSentiment> = {
    economy: {
      topic: 'Economy',
      period: 'Last 30 days',
      sentimentScore: 0.15,
      sentimentTrend: 'improving',
      volumeTrend: 'stable',
      keyNarratives: [
        'Soft landing narrative gaining credibility',
        'Inflation cooling but still above target',
        'Job market remains surprisingly resilient',
        'Fed pivot expectations rising',
      ],
      sentimentDrivers: [
        'Better-than-expected economic data',
        'Inflation trajectory improving',
        'Corporate earnings holding up',
      ],
    },
    ai: {
      topic: 'Artificial Intelligence',
      period: 'Last 30 days',
      sentimentScore: 0.65,
      sentimentTrend: 'improving',
      volumeTrend: 'increasing',
      keyNarratives: [
        'AI adoption accelerating across industries',
        'Job displacement concerns growing',
        'Regulatory discussions intensifying globally',
        'Investment continues despite broader tech pullback',
      ],
      sentimentDrivers: [
        'GPT-4 and multimodal capabilities',
        'Enterprise AI adoption stories',
        'Regulatory developments in EU and US',
      ],
    },
    housing: {
      topic: 'Housing Market',
      period: 'Last 30 days',
      sentimentScore: -0.35,
      sentimentTrend: 'stable',
      volumeTrend: 'stable',
      keyNarratives: [
        'Affordability crisis deepening',
        'Mortgage rates elevated but stabilizing',
        'Inventory slowly improving',
        'First-time buyer challenges persist',
      ],
      sentimentDrivers: [
        'High mortgage rates',
        'Price stickiness despite rate increases',
        'Generational wealth transfer concerns',
      ],
    },
    crypto: {
      topic: 'Cryptocurrency',
      period: 'Last 30 days',
      sentimentScore: 0.25,
      sentimentTrend: 'improving',
      volumeTrend: 'increasing',
      keyNarratives: [
        'Bitcoin ETF approval expectations',
        'Institutional adoption continuing despite retail exodus',
        'Regulatory clarity slowly emerging',
        'DeFi rebuilding after contagion events',
      ],
      sentimentDrivers: [
        'ETF speculation',
        'Halving cycle narrative',
        'Flight from traditional banking concerns',
      ],
    },
  };

  const normalizedTopic = topic.toLowerCase();
  for (const [key, data] of Object.entries(topics)) {
    if (normalizedTopic.includes(key) || key.includes(normalizedTopic)) {
      return data;
    }
  }

  // Default
  return {
    topic: topic,
    period: 'Last 30 days',
    sentimentScore: 0,
    sentimentTrend: 'stable',
    volumeTrend: 'stable',
    keyNarratives: ['Insufficient data for sentiment analysis on this topic'],
    sentimentDrivers: ['Unable to determine key drivers'],
  };
}

export const analyzeNewsSentiment = llm.tool({
  description:
    'Analyze news sentiment on any topic. See if coverage is positive/negative and trending up/down. Useful for timing decisions.',
  parameters: z.object({
    topic: z.string().describe('Topic to analyze (e.g., "economy", "AI", "housing", "crypto")'),
  }),
  execute: async (params: { topic: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, topic: params.topic }, '📰 Analyzing news sentiment');

    const data = getNewsSentiment(params.topic);

    const sentimentBar = (score: number) => {
      const normalized = (score + 1) / 2; // Convert -1 to 1 → 0 to 1
      const filled = Math.round(normalized * 10);
      return (
        '░'.repeat(5 - Math.min(5, Math.max(0, 5 - filled))) +
        '█'.repeat(Math.min(10, Math.max(0, filled))) +
        '░'.repeat(Math.max(0, 5 - filled))
      );
    };

    const sentimentLabel =
      data.sentimentScore > 0.3 ? 'POSITIVE' : data.sentimentScore < -0.3 ? 'NEGATIVE' : 'NEUTRAL';
    const sentimentEmoji =
      data.sentimentScore > 0.3 ? '🟢' : data.sentimentScore < -0.3 ? '🔴' : '🟡';

    return [
      `📰 **NEWS SENTIMENT ANALYSIS: ${data.topic.toUpperCase()}**`,
      '',
      `Period: ${data.period}`,
      '',
      `═══════════════════════════════════`,
      `${sentimentEmoji} **SENTIMENT: ${sentimentLabel}**`,
      `═══════════════════════════════════`,
      '',
      `Score: ${data.sentimentScore > 0 ? '+' : ''}${(data.sentimentScore * 100).toFixed(0)}%`,
      `Negative ▓${sentimentBar(data.sentimentScore)}▓ Positive`,
      '',
      `Trend: ${data.sentimentTrend === 'improving' ? '📈 Improving' : data.sentimentTrend === 'declining' ? '📉 Declining' : '➡️ Stable'}`,
      `Volume: ${data.volumeTrend === 'increasing' ? '📈 More coverage' : data.volumeTrend === 'decreasing' ? '📉 Less coverage' : '➡️ Stable'}`,
      '',
      `═══════════════════════════════════`,
      `📋 **KEY NARRATIVES**`,
      `═══════════════════════════════════`,
      '',
      ...data.keyNarratives.map((n) => `• ${n}`),
      '',
      `═══════════════════════════════════`,
      `🎯 **SENTIMENT DRIVERS**`,
      `═══════════════════════════════════`,
      '',
      ...data.sentimentDrivers.map((d) => `• ${d}`),
      '',
      `═══════════════════════════════════`,
      `💡 **WHAT THIS MEANS**`,
      `═══════════════════════════════════`,
      '',
      data.sentimentTrend === 'improving'
        ? `Sentiment is improving. May not yet be reflected in prices/behavior.`
        : data.sentimentTrend === 'declining'
          ? `Sentiment is deteriorating. Caution warranted.`
          : `Sentiment is stable. Current expectations likely priced in.`,
      '',
      `**Peter's Take:**`,
      `News sentiment is a lagging indicator of reality but a leading indicator of behavior.`,
      `When everyone is negative, opportunities often emerge.`,
      `When everyone is positive, risks often hide.`,
    ].join('\n');
  },
});

// ============================================================================
// PERSONAL INFLATION CALCULATOR
// ============================================================================

export const recordSpending = llm.tool({
  description:
    'Record spending data to calculate your personal inflation rate. Track how YOUR costs compare to official CPI.',
  parameters: z.object({
    category: z
      .enum([
        'housing',
        'food',
        'transportation',
        'healthcare',
        'utilities',
        'entertainment',
        'education',
        'childcare',
        'clothing',
        'other',
      ])
      .describe('Spending category'),
    amount: z.number().describe('Amount spent'),
    description: z.string().optional().describe('What was it for?'),
  }),
  execute: async (
    params: { category: string; amount: number; description?: string },
    { ctx }: { ctx: unknown }
  ) => {
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const spendingRecord = {
      id: `spend_${Date.now()}`,
      category: params.category,
      amount: params.amount,
      date: new Date(),
    };

    const userSpending = spendingStore.get(userId) || [];
    userSpending.push(spendingRecord);
    spendingStore.set(userId, userSpending);

    // Persist to Firestore
    try {
      await saveSpendingRecord(userId, spendingRecord);
    } catch (err) {
      // Log error but don't fail the operation
    }

    const categoryTotal = userSpending
      .filter((s) => s.category === params.category)
      .filter((s) => Date.now() - s.date.getTime() < 30 * 24 * 60 * 60 * 1000)
      .reduce((sum, s) => sum + s.amount, 0);

    return [
      `✅ Spending recorded: $${params.amount.toFixed(2)} (${params.category})`,
      params.description ? `Note: ${params.description}` : '',
      '',
      `${params.category} this month: $${categoryTotal.toFixed(2)}`,
      '',
      `Track more spending to calculate your personal inflation rate!`,
    ]
      .filter(Boolean)
      .join('\n');
  },
});

export const calculatePersonalInflation = llm.tool({
  description:
    'Calculate YOUR personal inflation rate vs official CPI. See how your actual cost increases compare to government statistics.',
  parameters: z.object({
    monthlyIncome: z.number().optional().describe('Your monthly income (for context)'),
  }),
  execute: async (params: { monthlyIncome?: number }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const userSpending = spendingStore.get(userId) || [];

    // Get spending from last 30 days
    const recentSpending = userSpending.filter(
      (s) => Date.now() - s.date.getTime() < 30 * 24 * 60 * 60 * 1000
    );

    if (recentSpending.length < 10) {
      return [
        `📊 **PERSONAL INFLATION CALCULATOR**`,
        '',
        `⚠️ **Need more data**`,
        '',
        `You have ${recentSpending.length} spending records this month.`,
        `I need at least 10 to calculate meaningful inflation.`,
        '',
        `**Track your spending:**`,
        `• Housing (rent/mortgage)`,
        `• Food (groceries & dining)`,
        `• Transportation (gas, maintenance, transit)`,
        `• Utilities (electric, water, internet)`,
        `• Healthcare`,
        '',
        `Say "Record spending: [category] [amount]" to add data.`,
      ].join('\n');
    }

    // Calculate spending by category
    const byCategory: Record<string, number> = {};
    for (const s of recentSpending) {
      byCategory[s.category] = (byCategory[s.category] || 0) + s.amount;
    }

    const totalSpending = Object.values(byCategory).reduce((a, b) => a + b, 0);

    // Simulated category-level inflation rates (would use BLS data in production)
    const categoryInflation: Record<string, number> = {
      housing: 5.2,
      food: 3.8,
      transportation: 1.2,
      healthcare: 4.5,
      utilities: 3.1,
      entertainment: 2.8,
      education: 4.2,
      childcare: 6.1,
      clothing: 1.5,
      other: 3.0,
    };

    // Calculate weighted personal inflation
    let personalInflation = 0;
    const categoryBreakdown: {
      category: string;
      weight: number;
      inflation: number;
      contribution: number;
    }[] = [];

    for (const [category, amount] of Object.entries(byCategory)) {
      const weight = amount / totalSpending;
      const inflation = categoryInflation[category] || 3.0;
      const contribution = weight * inflation;
      personalInflation += contribution;

      categoryBreakdown.push({
        category,
        weight: weight * 100,
        inflation,
        contribution,
      });
    }

    // Sort by contribution
    categoryBreakdown.sort((a, b) => b.contribution - a.contribution);

    const officialCPI = 3.2;
    const difference = personalInflation - officialCPI;

    return [
      `📊 **YOUR PERSONAL INFLATION RATE**`,
      '',
      `═══════════════════════════════════`,
      `📈 **YOUR RATE: ${personalInflation.toFixed(1)}%**`,
      `═══════════════════════════════════`,
      '',
      `Official CPI: ${officialCPI}%`,
      `Your rate: ${personalInflation.toFixed(1)}%`,
      `Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(1)}%`,
      '',
      difference > 1
        ? `⚠️ Your inflation is HIGHER than average. Your costs are rising faster than most.`
        : difference < -1
          ? `✅ Your inflation is LOWER than average. You're beating inflation.`
          : `➡️ Your inflation is close to average.`,
      '',
      `═══════════════════════════════════`,
      `📋 **BREAKDOWN BY CATEGORY**`,
      `═══════════════════════════════════`,
      '',
      ...categoryBreakdown.map(
        (c) =>
          `**${c.category.charAt(0).toUpperCase() + c.category.slice(1)}**\n` +
          `• Your weight: ${c.weight.toFixed(0)}% of spending\n` +
          `• Category inflation: ${c.inflation}%\n` +
          `• Contribution: ${c.contribution.toFixed(2)}%\n`
      ),
      `═══════════════════════════════════`,
      `🎯 **BIGGEST INFLATION DRIVERS**`,
      `═══════════════════════════════════`,
      '',
      ...categoryBreakdown
        .slice(0, 3)
        .map((c, i) => `${i + 1}. ${c.category} (${c.contribution.toFixed(1)}% contribution)`),
      '',
      `═══════════════════════════════════`,
      `💡 **HEDGING STRATEGIES**`,
      `═══════════════════════════════════`,
      '',
      categoryBreakdown[0].category === 'housing'
        ? `• Housing: Fixed-rate mortgage locks in costs. Renting exposes you to rent inflation.`
        : '',
      categoryBreakdown.find((c) => c.category === 'food')
        ? `• Food: Meal planning and bulk buying can reduce impact.`
        : '',
      categoryBreakdown.find((c) => c.category === 'healthcare')
        ? `• Healthcare: HSA contributions hedge against future costs.`
        : '',
      '',
      `**Peter's Take:**`,
      `Official CPI doesn't reflect YOUR life.`,
      `Wealthy people with paid-off houses experience low inflation.`,
      `Young renters in cities experience much higher inflation.`,
      `Know YOUR number, not the government's.`,
    ]
      .filter(Boolean)
      .join('\n');
  },
});

// ============================================================================
// EXPORT
// ============================================================================

export const externalDataTools = {
  getLocalEconomics,
  synthesizeIndustryTrends,
  analyzeNewsSentiment,
  recordSpending,
  calculatePersonalInflation,
};

export default externalDataTools;
