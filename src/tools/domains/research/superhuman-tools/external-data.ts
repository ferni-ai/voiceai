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
  IndustryTrendSynthesis,
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
    'Talk about the economy in a city or area. Live local data (home prices, jobs, incomes) is not connected, so this says so and points to public sources instead of quoting figures.',
  parameters: z.object({
    location: z
      .string()
      .describe('City or metro area (e.g., "San Francisco", "Austin", "New York")'),
  }),
  execute: async (params: { location: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, location: params.location }, '🏙️ Local economics requested; no live source');

    const place = params.location?.trim() || 'your area';
    return [
      `I can't look up live economic data for ${place} right now, so I won't quote home prices, job numbers or incomes there.`,
      `For current figures, the Bureau of Labor Statistics (bls.gov) has local unemployment and wages, the Census Bureau (data.census.gov) has incomes, and a listings site shows recent home sales.`,
      `What I can do is help you think through how a move, a job change or a home purchase fits your own numbers.`,
    ].join('\n');
  },
});

// ============================================================================
// INDUSTRY TREND SYNTHESIZER
// ============================================================================

function getIndustryTrends(industry: string): IndustryTrendSynthesis {
  const industries: Record<string, IndustryTrendSynthesis> = {
    technology: {
      industry: 'Technology',
      overallSentiment: 'neutral',
      keyTrends: [
        'AI is reshaping every segment - companies without AI strategy at risk',
        'Cloud growth moderating but still strong',
        'Cybersecurity spending increasing despite budget cuts elsewhere',
        'Remote/hybrid work has permanently changed enterprise software needs',
      ],
      disruptionRisks: [
        'AI automation of knowledge work',
        'Commoditization of cloud services',
        'Regulatory pressure on big tech',
        'Open source eating into proprietary software',
      ],
      opportunities: [
        'AI tooling and infrastructure',
        'Security and compliance automation',
        'Vertical SaaS in underserved industries',
        'Data infrastructure for AI workloads',
      ],
      topCompanies: [
        { name: 'Microsoft', ticker: 'MSFT', position: 'AI infrastructure leader via OpenAI' },
        { name: 'NVIDIA', ticker: 'NVDA', position: 'AI chip monopoly (for now)' },
        {
          name: 'Google',
          ticker: 'GOOGL',
          position: 'Search disruption risk but strong AI capabilities',
        },
      ],
      outlook:
        'Bifurcated market - AI winners gaining while others struggle. Focus on companies with clear AI advantage.',
    },
    healthcare: {
      industry: 'Healthcare',
      overallSentiment: 'bullish',
      keyTrends: [
        'GLP-1 drugs revolutionizing obesity and diabetes treatment',
        'AI diagnostic tools gaining FDA approvals',
        'Virtual care adoption remains elevated post-COVID',
        'Aging population driving demand across all segments',
      ],
      disruptionRisks: [
        'Drug pricing legislation',
        'Medicare reimbursement cuts',
        'Big tech entry into healthcare',
        'Patent cliffs for major drugs',
      ],
      opportunities: [
        'Obesity/metabolic disease treatments',
        'AI-assisted diagnostics',
        'Senior care and aging-in-place',
        'Mental health services',
      ],
      topCompanies: [
        { name: 'Eli Lilly', ticker: 'LLY', position: 'GLP-1 leader with Mounjaro' },
        { name: 'UnitedHealth', ticker: 'UNH', position: 'Diversified healthcare giant' },
        { name: 'Novo Nordisk', ticker: 'NVO', position: 'Ozempic dominance' },
      ],
      outlook:
        'Secular growth driven by demographics and innovation. GLP-1 drugs are generational change.',
    },
    finance: {
      industry: 'Financial Services',
      overallSentiment: 'neutral',
      keyTrends: [
        'Higher rates boost net interest margins but hurt loan growth',
        'Fintech consolidation after 2021-2022 bubble',
        'Embedded finance expanding into non-financial products',
        'Regulatory pressure on crypto and digital assets',
      ],
      disruptionRisks: [
        'Interest rate volatility',
        'Commercial real estate exposure',
        'Fintech competition in payments',
        'Credit quality deterioration',
      ],
      opportunities: [
        'Wealth management for aging population',
        'Small business lending (SBA loans)',
        'Insurance technology',
        'Financial wellness for employees',
      ],
      topCompanies: [
        { name: 'JPMorgan', ticker: 'JPM', position: 'Scale and technology leader' },
        { name: 'Visa', ticker: 'V', position: 'Payments network effect' },
        { name: 'Blackstone', ticker: 'BX', position: 'Alternative assets leader' },
      ],
      outlook:
        'Mature industry with steady returns. Winners have scale, technology, and diversification.',
    },
    realestate: {
      industry: 'Real Estate',
      overallSentiment: 'bearish',
      keyTrends: [
        'Office sector in structural decline due to remote work',
        'Industrial/logistics still strong but moderating',
        'Residential affordability at crisis levels',
        'Data center demand exploding for AI',
      ],
      disruptionRisks: [
        'Interest rate impact on valuations',
        'Office vacancy rates',
        'Construction cost inflation',
        'Climate risk in coastal markets',
      ],
      opportunities: [
        'Data centers and AI infrastructure',
        'Build-to-rent residential',
        'Senior housing',
        'Office-to-residential conversions',
      ],
      topCompanies: [
        { name: 'Prologis', ticker: 'PLD', position: 'Industrial/logistics REIT leader' },
        { name: 'Equinix', ticker: 'EQIX', position: 'Data center REIT' },
        { name: 'AvalonBay', ticker: 'AVB', position: 'Quality residential REIT' },
      ],
      outlook: 'Highly bifurcated. Avoid office, overweight data centers and industrial.',
    },
    energy: {
      industry: 'Energy',
      overallSentiment: 'neutral',
      keyTrends: [
        'Oil demand peak debate - transport declining, petrochemicals growing',
        'Natural gas as transition fuel gaining support',
        'Solar/wind costs continue falling',
        'Grid infrastructure needs massive investment',
      ],
      disruptionRisks: [
        'Faster-than-expected EV adoption',
        'Regulatory/ESG pressure',
        'Commodity price volatility',
        'Geopolitical supply disruptions',
      ],
      opportunities: [
        'Grid infrastructure and storage',
        'LNG export facilities',
        'Carbon capture technology',
        'Nuclear renaissance',
      ],
      topCompanies: [
        {
          name: 'ExxonMobil',
          ticker: 'XOM',
          position: 'Integrated major with strong balance sheet',
        },
        { name: 'NextEra', ticker: 'NEE', position: 'Renewable energy leader' },
        { name: 'Schlumberger', ticker: 'SLB', position: 'Oilfield services leader' },
      ],
      outlook: 'Transition creates both risks and opportunities. Diversification is key.',
    },
  };

  const normalizedIndustry = industry.toLowerCase().replace(/\s+/g, '');
  for (const [key, data] of Object.entries(industries)) {
    if (normalizedIndustry.includes(key) || key.includes(normalizedIndustry)) {
      return data;
    }
  }

  // Default
  return {
    industry: industry,
    overallSentiment: 'neutral',
    keyTrends: ['Data not available for this specific industry'],
    disruptionRisks: ['Industry-specific analysis required'],
    opportunities: ['Consult industry-specific sources'],
    topCompanies: [],
    outlook: 'Unable to provide specific outlook. Consider consulting industry reports.',
  };
}

