/**
 * Tools Analytics API
 *
 * Provides REST endpoints for the tool analytics dashboard.
 * Fetches data from the optimization persistence service and in-memory caches.
 */

// Types for API responses
export interface ToolAnalyticsResponse {
  registry: {
    totalTools: number;
    byDomain: Record<string, number>;
  };
  experiments: Array<{
    id: string;
    name: string;
    description: string;
    active: boolean;
  }>;
  topTools: Array<{
    toolId: string;
    calls: number;
    avgLatencyMs: number;
  }>;
  slowTools: Array<{
    toolId: string;
    avgLatencyMs: number;
  }>;
  errorTools: Array<{
    toolId: string;
    errorRate: number;
  }>;
  recommendations: string[];
  patterns: {
    coOccurrences: Array<{
      toolA: string;
      toolB: string;
      count: number;
      correlation: number;
    }>;
    sequences: Array<{
      sequence: string[];
      count: number;
      successRate: number;
    }>;
    journeys: Array<{
      name: string;
      tools: string[];
      frequency: number;
    }>;
  };
  feedback: {
    totalFeedback: number;
    positiveRate: number;
    topFeatureRequests: Array<{
      capability: string;
      count: number;
    }>;
    problematicTools: Array<{
      toolId: string;
      negativeRate: number;
    }>;
  };
  optimizer: {
    isRunning: boolean;
    cycleCount: number;
    lastCycleTime: string | null;
  };
}

/**
 * Fetch tool analytics data from the server
 * In development, returns mock data
 * In production, calls the actual API endpoint
 */
export async function fetchToolAnalytics(): Promise<ToolAnalyticsResponse> {
  // Check if we're in development or production
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isDev) {
    // Return mock data for development
    return getMockData();
  }

  try {
    const response = await fetch('/api/tools/analytics');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.warn('Failed to fetch analytics, using mock data:', error);
    return getMockData();
  }
}

/**
 * Fetch live analytics from the CLI (for server-side)
 * This would be called by an Express endpoint
 */
export async function getServerAnalytics(): Promise<ToolAnalyticsResponse> {
  // Import server-side modules
  const { toolRegistry } = await import('../../../src/tools/registry/index.js');
  const { abTestingService } = await import('../../../src/tools/ab-testing.js');
  const { toolUsageAnalytics } = await import('../../../src/services/tool-usage-analytics.js');
  const { patternAnalyzer } = await import('../../../src/tools/pattern-analyzer.js');
  const { feedbackCollector } = await import('../../../src/tools/feedback-collector.js');
  const { recommendationEngine } = await import('../../../src/tools/recommendation-engine.js');
  const { autoOptimizer } = await import('../../../src/tools/auto-optimizer.js');

  // Get registry stats
  const registryStats = toolRegistry.getStats();

  // Get experiments
  const experiments = abTestingService.getExperiments().map(exp => ({
    id: exp.id,
    name: exp.name,
    description: exp.description,
    active: exp.status === 'active',
  }));

  // Get tool usage stats
  const allStats = await toolUsageAnalytics.getAllStats();
  const topTools = allStats
    .sort((a, b) => b.totalCalls - a.totalCalls)
    .slice(0, 10)
    .map(s => ({
      toolId: s.toolId,
      calls: s.totalCalls,
      avgLatencyMs: s.avgLatencyMs,
    }));

  const slowTools = allStats
    .filter(s => s.totalCalls > 0)
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 5)
    .map(s => ({
      toolId: s.toolId,
      avgLatencyMs: s.avgLatencyMs,
    }));

  const errorTools = allStats
    .filter(s => s.failureCount > 0)
    .map(s => ({
      toolId: s.toolId,
      errorRate: s.failureCount / s.totalCalls,
    }))
    .filter(t => t.errorRate > 0.05)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 5);

  // Get recommendations
  const recommendations = await recommendationEngine.generateRecommendations();
  const recStrings = recommendations.slice(0, 10).map(r => 
    `${r.priority === 'critical' ? '🚨' : r.priority === 'high' ? '⚠️' : '💡'} ${r.title}`
  );

  // Get patterns
  const coOccurrences = patternAnalyzer.getCoOccurrences(5).slice(0, 10);
  const sequences = patternAnalyzer.discoverSequences(2, 4, 3).slice(0, 10);
  const journeys = patternAnalyzer.identifyJourneys().slice(0, 5);

  // Get feedback
  const allFeedback = feedbackCollector.getAllFeedback();
  const totalFeedback = allFeedback.reduce((sum, f) => sum + f.totalFeedback, 0);
  const totalPositive = allFeedback.reduce((sum, f) => sum + f.positiveCount, 0);
  const positiveRate = totalFeedback > 0 ? totalPositive / totalFeedback : 0;
  
  const topFeatureRequests = feedbackCollector.getTopFeatureRequests(5);
  const problematicTools = feedbackCollector.getProblematicTools().slice(0, 5).map(p => ({
    toolId: p.toolId,
    negativeRate: p.negativeCount / p.totalFeedback,
  }));

  // Get optimizer status
  const optimizerStatus = autoOptimizer.getStatus();

  return {
    registry: {
      totalTools: registryStats.totalTools,
      byDomain: registryStats.byDomain,
    },
    experiments,
    topTools,
    slowTools,
    errorTools,
    recommendations: recStrings,
    patterns: {
      coOccurrences: coOccurrences.map(c => ({
        toolA: c.toolA,
        toolB: c.toolB,
        count: c.count,
        correlation: c.correlation,
      })),
      sequences: sequences.map(s => ({
        sequence: s.sequence,
        count: s.count,
        successRate: s.successRate,
      })),
      journeys: journeys.map(j => ({
        name: j.name,
        tools: j.tools,
        frequency: j.frequency,
      })),
    },
    feedback: {
      totalFeedback,
      positiveRate,
      topFeatureRequests,
      problematicTools,
    },
    optimizer: {
      isRunning: optimizerStatus.isRunning,
      cycleCount: optimizerStatus.cycleCount,
      lastCycleTime: null, // Would need to add this to status
    },
  };
}

