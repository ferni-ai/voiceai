/**
 * Active Learning System
 *
 * Continuously improves routing through:
 * 1. Correction collection & integration
 * 2. Strategic query selection for labeling
 * 3. Automatic retraining triggers
 * 4. A/B testing of routing strategies
 *
 * The system identifies high-value corrections (ambiguous queries)
 * and uses them to improve the learned retriever and calibration.
 *
 * @module tools/semantic-router/advanced/active-learning
 */

import { createLogger } from '../../../utils/safe-logger.js';
// Note: Uses simplified ToolMatch from local modules
import { TrainingExample, logRoutingDecision } from './datasets.js';
import { getCalibrator, CalibratedResult } from './uncertainty.js';
import { getPersonalizationEngine } from './personalization.js';
import { getLearnedRetriever } from './learned-retriever.js';

const log = createLogger({ module: 'semantic-router:active-learning' });

// ============================================================================
// TYPES
// ============================================================================

interface CorrectionEvent {
  id: string;
  timestamp: Date;
  userId: string;

  // Query details
  query: string;
  conversationContext: string[];

  // Prediction details
  predictedTool: string;
  predictedConfidence: number;
  calibratedProbability: number;

  // Correction details
  actualTool: string;
  correctionSource: 'explicit' | 'implicit' | 'inferred';

  // Learning value
  informationGain: number;
}

interface LearningMetrics {
  totalCorrections: number;
  correctionRate: number;
  accuracyImprovement: number;
  averageConfidenceGap: number;
  mostConfusedPairs: Array<{ from: string; to: string; count: number }>;
}

interface ABTestConfig {
  testId: string;
  variants: Array<{
    name: string;
    weight: number;
    config: Record<string, unknown>;
  }>;
  metrics: string[];
  startDate: Date;
  endDate?: Date;
}

// ============================================================================
// ACTIVE LEARNING ENGINE
// ============================================================================

export class ActiveLearningEngine {
  // Correction history
  private corrections: CorrectionEvent[] = [];

  // Confusion matrix (from → to → count)
  private confusionMatrix = new Map<string, Map<string, number>>();

  // Running accuracy by time window
  private accuracyWindows: Array<{ timestamp: Date; accuracy: number }> = [];

  // Active A/B tests
  private activeTests: ABTestConfig[] = [];
  private testResults = new Map<string, Map<string, number[]>>();

  // Retraining state
  private lastRetrainTime: Date | null = null;
  private pendingExamples: TrainingExample[] = [];

  constructor() {
    // Schedule periodic tasks
    this.schedulePeriodicTasks();
  }

