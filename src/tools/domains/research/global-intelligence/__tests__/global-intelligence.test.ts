/**
 * Global Intelligence Tests
 *
 * Tests for Peter's aggregate intelligence systems.
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

// Import types
import type {
  PeerBenchmark,
  BehavioralPattern,
  SuccessPattern,
  QuestionCluster,
  ResearchEntry,
  CompanyKnowledge,
  MarketWisdom,
  AnonymizedEvent,
} from '../types.js';

import { PeerBenchmarks } from '../peer-benchmarks.js';
import { EventPipeline } from '../event-pipeline.js';

describe('Peer Benchmarks', () => {
  describe('getBenchmark', () => {
    it('should return benchmark for valid demographic', () => {
      const benchmark = PeerBenchmarks.getBenchmark('30s', '100k_200k');
      expect(benchmark).toBeDefined();
      expect(benchmark?.ageGroup).toBe('30s');
      expect(benchmark?.incomeBracket).toBe('100k_200k');
    });

    it('should return null for invalid demographic', () => {
      const benchmark = PeerBenchmarks.getBenchmark('invalid', 'invalid');
      expect(benchmark).toBeNull();
    });
  });

  describe('getClosestBenchmark', () => {
    it('should bucket age correctly', () => {
      const benchmark25 = PeerBenchmarks.getClosestBenchmark(25, 75000);
      expect(benchmark25.ageGroup).toBe('20s');

      const benchmark35 = PeerBenchmarks.getClosestBenchmark(35, 75000);
      expect(benchmark35.ageGroup).toBe('30s');

      const benchmark55 = PeerBenchmarks.getClosestBenchmark(55, 75000);
      expect(benchmark55.ageGroup).toBe('50s');
    });

    it('should bucket income correctly', () => {
      const benchmarkLow = PeerBenchmarks.getClosestBenchmark(30, 40000);
      expect(benchmarkLow.incomeBracket).toBe('under_50k');

      const benchmarkMid = PeerBenchmarks.getClosestBenchmark(30, 75000);
      expect(benchmarkMid.incomeBracket).toBe('50k_100k');

      const benchmarkHigh = PeerBenchmarks.getClosestBenchmark(30, 150000);
      expect(benchmarkHigh.incomeBracket).toBe('100k_200k');

      const benchmarkVeryHigh = PeerBenchmarks.getClosestBenchmark(30, 250000);
      expect(benchmarkVeryHigh.incomeBracket).toBe('200k_plus');
    });
  });

  describe('calculatePercentile', () => {
    const metric = { median: 50, p25: 25, p75: 75, p90: 90 };

    it('should calculate percentiles correctly', () => {
      // At median = 50th percentile
      expect(PeerBenchmarks.calculatePercentile(50, metric)).toBe(50);

      // Below p25 = proportional to 0-25
      expect(PeerBenchmarks.calculatePercentile(12.5, metric)).toBe(13);

      // Between p75 and p90
      expect(PeerBenchmarks.calculatePercentile(82.5, metric)).toBe(82);
    });

    it('should cap at 99 for extreme values', () => {
      expect(PeerBenchmarks.calculatePercentile(200, metric)).toBeLessThanOrEqual(99);
    });
  });

  describe('getPeerComparison', () => {
    it('should return comprehensive comparison', () => {
      const comparison = PeerBenchmarks.getPeerComparison({
        age: 35,
        annualIncome: 120000,
        savingsRate: 25,
        netWorth: 300000,
        behavioralScore: 75,
        fireProgress: 30,
        hasEmergencyFund: true,
        hasAutomatedSavings: true,
        tracksbudget: true,
        hasIndexFunds: true,
      });

      expect(comparison.benchmark).toBeDefined();
      expect(comparison.percentiles).toHaveProperty('savingsRate');
      expect(comparison.percentiles).toHaveProperty('netWorth');
      expect(comparison.percentiles).toHaveProperty('overall');
      expect(comparison.comparisons).toHaveProperty('savingsRate');
      expect(comparison.characteristics).toHaveProperty('emergencyFund');
      expect(comparison.insights).toBeDefined();
    });

    it('should generate relevant insights', () => {
      const comparisonHighSaver = PeerBenchmarks.getPeerComparison({
        age: 30,
        annualIncome: 100000,
        savingsRate: 35, // High savings rate
        netWorth: 200000,
        behavioralScore: 80,
        fireProgress: 25,
        hasEmergencyFund: true,
        hasAutomatedSavings: true,
        tracksbudget: true,
        hasIndexFunds: true,
      });

      // Should have positive insight about savings rate
      const hasSavingsInsight = comparisonHighSaver.insights.some(
        (i) => i.toLowerCase().includes('savings') || i.toLowerCase().includes('top')
      );
      expect(hasSavingsInsight).toBe(true);
    });
  });
});

describe('Event Pipeline', () => {
  describe('createAnonymizedEvent', () => {
    it('should create event with anonymized demographics', () => {
      const event = EventPipeline.createAnonymizedEvent({
        type: 'question_asked',
        userProfile: {
          age: 35,
          income: 10000, // monthly
          netWorth: 250000,
        },
        eventData: {
          topic: 'investing',
        },
      });

      expect(event.eventType).toBe('question_asked');
      expect(event.demographics.ageGroup).toBe('35-44');
      expect(event.demographics.incomeBracket).toBe('100k_200k');
      expect(event.demographics.netWorthBracket).toBe('100k_500k');
      expect(event.eventId).toBeDefined();
    });

    it('should bucket ages correctly', () => {
      const event20s = EventPipeline.createAnonymizedEvent({
        type: 'tool_used',
        userProfile: { age: 28 },
      });
      expect(event20s.demographics.ageGroup).toBe('25-34');

      const event60s = EventPipeline.createAnonymizedEvent({
        type: 'tool_used',
        userProfile: { age: 68 },
      });
      expect(event60s.demographics.ageGroup).toBe('65+');
    });

    it('should sanitize event data', () => {
      const event = EventPipeline.createAnonymizedEvent({
        type: 'question_asked',
        eventData: {
          symbol: 'AAPL', // Safe - whitelisted
          tool: 'analyzeStock', // Safe - whitelisted
          longString: 'a'.repeat(100), // Should be filtered (>50 chars)
          unknownField: 'test', // Should be filtered (not whitelisted)
        },
      });

      expect(event.eventData.symbol).toBe('AAPL');
      expect(event.eventData.tool).toBe('analyzeStock');
      expect(event.eventData.longString).toBeUndefined();
      expect(event.eventData.unknownField).toBeUndefined();
    });
  });
});

describe('Data Types', () => {
  describe('PeerBenchmark', () => {
    it('should have all required fields', () => {
      const benchmark: PeerBenchmark = {
        ageGroup: '30s',
        incomeBracket: '100k_200k',
        savingsRate: { median: 20, p25: 10, p75: 30, p90: 40 },
        netWorth: { median: 300000, p25: 100000, p75: 600000, p90: 1000000 },
        behavioralScore: { median: 65, topQuartile: 80 },
        fireProgress: { medianPercentage: 25, averageYearsToFire: 18 },
        characteristics: {
          emergencyFundRate: 0.65,
          automatedSavingsRate: 0.70,
          budgetTrackingRate: 0.55,
          indexFundRate: 0.68,
        },
        sampleSize: 5000,
        lastUpdated: new Date(),
      };

      expect(benchmark.ageGroup).toBeDefined();
      expect(benchmark.savingsRate.median).toBe(20);
      expect(benchmark.characteristics.emergencyFundRate).toBe(0.65);
    });
  });

  describe('BehavioralPattern', () => {
    it('should capture panic sell pattern', () => {
      const pattern: BehavioralPattern = {
        patternId: 'panic_sell_1',
        patternType: 'panic_sell',
        triggers: {
          marketConditions: {
            drawdownRange: [10, 20],
            vixRange: [25, 40],
            sentiment: 'fear',
          },
          timePatterns: {
            dayOfWeek: ['Monday', 'Friday'],
            timeOfDay: ['morning'],
            seasonal: ['Q4'],
          },
        },
        demographics: {
          mostCommonAgeGroup: '30s',
          mostCommonExperienceLevel: 'beginner',
          averageBehavioralScore: 45,
        },
        outcomes: {
          averageRecoveryDays: 180,
          averageReturnImpact: -8.5,
          regretRate: 0.72,
          repeatRate: 0.35,
        },
        prevention: {
          successfulInterventions: ['thesis reminder', 'peer comparison'],
          bestTimeToIntervene: 'before market opens',
          messagingThatWorks: ['Remember your thesis', 'You held last time'],
        },
        occurrenceCount: 2500,
        lastUpdated: new Date(),
      };

      expect(pattern.patternType).toBe('panic_sell');
      expect(pattern.outcomes.regretRate).toBe(0.72);
      expect(pattern.prevention.successfulInterventions).toContain('thesis reminder');
    });
  });

  describe('SuccessPattern', () => {
    it('should define success criteria', () => {
      const pattern: SuccessPattern = {
        patternId: 'steady_builder_1',
        patternName: 'Steady Wealth Builder',
        description: 'Consistent savers who reach FIRE in 15-20 years',
        successCriteria: {
          fireProgressRate: 5, // 5% per year
          behavioralScoreMin: 70,
          netWorthGrowthRate: 15,
          goalCompletionRate: 0.8,
        },
        characteristics: {
          habits: ['automate savings', 'monthly review', 'yearly rebalance'],
          toolsUsed: ['analyzeSavingsRate', 'calculateFIRE', 'peerComparison'],
          averageSavingsRate: 30,
          investingFrequency: 'monthly',
          portfolioStyle: 'index_heavy',
          automationLevel: 'full',
        },
        behavioralTraits: {
          panicSellRate: 0.05,
          timingAttemptRate: 0.1,
          consistencyScore: 0.9,
          patienceScore: 0.85,
        },
        typicalJourney: {
          yearsToFirstMilestone: 3,
          yearsToHalfway: 8,
          yearsToFire: 17,
          biggestChallenges: ['early career income', 'lifestyle inflation'],
          turningPoints: ['first 100k', 'compound effect kicks in'],
        },
        sampleSize: 1500,
        statisticalSignificance: 0.95,
        lastUpdated: new Date(),
      };

      expect(pattern.patternName).toBe('Steady Wealth Builder');
      expect(pattern.successCriteria.fireProgressRate).toBe(5);
      expect(pattern.behavioralTraits.panicSellRate).toBe(0.05);
    });
  });

  describe('ResearchEntry (Big Brain)', () => {
    it('should store research findings', () => {
      const entry: ResearchEntry = {
        id: 'research_aapl_2024',
        type: 'company_analysis',
        title: 'Apple Services Revenue Analysis',
        content: {
          summary: 'Services now 25% of revenue with 70% margins',
          keyPoints: [
            'Services grew 14% YoY',
            'Active devices at 2.2B',
            'Subscription stickiness increasing',
          ],
          fullAnalysis: 'Detailed analysis...',
          sources: ['10-K 2024', 'Earnings call'],
        },
        categories: {
          symbols: ['AAPL'],
          sectors: ['Technology'],
          topics: ['services', 'margins', 'growth'],
          concepts: ['recurring revenue', 'platform economics'],
        },
        quality: {
          confidenceScore: 0.9,
          timeSensitive: false,
          verifiedAt: new Date(),
          verificationSource: 'SEC filings',
        },
        usage: {
          timesUsed: 45,
          helpfulnessScore: 0.88,
          lastUsed: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdFrom: 'user question about AAPL services',
      };

      expect(entry.type).toBe('company_analysis');
      expect(entry.content.keyPoints).toHaveLength(3);
      expect(entry.quality.confidenceScore).toBe(0.9);
      expect(entry.usage.helpfulnessScore).toBe(0.88);
    });
  });

  describe('MarketWisdom', () => {
    it('should capture timeless wisdom', () => {
      const wisdom: MarketWisdom = {
        id: 'wisdom_buffett_greedy',
        category: 'principle',
        wisdom: {
          title: 'Be Greedy When Others Are Fearful',
          insight: 'The best buying opportunities come during market panics',
          context: 'Market downturns of 20%+ historically recover within 2 years',
          source: 'Warren Buffett',
        },
        applicability: {
          marketConditions: ['bear market', 'high VIX', 'panic selling'],
          userSituations: ['considering selling', 'fear of loss'],
          triggerPhrases: ['should I sell', 'market is crashing', 'losing money'],
        },
        effectiveness: {
          timesShared: 1250,
          helpfulnessScore: 0.82,
          memorableQuotes: [
            'Be fearful when others are greedy, greedy when others are fearful',
          ],
        },
        createdAt: new Date(),
      };

      expect(wisdom.category).toBe('principle');
      expect(wisdom.applicability.triggerPhrases).toContain('should I sell');
      expect(wisdom.effectiveness.helpfulnessScore).toBe(0.82);
    });
  });
});

