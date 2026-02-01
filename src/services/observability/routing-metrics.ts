/**
 * FTIS V3 Metrics and Observability
 *
 * Comprehensive metrics collection for the FTIS V3 system including:
 * - Classification accuracy
 * - Open intent detection recall
 * - Expected Calibration Error (ECE)
 * - False positive rate
 * - Latency percentiles
 * - Fallback rate
 * - Routing tier distribution
 *
 * Exports Prometheus-compatible metrics and JSON summaries.
 *
 * @module services/observability/routing-metrics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'routing-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationOutcome {
  /** Query that was classified */
  query: string;
  /** Predicted fine category */
  predictedCategory: string;
  /** Predicted super category */
  predictedSuperCategory: string;
  /** Original confidence before calibration */
  originalConfidence: number;
  /** Calibrated/boundary-adjusted confidence */
  effectiveConfidence: number;
  /** Whether query was within class boundary */
  withinBoundary: boolean;
  /** Routing tier selected */
  routingTier: 'fast' | 'verify' | 'llm';
  /** Actual tool that was executed (for accuracy) */
  executedTool?: string;
  /** Whether the classification was correct (ground truth) */
  wasCorrect?: boolean;
  /** Whether this was an open intent that should have gone to LLM */
  shouldBeOpenIntent?: boolean;
  /** Classification latency in ms */
  latencyMs: number;
  /** Timestamp */
  timestamp: Date;
}

export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  avgConfidence: number;
  avgAccuracy: number;
  count: number;
}

export interface FTISMetricsSummary {
  // Accuracy metrics
  totalClassifications: number;
  correctClassifications: number;
  classificationAccuracy: number;

  // Open intent detection
  totalOpenIntents: number;
  detectedOpenIntents: number;
  openIntentRecall: number;
  openIntentPrecision: number;

  // Calibration
  expectedCalibrationError: number;
  calibrationBins: CalibrationBin[];

  // False positives
  totalToolCalls: number;
  incorrectToolCalls: number;
  falsePositiveRate: number;

  // Latency
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  averageLatencyMs: number;

  // Routing
  fastPathRate: number;
  verifyPathRate: number;
  llmPathRate: number;

  // Category breakdown
  categoryAccuracy: Map<string, { correct: number; total: number; accuracy: number }>;

  // Timing
  windowStartTime: Date;
  windowEndTime: Date;
}

// ============================================================================
// FTIS METRICS COLLECTOR
// ============================================================================

export class FTISMetricsCollector {
  private outcomes: ClassificationOutcome[] = [];
  private windowSizeMs: number;
  private maxOutcomes: number;

  constructor(windowSizeMs: number = 3600000, maxOutcomes: number = 10000) {
    // Default: 1 hour window, 10k max outcomes
    this.windowSizeMs = windowSizeMs;
    this.maxOutcomes = maxOutcomes;
  }

  /**
   * Record a classification outcome
   */
  recordOutcome(outcome: ClassificationOutcome): void {
    this.outcomes.push(outcome);

    // Prune old outcomes
    this.pruneOldOutcomes();

    // Log significant events
    if (outcome.wasCorrect === false) {
      log.warn(
        {
          query: outcome.query.slice(0, 40),
          predicted: outcome.predictedCategory,
          executed: outcome.executedTool,
          confidence: outcome.effectiveConfidence.toFixed(3),
        },
        '❌ Misclassification recorded'
      );
    }
  }

  /**
   * Record that a classification was correct
   */
  markCorrect(query: string, executedTool: string): void {
    const outcome = this.findRecentOutcome(query);
    if (outcome) {
      outcome.wasCorrect = true;
      outcome.executedTool = executedTool;
    }
  }

  /**
   * Record that a classification was incorrect
   */
  markIncorrect(query: string, executedTool: string): void {
    const outcome = this.findRecentOutcome(query);
    if (outcome) {
      outcome.wasCorrect = false;
      outcome.executedTool = executedTool;
    }
  }

  /**
   * Mark that a query should have been open intent (user interrupted)
   */
  markShouldBeOpenIntent(query: string): void {
    const outcome = this.findRecentOutcome(query);
    if (outcome) {
      outcome.shouldBeOpenIntent = true;
    }
  }

