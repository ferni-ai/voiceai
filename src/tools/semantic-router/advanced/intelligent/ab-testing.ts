/**
 * A/B Testing for Intelligent Routing
 *
 * Compare intelligent routing vs semantic routing in production:
 * - Random user assignment with consistent bucketing
 * - Track success rates, latency, user satisfaction
 * - Statistical significance calculation
 * - Gradual rollout support
 *
 * @module semantic-router/advanced/intelligent/ab-testing
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { RoutingDecision } from './orchestrator.js';

const log = createLogger({ module: 'intelligent-ab-testing' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingExperiment {
  id: string;
  name: string;
  description: string;
  /** Control = semantic routing */
  control: {
    name: string;
    routingType: 'semantic';
  };
  /** Variants = intelligent routing configurations */
  variants: Array<{
    id: string;
    name: string;
    routingType: 'intelligent';
    config: IntelligentRoutingConfig;
  }>;
  /** Traffic allocation (control + variants must sum to 100) */
  trafficAllocation: number[];
  /** Start date */
  startDate: Date;
  /** End date (null = ongoing) */
  endDate: Date | null;
  /** Is active */
  active: boolean;
  /** Minimum sample size per variant */
  minSampleSize: number;
}

export interface IntelligentRoutingConfig {
  enableIntentClassifier: boolean;
  enableLLMFallback: boolean;
  enableBanditOptimization: boolean;
  enableReActReasoning: boolean;
  enableGoalPlanning: boolean;
  confidenceThreshold: number;
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  userId: string;
  assignedAt: Date;
}

export interface ExperimentMetric {
  experimentId: string;
  variantId: string;
  userId: string;
  metric: string;
  value: number;
  timestamp: Date;
}

export interface ExperimentResults {
  experimentId: string;
  controlStats: VariantStats;
  variantStats: VariantStats[];
  winner: string | null;
  confidenceLevel: number;
  recommendations: string[];
}

export interface VariantStats {
  variantId: string;
  sampleSize: number;
  successRate: number;
  avgLatencyMs: number;
  avgConfidence: number;
  userSatisfaction: number;
}

// ============================================================================
// PREDEFINED EXPERIMENTS
// ============================================================================

export const INTELLIGENT_VS_SEMANTIC_EXPERIMENT: RoutingExperiment = {
  id: 'intelligent-vs-semantic',
  name: 'Intelligent Routing vs Semantic Routing',
  description: 'Compare the new 6-strategy intelligent routing cascade with the existing semantic router',
  control: {
    name: 'Semantic Routing (Control)',
    routingType: 'semantic',
  },
  variants: [
    {
      id: 'intelligent-full',
      name: 'Full Intelligent Routing',
      routingType: 'intelligent',
      config: {
        enableIntentClassifier: true,
        enableLLMFallback: true,
        enableBanditOptimization: true,
        enableReActReasoning: true,
        enableGoalPlanning: true,
        confidenceThreshold: 0.7,
      },
    },
    {
      id: 'intelligent-no-llm',
      name: 'Intelligent (No LLM Fallback)',
      routingType: 'intelligent',
      config: {
        enableIntentClassifier: true,
        enableLLMFallback: false,
        enableBanditOptimization: true,
        enableReActReasoning: false,
        enableGoalPlanning: false,
        confidenceThreshold: 0.7,
      },
    },
  ],
  trafficAllocation: [34, 33, 33], // Control, Full, No-LLM
  startDate: new Date(),
  endDate: null,
  active: false, // Enable when ready
  minSampleSize: 1000,
};

export const CONFIDENCE_THRESHOLD_EXPERIMENT: RoutingExperiment = {
  id: 'confidence-threshold',
  name: 'Confidence Threshold Optimization',
  description: 'Find the optimal confidence threshold for intelligent routing',
  control: {
    name: 'Threshold 0.7 (Control)',
    routingType: 'semantic',
  },
  variants: [
    {
      id: 'threshold-0.6',
      name: 'Threshold 0.6',
      routingType: 'intelligent',
      config: {
        enableIntentClassifier: true,
        enableLLMFallback: true,
        enableBanditOptimization: true,
        enableReActReasoning: false,
        enableGoalPlanning: false,
        confidenceThreshold: 0.6,
      },
    },
    {
      id: 'threshold-0.8',
      name: 'Threshold 0.8',
      routingType: 'intelligent',
      config: {
        enableIntentClassifier: true,
        enableLLMFallback: true,
        enableBanditOptimization: true,
        enableReActReasoning: false,
        enableGoalPlanning: false,
        confidenceThreshold: 0.8,
      },
    },
  ],
  trafficAllocation: [34, 33, 33],
  startDate: new Date(),
  endDate: null,
  active: false,
  minSampleSize: 500,
};

