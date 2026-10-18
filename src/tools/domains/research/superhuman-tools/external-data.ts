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