/**
 * Mock data for development/demo
 */
function getMockData(): ToolAnalyticsResponse {
  return {
    registry: {
      totalTools: 208,
      byDomain: {
        memory: 5,
        calendar: 11,
        communication: 6,
        habits: 10,
        finance: 9,
        research: 8,
        productivity: 10,
        'life-planning': 12,
        wellness: 4,
        entertainment: 7,
        information: 5,
        wisdom: 4,
        handoff: 6,
        telephony: 2,
        grief: 10,
        meaning: 5,
        relationships: 6,
        stories: 9,
        curiosity: 7,
        vulnerability: 8,
        dreams: 8,
        play: 11,
        'self-compassion': 12,
        presence: 5,
        proactive: 8,
        awareness: 5,
      },
    },
    experiments: [
      {
        id: 'consolidated-vs-granular',
        name: 'Consolidated vs Granular Tools',
        description: 'Test if users prefer consolidated multi-action tools vs many specific tools',
        active: false,
      },
      {
        id: 'awareness-tools',
        name: 'Awareness Tools Impact',
        description: 'Test if world awareness tools improve conversation quality',
        active: true,
      },
      {
        id: 'tool-count-optimization',
        name: 'Optimal Tool Count',
        description: 'Find the optimal number of tools per agent',
        active: false,
      },
    ],
    topTools: [
      { toolId: 'playMusic', calls: 342, avgLatencyMs: 156 },
      { toolId: 'rememberAboutUser', calls: 287, avgLatencyMs: 89 },
      { toolId: 'recallFromMemory', calls: 256, avgLatencyMs: 67 },
      { toolId: 'getCurrentContext', calls: 234, avgLatencyMs: 12 },
      { toolId: 'getNews', calls: 198, avgLatencyMs: 234 },
      { toolId: 'getWeather', calls: 187, avgLatencyMs: 189 },
      { toolId: 'manageTasks', calls: 156, avgLatencyMs: 145 },
      { toolId: 'budgetPlanner', calls: 134, avgLatencyMs: 178 },
      { toolId: 'scheduleEvent', calls: 123, avgLatencyMs: 201 },
      { toolId: 'sendCommunication', calls: 98, avgLatencyMs: 312 },
    ],
    slowTools: [
      { toolId: 'searchWeb', avgLatencyMs: 2340 },
      { toolId: 'analyzeStock', avgLatencyMs: 1890 },
      { toolId: 'synthesizeInsights', avgLatencyMs: 1456 },
      { toolId: 'sendCommunication', avgLatencyMs: 1234 },
      { toolId: 'practiceConversation', avgLatencyMs: 987 },
    ],
    errorTools: [
      { toolId: 'spotifyAdvanced', errorRate: 0.23 },
      { toolId: 'telephonyCallback', errorRate: 0.15 },
      { toolId: 'searchWeb', errorRate: 0.12 },
    ],
    recommendations: [
      '🎯 Tool count optimized! Average 8.0 tools per domain (target: 8-10)',
      '📊 Consider consolidating the "self-compassion" domain (12 tools)',
      '🔄 "life-planning" domain has 12 tools - review for consolidation',
      '⚡ 3 tools have >10% error rate - investigate stability',
      '💡 Users frequently request "flight tracking" - consider adding',
    ],
    patterns: {
      coOccurrences: [
        { toolA: 'playMusic', toolB: 'getCurrentContext', count: 156, correlation: 0.72 },
        { toolA: 'rememberAboutUser', toolB: 'recallFromMemory', count: 134, correlation: 0.85 },
        { toolA: 'getWeather', toolB: 'getCurrentContext', count: 98, correlation: 0.67 },
        { toolA: 'manageHabit', toolB: 'habitProgress', count: 87, correlation: 0.91 },
        { toolA: 'scheduleEvent', toolB: 'sendCommunication', count: 76, correlation: 0.58 },
      ],
      sequences: [
        { sequence: ['getCurrentContext', 'playMusic'], count: 89, successRate: 0.94 },
        { sequence: ['rememberAboutUser', 'recallFromMemory', 'respond'], count: 67, successRate: 0.89 },
        { sequence: ['getWeather', 'getCurrentContext', 'suggest'], count: 45, successRate: 0.92 },
      ],
      journeys: [
        { name: 'Morning Routine', tools: ['getCurrentContext', 'getWeather', 'manageTasks'], frequency: 234 },
        { name: 'Entertainment Request', tools: ['playMusic', 'musicControl', 'musicInfo'], frequency: 189 },
        { name: 'Memory Recall', tools: ['recallFromMemory', 'rememberAboutUser'], frequency: 156 },
      ],
    },
    feedback: {
      totalFeedback: 1247,
      positiveRate: 0.78,
      topFeatureRequests: [
        { capability: 'flight tracking', count: 23 },
        { capability: 'food ordering', count: 18 },
        { capability: 'smart home control', count: 15 },
        { capability: 'package tracking', count: 12 },
        { capability: 'translation', count: 9 },
      ],
      problematicTools: [
        { toolId: 'searchWeb', negativeRate: 0.34 },
        { toolId: 'spotifyAdvanced', negativeRate: 0.28 },
        { toolId: 'telephonyCallback', negativeRate: 0.22 },
      ],
    },
    optimizer: {
      isRunning: true,
      cycleCount: 47,
      lastCycleTime: new Date(Date.now() - 300000).toISOString(),
    },
  };
}

export default fetchToolAnalytics;

