/**
 * Optimization System API
 *
 * Provides REST API endpoints for the tool analytics dashboard.
 * Can be deployed as a Cloud Function or integrated into the main server.
 */

import { getLogger } from '../utils/safe-logger.js';
import { optimizationPersistence } from './optimization-persistence.js';
import { toolUsageAnalytics } from './tool-usage-analytics.js';
import { toolRegistry } from '../tools/registry/index.js';
import { abTestingService } from '../tools/ab-testing.js';
import { patternAnalyzer } from '../tools/pattern-analyzer.js';
import { feedbackCollector } from '../tools/feedback-collector.js';
import { recommendationEngine } from '../tools/recommendation-engine.js';
import { autoOptimizer } from '../tools/auto-optimizer.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardData {
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

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * Get full dashboard data
 */
export async function getDashboardData(): Promise<DashboardData> {
  const startTime = Date.now();
  
  try {
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
        avgLatencyMs: Math.round(s.avgLatencyMs),
      }));

    const slowTools = allStats
      .filter(s => s.totalCalls > 0)
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
      .slice(0, 5)
      .map(s => ({
        toolId: s.toolId,
        avgLatencyMs: Math.round(s.avgLatencyMs),
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
    const coOccurrences = patternAnalyzer.getCoOccurrences(5).slice(0, 10).map(c => ({
      toolA: c.toolA,
      toolB: c.toolB,
      count: c.count,
      correlation: c.correlation,
    }));
    
    const sequences = patternAnalyzer.discoverSequences(2, 4, 3).slice(0, 10).map(s => ({
      sequence: s.sequence,
      count: s.count,
      successRate: s.successRate,
    }));
    
    const journeys = patternAnalyzer.identifyJourneys().slice(0, 5).map(j => ({
      name: j.name,
      tools: j.tools,
      frequency: j.frequency,
    }));

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

    const data: DashboardData = {
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
        coOccurrences,
        sequences,
        journeys,
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
        lastCycleTime: null,
      },
    };

    getLogger().debug({ durationMs: Date.now() - startTime }, 'Dashboard data fetched');
    return data;
  } catch (error) {
    getLogger().error({ error }, 'Failed to get dashboard data');
    throw error;
  }
}

/**
 * Trigger an optimization cycle manually
 */
export async function triggerOptimizationCycle(): Promise<{
  success: boolean;
  message: string;
  recommendationsGenerated: number;
}> {
  try {
    const cycle = await autoOptimizer.runOptimizationCycle();
    
    return {
      success: cycle.status === 'success',
      message: cycle.status === 'success' 
        ? `Cycle complete: ${cycle.recommendationsCreated} recommendations`
        : `Cycle incomplete: ${cycle.status}`,
      recommendationsGenerated: cycle.recommendationsCreated,
    };
  } catch (error) {
    getLogger().error({ error }, 'Failed to trigger optimization cycle');
    return {
      success: false,
      message: String(error),
      recommendationsGenerated: 0,
    };
  }
}

/**
 * Start the auto-optimizer
 */
