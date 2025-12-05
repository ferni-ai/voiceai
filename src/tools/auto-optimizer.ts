/**
 * Auto Tool Optimizer
 *
 * The brain of the automated tool optimization system.
 * Continuously learns from user interactions and automatically:
 *
 * 1. Collects feedback (explicit and implicit)
 * 2. Analyzes interaction patterns
 * 3. Generates recommendations
 * 4. Runs experiments to validate recommendations
 * 5. Auto-implements proven improvements
 *
 * This creates a continuous improvement loop for tool quality.
 */

import { getLogger } from '../utils/safe-logger.js';
import { feedbackCollector, type ConversationContext } from './feedback-collector.js';
import { patternAnalyzer } from './pattern-analyzer.js';
import { recommendationEngine, type Recommendation } from './recommendation-engine.js';
import { abTestingService } from './ab-testing.js';
import { deprecationService } from './deprecation.js';
import { toolRegistry } from './registry/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OptimizerConfig {
  /** Enable automatic recommendation generation */
  enableAutoRecommendations: boolean;
  /** Enable automatic experiment creation */
  enableAutoExperiments: boolean;
  /** Enable automatic implementation of low-risk changes */
  enableAutoImplementation: boolean;
  /** Minimum data points before generating recommendations */
  minDataPoints: number;
  /** How often to run analysis (ms) */
  analysisIntervalMs: number;
  /** Maximum concurrent experiments */
  maxConcurrentExperiments: number;
}

export interface OptimizationReport {
  timestamp: Date;
  summary: {
    feedbackCollected: number;
    patternsIdentified: number;
    recommendationsGenerated: number;
    experimentsRunning: number;
    autoImplemented: number;
  };
  topRecommendations: Recommendation[];
  activeExperiments: string[];
  recentChanges: string[];
}

export interface OptimizationCycle {
  startTime: Date;
  endTime?: Date;
  feedbackProcessed: number;
  patternsFound: number;
  recommendationsCreated: number;
  experimentsStarted: number;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}

// ============================================================================
// AUTO OPTIMIZER
// ============================================================================

export class AutoToolOptimizer {
  private config: OptimizerConfig;
  private isRunning = false;
  private analysisTimer: NodeJS.Timeout | null = null;
  private cycles: OptimizationCycle[] = [];
  private recentChanges: string[] = [];

  constructor(config: Partial<OptimizerConfig> = {}) {
    this.config = {
      enableAutoRecommendations: true,
      enableAutoExperiments: true,
      enableAutoImplementation: false, // Disabled by default for safety
      minDataPoints: 50,
      analysisIntervalMs: 15 * 60 * 1000, // 15 minutes
      maxConcurrentExperiments: 3,
      ...config,
    };
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Start the auto-optimizer
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    getLogger().info({ config: this.config }, '🤖 Auto Tool Optimizer started');

    // Run initial analysis
    this.runOptimizationCycle();

    // Schedule periodic analysis
    this.analysisTimer = setInterval(
      () => this.runOptimizationCycle(),
      this.config.analysisIntervalMs
    );
  }

  /**
   * Stop the auto-optimizer
   */
  stop(): void {
    if (!this.isRunning) return;

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.isRunning = false;
    getLogger().info('🤖 Auto Tool Optimizer stopped');
  }

  // ==========================================================================
  // REAL-TIME HOOKS
  // ==========================================================================

  /**
   * Process a user message for feedback and patterns
   * Call this on every user turn
   */
  processUserMessage(
    message: string,
    context: ConversationContext,
    lastToolId?: string
  ): void {
    // Collect feedback
    feedbackCollector.processFeedback(message, context, lastToolId);
  }

  /**
   * Record a tool execution
   * Call this after every tool call
   */
  recordToolExecution(
    sessionId: string,
    toolId: string,
    success: boolean,
    latencyMs: number
  ): void {
    // Track in pattern analyzer
    patternAnalyzer.recordToolCall(sessionId, toolId, success, latencyMs);

    // Track in deprecation service
    deprecationService.recordUsage(toolId, success, latencyMs);

    // Record metrics for active experiments
    const activeExperiments = abTestingService.getActiveExperiments();
    for (const exp of activeExperiments) {
      abTestingService.recordToolUsage(sessionId, toolId, success, latencyMs);
    }
  }

  /**
   * Start a session
   */
  startSession(sessionId: string, userId: string, agentId: string): void {
    patternAnalyzer.startSession(sessionId, userId, agentId);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    patternAnalyzer.endSession(sessionId);
  }

  // ==========================================================================
  // OPTIMIZATION CYCLE
  // ==========================================================================