export const synthesizeIndustryTrends = llm.tool({
  description:
    'Get a synthesis of trends in any industry. Key developments, disruption risks, opportunities, and leading companies.',
  parameters: z.object({
    industry: z
      .string()
      .describe('Industry to analyze (e.g., "technology", "healthcare", "finance")'),
  }),
  execute: async (params: { industry: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, industry: params.industry }, '📈 Synthesizing industry trends');

    const data = getIndustryTrends(params.industry);

    const sentimentEmoji =
      data.overallSentiment === 'bullish'
        ? '🟢'
        : data.overallSentiment === 'bearish'
          ? '🔴'
          : '🟡';

    return [
      `📈 **INDUSTRY TREND SYNTHESIS: ${data.industry.toUpperCase()}**`,
      '',
      `═══════════════════════════════════`,
      `${sentimentEmoji} **OVERALL SENTIMENT: ${data.overallSentiment.toUpperCase()}**`,
      `═══════════════════════════════════`,
      '',
      `═══════════════════════════════════`,
      `🔑 **KEY TRENDS**`,
      `═══════════════════════════════════`,
      '',
      ...data.keyTrends.map((t) => `• ${t}`),
      '',
      `═══════════════════════════════════`,
      `⚠️ **DISRUPTION RISKS**`,
      `═══════════════════════════════════`,
      '',
      ...data.disruptionRisks.map((r) => `• ${r}`),
      '',
      `═══════════════════════════════════`,
      `✅ **OPPORTUNITIES**`,
      `═══════════════════════════════════`,
      '',
      ...data.opportunities.map((o) => `• ${o}`),
      '',
      data.topCompanies.length > 0 ? `═══════════════════════════════════` : '',
      data.topCompanies.length > 0 ? `🏢 **LEADING COMPANIES**` : '',
      data.topCompanies.length > 0 ? `═══════════════════════════════════` : '',
      data.topCompanies.length > 0 ? '' : '',
      ...data.topCompanies.map((c) => `• **${c.name}** (${c.ticker}): ${c.position}`),
      '',
      `═══════════════════════════════════`,
      `🔮 **OUTLOOK**`,
      `═══════════════════════════════════`,
      '',
      data.outlook,
      '',
      `═══════════════════════════════════`,
      `💡 **PETER'S TAKE**`,
      `═══════════════════════════════════`,
      '',
      `Industry trends affect your career, investments, and opportunities.`,
      ``,
      `**Questions to ask yourself:**`,
      `• Is my career aligned with industry tailwinds?`,
      `• Am I exposed to disruption risks?`,
      `• Should I be building skills for the emerging opportunities?`,
    ]
      .filter(Boolean)
      .join('\n');
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
    'Talk about news coverage of a topic. Live news is not connected, so this says it cannot score current coverage instead of guessing whether it is positive or negative.',
  parameters: z.object({
    topic: z.string().describe('Topic to analyze (e.g., "economy", "AI", "housing", "crypto")'),
  }),
  execute: async (params: { topic: string }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    log.info({ userId, topic: params.topic }, '📰 News sentiment requested; no live source');

    const topic = params.topic?.trim() || 'that topic';
    return [
      `I can't read current news right now, so I can't tell you whether coverage of ${topic} is positive or negative, or which way it's moving.`,
      `I'm glad to talk through what you've been reading about it and how it affects your plans.`,
    ].join('\n');
  },
});

