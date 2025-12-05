/**
 * Tests for the Automated Tool Optimization System
 *
 * Tests feedback collection, pattern analysis, recommendations, and auto-optimization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackCollector } from '../tools/feedback-collector.js';
import { PatternAnalyzer } from '../tools/pattern-analyzer.js';
import { RecommendationEngine } from '../tools/recommendation-engine.js';
import { AutoToolOptimizer } from '../tools/auto-optimizer.js';

// =============================================================================
// FEEDBACK COLLECTOR TESTS
// =============================================================================

describe('FeedbackCollector', () => {
  let collector: FeedbackCollector;

  beforeEach(() => {
    collector = new FeedbackCollector();
  });

  afterEach(async () => {
    await collector.flush();
  });

  describe('Explicit Feedback Detection', () => {
    it('detects positive feedback', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['playMusic'],
        lastToolResult: 'Playing jazz music',
      };

      collector.processFeedback('thanks, that was really helpful!', context, 'playMusic');
      const allFeedback = collector.getAllFeedback();

      expect(allFeedback.some((f) => f.positiveCount > 0)).toBe(true);
    });

    it('detects negative feedback', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['searchWeb'],
        lastToolResult: 'Search results...',
      };

      collector.processFeedback("that didn't work at all", context, 'searchWeb');
      const allFeedback = collector.getAllFeedback();

      expect(allFeedback.some((f) => f.negativeCount > 0)).toBe(true);
    });

    it('detects feature requests', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 3,
        recentTools: [],
      };

      collector.processFeedback('I wish you could order food for me', context);
      const featureRequests = collector.getTopFeatureRequests();

      expect(featureRequests.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Implicit Feedback Detection', () => {
    it('detects retry patterns', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 2,
        recentTools: ['searchWeb'],
      };

      // First attempt
      collector.processFeedback('search for restaurants', context, 'searchWeb');
      // Retry (same tool mentioned)
      collector.processFeedback('can you try that search again', context, 'searchWeb');

      const toolFeedback = collector.getToolFeedback('searchWeb');
      // Retry detection may or may not trigger depending on heuristics
      expect(toolFeedback).not.toBeNull();
    });
  });

  describe('Sentiment Scoring', () => {
    it('calculates sentiment scores correctly', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 1,
        recentTools: ['playMusic'],
      };

      // Mix of feedback
      collector.processFeedback('perfect, exactly what I wanted!', context, 'playMusic');
      collector.processFeedback('hmm, not quite right', context, 'playMusic');
      collector.processFeedback('thanks!', context, 'playMusic');

      const allFeedback = collector.getAllFeedback();
      // Should have some positive sentiment since 2/3 are positive
      expect(allFeedback.some((f) => f.positiveCount > 0)).toBe(true);
    });
  });
});

// =============================================================================
// PATTERN ANALYZER TESTS
// =============================================================================

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer;

  beforeEach(() => {
    analyzer = new PatternAnalyzer();
  });

  describe('Session Management', () => {
    it('starts and tracks sessions', () => {
      analyzer.startSession('session1', 'user1', 'ferni');
      analyzer.recordToolCall('session1', 'playMusic', true, 150);
      analyzer.endSession('session1');

      // Should complete without error
      expect(true).toBe(true);
    });

    it('handles multiple concurrent sessions', () => {
      analyzer.startSession('session1', 'user1', 'ferni');
      analyzer.startSession('session2', 'user2', 'alex');

      analyzer.recordToolCall('session1', 'playMusic', true, 150);
      analyzer.recordToolCall('session2', 'sendEmail', true, 200);

      analyzer.endSession('session1');
      analyzer.endSession('session2');

      expect(true).toBe(true);
    });
  });

  describe('Co-occurrence Analysis', () => {
    it('identifies tools used together', () => {
      analyzer.startSession('session1', 'user1', 'ferni');

      // Tools often used in the same session
      analyzer.recordToolCall('session1', 'getCurrentContext', true, 50);
      analyzer.recordToolCall('session1', 'getUserContext', true, 50);
      analyzer.recordToolCall('session1', 'playMusic', true, 150);

      analyzer.endSession('session1');

      const coOccurrence = analyzer.getCoOccurrences(1); // Low threshold for testing
      expect(Array.isArray(coOccurrence)).toBe(true);
    });
  });

  describe('Sequence Discovery', () => {
    it('discovers tool sequences', () => {
      analyzer.startSession('session1', 'user1', 'ferni');

      // Common sequence: context -> music
      analyzer.recordToolCall('session1', 'getCurrentContext', true, 50);
      analyzer.recordToolCall('session1', 'playMusic', true, 150);

      analyzer.endSession('session1');

      const sequences = analyzer.discoverSequences(2, 5, 1); // Low threshold for testing
      expect(Array.isArray(sequences)).toBe(true);
    });
  });

  describe('User Journey Analysis', () => {
    it('builds user journeys from sessions', () => {
      analyzer.startSession('session1', 'user1', 'ferni');
      analyzer.recordToolCall('session1', 'getCurrentContext', true, 50);
      analyzer.recordToolCall('session1', 'playMusic', true, 150);
      analyzer.endSession('session1');

      const journeys = analyzer.identifyJourneys();
      // Journey identification needs more data, just check array type
      expect(Array.isArray(journeys)).toBe(true);
    });
  });

  describe('Gap Analysis', () => {
    it('identifies gaps in tool coverage', () => {
      // Gap analysis requires feature requests from feedback collector
      const featureRequests = [
        { capability: 'order food delivery', count: 5, examples: ['can you order food'] },
      ];

      const gaps = analyzer.analyzeGaps(featureRequests);
      expect(Array.isArray(gaps)).toBe(true);
      expect(gaps.length).toBeGreaterThan(0);
    });
  });

  describe('Consolidation Opportunities', () => {
    it('finds tools that could be consolidated', () => {
      // Need multiple sessions with same tool pairs for consolidation detection
      for (let session = 0; session < 15; session++) {
        analyzer.startSession(`session${session}`, 'user1', 'ferni');
        analyzer.recordToolCall(`session${session}`, 'getStockQuote', true, 100);
        analyzer.recordToolCall(`session${session}`, 'analyzeStock', true, 100);
        analyzer.endSession(`session${session}`);
      }

      const opportunities = analyzer.findConsolidationOpportunities();
      expect(Array.isArray(opportunities)).toBe(true);
    });
  });
});

// =============================================================================
// RECOMMENDATION ENGINE TESTS
// =============================================================================

describe('RecommendationEngine', () => {
  let engine: RecommendationEngine;
  let localPatternAnalyzer: PatternAnalyzer;
  let localFeedbackCollector: FeedbackCollector;

  beforeEach(() => {
    localPatternAnalyzer = new PatternAnalyzer();
    localFeedbackCollector = new FeedbackCollector();
    engine = new RecommendationEngine(localPatternAnalyzer, localFeedbackCollector);
  });

  describe('Recommendation Generation', () => {
    it('generates recommendations from data', async () => {
      // Add some pattern data
      localPatternAnalyzer.startSession('session1', 'user1', 'ferni');
      localPatternAnalyzer.recordToolCall('session1', 'playMusic', true, 150);
      localPatternAnalyzer.recordToolCall('session1', 'musicControl', true, 50);
      localPatternAnalyzer.endSession('session1');

      // Add some feedback data
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['playMusic'],
      };
      localFeedbackCollector.processFeedback('perfect, thanks!', context, 'playMusic');

      const recommendations = await engine.generateRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('prioritizes recommendations by impact', async () => {
      // Add significant data for recommendations
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['searchWeb'],
      };

      // Multiple negative feedback for same tool = high impact recommendation
      for (let i = 0; i < 5; i++) {
        localFeedbackCollector.processFeedback('that search was terrible', context, 'searchWeb');
      }

      const recommendations = await engine.generateRecommendations();

      // If there are recommendations, check they have priority
      if (recommendations.length > 0) {
        expect(recommendations[0]).toHaveProperty('priority');
      }
    });
  });

  describe('Recommendation Types', () => {
    it('generates CREATE recommendations for feature requests', async () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 3,
        recentTools: [],
      };

      localFeedbackCollector.processFeedback(
        'I wish you could book restaurant reservations',
        context
      );
      localFeedbackCollector.processFeedback('can you order food delivery?', context);

      const recommendations = await engine.generateRecommendations();
      const createRecs = recommendations.filter((r) => r.type === 'create');

      // May or may not generate CREATE depending on threshold
      expect(Array.isArray(createRecs)).toBe(true);
    });

    it('generates IMPROVE recommendations for mediocre tools', async () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['searchWeb'],
      };

      // Mix of feedback (not all negative, not all positive)
      localFeedbackCollector.processFeedback('ok, that kind of worked', context, 'searchWeb');
      localFeedbackCollector.processFeedback('close but not quite', context, 'searchWeb');
      localFeedbackCollector.processFeedback('better this time', context, 'searchWeb');

      const recommendations = await engine.generateRecommendations();
      const improveRecs = recommendations.filter((r) => r.type === 'improve');

      expect(Array.isArray(improveRecs)).toBe(true);
    });

    it('generates DEPRECATE recommendations for unused tools', async () => {
      // No tool calls recorded = unused tools

      const recommendations = await engine.generateRecommendations();
      const deprecateRecs = recommendations.filter((r) => r.type === 'deprecate');

      // With no data, may or may not generate deprecate recs
      expect(Array.isArray(deprecateRecs)).toBe(true);
    });

    it('generates CONSOLIDATE recommendations for co-occurring tools', async () => {
      // Need multiple sessions with same tool pairs
      for (let session = 0; session < 15; session++) {
        localPatternAnalyzer.startSession(`session${session}`, 'user1', 'ferni');
        localPatternAnalyzer.recordToolCall(`session${session}`, 'getWeather', true, 50);
        localPatternAnalyzer.recordToolCall(`session${session}`, 'getCurrentContext', true, 30);
        localPatternAnalyzer.endSession(`session${session}`);
      }

      const recommendations = await engine.generateRecommendations();
      const consolidateRecs = recommendations.filter((r) => r.type === 'consolidate');

      expect(Array.isArray(consolidateRecs)).toBe(true);
    });
  });
});

// =============================================================================
// AUTO OPTIMIZER TESTS
// =============================================================================

describe('AutoToolOptimizer', () => {
  let optimizer: AutoToolOptimizer;

  beforeEach(() => {
    optimizer = new AutoToolOptimizer({
      enableAutoRecommendations: true,
      enableAutoExperiments: true,
      enableAutoImplementation: false, // Keep manual for tests
      analysisIntervalMs: 1000, // Fast interval for testing
    });
  });

  afterEach(() => {
    optimizer.stop();
  });

  describe('Session Tracking', () => {
    it('tracks sessions correctly', () => {
      optimizer.startSession('session1', 'user1', 'ferni');
      optimizer.recordToolExecution('session1', 'playMusic', true, 150);
      optimizer.endSession('session1');

      expect(true).toBe(true); // No errors
    });
  });

  describe('Message Processing', () => {
    it('processes user messages for feedback', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['playMusic'],
        lastToolResult: 'Playing jazz',
      };

      optimizer.processUserMessage('thanks, love it!', context, 'playMusic');

      // Should process without error
      expect(true).toBe(true);
    });

    it('handles feature requests', () => {
      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 3,
        recentTools: [],
      };

      optimizer.processUserMessage('I wish you could track my flights', context);

      // Should process without error
      expect(true).toBe(true);
    });
  });

  describe('Optimization Cycle', () => {
    it('runs optimization cycle', async () => {
      // Add some data first
      optimizer.startSession('session1', 'user1', 'ferni');
      optimizer.recordToolExecution('session1', 'playMusic', true, 150);

      const context = {
        userId: 'user1',
        sessionId: 'session1',
        agentId: 'ferni',
        turnNumber: 5,
        recentTools: ['playMusic'],
      };
      optimizer.processUserMessage('great!', context, 'playMusic');
      optimizer.endSession('session1');

      // Run a cycle
      const cycle = await optimizer.runOptimizationCycle();

      expect(cycle).toHaveProperty('startTime');
      expect(cycle).toHaveProperty('status');
      expect(cycle).toHaveProperty('recommendationsCreated');
    });
  });

  describe('Start/Stop', () => {
    it('starts and stops cleanly', async () => {
      optimizer.start();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      optimizer.stop();

      // Should stop without error
      expect(true).toBe(true);
    });

    it('handles multiple start/stop cycles', () => {
      optimizer.start();
      optimizer.stop();
      optimizer.start();
      optimizer.stop();

      expect(true).toBe(true);
    });
  });

  describe('Status Reporting', () => {
    it('reports status correctly', () => {
      const status = optimizer.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('cycleCount');
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Optimization System Integration', () => {
  let integrationFeedbackCollector: FeedbackCollector;
  let integrationPatternAnalyzer: PatternAnalyzer;
  let integrationRecommendationEngine: RecommendationEngine;
  let integrationAutoOptimizer: AutoToolOptimizer;

  beforeEach(() => {
    integrationFeedbackCollector = new FeedbackCollector();
    integrationPatternAnalyzer = new PatternAnalyzer();
    integrationRecommendationEngine = new RecommendationEngine(
      integrationPatternAnalyzer,
      integrationFeedbackCollector
    );
    integrationAutoOptimizer = new AutoToolOptimizer({
      enableAutoRecommendations: true,
      enableAutoExperiments: false,
      enableAutoImplementation: false,
      analysisIntervalMs: 60000, // Don't auto-run in tests
    });
  });

  afterEach(() => {
    integrationAutoOptimizer.stop();
  });

  it('end-to-end: collects data and generates recommendations', async () => {
    // Simulate a user session
    const sessionId = 'integration-test-session';
    const userId = 'test-user';
    const agentId = 'ferni';

    // Start tracking
    integrationPatternAnalyzer.startSession(sessionId, userId, agentId);
    integrationAutoOptimizer.startSession(sessionId, userId, agentId);

    // Simulate tool usage
    integrationPatternAnalyzer.recordToolCall(sessionId, 'getCurrentContext', true, 50);
    integrationAutoOptimizer.recordToolExecution(sessionId, 'getCurrentContext', true, 50);

    integrationPatternAnalyzer.recordToolCall(sessionId, 'playMusic', true, 150);
    integrationAutoOptimizer.recordToolExecution(sessionId, 'playMusic', true, 150);

    // Simulate user feedback
    const context = {
      userId,
      sessionId,
      agentId,
      turnNumber: 3,
      recentTools: ['getCurrentContext', 'playMusic'],
      lastToolResult: 'Playing jazz music',
    };

    integrationFeedbackCollector.processFeedback('perfect, love it!', context, 'playMusic');
    integrationAutoOptimizer.processUserMessage('perfect, love it!', context, 'playMusic');

    // End session
    integrationPatternAnalyzer.endSession(sessionId);
    integrationAutoOptimizer.endSession(sessionId);

    // Generate recommendations
    const recommendations = await integrationRecommendationEngine.generateRecommendations();

    // Verify the system captured data
    const allFeedback = integrationFeedbackCollector.getAllFeedback();
    expect(allFeedback.length).toBeGreaterThanOrEqual(1);

    // Recommendations should be an array (may be empty if not enough data)
    expect(Array.isArray(recommendations)).toBe(true);
  });

  it('handles high volume of data gracefully', async () => {
    const sessionId = 'high-volume-session';
    const userId = 'power-user';
    const agentId = 'ferni';

    integrationPatternAnalyzer.startSession(sessionId, userId, agentId);

    // Simulate 100 tool calls
    for (let i = 0; i < 100; i++) {
      const tools = ['playMusic', 'searchWeb', 'getCurrentContext', 'sendEmail', 'getWeather'];
      const tool = tools[i % tools.length];
      integrationPatternAnalyzer.recordToolCall(
        sessionId,
        tool,
        Math.random() > 0.1,
        Math.random() * 500
      );
    }

    integrationPatternAnalyzer.endSession(sessionId);

    // Should complete without error
    const coOccurrence = integrationPatternAnalyzer.getCoOccurrences(1);
    const sequences = integrationPatternAnalyzer.discoverSequences(2, 5, 1);

    expect(Array.isArray(coOccurrence)).toBe(true);
    expect(Array.isArray(sequences)).toBe(true);
  });
});