  /**
   * Find a recent outcome by query
   */
  private findRecentOutcome(query: string): ClassificationOutcome | undefined {
    // Look in last 100 outcomes
    for (let i = this.outcomes.length - 1; i >= Math.max(0, this.outcomes.length - 100); i--) {
      if (this.outcomes[i].query === query) {
        return this.outcomes[i];
      }
    }
    return undefined;
  }

  /**
   * Remove outcomes outside the time window
   */
  private pruneOldOutcomes(): void {
    const cutoff = Date.now() - this.windowSizeMs;
    this.outcomes = this.outcomes.filter((o) => o.timestamp.getTime() > cutoff);

    // Also enforce max count
    if (this.outcomes.length > this.maxOutcomes) {
      this.outcomes = this.outcomes.slice(-this.maxOutcomes);
    }
  }

  /**
   * Compute Expected Calibration Error
   */
  private computeECE(
    outcomes: ClassificationOutcome[],
    nBins: number = 10
  ): { ece: number; bins: CalibrationBin[] } {
    const outcomesWithLabels = outcomes.filter((o) => o.wasCorrect !== undefined);

    if (outcomesWithLabels.length === 0) {
      return { ece: 0, bins: [] };
    }

    const bins: CalibrationBin[] = [];
    const binSize = 1.0 / nBins;

    for (let i = 0; i < nBins; i++) {
      const binStart = i * binSize;
      const binEnd = (i + 1) * binSize;

      const inBin = outcomesWithLabels.filter(
        (o) => o.effectiveConfidence >= binStart && o.effectiveConfidence < binEnd
      );

      if (inBin.length > 0) {
        const avgConfidence =
          inBin.reduce((sum, o) => sum + o.effectiveConfidence, 0) / inBin.length;
        const avgAccuracy = inBin.filter((o) => o.wasCorrect).length / inBin.length;

        bins.push({
          binStart,
          binEnd,
          avgConfidence,
          avgAccuracy,
          count: inBin.length,
        });
      }
    }

    // ECE = sum(bin_weight * |accuracy - confidence|)
    let ece = 0;
    for (const bin of bins) {
      const weight = bin.count / outcomesWithLabels.length;
      ece += weight * Math.abs(bin.avgAccuracy - bin.avgConfidence);
    }

    return { ece, bins };
  }