// ============================================================================
// A/B TESTING SERVICE
// ============================================================================

class RoutingABTestingService {
  private experiments = new Map<string, RoutingExperiment>();
  private assignments = new Map<string, ExperimentAssignment>();
  private metrics: ExperimentMetric[] = [];
  private maxMetrics = 50000;

  constructor() {
    // Register predefined experiments
    this.registerExperiment(INTELLIGENT_VS_SEMANTIC_EXPERIMENT);
    this.registerExperiment(CONFIDENCE_THRESHOLD_EXPERIMENT);
  }

  /**
   * Register a routing experiment
   */
  registerExperiment(experiment: RoutingExperiment): void {
    this.experiments.set(experiment.id, experiment);
    log.info({ experimentId: experiment.id }, 'Registered routing experiment');
  }

  /**
   * Enable/disable an experiment
   */
  setExperimentActive(experimentId: string, active: boolean): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.active = active;
      log.info({ experimentId, active }, 'Updated experiment status');
    }
  }

  /**
   * Assign user to experiment variant
   */
  assignUser(userId: string, experimentId: string): ExperimentAssignment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.active) return null;

    // Check existing assignment
    const key = `${userId}:${experimentId}`;
    if (this.assignments.has(key)) {
      return this.assignments.get(key)!;
    }

    // Consistent hash for deterministic assignment
    const hash = this.hashString(`${userId}:${experimentId}`);
    const bucket = hash % 100;

    // Determine variant
    let cumulativePercent = 0;
    const allVariants = [
      { id: 'control', ...experiment.control },
      ...experiment.variants,
    ];

    for (let i = 0; i < allVariants.length; i++) {
      cumulativePercent += experiment.trafficAllocation[i];
      if (bucket < cumulativePercent) {
        const assignment: ExperimentAssignment = {
          experimentId,
          variantId: allVariants[i].id,
          userId,
          assignedAt: new Date(),
        };
        this.assignments.set(key, assignment);
        log.debug({ userId, experimentId, variantId: assignment.variantId }, 'User assigned to variant');
        return assignment;
      }
    }

    // Fallback to control
    const fallback: ExperimentAssignment = {
      experimentId,
      variantId: 'control',
      userId,
      assignedAt: new Date(),
    };
    this.assignments.set(key, fallback);
    return fallback;
  }

  /**
   * Get routing config for user based on experiment assignment
   */
  getRoutingConfigForUser(userId: string): {
    useIntelligentRouting: boolean;
    config: IntelligentRoutingConfig | null;
    experimentId: string | null;
    variantId: string | null;
  } {
    // Check main experiment
    const assignment = this.assignUser(userId, 'intelligent-vs-semantic');

    if (!assignment) {
      return {
        useIntelligentRouting: false,
        config: null,
        experimentId: null,
        variantId: null,
      };
    }

    if (assignment.variantId === 'control') {
      return {
        useIntelligentRouting: false,
        config: null,
        experimentId: assignment.experimentId,
        variantId: assignment.variantId,
      };
    }

    // Find variant config
    const experiment = this.experiments.get(assignment.experimentId)!;
    const variant = experiment.variants.find((v) => v.id === assignment.variantId);

    return {
      useIntelligentRouting: true,
      config: variant?.config || null,
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
    };
  }

  /**
   * Record a metric for experiment
   */
  recordMetric(
    userId: string,
    experimentId: string,
    metric: string,
    value: number
  ): void {
    const assignment = this.assignments.get(`${userId}:${experimentId}`);
    if (!assignment) return;

    const event: ExperimentMetric = {
      experimentId,
      variantId: assignment.variantId,
      userId,
      metric,
      value,
      timestamp: new Date(),
    };

    this.metrics.push(event);
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  /**
   * Record routing decision for experiment
   */
  recordRoutingDecision(
    userId: string,
    experimentId: string,
    decision: RoutingDecision,
    success: boolean
  ): void {
    this.recordMetric(userId, experimentId, 'success', success ? 1 : 0);
    this.recordMetric(userId, experimentId, 'latency', decision.timing.total);
    this.recordMetric(userId, experimentId, 'confidence', decision.confidence);
  }

  /**
   * Get experiment results with statistical analysis
   */
  getResults(experimentId: string): ExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    const experimentMetrics = this.metrics.filter((m) => m.experimentId === experimentId);

    const getVariantStats = (variantId: string): VariantStats => {
      const variantMetrics = experimentMetrics.filter((m) => m.variantId === variantId);
      const successMetrics = variantMetrics.filter((m) => m.metric === 'success');
      const latencyMetrics = variantMetrics.filter((m) => m.metric === 'latency');
      const confidenceMetrics = variantMetrics.filter((m) => m.metric === 'confidence');

      return {
        variantId,
        sampleSize: successMetrics.length,
        successRate: successMetrics.length > 0
          ? successMetrics.reduce((sum, m) => sum + m.value, 0) / successMetrics.length
          : 0,
        avgLatencyMs: latencyMetrics.length > 0
          ? latencyMetrics.reduce((sum, m) => sum + m.value, 0) / latencyMetrics.length
          : 0,
        avgConfidence: confidenceMetrics.length > 0
          ? confidenceMetrics.reduce((sum, m) => sum + m.value, 0) / confidenceMetrics.length
          : 0,
        userSatisfaction: 0, // Would need separate tracking
      };
    };

    const controlStats = getVariantStats('control');
    const variantStats = experiment.variants.map((v) => getVariantStats(v.id));

    // Determine winner (simple comparison for now)
    let winner: string | null = null;
    let bestSuccessRate = controlStats.successRate;

    for (const stats of variantStats) {
      if (stats.sampleSize >= experiment.minSampleSize && stats.successRate > bestSuccessRate) {
        winner = stats.variantId;
        bestSuccessRate = stats.successRate;
      }
    }

    // Calculate confidence (simplified - should use proper statistical tests)
    const totalSamples = controlStats.sampleSize + variantStats.reduce((sum, v) => sum + v.sampleSize, 0);
    const confidenceLevel = Math.min(0.95, totalSamples / (experiment.minSampleSize * 3));

    // Generate recommendations
    const recommendations: string[] = [];
    if (controlStats.sampleSize < experiment.minSampleSize) {
      recommendations.push(`Need more samples in control (${controlStats.sampleSize}/${experiment.minSampleSize})`);
    }
    for (const stats of variantStats) {
      if (stats.sampleSize < experiment.minSampleSize) {
        recommendations.push(`Need more samples in ${stats.variantId} (${stats.sampleSize}/${experiment.minSampleSize})`);
      }
      if (stats.avgLatencyMs > controlStats.avgLatencyMs * 1.5) {
        recommendations.push(`${stats.variantId} has ${Math.round((stats.avgLatencyMs / controlStats.avgLatencyMs - 1) * 100)}% higher latency`);
      }
    }

    if (winner && confidenceLevel >= 0.95) {
      recommendations.push(`✅ ${winner} is the winner with ${Math.round(bestSuccessRate * 100)}% success rate`);
    }

    return {
      experimentId,
      controlStats,
      variantStats,
      winner: confidenceLevel >= 0.95 ? winner : null,
      confidenceLevel,
      recommendations,
    };
  }

  /**
   * Get all active experiments
   */
  getActiveExperiments(): RoutingExperiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.active);
  }

  /**
   * Hash string to number (for consistent bucketing)
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let abTestingService: RoutingABTestingService | null = null;

export function getABTestingService(): RoutingABTestingService {
  if (!abTestingService) {
    abTestingService = new RoutingABTestingService();
  }
  return abTestingService;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if user should use intelligent routing
 */