  /**
   * Record a correction event
   */
  async recordCorrection(event: Omit<CorrectionEvent, 'id' | 'informationGain'>): Promise<void> {
    // Calculate information gain (how valuable is this correction?)
    const informationGain = this.calculateInformationGain(event);

    const correction: CorrectionEvent = {
      ...event,
      id: `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      informationGain,
    };

    this.corrections.push(correction);

    // Update confusion matrix
    this.updateConfusionMatrix(event.predictedTool, event.actualTool);

    // Update personalization
    getPersonalizationEngine().learn({
      userId: event.userId,
      query: event.query,
      predictedTool: event.predictedTool,
      actualTool: event.actualTool,
      timestamp: event.timestamp,
    });

    // Update calibration
    getCalibrator().addValidationExample({
      query: event.query,
      predictedTool: event.predictedTool,
      actualTool: event.actualTool,
      rawScore: event.predictedConfidence,
    });

    // Queue for retraining if high value
    if (informationGain > 0.5) {
      this.pendingExamples.push({
        query: event.query,
        toolId: event.actualTool,
        context: event.conversationContext,
        source: 'ferni_corrections',
        confidence: 0.95,
      });
    }

    // Log for dataset building
    logRoutingDecision({
      query: event.query,
      predictedTool: event.predictedTool,
      executedTool: event.actualTool,
      confidence: event.predictedConfidence,
      wasCorrect: false,
      userId: event.userId,
    });

    // Check if retraining needed
    await this.checkRetrainTrigger();

    log.info(
      {
        correctionId: correction.id,
        informationGain,
        fromTo: `${event.predictedTool} → ${event.actualTool}`,
      },
      'Recorded correction'
    );
  }

  /**
   * Record a successful routing (implicit confirmation)
   */
  recordSuccess(userId: string, query: string, toolId: string, confidence: number): void {
    // Log successful routing
    logRoutingDecision({
      query,
      predictedTool: toolId,
      executedTool: toolId,
      confidence,
      wasCorrect: true,
      userId,
    });

    // Update personalization with implicit confirmation
    getPersonalizationEngine().learn({
      userId,
      query,
      predictedTool: toolId,
      actualTool: toolId,
      timestamp: new Date(),
    });

    // Update calibration
    getCalibrator().addValidationExample({
      query,
      predictedTool: toolId,
      actualTool: toolId,
      rawScore: confidence,
    });

    // Track accuracy
    this.updateAccuracyWindow(true);
  }

  /**
   * Get queries that would be most valuable to label
   */
  selectQueriesForLabeling(k: number = 10): string[] {
    // Find queries with highest uncertainty
    const uncertainQueries = this.corrections
      .filter((c) => c.informationGain > 0.3)
      .sort((a, b) => b.informationGain - a.informationGain)
      .slice(0, k * 2)
      .map((c) => c.query);

    // Deduplicate and return
    const seen: Record<string, boolean> = {};
    const deduplicated: string[] = [];
    for (const q of uncertainQueries) {
      if (!seen[q]) {
        seen[q] = true;
        deduplicated.push(q);
      }
    }
    return deduplicated.slice(0, k);
  }

  /**
   * Get current learning metrics
   */
  getMetrics(): LearningMetrics {
    const totalCorrections = this.corrections.length;

    // Calculate correction rate from recent window
    const recentWindow = this.accuracyWindows.slice(-100);
    const correctionRate =
      recentWindow.length > 0
        ? 1 - recentWindow.filter((w) => w.accuracy === 1).length / recentWindow.length
        : 0;

    // Calculate accuracy improvement
    const oldAccuracy = this.getWindowedAccuracy(0, 50);
    const newAccuracy = this.getWindowedAccuracy(-50, -1);
    const accuracyImprovement = newAccuracy - oldAccuracy;

    // Average confidence gap (when wrong)
    const avgConfidenceGap =
      this.corrections.length > 0
        ? this.corrections.reduce((sum, c) => sum + c.calibratedProbability, 0) /
          this.corrections.length
        : 0;

    // Most confused pairs
    const confusedPairs: Array<{ from: string; to: string; count: number }> = [];
    const outerEntries = Array.from(this.confusionMatrix.entries());
    for (const [from, toMap] of outerEntries) {
      const innerEntries = Array.from(toMap.entries());
      for (const [to, count] of innerEntries) {
        if (from !== to && count > 1) {
          confusedPairs.push({ from, to, count });
        }
      }
    }
    confusedPairs.sort((a, b) => b.count - a.count);

    return {
      totalCorrections,
      correctionRate,
      accuracyImprovement,
      averageConfidenceGap: avgConfidenceGap,
      mostConfusedPairs: confusedPairs.slice(0, 10),
    };
  }

  /**
   * Start an A/B test
   */
  startABTest(config: ABTestConfig): void {
    this.activeTests.push(config);
    this.testResults.set(config.testId, new Map());

    log.info({ testId: config.testId, variants: config.variants.length }, 'Started A/B test');
  }

  /**
   * Get variant for a user in an A/B test
   */
  getTestVariant(testId: string, userId: string): string | null {
    const test = this.activeTests.find((t) => t.testId === testId);
    if (!test) {
      return null;
    }

    // Deterministic assignment based on userId
    const hash = this.hashString(userId + testId);
    const normalized = (hash % 1000) / 1000;

    let cumulative = 0;
    for (const variant of test.variants) {
      cumulative += variant.weight;
      if (normalized < cumulative) {
        return variant.name;
      }
    }

    return test.variants[test.variants.length - 1].name;
  }

  /**
   * Record A/B test metric
   */
  recordTestMetric(testId: string, variant: string, metric: string, value: number): void {
    const testMetrics = this.testResults.get(testId);
    if (!testMetrics) {
      return;
    }

    const key = `${variant}:${metric}`;
    const values = testMetrics.get(key) || [];
    values.push(value);
    testMetrics.set(key, values);
  }

  /**
   * Get A/B test results
   */
  getTestResults(testId: string): Record<string, { mean: number; stdDev: number; count: number }> {
    const testMetrics = this.testResults.get(testId);
    if (!testMetrics) {
      return {};
    }

    const results: Record<string, { mean: number; stdDev: number; count: number }> = {};

    const entries = Array.from(testMetrics.entries());
    for (const [key, values] of entries) {
      if (values.length === 0) {
        continue;
      }

      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

      results[key] = {
        mean,
        stdDev: Math.sqrt(variance),
        count: values.length,
      };
    }

    return results;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private calculateInformationGain(event: Omit<CorrectionEvent, 'id' | 'informationGain'>): number {
    // Higher information gain for:
    // 1. High confidence mistakes (calibration error)
    // 2. Rare corrections (new pattern)
    // 3. Ambiguous queries (multiple plausible interpretations)

    let gain = 0;

    // Confidence gap: high confidence but wrong → very informative
    gain += event.calibratedProbability * 0.4;

    // Rarity: new confusion pattern → informative
    const existingConfusion = this.getConfusionCount(event.predictedTool, event.actualTool);
    if (existingConfusion === 0) {
      gain += 0.3; // New pattern
    } else if (existingConfusion < 3) {
      gain += 0.15; // Rare pattern
    }

    // Query length: longer queries often more informative
    const words = event.query.split(/\s+/).length;
    if (words >= 5) {
      gain += 0.1;
    }

    // Context: with conversation history → more informative
    if (event.conversationContext.length > 0) {
      gain += 0.2;
    }

    return Math.min(1, gain);
  }

  private updateConfusionMatrix(from: string, to: string): void {
    let toMap = this.confusionMatrix.get(from);
    if (!toMap) {
      toMap = new Map();
      this.confusionMatrix.set(from, toMap);
    }

    toMap.set(to, (toMap.get(to) || 0) + 1);
  }

  private getConfusionCount(from: string, to: string): number {
    return this.confusionMatrix.get(from)?.get(to) || 0;
  }

  private updateAccuracyWindow(wasCorrect: boolean): void {
    this.accuracyWindows.push({
      timestamp: new Date(),
      accuracy: wasCorrect ? 1 : 0,
    });

    // Keep last 1000 entries
    if (this.accuracyWindows.length > 1000) {
      this.accuracyWindows.shift();
    }
  }

  private getWindowedAccuracy(startIdx: number, endIdx: number): number {
    const len = this.accuracyWindows.length;
    if (len === 0) {
      return 0.5;
    }

    const actualStart = startIdx >= 0 ? startIdx : len + startIdx;
    const actualEnd = endIdx >= 0 ? endIdx : len + endIdx;

    const slice = this.accuracyWindows.slice(
      Math.max(0, actualStart),
      Math.min(len, actualEnd + 1)
    );

    if (slice.length === 0) {
      return 0.5;
    }

    return slice.reduce((sum, w) => sum + w.accuracy, 0) / slice.length;
  }

  private async checkRetrainTrigger(): Promise<void> {
    // Trigger retraining if:
    // 1. Enough new corrections (>50)
    // 2. Or accuracy dropped significantly
    // 3. And enough time has passed since last retrain

    const minTimeBetweenRetrains = 60 * 60 * 1000; // 1 hour
    const timeSinceLastRetrain = this.lastRetrainTime
      ? Date.now() - this.lastRetrainTime.getTime()
      : Infinity;

    if (timeSinceLastRetrain < minTimeBetweenRetrains) {
      return;
    }

    const shouldRetrain =
      this.pendingExamples.length >= 50 ||
      (this.pendingExamples.length >= 20 && this.getMetrics().correctionRate > 0.15);

    if (shouldRetrain) {
      await this.triggerRetrain();
    }
  }

  private async triggerRetrain(): Promise<void> {
    if (this.pendingExamples.length === 0) {
      return;
    }

    log.info({ exampleCount: this.pendingExamples.length }, 'Triggering retrain');

    try {
      const retriever = getLearnedRetriever();

      // Add corrections to retriever
      for (const example of this.pendingExamples) {
        await retriever.addCorrection(
          example.query,
          '__predicted__', // We don't track original prediction here
          example.toolId
        );
      }

      this.pendingExamples = [];
      this.lastRetrainTime = new Date();

      log.info('Retrain completed');
    } catch (error) {
      log.error({ error }, 'Retrain failed');
    }
  }

  private schedulePeriodicTasks(): void {
    // Daily decay of personalization weights
    setInterval(
      () => {
        getPersonalizationEngine().applyDecay();
      },
      24 * 60 * 60 * 1000
    );

    // Hourly cleanup of old corrections
    setInterval(
      () => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
        this.corrections = this.corrections.filter((c) => c.timestamp.getTime() > cutoff);
      },
      60 * 60 * 1000
    );
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: ActiveLearningEngine | null = null;

export function getActiveLearningEngine(): ActiveLearningEngine {
  if (!engineInstance) {
    engineInstance = new ActiveLearningEngine();
  }
  return engineInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Record a correction (convenience wrapper)
 */
export async function recordCorrection(
  userId: string,
  query: string,
  predictedTool: string,
  actualTool: string,
  confidence: number,
  context: string[] = []
): Promise<void> {
  await getActiveLearningEngine().recordCorrection({
    timestamp: new Date(),
    userId,
    query,
    conversationContext: context,
    predictedTool,
    predictedConfidence: confidence,
    calibratedProbability: confidence, // Will be updated by calibrator
    actualTool,
    correctionSource: 'explicit',
  });
}

/**
 * Record a successful routing (convenience wrapper)
 */
export function recordSuccess(
  userId: string,
  query: string,
  toolId: string,
  confidence: number
): void {
  getActiveLearningEngine().recordSuccess(userId, query, toolId, confidence);
}
