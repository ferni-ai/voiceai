/**
 * Proactive Engine Tests
 *
 * Tests for Peter's proactive insights and daily briefings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock Firestore
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: false,
        }),
        set: vi.fn().mockResolvedValue(undefined),
        collection: vi.fn(() => ({
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        })),
      })),
    })),
  })),
}));

import {
  generatePortfolioInsight,
  generateBehavioralInsight,
  generateFIREInsight,
  generateEconomicInsight,
  formatDailyBriefing,
} from '../daily-insights.js';

describe('Proactive Insights Generation', () => {
  describe('Portfolio Insights', () => {
    it('should generate diversification alert', () => {
      const insight = generatePortfolioInsight({
        holdings: [
          { symbol: 'AAPL', value: 50000, sector: 'Technology' },
          { symbol: 'MSFT', value: 30000, sector: 'Technology' },
          { symbol: 'GOOGL', value: 15000, sector: 'Technology' },
          { symbol: 'VTI', value: 5000, sector: 'Index Fund' },
        ],
        totalValue: 100000,
      });

      expect(insight.type).toBe('portfolio');
      // Tech concentration is 95%, should flag
      expect(insight.priority).toBe('high');
      expect(insight.message.toLowerCase()).toContain('tech');
    });

    it('should recognize balanced portfolio', () => {
      const insight = generatePortfolioInsight({
        holdings: [
          { symbol: 'VTI', value: 40000, sector: 'Index Fund' },
          { symbol: 'VXUS', value: 30000, sector: 'International' },
          { symbol: 'BND', value: 20000, sector: 'Bonds' },
          { symbol: 'AAPL', value: 10000, sector: 'Technology' },
        ],
        totalValue: 100000,
      });

      expect(insight.priority).toBe('low');
    });

    it('should handle empty portfolio', () => {
      const insight = generatePortfolioInsight({
        holdings: [],
        totalValue: 0,
      });

      expect(insight.type).toBe('portfolio');
      expect(insight.message.toLowerCase()).toContain('start');
    });
  });

  describe('Behavioral Insights', () => {
    it('should detect checking frequency patterns', () => {
      const insight = generateBehavioralInsight({
        checksThisWeek: 28, // 4x per day = potentially anxious
        averageChecks: 7,
        panicSells: 0,
        timingAttempts: 0,
        impulsePurchases: 0,
      });

      expect(insight.type).toBe('behavioral');
      expect(insight.priority).toBe('medium');
      expect(insight.message.toLowerCase()).toContain('check');
    });

    it('should celebrate good behavior', () => {
      const insight = generateBehavioralInsight({
        checksThisWeek: 2,
        averageChecks: 3,
        panicSells: 0,
        timingAttempts: 0,
        impulsePurchases: 0,
        behavioralScore: 85,
      });

      expect(insight.priority).toBe('low');
      expect(insight.sentiment).toBe('positive');
    });

    it('should flag panic selling patterns', () => {
      const insight = generateBehavioralInsight({
        checksThisWeek: 10,
        averageChecks: 5,
        panicSells: 2, // Two panic sells recently
        timingAttempts: 3,
        impulsePurchases: 0,
      });

      expect(insight.priority).toBe('high');
    });
  });

  describe('FIRE Insights', () => {
    it('should celebrate milestone proximity', () => {
      const insight = generateFIREInsight({
        currentProgress: 24.5, // Near 25% milestone
        previousProgress: 23.8,
        monthlyContribution: 2000,
        targetNumber: 1000000,
        currentNetWorth: 245000,
        projectedAge: 52,
      });

      expect(insight.type).toBe('fire');
      expect(insight.message).toContain('25%');
    });

    it('should alert on pace changes', () => {
      const insight = generateFIREInsight({
        currentProgress: 30,
        previousProgress: 28, // 2% jump is good!
        monthlyContribution: 3000,
        targetNumber: 1000000,
        currentNetWorth: 300000,
        projectedAge: 48,
      });

      expect(insight.priority).toBe('low');
      expect(insight.sentiment).toBe('positive');
    });

    it('should handle early stage', () => {
      const insight = generateFIREInsight({
        currentProgress: 5,
        previousProgress: 4,
        monthlyContribution: 500,
        targetNumber: 1000000,
        currentNetWorth: 50000,
        projectedAge: 58,
      });

      expect(insight.type).toBe('fire');
      // Should be encouraging for early stage
      expect(insight.sentiment).not.toBe('negative');
    });
  });

  describe('Economic Insights', () => {
    it('should generate inflation context', () => {
      const insight = generateEconomicInsight({
        indicator: 'CPI',
        currentValue: 3.5,
        previousValue: 3.2,
        historicalAverage: 2.5,
        trend: 'rising',
      });

      expect(insight.type).toBe('general');
      expect(insight.message.toLowerCase()).toContain('inflation');
    });

    it('should contextualize fed rates', () => {
      const insight = generateEconomicInsight({
        indicator: 'FED_FUNDS',
        currentValue: 5.5,
        previousValue: 5.25,
        historicalAverage: 2.0,
        trend: 'rising',
      });

      expect(insight.message.toLowerCase()).toContain('rate');
    });

    it('should explain unemployment', () => {
      const insight = generateEconomicInsight({
        indicator: 'UNEMPLOYMENT',
        currentValue: 3.8,
        previousValue: 3.9,
        historicalAverage: 5.5,
        trend: 'falling',
      });

      expect(insight.sentiment).toBe('positive');
    });
  });
});

describe('Daily Briefing Formatter', () => {
  it('should format multiple insights into briefing', () => {
    const insights = [
      {
        type: 'portfolio' as const,
        priority: 'high' as const,
        message: 'Your tech allocation is at 80%',
        sentiment: 'neutral' as const,
        actionable: true,
        details: 'Consider diversifying into other sectors',
        date: new Date(),
      },
      {
        type: 'behavioral' as const,
        priority: 'low' as const,
        message: 'Great discipline this week',
        sentiment: 'positive' as const,
        actionable: false,
        date: new Date(),
      },
      {
        type: 'fire' as const,
        priority: 'medium' as const,
        message: "You're approaching 25%!",
        sentiment: 'positive' as const,
        actionable: false,
        date: new Date(),
      },
    ];

    const briefing = formatDailyBriefing(insights, 'Seth');

    expect(briefing).toContain('Seth');
    expect(briefing).toContain('tech allocation');
    expect(briefing).toContain('25%');
    expect(briefing.length).toBeGreaterThan(100);
  });

  it('should prioritize high priority items', () => {
    const insights = [
      {
        type: 'behavioral' as const,
        priority: 'low' as const,
        message: 'Looking good',
        sentiment: 'positive' as const,
        actionable: false,
        date: new Date(),
      },
      {
        type: 'portfolio' as const,
        priority: 'high' as const,
        message: 'Urgent rebalancing needed',
        sentiment: 'negative' as const,
        actionable: true,
        date: new Date(),
      },
    ];

    const briefing = formatDailyBriefing(insights, 'Seth');

    // High priority should come first
    const urgentIndex = briefing.indexOf('Urgent');
    const lookingGoodIndex = briefing.indexOf('Looking good');

    expect(urgentIndex).toBeLessThan(lookingGoodIndex);
  });

  it('should handle no insights gracefully', () => {
    const briefing = formatDailyBriefing([], 'Seth');

    expect(briefing).toContain('Seth');
    expect(briefing.toLowerCase()).toContain('track');
  });

  it('should be speech-friendly', () => {
    const insights = [
      {
        type: 'fire' as const,
        priority: 'medium' as const,
        message: '50% milestone reached',
        sentiment: 'positive' as const,
        actionable: false,
        date: new Date(),
      },
    ];

    const briefing = formatDailyBriefing(insights, 'Seth');

    // Should not have markdown or special characters
    expect(briefing).not.toContain('**');
    expect(briefing).not.toContain('###');
    expect(briefing).not.toContain('\n\n\n');
  });
});

describe('Insight Prioritization', () => {
  it('should rank insights by priority and freshness', () => {
    const insights = [
      {
        type: 'general' as const,
        priority: 'low' as const,
        message: 'Old news',
        sentiment: 'neutral' as const,
        actionable: false,
        date: new Date(Date.now() - 86400000 * 3), // 3 days old
      },
      {
        type: 'portfolio' as const,
        priority: 'high' as const,
        message: 'Urgent',
        sentiment: 'negative' as const,
        actionable: true,
        date: new Date(), // Fresh
      },
      {
        type: 'behavioral' as const,
        priority: 'medium' as const,
        message: 'Watch this',
        sentiment: 'neutral' as const,
        actionable: true,
        date: new Date(), // Fresh
      },
    ];

    // Sort by priority (high > medium > low) then by freshness
    const sorted = insights.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.date.getTime() - a.date.getTime();
    });

    expect(sorted[0].priority).toBe('high');
    expect(sorted[1].priority).toBe('medium');
    expect(sorted[2].priority).toBe('low');
  });
});