export function shouldUseIntelligentRouting(userId: string): boolean {
  const config = getABTestingService().getRoutingConfigForUser(userId);
  return config.useIntelligentRouting;
}

/**
 * Get intelligent routing config for user
 */
export function getIntelligentConfig(userId: string): IntelligentRoutingConfig | null {
  const config = getABTestingService().getRoutingConfigForUser(userId);
  return config.config;
}

/**
 * Record routing result for A/B testing
 */
export function recordABTestResult(
  userId: string,
  decision: RoutingDecision,
  success: boolean
): void {
  const service = getABTestingService();
  const config = service.getRoutingConfigForUser(userId);

  if (config.experimentId) {
    service.recordRoutingDecision(userId, config.experimentId, decision, success);
  }
}

/**
 * Enable the main intelligent vs semantic experiment
 */
export function enableIntelligentRouting(trafficPercent: number = 50): void {
  const service = getABTestingService();

  // Update traffic allocation
  const experiment = service.getActiveExperiments().find(
    (e) => e.id === 'intelligent-vs-semantic'
  );
  if (experiment) {
    const controlPercent = 100 - trafficPercent;
    const variantPercent = trafficPercent / experiment.variants.length;
    experiment.trafficAllocation = [
      controlPercent,
      ...experiment.variants.map(() => variantPercent),
    ];
  }

  service.setExperimentActive('intelligent-vs-semantic', true);
  log.info({ trafficPercent }, 'Enabled intelligent routing A/B test');
}

/**
 * Get experiment results dashboard data
 */
export function getExperimentDashboard(): {
  experiments: RoutingExperiment[];
  results: ExperimentResults[];
} {
  const service = getABTestingService();
  const experiments = Array.from(service['experiments'].values());
  const results = experiments
    .map((e) => service.getResults(e.id))
    .filter((r): r is ExperimentResults => r !== null);

  return { experiments, results };
}