  /**
   * Compute latency percentiles
   */
  private computeLatencyPercentiles(outcomes: ClassificationOutcome[]): {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
    if (outcomes.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const latencies = outcomes.map((o) => o.latencyMs).sort((a, b) => a - b);
    const avg = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

    const percentile = (p: number) => {
      const idx = Math.ceil((p / 100) * latencies.length) - 1;
      return latencies[Math.max(0, idx)];
    };

    return {
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
      avg,
    };
  }

  /**
   * Get comprehensive metrics summary
   */
  getSummary(): FTISMetricsSummary {
    this.pruneOldOutcomes();

    const outcomesWithLabels = this.outcomes.filter((o) => o.wasCorrect !== undefined);
    const correctCount = outcomesWithLabels.filter((o) => o.wasCorrect).length;

    // Open intent metrics
    const openIntentOutcomes = this.outcomes.filter((o) => o.shouldBeOpenIntent !== undefined);
    const actualOpenIntents = openIntentOutcomes.filter((o) => o.shouldBeOpenIntent);
    const detectedOpenIntents = actualOpenIntents.filter((o) => !o.withinBoundary);
    const predictedOpenIntents = this.outcomes.filter((o) => !o.withinBoundary);
    const truePositiveOpenIntent = predictedOpenIntents.filter((o) => o.shouldBeOpenIntent);

    // Routing tier counts
    const fastCount = this.outcomes.filter((o) => o.routingTier === 'fast').length;
    const verifyCount = this.outcomes.filter((o) => o.routingTier === 'verify').length;
    const llmCount = this.outcomes.filter((o) => o.routingTier === 'llm').length;

    // Category breakdown
    const categoryAccuracy = new Map<
      string,
      { correct: number; total: number; accuracy: number }
    >();
    for (const outcome of outcomesWithLabels) {
      const cat = outcome.predictedCategory;
      const existing = categoryAccuracy.get(cat) || { correct: 0, total: 0, accuracy: 0 };
      existing.total++;
      if (outcome.wasCorrect) {
        existing.correct++;
      }
      existing.accuracy = existing.correct / existing.total;
      categoryAccuracy.set(cat, existing);
    }

    // ECE and latency
    const { ece, bins } = this.computeECE(this.outcomes);
    const latencyStats = this.computeLatencyPercentiles(this.outcomes);

    // False positives (tool called when it shouldn't be)
    const toolCalls = outcomesWithLabels.filter((o) => o.routingTier !== 'llm');
    const incorrectToolCalls = toolCalls.filter((o) => !o.wasCorrect);

    return {
      totalClassifications: this.outcomes.length,
      correctClassifications: correctCount,
      classificationAccuracy:
        outcomesWithLabels.length > 0 ? correctCount / outcomesWithLabels.length : 0,

      totalOpenIntents: actualOpenIntents.length,
      detectedOpenIntents: detectedOpenIntents.length,
      openIntentRecall:
        actualOpenIntents.length > 0 ? detectedOpenIntents.length / actualOpenIntents.length : 0,
      openIntentPrecision:
        predictedOpenIntents.length > 0
          ? truePositiveOpenIntent.length / predictedOpenIntents.length
          : 0,

      expectedCalibrationError: ece,
      calibrationBins: bins,

      totalToolCalls: toolCalls.length,
      incorrectToolCalls: incorrectToolCalls.length,
      falsePositiveRate: toolCalls.length > 0 ? incorrectToolCalls.length / toolCalls.length : 0,

      latencyP50Ms: latencyStats.p50,
      latencyP95Ms: latencyStats.p95,
      latencyP99Ms: latencyStats.p99,
      averageLatencyMs: latencyStats.avg,

      fastPathRate: this.outcomes.length > 0 ? fastCount / this.outcomes.length : 0,
      verifyPathRate: this.outcomes.length > 0 ? verifyCount / this.outcomes.length : 0,
      llmPathRate: this.outcomes.length > 0 ? llmCount / this.outcomes.length : 0,

      categoryAccuracy,

      windowStartTime: this.outcomes.length > 0 ? this.outcomes[0].timestamp : new Date(),
      windowEndTime: new Date(),
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const summary = this.getSummary();
    const lines: string[] = [];

    // Helper to add a metric
    const metric = (
      name: string,
      help: string,
      type: string,
      value: number,
      labels?: Record<string, string>
    ) => {
      lines.push(`# HELP ftis_${name} ${help}`);
      lines.push(`# TYPE ftis_${name} ${type}`);
      const labelStr = labels
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',')}}`
        : '';
      lines.push(`ftis_${name}${labelStr} ${value}`);
    };

    metric(
      'classification_accuracy',
      'Classification accuracy ratio',
      'gauge',
      summary.classificationAccuracy
    );
    metric(
      'total_classifications',
      'Total classifications in window',
      'counter',
      summary.totalClassifications
    );
    metric('open_intent_recall', 'Open intent detection recall', 'gauge', summary.openIntentRecall);
    metric(
      'open_intent_precision',
      'Open intent detection precision',
      'gauge',
      summary.openIntentPrecision
    );
    metric(
      'expected_calibration_error',
      'Expected Calibration Error (ECE)',
      'gauge',
      summary.expectedCalibrationError
    );
    metric(
      'false_positive_rate',
      'Tool call false positive rate',
      'gauge',
      summary.falsePositiveRate
    );
    metric('latency_p50_ms', 'Classification latency P50', 'gauge', summary.latencyP50Ms);
    metric('latency_p95_ms', 'Classification latency P95', 'gauge', summary.latencyP95Ms);
    metric('latency_p99_ms', 'Classification latency P99', 'gauge', summary.latencyP99Ms);
    metric('fast_path_rate', 'Rate of fast path routing', 'gauge', summary.fastPathRate);
    metric('verify_path_rate', 'Rate of verify path routing', 'gauge', summary.verifyPathRate);
    metric('llm_path_rate', 'Rate of LLM path routing', 'gauge', summary.llmPathRate);

    // Per-category accuracy
    for (const [category, data] of summary.categoryAccuracy) {
      lines.push(`ftis_category_accuracy{category="${category}"} ${data.accuracy}`);
    }

    return lines.join('\n');
  }

  /**
   * Get raw outcomes for analysis
   */
  getOutcomes(): ClassificationOutcome[] {
    return [...this.outcomes];
  }

  /**
   * Get misclassifications for hard negative mining
   */
  getMisclassifications(): ClassificationOutcome[] {
    return this.outcomes.filter((o) => o.wasCorrect === false);
  }

  /**
   * Clear all outcomes
   */
  reset(): void {
    this.outcomes = [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let metricsInstance: FTISMetricsCollector | null = null;

export function getFTISMetrics(): FTISMetricsCollector {
  if (!metricsInstance) {
    metricsInstance = new FTISMetricsCollector();
  }
  return metricsInstance;
}

export function resetFTISMetrics(): void {
  metricsInstance = null;
}

// ============================================================================
// FTIS V2 JSON BYPASS METRICS
// ============================================================================

let ftisV2BypassCount = 0;

/**
 * Record that FTIS V2 mode bypassed the JSON workaround.
 * Called from the sanitizer transform stream when FTIS V2 is active.
 */
export function recordFTISV2JsonBypass(): void {
  ftisV2BypassCount++;
  log.debug({ count: ftisV2BypassCount }, 'FTIS V2 JSON bypass recorded');
}

// ============================================================================
// INJECTION BLOAT METRICS
// ============================================================================

let injectionBloatCount = 0;
let lastInjectionReset = Date.now();

/**
 * Record an injection bloat event (context injection exceeding target size).
 */
export function recordInjectionBloat(): void {
  injectionBloatCount++;
}

/**
 * Get injection metrics snapshot for observability dashboard.
 */
export function getInjectionMetrics(): {
  injectionBloatCount: number;
  ftisV2BypassCount: number;
  windowStartTime: string;
} {
  return {
    injectionBloatCount,
    ftisV2BypassCount,
    windowStartTime: new Date(lastInjectionReset).toISOString(),
  };
}

// ============================================================================
// FTIS ROUTE HANDLER
// ============================================================================

/**
 * Handle /api/ftis/* routes for FTIS metrics and health.
 */
export async function handleFTISRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/ftis')) {
    return false;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  const sendResponse = (data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  try {
    // GET /api/ftis/health
    if (pathname === '/api/ftis/health' && req.method === 'GET') {
      sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
      return true;
    }

    // GET /api/ftis/metrics
    if (pathname === '/api/ftis/metrics' && req.method === 'GET') {
      const metrics = getFTISMetrics();
      const summary = metrics.getSummary();
      sendResponse({
        ...summary,
        categoryAccuracy: Object.fromEntries(summary.categoryAccuracy),
        windowStartTime: summary.windowStartTime.toISOString(),
        windowEndTime: summary.windowEndTime.toISOString(),
      });
      return true;
    }

    // GET /api/ftis/prometheus
    if (pathname === '/api/ftis/prometheus' && req.method === 'GET') {
      const metrics = getFTISMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(metrics.toPrometheus());
      return true;
    }

    // GET /api/ftis/misclassifications
    if (pathname === '/api/ftis/misclassifications' && req.method === 'GET') {
      const metrics = getFTISMetrics();
      sendResponse({ misclassifications: metrics.getMisclassifications() });
      return true;
    }

    // POST /api/ftis/reset
    if (pathname === '/api/ftis/reset' && req.method === 'POST') {
      resetFTISMetrics();
      injectionBloatCount = 0;
      ftisV2BypassCount = 0;
      lastInjectionReset = Date.now();
      sendResponse({ status: 'reset' });
      return true;
    }

    sendResponse({ error: 'Not found' }, 404);
    return true;
  } catch (error) {
    log.error({ error: String(error) }, 'FTIS route error');
    sendResponse({ error: 'Internal error' }, 500);
    return true;
  }
}
