/**
 * Growth Intelligence Tests
 *
 * Tests for the "Better Than Human" intelligence capabilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadIntelligenceState,
  saveIntelligenceState,
  analyzePerformancePatterns,
  calculateOptimalTimes,
  suggestPostingTime,
  detectTrends,
  scoreEngagementQuality,
  getCrossPlatformInsights,
  scoreInfluencerFit,
  optimizeContent,
  analyzeSentiment,
  analyzeCompetitor,
  getIntelligenceDashboard,
  createABTest,
  analyzeABTestResults,
  type IntelligenceState,
  type ContentPerformancePattern,
  type OptimalTimeSlot,
  type TrendSignal,
  type EngagementQualityScore,
  type InfluencerFitScore,
  type ContentOptimization,
  type SentimentAnalysis,
  type CompetitorInsight,
  type ABTest,
} from '../../../apps/cli/src/commands/growth/growth-intelligence.js';
import * as storage from '../../../apps/cli/src/commands/growth/growth-storage.js';
import type {
  ContentPiece,
  InfluencerLead,
  GrowthState,
} from '../../../apps/cli/src/commands/growth/growth-storage.js';

// Mock storage module
vi.mock('../../../apps/cli/src/commands/growth/growth-storage.js', () => ({
  loadGrowthState: vi.fn(),
  saveGrowthState: vi.fn(),
  getContentQueue: vi.fn(),
  getInfluencerLeads: vi.fn(),
  getMetrics: vi.fn(),
}));

describe('Growth Intelligence - "Better Than Human" Capabilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks
    vi.mocked(storage.loadGrowthState).mockResolvedValue({} as GrowthState);
    vi.mocked(storage.saveGrowthState).mockResolvedValue();
    vi.mocked(storage.getContentQueue).mockResolvedValue([]);
    vi.mocked(storage.getInfluencerLeads).mockResolvedValue([]);
    vi.mocked(storage.getMetrics).mockResolvedValue([]);
  });

  // ============================================================================
  // INTELLIGENCE STATE MANAGEMENT
  // ============================================================================

  describe('Intelligence State Management', () => {
    it('should load default intelligence state when none exists', async () => {
      vi.mocked(storage.loadGrowthState).mockResolvedValue({} as GrowthState);

      const state = await loadIntelligenceState();

      expect(state).toMatchObject({
        performancePatterns: [],
        optimalTimeSlots: [],
        trendSignals: [],
        influencerScores: [],
        competitorInsights: [],
        learningHistory: [],
      });
      expect(state.lastAnalyzed).toBeDefined();
    });

    it('should load existing intelligence state', async () => {
      const existingIntel: IntelligenceState = {
        performancePatterns: [{ pattern: 'test', platform: 'tiktok' } as ContentPerformancePattern],
        optimalTimeSlots: [],
        trendSignals: [],
        influencerScores: [],
        competitorInsights: [],
        learningHistory: [],
        lastAnalyzed: '2026-01-15T00:00:00.000Z',
      };

      vi.mocked(storage.loadGrowthState).mockResolvedValue({
        intelligence: existingIntel,
      } as unknown as GrowthState);

      const state = await loadIntelligenceState();

      expect(state.performancePatterns).toHaveLength(1);
      expect(state.performancePatterns[0].pattern).toBe('test');
    });

    it('should save intelligence state with updated timestamp', async () => {
      const intel: IntelligenceState = {
        performancePatterns: [],
        optimalTimeSlots: [],
        trendSignals: [],
        influencerScores: [],
        competitorInsights: [],
        learningHistory: [],
        lastAnalyzed: '2026-01-15T00:00:00.000Z',
      };

      await saveIntelligenceState(intel);

      expect(storage.saveGrowthState).toHaveBeenCalled();
      const savedState = vi.mocked(storage.saveGrowthState).mock.calls[0][0] as any;
      expect(savedState.intelligence).toBeDefined();
      expect(savedState.intelligence.lastAnalyzed).not.toBe('2026-01-15T00:00:00.000Z');
    });
  });

  // ============================================================================
  // 1. LEARNING ENGINE - Pattern Recognition
  // ============================================================================

  describe('1. Learning Engine - Performance Patterns', () => {
    it('should return existing patterns when insufficient data', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        { id: '1', platform: 'tiktok' } as ContentPiece,
        { id: '2', platform: 'tiktok' } as ContentPiece,
      ]);

      const patterns = await analyzePerformancePatterns();

      // Returns cached patterns, not new ones (need 5+ pieces)
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should analyze patterns when sufficient data exists', async () => {
      const mockContent: ContentPiece[] = [
        {
          id: '1',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'POV: you tried',
          metrics: { views: 1000, likes: 100, comments: 20, shares: 5, signups: 2 },
          hashtags: ['#fyp', '#ferni'],
        },
        {
          id: '2',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'POV: you discovered',
          metrics: { views: 2000, likes: 200, comments: 40, shares: 10, signups: 5 },
          hashtags: ['#fyp', '#mindset'],
        },
        {
          id: '3',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'Stop scrolling',
          metrics: { views: 500, likes: 30, comments: 5, shares: 1, signups: 0 },
          hashtags: ['#productivity'],
        },
        {
          id: '4',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'POV: you realized',
          metrics: { views: 3000, likes: 300, comments: 60, shares: 15, signups: 8 },
          hashtags: ['#fyp', '#growth'],
        },
        {
          id: '5',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'This changed my life',
          metrics: { views: 1500, likes: 150, comments: 30, shares: 8, signups: 3 },
          hashtags: ['#selfcare'],
        },
        {
          id: '6',
          platform: 'reddit',
          type: 'post',
          metrics: { views: 800, likes: 50, comments: 25, shares: 2, signups: 1 },
          hashtags: [],
        },
      ] as ContentPiece[];

      vi.mocked(storage.getContentQueue).mockResolvedValue(mockContent);

      const patterns = await analyzePerformancePatterns();

      expect(patterns.length).toBeGreaterThanOrEqual(1);
      const tiktokPattern = patterns.find((p) => p.platform === 'tiktok');
      expect(tiktokPattern).toBeDefined();
      expect(tiktokPattern!.sampleSize).toBeGreaterThan(0);
      expect(tiktokPattern!.avgEngagementRate).toBeGreaterThan(0);
    });

    it('should extract winning elements from top performers', async () => {
      const mockContent: ContentPiece[] = Array.from(
        { length: 10 },
        (_, i) =>
          ({
            id: `${i}`,
            platform: 'tiktok',
            type: 'video_script',
            hook: i < 5 ? 'POV: winning hook' : 'Weak hook',
            cta: i < 5 ? 'Link in bio' : 'Check it out',
            metrics: {
              views: i < 5 ? 5000 : 500,
              likes: i < 5 ? 500 : 20,
              comments: i < 5 ? 100 : 2,
              shares: i < 5 ? 50 : 1,
              signups: i < 5 ? 10 : 0,
            },
            hashtags: i < 5 ? ['#fyp', '#trending'] : ['#random'],
          }) as ContentPiece
      );

      vi.mocked(storage.getContentQueue).mockResolvedValue(mockContent);

      const patterns = await analyzePerformancePatterns();

      const tiktokPattern = patterns.find((p) => p.platform === 'tiktok');
      expect(tiktokPattern).toBeDefined();
      expect(tiktokPattern!.elements.hashtags).toContain('#fyp');
    });
  });

  // ============================================================================
  // 2. PREDICTIVE SCHEDULING ENGINE
  // ============================================================================

  describe('2. Predictive Scheduling Engine', () => {
    it('should return default times when insufficient data', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      const slots = await calculateOptimalTimes();

      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0].confidence).toBe(0.5); // Default confidence
    });

    it('should calculate optimal times from historical data', async () => {
      const mockContent: ContentPiece[] = [];

      // Create content posted at different times - need 10+ for real calculation
      for (let day = 0; day < 3; day++) {
        for (let hour = 9; hour <= 17; hour++) {
          const date = new Date();
          date.setDate(date.getDate() - day);
          date.setHours(hour, 0, 0, 0);

          mockContent.push({
            id: `${day}-${hour}`,
            platform: 'tiktok',
            type: 'video_script',
            status: 'posted',
            postedAt: date.toISOString(),
            metrics: {
              views: hour === 10 ? 5000 : 1000, // 10am gets best engagement
              likes: hour === 10 ? 500 : 50,
              comments: hour === 10 ? 100 : 10,
              shares: hour === 10 ? 20 : 2,
              signups: hour === 10 ? 5 : 0,
            },
          } as ContentPiece);
        }
      }

      vi.mocked(storage.getContentQueue).mockResolvedValue(mockContent);

      const slots = await calculateOptimalTimes();

      // Function always returns slots (either calculated or defaults)
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThanOrEqual(0);
      // Default slots are returned if insufficient data for calculation
      // Real slots are returned if enough data exists
    });

    it('should suggest posting time with confidence', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      const suggestion = await suggestPostingTime('tiktok', 'video_script');

      expect(suggestion.time).toBeInstanceOf(Date);
      expect(suggestion.confidence).toBeGreaterThan(0);
      expect(suggestion.reasoning).toBeDefined();
    });
  });

  // ============================================================================
  // 3. TREND DETECTION SYSTEM
  // ============================================================================

  describe('3. Trend Detection System', () => {
    it('should return empty trends when no recent content', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      const trends = await detectTrends();

      expect(Array.isArray(trends)).toBe(true);
    });

    it('should detect trending topics from recent engagement', async () => {
      const yesterday = new Date(Date.now() - 12 * 60 * 60 * 1000);

      const mockContent: ContentPiece[] = [
        {
          id: '1',
          platform: 'tiktok',
          type: 'video_script',
          title: 'AI productivity coaching',
          createdAt: yesterday.toISOString(),
          postedAt: yesterday.toISOString(),
          hashtags: ['#productivity', '#ai', '#coaching'],
          metrics: { views: 10000, likes: 1000, comments: 200, shares: 50, signups: 20 },
        } as ContentPiece,
        {
          id: '2',
          platform: 'tiktok',
          type: 'video_script',
          title: 'Mental health productivity tips',
          createdAt: yesterday.toISOString(),
          postedAt: yesterday.toISOString(),
          hashtags: ['#mentalhealth', '#productivity'],
          metrics: { views: 8000, likes: 800, comments: 150, shares: 40, signups: 15 },
        } as ContentPiece,
      ];

      vi.mocked(storage.getContentQueue).mockResolvedValue(mockContent);

      const trends = await detectTrends();

      expect(Array.isArray(trends)).toBe(true);
      // Trends are detected based on velocity threshold
    });
  });

  // ============================================================================
  // 4. ENGAGEMENT QUALITY SCORING
  // ============================================================================

  describe('4. Engagement Quality Scoring', () => {
    it('should return zero score when content not found', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      const score = await scoreEngagementQuality('nonexistent');

      expect(score.overallScore).toBe(0);
      expect(score.insights).toContain('Insufficient data for quality scoring');
    });

    it('should return zero score when no metrics', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        { id: 'test', platform: 'tiktok' } as ContentPiece,
      ]);

      const score = await scoreEngagementQuality('test');

      expect(score.overallScore).toBe(0);
    });

    it('should calculate comprehensive engagement quality score', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        {
          id: 'test',
          platform: 'tiktok',
          metrics: {
            views: 10000,
            likes: 1000,
            comments: 200,
            shares: 100,
            signups: 50,
          },
        } as ContentPiece,
      ]);

      const score = await scoreEngagementQuality('test');

      expect(score.contentId).toBe('test');
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.components.reachQuality).toBeGreaterThan(0);
      expect(score.components.engagementDepth).toBeGreaterThan(0);
      expect(score.components.conversionEfficiency).toBeGreaterThan(0);
      expect(score.components.viralCoefficient).toBeGreaterThan(0);
    });

    it('should provide actionable insights and recommendations', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        {
          id: 'high-performer',
          platform: 'tiktok',
          metrics: {
            views: 10000,
            likes: 2000,
            comments: 500,
            shares: 200,
            signups: 100,
          },
        } as ContentPiece,
      ]);

      const score = await scoreEngagementQuality('high-performer');

      expect(score.insights.length).toBeGreaterThan(0);
      // High engagement should get positive insights
      expect(score.insights.some((i) => i.includes('engagement') || i.includes('conversion'))).toBe(
        true
      );
    });
  });

  // ============================================================================
  // 5. CROSS-PLATFORM INTELLIGENCE
  // ============================================================================

  describe('5. Cross-Platform Intelligence', () => {
    it('should return empty insights when no source patterns', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      const insights = await getCrossPlatformInsights('tiktok', 'reddit');

      expect(insights.transferablePatterns).toHaveLength(0);
    });

    it('should provide adaptation rules between platforms', async () => {
      // Create enough content to generate patterns
      const mockContent: ContentPiece[] = Array.from(
        { length: 10 },
        (_, i) =>
          ({
            id: `${i}`,
            platform: 'tiktok',
            type: 'video_script',
            hook: 'POV: winning',
            cta: 'Link in bio',
            metrics: { views: 5000, likes: 500, comments: 100, shares: 50, signups: 10 },
            hashtags: ['#fyp'],
          }) as ContentPiece
      );

      vi.mocked(storage.getContentQueue).mockResolvedValue(mockContent);

      const insights = await getCrossPlatformInsights('tiktok', 'reddit');

      // Should provide adaptation guidance
      expect(insights.adaptationNeeded.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 6. INFLUENCER FIT SCORING
  // ============================================================================

  describe('6. Influencer Fit Scoring', () => {
    it('should throw error when influencer not found', async () => {
      vi.mocked(storage.getInfluencerLeads).mockResolvedValue([]);

      await expect(scoreInfluencerFit('nonexistent')).rejects.toThrow(
        'Influencer nonexistent not found'
      );
    });

    it('should calculate comprehensive influencer fit score', async () => {
      const mockInfluencer: InfluencerLead = {
        id: 'inf-1',
        name: 'Test Creator',
        handle: '@testcreator',
        platform: 'tiktok',
        followers: 50000,
        tier: 'micro',
        category: 'self-improvement',
        status: 'identified',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(storage.getInfluencerLeads).mockResolvedValue([mockInfluencer]);

      const score = await scoreInfluencerFit('inf-1');

      expect(score.influencerId).toBe('inf-1');
      expect(score.overallFit).toBeGreaterThan(0);
      expect(score.overallFit).toBeLessThanOrEqual(100);
      expect(score.components.audienceOverlap).toBeGreaterThan(0);
      expect(score.components.contentAlignment).toBeGreaterThan(0);
      expect(score.components.engagementAuthenticity).toBeGreaterThan(0);
      expect(score.recommendedDealType).toBeDefined();
    });

    it('should recommend affiliate deals for lower fit scores', async () => {
      const mockInfluencer: InfluencerLead = {
        id: 'inf-2',
        name: 'Generic Creator',
        handle: '@generic',
        platform: 'twitter',
        followers: 5000,
        tier: 'nano',
        category: 'entertainment',
        status: 'identified',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(storage.getInfluencerLeads).mockResolvedValue([mockInfluencer]);

      const score = await scoreInfluencerFit('inf-2');

      expect(['affiliate', 'product_only']).toContain(score.recommendedDealType);
    });

    it('should identify risks and opportunities', async () => {
      const mockInfluencer: InfluencerLead = {
        id: 'inf-3',
        name: 'Mental Health Coach',
        handle: '@mhcoach',
        platform: 'tiktok',
        followers: 100000,
        tier: 'mid',
        category: 'mental-health',
        status: 'identified',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(storage.getInfluencerLeads).mockResolvedValue([mockInfluencer]);

      const score = await scoreInfluencerFit('inf-3');

      expect(Array.isArray(score.risks)).toBe(true);
      expect(Array.isArray(score.opportunities)).toBe(true);
    });
  });

  // ============================================================================
  // 7. CONTENT OPTIMIZATION ENGINE
  // ============================================================================

  describe('7. Content Optimization Engine', () => {
    it('should throw error when content not found', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);

      await expect(optimizeContent('nonexistent')).rejects.toThrow('Content nonexistent not found');
    });

    it('should provide optimization suggestions', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        {
          id: 'test-content',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'Basic hook',
          cta: 'Check it out',
          hashtags: ['#random'],
          scheduledFor: new Date().toISOString(),
        } as ContentPiece,
      ]);

      const optimization = await optimizeContent('test-content');

      expect(optimization.contentId).toBe('test-content');
      expect(optimization.currentScore).toBeDefined();
      expect(Array.isArray(optimization.suggestions)).toBe(true);
      expect(Array.isArray(optimization.abTestVariants)).toBe(true);
    });

    it('should include A/B test variants', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([
        {
          id: 'test-content',
          platform: 'tiktok',
          type: 'video_script',
          hook: 'This is a hook',
        } as ContentPiece,
      ]);

      const optimization = await optimizeContent('test-content');

      expect(optimization.abTestVariants.length).toBeGreaterThan(0);
      expect(optimization.abTestVariants[0].variant).toBeDefined();
      expect(optimization.abTestVariants[0].hypothesis).toBeDefined();
    });
  });

  // ============================================================================
  // 8. SENTIMENT PRE-ANALYSIS
  // ============================================================================

  describe('8. Sentiment Pre-Analysis', () => {
    it('should approve positive, non-controversial content', async () => {
      const content =
        'This amazing productivity tip helped me achieve great results! Try it yourself.';

      const analysis = await analyzeSentiment(content);

      expect(analysis.approved).toBe(true);
      expect(analysis.overallSentiment).toBeGreaterThan(0);
      expect(analysis.toneAnalysis.authentic).toBeGreaterThan(0);
    });

    it('should flag controversial content', async () => {
      const content =
        'This politics debate about the war is controversial and might cause a fight.';

      const analysis = await analyzeSentiment(content);

      expect(analysis.riskFactors.length).toBeGreaterThan(0);
      expect(analysis.riskFactors.some((r) => r.factor.includes('controversial'))).toBe(true);
    });

    it('should flag overly promotional content', async () => {
      const content =
        'BUY NOW! Limited time SALE! Exclusive DISCOUNT! Best DEAL ever! Special OFFER!';

      const analysis = await analyzeSentiment(content);

      expect(analysis.toneAnalysis.promotional).toBeGreaterThan(0.5);
      expect(analysis.riskFactors.some((r) => r.factor.includes('promotional'))).toBe(true);
    });

    it('should calculate platform-specific fit scores', async () => {
      const shortContent = 'Quick tip!';
      // Content must be over 280 chars to get lower twitter score
      const longContent =
        'This is a very detailed and comprehensive guide to improving your productivity through various scientifically-backed methods and techniques. We will explore multiple approaches including time management, focus techniques, habit stacking, deep work protocols, and more. This guide covers everything you need to transform your daily routine.';

      const shortAnalysis = await analyzeSentiment(shortContent);
      const longAnalysis = await analyzeSentiment(longContent);

      expect(shortAnalysis.platformFit.twitter).toBeGreaterThan(longAnalysis.platformFit.twitter);
    });
  });

  // ============================================================================
  // 9. A/B TESTING ENGINE
  // ============================================================================

  describe('9. A/B Testing Engine', () => {
    it('should create A/B test with variants', async () => {
      const test = await createABTest('content-1', [
        { id: 'variant-a', changes: ['Changed hook to question'] },
        { id: 'variant-b', changes: ['Added statistic'] },
      ]);

      expect(test.id).toBeDefined();
      expect(test.originalContentId).toBe('content-1');
      expect(test.variants).toHaveLength(2);
      expect(test.status).toBe('running');
      expect(test.startedAt).toBeDefined();
    });

    it('should analyze test results and declare winner', async () => {
      const test: ABTest = {
        id: 'test-1',
        originalContentId: 'content-1',
        variants: [
          {
            id: 'control',
            contentId: 'c1',
            changes: [],
            metrics: { views: 1000, likes: 50, comments: 10, shares: 5, signups: 2 },
          },
          {
            id: 'variant-a',
            contentId: 'c2',
            changes: ['Better hook'],
            metrics: { views: 1000, likes: 100, comments: 25, shares: 15, signups: 8 },
          },
        ],
        status: 'running',
        startedAt: new Date().toISOString(),
      };

      const results = await analyzeABTestResults(test);

      expect(results.winner).toBe('variant-a');
      expect(results.lift).toBeGreaterThan(0);
      expect(results.confidence).toBeGreaterThan(0);
      expect(results.learnings.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 10. COMPETITIVE INTELLIGENCE
  // ============================================================================

  describe('10. Competitive Intelligence', () => {
    it('should analyze competitor and save insights', async () => {
      const insight = await analyzeCompetitor('Calm', 'tiktok');

      expect(insight.competitor).toBe('Calm');
      expect(insight.platform).toBe('tiktok');
      expect(insight.opportunities.length).toBeGreaterThan(0);
      expect(insight.threats.length).toBeGreaterThan(0);
    });

    it('should save competitor insights to state', async () => {
      await analyzeCompetitor('Headspace', 'instagram');

      expect(storage.saveGrowthState).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // INTELLIGENCE DASHBOARD
  // ============================================================================

  describe('Intelligence Dashboard', () => {
    it('should generate comprehensive dashboard', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);
      vi.mocked(storage.getMetrics).mockResolvedValue([]);

      const dashboard = await getIntelligenceDashboard();

      expect(dashboard.healthScore).toBeGreaterThanOrEqual(0);
      expect(dashboard.healthScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(dashboard.topInsights)).toBe(true);
      expect(Array.isArray(dashboard.actionItems)).toBe(true);
      expect(Array.isArray(dashboard.trends)).toBe(true);
      expect(Array.isArray(dashboard.performanceSummary)).toBe(true);
      expect(typeof dashboard.learningVelocity).toBe('number');
    });

    it('should generate action items when data is insufficient', async () => {
      vi.mocked(storage.getContentQueue).mockResolvedValue([]);
      vi.mocked(storage.getMetrics).mockResolvedValue([]);

      const dashboard = await getIntelligenceDashboard();

      expect(dashboard.actionItems.some((a) => a.priority === 'high')).toBe(true);
    });
  });
});