  /**
   * Run a full optimization cycle
   */
  async runOptimizationCycle(): Promise<OptimizationCycle> {
    const cycle: OptimizationCycle = {
      startTime: new Date(),
      feedbackProcessed: 0,
      patternsFound: 0,
      recommendationsCreated: 0,
      experimentsStarted: 0,
      status: 'running',
    };

    try {
      getLogger().info('🔄 Starting optimization cycle');

      // 1. Flush feedback buffer
      await feedbackCollector.flush();
      cycle.feedbackProcessed = feedbackCollector.getAllFeedback().length;

      // 2. Check if we have enough data
      if (cycle.feedbackProcessed < this.config.minDataPoints) {
        getLogger().info(
          { current: cycle.feedbackProcessed, required: this.config.minDataPoints },
          '⏳ Not enough data for optimization'
        );
        cycle.status = 'completed';
        cycle.endTime = new Date();
        return cycle;
      }

      // 3. Analyze patterns
      const sequences = patternAnalyzer.discoverSequences();
      const coOccurrences = patternAnalyzer.getCoOccurrences();
      cycle.patternsFound = sequences.length + coOccurrences.length;

      // 4. Generate recommendations
      if (this.config.enableAutoRecommendations) {
        const recommendations = await recommendationEngine.generateRecommendations();
        cycle.recommendationsCreated = recommendations.length;
      }

      // 5. Auto-create experiments
      if (this.config.enableAutoExperiments) {
        cycle.experimentsStarted = await this.autoCreateExperiments();
      }

      // 6. Auto-implement low-risk changes
      if (this.config.enableAutoImplementation) {
        const implemented = await recommendationEngine.autoImplement(false);
        this.recentChanges.push(...implemented.map(id => `Implemented: ${id}`));
      }

      // 7. Check experiment results and graduate winners
      await this.processExperimentResults();

      cycle.status = 'completed';
      cycle.endTime = new Date();

      getLogger().info({
        feedbackProcessed: cycle.feedbackProcessed,
        patternsFound: cycle.patternsFound,
        recommendationsCreated: cycle.recommendationsCreated,
        experimentsStarted: cycle.experimentsStarted,
      }, '✅ Optimization cycle completed');

    } catch (error) {
      cycle.status = 'failed';
      cycle.error = error instanceof Error ? error.message : String(error);
      getLogger().error({ error }, '❌ Optimization cycle failed');
    }

    this.cycles.push(cycle);
    if (this.cycles.length > 100) {
      this.cycles = this.cycles.slice(-100);
    }

    return cycle;
  }

  // ==========================================================================
  // AUTO-EXPERIMENTATION
  // ==========================================================================

  /**
   * Automatically create experiments from recommendations
   */
  private async autoCreateExperiments(): Promise<number> {
    // Check current experiment count
    const activeExperiments = abTestingService.getActiveExperiments();
    if (activeExperiments.length >= this.config.maxConcurrentExperiments) {
      getLogger().debug(
        { current: activeExperiments.length, max: this.config.maxConcurrentExperiments },
        'Max concurrent experiments reached'
      );
      return 0;
    }

    // Get experiment recommendations
    const experimentRecs = recommendationEngine
      .getRecommendationsByType('run_experiment')
      .filter(r => r.status === 'pending')
      .slice(0, this.config.maxConcurrentExperiments - activeExperiments.length);

    let started = 0;

    for (const rec of experimentRecs) {
      try {
        // Create experiment from recommendation
        const experiment = this.createExperimentFromRec(rec);
        abTestingService.registerExperiment(experiment);
        abTestingService.activateExperiment(experiment.id);

        recommendationEngine.markImplemented(rec.id);
        this.recentChanges.push(`Started experiment: ${experiment.name}`);
        started++;

        getLogger().info({ experimentId: experiment.id }, '🧪 Auto-created experiment');
      } catch (error) {
        getLogger().warn({ error, recId: rec.id }, 'Failed to auto-create experiment');
      }
    }

    return started;
  }

  private createExperimentFromRec(rec: Recommendation): {
    id: string;
    name: string;
    description: string;
    startDate: Date;
    endDate: null;
    active: boolean;
    control: { id: string; name: string };
    variants: Array<{ id: string; name: string; config?: Record<string, unknown> }>;
    trafficAllocation: number[];
    metrics: Array<{ id: string; name: string; aggregation: 'average'; higherIsBetter: boolean }>;
  } {
    return {
      id: `auto_${rec.id}`,
      name: rec.title,
      description: rec.description,
      startDate: new Date(),
      endDate: null,
      active: false,
      control: { id: 'control', name: 'Current Behavior' },
      variants: [{ id: 'treatment', name: 'Optimized Behavior' }],
      trafficAllocation: [50, 50],
      metrics: [
        { id: 'success_rate', name: 'Success Rate', aggregation: 'average', higherIsBetter: true },
        { id: 'user_satisfaction', name: 'User Satisfaction', aggregation: 'average', higherIsBetter: true },
      ],
    };
  }