// ============================================================================
// PERSONAL INFLATION CALCULATOR
// ============================================================================

export const recordSpending = llm.tool({
  description:
    'Record a spending entry (category and amount) so the user can see a summary of their own spending by category.',
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
      `Keep recording and I can show you where your money goes by category.`,
    ]
      .filter(Boolean)
      .join('\n');
  },
});

export const calculatePersonalInflation = llm.tool({
  description:
    'Summarize the spending the user has recorded in the last 30 days by category. Live inflation data is not connected, so this does not compute a personal inflation rate or compare against CPI.',
  parameters: z.object({
    monthlyIncome: z.number().optional().describe('Your monthly income (for context)'),
  }),
  execute: async (params: { monthlyIncome?: number }, { ctx }: { ctx: unknown }) => {
    const userId = getUserIdFromContext(ctx);
    if (!userId) return 'I need to know who you are.';

    const userSpending = spendingStore.get(userId) || [];
    const recentSpending = userSpending.filter(
      (s) => Date.now() - s.date.getTime() < 30 * 24 * 60 * 60 * 1000
    );

    const unavailable = `I can't look up current inflation rates right now, so I can't give you a personal inflation rate or compare it with CPI.`;

    if (recentSpending.length === 0) {
      return [
        unavailable,
        `You haven't recorded any spending in the last 30 days. Tell me a category and an amount, like "groceries, 120 dollars", and I'll keep track.`,
      ].join('\n');
    }

    const byCategory: Record<string, number> = {};
    for (const s of recentSpending) {
      byCategory[s.category] = (byCategory[s.category] || 0) + s.amount;
    }
    const totalSpending = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const breakdown = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(
        ([category, amount]) =>
          `• ${category}: $${amount.toFixed(2)} (${totalSpending > 0 ? Math.round((amount / totalSpending) * 100) : 0}% of what you recorded)`
      );

    return [
      unavailable,
      `Here's what you've recorded over the last 30 days: $${totalSpending.toFixed(2)} across ${recentSpending.length} entries.`,
      ...breakdown,
      params.monthlyIncome !== undefined && params.monthlyIncome > 0
        ? `That's about ${Math.round((totalSpending / params.monthlyIncome) * 100)}% of the monthly income you mentioned.`
        : '',
      `Keep recording and I'll keep this summary up to date.`,
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