export function startOptimizer(): { success: boolean; message: string } {
  try {
    autoOptimizer.start();
    return { success: true, message: 'Optimizer started' };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Stop the auto-optimizer
 */
export function stopOptimizer(): { success: boolean; message: string } {
  try {
    autoOptimizer.stop();
    return { success: true, message: 'Optimizer stopped' };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Activate an A/B experiment
 */
export function activateExperiment(experimentId: string): { success: boolean; message: string } {
  try {
    abTestingService.activateExperiment(experimentId);
    return { success: true, message: `Experiment ${experimentId} activated` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Deactivate an A/B experiment
 */
export function deactivateExperiment(experimentId: string): { success: boolean; message: string } {
  try {
    abTestingService.deactivateExperiment(experimentId);
    return { success: true, message: `Experiment ${experimentId} deactivated` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Get recommendations with full details
 */
export async function getRecommendations(): Promise<{
  recommendations: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    priority: string;
    impact: string;
    effort: string;
    status: string;
  }>;
}> {
  const recs = await recommendationEngine.generateRecommendations();
  
  return {
    recommendations: recs.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      priority: r.priority,
      impact: r.impact.level,
      effort: r.implementation.effort,
      status: r.status,
    })),
  };
}

/**
 * Approve a recommendation
 */
export async function approveRecommendation(recommendationId: string): Promise<{ success: boolean; message: string }> {
  try {
    await optimizationPersistence.updateRecommendationStatus(recommendationId, 'approved');
    return { success: true, message: `Recommendation ${recommendationId} approved` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

/**
 * Reject a recommendation
 */
export async function rejectRecommendation(recommendationId: string): Promise<{ success: boolean; message: string }> {
  try {
    await optimizationPersistence.updateRecommendationStatus(recommendationId, 'rejected');
    return { success: true, message: `Recommendation ${recommendationId} rejected` };
  } catch (error) {
    return { success: false, message: String(error) };
  }
}

// ============================================================================
// EXPRESS ROUTER (Optional - for use with Express server)
// ============================================================================

/**
 * Create Express router for optimization API
 * Usage: app.use('/api/tools', createOptimizationRouter())
 */
export function createOptimizationRouter() {
  // Dynamic import to avoid requiring express if not used
  return (async () => {
    try {
      const { Router } = await import('express');
      const router = Router();

      // GET /api/tools/analytics - Main dashboard data
      router.get('/analytics', async (_req, res) => {
        try {
          const data = await getDashboardData();
          res.json(data);
        } catch (error) {
          res.status(500).json({ error: 'Failed to get analytics' });
        }
      });

      // POST /api/tools/optimize - Trigger optimization cycle
      router.post('/optimize', async (_req, res) => {
        const result = await triggerOptimizationCycle();
        res.json(result);
      });

      // POST /api/tools/optimizer/start - Start auto-optimizer
      router.post('/optimizer/start', (_req, res) => {
        res.json(startOptimizer());
      });

      // POST /api/tools/optimizer/stop - Stop auto-optimizer
      router.post('/optimizer/stop', (_req, res) => {
        res.json(stopOptimizer());
      });

      // GET /api/tools/recommendations - Get all recommendations
      router.get('/recommendations', async (_req, res) => {
        const result = await getRecommendations();
        res.json(result);
      });

      // POST /api/tools/recommendations/:id/approve - Approve recommendation
      router.post('/recommendations/:id/approve', async (req, res) => {
        const result = await approveRecommendation(req.params.id);
        res.json(result);
      });

      // POST /api/tools/recommendations/:id/reject - Reject recommendation
      router.post('/recommendations/:id/reject', async (req, res) => {
        const result = await rejectRecommendation(req.params.id);
        res.json(result);
      });

      // POST /api/tools/experiments/:id/activate - Activate experiment
      router.post('/experiments/:id/activate', (req, res) => {
        res.json(activateExperiment(req.params.id));
      });

      // POST /api/tools/experiments/:id/deactivate - Deactivate experiment
      router.post('/experiments/:id/deactivate', (req, res) => {
        res.json(deactivateExperiment(req.params.id));
      });

      return router;
    } catch {
      getLogger().warn('Express not available, router not created');
      return null;
    }
  })();
}

// ============================================================================
// CLOUD FUNCTION HANDLER (for Cloud Functions / Cloud Run)
// ============================================================================

/**
 * HTTP handler for Cloud Functions
 * Can be used directly as a Cloud Function entry point
 */
export async function handleOptimizationRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  try {
    // Parse the path
    const segments = path.split('/').filter(Boolean);

    // GET /analytics
    if (method === 'GET' && segments[0] === 'analytics') {
      return { status: 200, body: await getDashboardData() };
    }

    // POST /optimize
    if (method === 'POST' && segments[0] === 'optimize') {
      return { status: 200, body: await triggerOptimizationCycle() };
    }

    // POST /optimizer/start
    if (method === 'POST' && segments[0] === 'optimizer' && segments[1] === 'start') {
      return { status: 200, body: startOptimizer() };
    }

    // POST /optimizer/stop
    if (method === 'POST' && segments[0] === 'optimizer' && segments[1] === 'stop') {
      return { status: 200, body: stopOptimizer() };
    }

    // GET /recommendations
    if (method === 'GET' && segments[0] === 'recommendations') {
      return { status: 200, body: await getRecommendations() };
    }

    // POST /recommendations/:id/approve
    if (method === 'POST' && segments[0] === 'recommendations' && segments[2] === 'approve') {
      return { status: 200, body: await approveRecommendation(segments[1]) };
    }

    // POST /recommendations/:id/reject
    if (method === 'POST' && segments[0] === 'recommendations' && segments[2] === 'reject') {
      return { status: 200, body: await rejectRecommendation(segments[1]) };
    }

    // POST /experiments/:id/activate
    if (method === 'POST' && segments[0] === 'experiments' && segments[2] === 'activate') {
      return { status: 200, body: activateExperiment(segments[1]) };
    }

    // POST /experiments/:id/deactivate
    if (method === 'POST' && segments[0] === 'experiments' && segments[2] === 'deactivate') {
      return { status: 200, body: deactivateExperiment(segments[1]) };
    }

    return { status: 404, body: { error: 'Not found' } };
  } catch (error) {
    getLogger().error({ error, method, path }, 'Optimization API error');
    return { status: 500, body: { error: String(error) } };
  }
}

export default {
  getDashboardData,
  triggerOptimizationCycle,
  startOptimizer,
  stopOptimizer,
  activateExperiment,
  deactivateExperiment,
  getRecommendations,
  approveRecommendation,
  rejectRecommendation,
  createOptimizationRouter,
  handleOptimizationRequest,
};