  /**
   * Process experiment results and graduate winners
   */
  private async processExperimentResults(): Promise<void> {
    const activeExperiments = abTestingService.getActiveExperiments();

    for (const exp of activeExperiments) {
      const results = abTestingService.getResults(exp.id);
      if (!results) continue;

      // Check if we have enough data
      if (results.totalParticipants < 100) continue;

      // Analyze results
      const recommendation = this.analyzeExperimentResults(exp, results);
      if (recommendation) {
        this.recentChanges.push(recommendation);
      }
    }
  }

  private analyzeExperimentResults(
    exp: { id: string; name: string },
    results: { totalParticipants: number; recommendations: string[] }
  ): string | null {
    // Simple analysis - in production would do proper statistical analysis
    if (results.recommendations.length > 0 && results.recommendations[0].includes('outperforms')) {
      return `Experiment "${exp.name}": Treatment is winning - consider graduating`;
    }
    return null;
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Get optimization status report
   */
  getReport(): OptimizationReport {
    const allFeedback = feedbackCollector.getAllFeedback();
    const sequences = patternAnalyzer.discoverSequences();
    const recommendations = recommendationEngine.getPendingRecommendations();
    const activeExperiments = abTestingService.getActiveExperiments();

    return {
      timestamp: new Date(),
      summary: {
        feedbackCollected: allFeedback.reduce((sum, f) => sum + f.totalFeedback, 0),
        patternsIdentified: sequences.length,
        recommendationsGenerated: recommendations.length,
        experimentsRunning: activeExperiments.length,
        autoImplemented: this.recentChanges.length,
      },
      topRecommendations: recommendations.slice(0, 5),
      activeExperiments: activeExperiments.map(e => e.id),
      recentChanges: this.recentChanges.slice(-10),
    };
  }

  /**
   * Generate full optimization report
   */
  generateFullReport(): string {
    let report = '═══════════════════════════════════════════════════════════════\n';
    report += '              🤖 AUTO TOOL OPTIMIZER REPORT 🤖                   \n';
    report += '═══════════════════════════════════════════════════════════════\n\n';

    const status = this.getReport();

    // Summary
    report += '📊 CURRENT STATUS\n';
    report += '─────────────────────────────────────────────────────────────────\n';
    report += `  Running:              ${this.isRunning ? '✅ Yes' : '❌ No'}\n`;
    report += `  Feedback Collected:   ${status.summary.feedbackCollected}\n`;
    report += `  Patterns Identified:  ${status.summary.patternsIdentified}\n`;
    report += `  Recommendations:      ${status.summary.recommendationsGenerated}\n`;
    report += `  Active Experiments:   ${status.summary.experimentsRunning}\n`;
    report += `  Auto-Implemented:     ${status.summary.autoImplemented}\n\n`;

    // Config
    report += '⚙️ CONFIGURATION\n';
    report += '─────────────────────────────────────────────────────────────────\n';
    report += `  Auto Recommendations: ${this.config.enableAutoRecommendations ? '✅' : '❌'}\n`;
    report += `  Auto Experiments:     ${this.config.enableAutoExperiments ? '✅' : '❌'}\n`;
    report += `  Auto Implementation:  ${this.config.enableAutoImplementation ? '✅' : '❌'}\n`;
    report += `  Min Data Points:      ${this.config.minDataPoints}\n`;
    report += `  Analysis Interval:    ${this.config.analysisIntervalMs / 1000}s\n`;
    report += `  Max Experiments:      ${this.config.maxConcurrentExperiments}\n\n`;

    // Recent cycles
    const recentCycles = this.cycles.slice(-5);
    if (recentCycles.length > 0) {
      report += '🔄 RECENT OPTIMIZATION CYCLES\n';
      report += '─────────────────────────────────────────────────────────────────\n';
      for (const cycle of recentCycles) {
        const duration = cycle.endTime
          ? ((cycle.endTime.getTime() - cycle.startTime.getTime()) / 1000).toFixed(1) + 's'
          : 'running';
        const statusIcon = cycle.status === 'completed' ? '✅' : cycle.status === 'failed' ? '❌' : '🔄';
        report += `  ${statusIcon} ${cycle.startTime.toISOString().slice(11, 19)} - ${duration}\n`;
        report += `     Feedback: ${cycle.feedbackProcessed}, Patterns: ${cycle.patternsFound}, Recs: ${cycle.recommendationsCreated}\n`;
      }
      report += '\n';
    }

    // Recent changes
    if (this.recentChanges.length > 0) {
      report += '🚀 RECENT CHANGES\n';
      report += '─────────────────────────────────────────────────────────────────\n';
      for (const change of this.recentChanges.slice(-5)) {
        report += `  • ${change}\n`;
      }
      report += '\n';
    }

    // Recommendations summary
    report += recommendationEngine.generateReport();

    // Pattern analysis
    report += patternAnalyzer.generateReport();

    return report;
  }

  /**
   * Get optimizer status
   */
  getStatus(): { isRunning: boolean; config: OptimizerConfig; cycleCount: number } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      cycleCount: this.cycles.length,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

export const autoOptimizer = new AutoToolOptimizer();

export default autoOptimizer;

