/**
 * FTIS Feedback Loop - Continuous Learning Pipeline
 *
 * Collects feedback signals and mines hard negatives for retraining:
 * - User interruptions after tool execution (negative signal)
 * - Tool success/failure outcomes
 * - Explicit user corrections
 * - Automatic hard negative mining from misclassifications
 *
 * @module tools/intelligence/learning/routing-feedback
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../../utils/safe-logger.js';
import {
  getFTISMetrics,
  ClassificationOutcome,
} from '../../../services/observability/routing-metrics-v3.js';

const log = createLogger({ module: 'ftis-feedback' });

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackSignal {
  /** Type of feedback */
  type: 'interruption' | 'tool_success' | 'tool_failure' | 'user_correction' | 'implicit_negative';
  /** Original query */
  query: string;
  /** What was predicted */
  predictedCategory: string;
  /** What should have been predicted (if known) */
  correctCategory?: string;
  /** Confidence at prediction time */
  confidence: number;
  /** Additional context */
  context?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

export interface MinedNegative {
  /** The query text */
  text: string;
  /** Category it was wrongly classified as */
  confusedWith: string;
  /** Category it should have been (or 'conversation') */
  correctCategory: string;
  /** Source of this negative */
  source: 'interruption' | 'tool_failure' | 'user_correction' | 'low_confidence_wrong';
  /** Confidence when misclassified */
  confidence: number;
  /** Mining timestamp */
  minedAt: Date;
}

export interface FeedbackLoopConfig {
  /** Path to store feedback data */
  feedbackDir: string;
  /** Minimum examples before triggering retraining suggestion */
  minExamplesForRetrain: number;
  /** Confidence threshold below which wrong predictions are mined */
  lowConfidenceThreshold: number;
  /** Maximum age of feedback to keep (ms) */
  maxFeedbackAge: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: FeedbackLoopConfig = {
  feedbackDir: path.join(__dirname, '../../../../models/ftis-merged/feedback'),
  minExamplesForRetrain: 50,
  lowConfidenceThreshold: 0.7,
  maxFeedbackAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// FEEDBACK LOOP
// ============================================================================

export class FTISFeedbackLoop {
  private config: FeedbackLoopConfig;
  private signals: FeedbackSignal[] = [];
  private minedNegatives: MinedNegative[] = [];

  constructor(config: Partial<FeedbackLoopConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize feedback loop (create directories, load existing data)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.feedbackDir, { recursive: true });

      // Load existing feedback if any
      const signalsPath = path.join(this.config.feedbackDir, 'signals.json');
      const negativesPath = path.join(this.config.feedbackDir, 'mined_negatives.json');

      try {
        const signalsData = await fs.readFile(signalsPath, 'utf-8');
        this.signals = JSON.parse(signalsData).map((s: FeedbackSignal) => ({
          ...s,
          timestamp: new Date(s.timestamp),
        }));
      } catch {
        // No existing signals
      }

      try {
        const negativesData = await fs.readFile(negativesPath, 'utf-8');
        this.minedNegatives = JSON.parse(negativesData).map((n: MinedNegative) => ({
          ...n,
          minedAt: new Date(n.minedAt),
        }));
      } catch {
        // No existing negatives
      }

      log.info(
        {
          signals: this.signals.length,
          minedNegatives: this.minedNegatives.length,
        },
        '✅ Feedback loop initialized'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize feedback loop');
    }
  }

  /**
   * Record a feedback signal
   */
  async recordFeedback(signal: FeedbackSignal): Promise<void> {
    this.signals.push(signal);

    // Auto-mine hard negatives from certain signal types
    if (
      signal.type === 'interruption' ||
      signal.type === 'tool_failure' ||
      signal.type === 'user_correction'
    ) {
      this.mineNegativeFromSignal(signal);
    }

    // Persist periodically
    if (this.signals.length % 10 === 0) {
      await this.persist();
    }

    log.debug(
      {
        type: signal.type,
        query: signal.query.slice(0, 30),
        predicted: signal.predictedCategory,
      },
      '📝 Feedback recorded'
    );
  }

  /**
   * Record user interruption (they stopped the tool mid-execution or immediately after)
   */
  async recordInterruption(
    query: string,
    predictedCategory: string,
    confidence: number
  ): Promise<void> {
    await this.recordFeedback({
      type: 'interruption',
      query,
      predictedCategory,
      confidence,
      timestamp: new Date(),
    });

    // Also mark in metrics
    const metrics = getFTISMetrics();
    metrics.markShouldBeOpenIntent(query);
  }

  /**
   * Record tool execution success
   */
  async recordToolSuccess(
    query: string,
    predictedCategory: string,
    executedTool: string
  ): Promise<void> {
    await this.recordFeedback({
      type: 'tool_success',
      query,
      predictedCategory,
      correctCategory: predictedCategory,
      confidence: 1.0, // Will be overwritten by actual confidence
      context: { executedTool },
      timestamp: new Date(),
    });

    // Mark in metrics
    const metrics = getFTISMetrics();
    metrics.markCorrect(query, executedTool);
  }

  /**
   * Record tool execution failure
   */
  async recordToolFailure(
    query: string,
    predictedCategory: string,
    executedTool: string,
    error?: string
  ): Promise<void> {
    await this.recordFeedback({
      type: 'tool_failure',
      query,
      predictedCategory,
      confidence: 0, // Will be overwritten
      context: { executedTool, error },
      timestamp: new Date(),
    });

    // Mark in metrics
    const metrics = getFTISMetrics();
    metrics.markIncorrect(query, executedTool);
  }

  /**
   * Record explicit user correction ("that's not what I meant")
   */
  async recordUserCorrection(
    query: string,
    predictedCategory: string,
    correctCategory: string
  ): Promise<void> {
    await this.recordFeedback({
      type: 'user_correction',
      query,
      predictedCategory,
      correctCategory,
      confidence: 0,
      timestamp: new Date(),
    });
  }

  /**
   * Mine a hard negative from a feedback signal
   */
  private mineNegativeFromSignal(signal: FeedbackSignal): void {
    const negative: MinedNegative = {
      text: signal.query,
      confusedWith: signal.predictedCategory,
      correctCategory: signal.correctCategory || 'conversation',
      source: signal.type as MinedNegative['source'],
      confidence: signal.confidence,
      minedAt: new Date(),
    };

    // Check for duplicates
    const exists = this.minedNegatives.some(
      (n) => n.text === negative.text && n.confusedWith === negative.confusedWith
    );

    if (!exists) {
      this.minedNegatives.push(negative);
      log.info(
        {
          text: negative.text.slice(0, 30),
          confusedWith: negative.confusedWith,
          source: negative.source,
        },
        '🎯 Hard negative mined'
      );
    }
  }

  /**
   * Mine hard negatives from metrics misclassifications
   */
  async mineFromMetrics(): Promise<number> {
    const metrics = getFTISMetrics();
    const misclassifications = metrics.getMisclassifications();

    let newNegatives = 0;

    for (const outcome of misclassifications) {
      // Check if already mined
      const exists = this.minedNegatives.some(
        (n) => n.text === outcome.query && n.confusedWith === outcome.predictedCategory
      );

      if (!exists) {
        this.minedNegatives.push({
          text: outcome.query,
          confusedWith: outcome.predictedCategory,
          correctCategory: outcome.executedTool || 'conversation',
          source: 'low_confidence_wrong',
          confidence: outcome.effectiveConfidence,
          minedAt: new Date(),
        });
        newNegatives++;
      }
    }

    if (newNegatives > 0) {
      log.info({ count: newNegatives }, '🔍 Mined hard negatives from metrics');
      await this.persist();
    }

    return newNegatives;
  }

  /**
   * Export mined negatives for training
   */
  async exportForTraining(): Promise<{ path: string; count: number }> {
    // Group by confusedWith category
    const byCategory: Record<string, string[]> = {};

    for (const negative of this.minedNegatives) {
      if (!byCategory[negative.confusedWith]) {
        byCategory[negative.confusedWith] = [];
      }
      byCategory[negative.confusedWith].push(negative.text);
    }

    // Export to training format
    const exportPath = path.join(this.config.feedbackDir, 'exported_negatives.json');
    await fs.writeFile(exportPath, JSON.stringify(byCategory, null, 2));

    log.info(
      {
        path: exportPath,
        categories: Object.keys(byCategory).length,
        total: this.minedNegatives.length,
      },
      '📤 Exported negatives for training'
    );

    return { path: exportPath, count: this.minedNegatives.length };
  }

  /**
   * Check if we have enough data to suggest retraining
   */
  shouldSuggestRetrain(): { should: boolean; reason: string; stats: Record<string, number> } {
    const stats = {
      totalSignals: this.signals.length,
      minedNegatives: this.minedNegatives.length,
      interruptions: this.signals.filter((s) => s.type === 'interruption').length,
      failures: this.signals.filter((s) => s.type === 'tool_failure').length,
      corrections: this.signals.filter((s) => s.type === 'user_correction').length,
    };

    if (this.minedNegatives.length >= this.config.minExamplesForRetrain) {
      return {
        should: true,
        reason: `Collected ${this.minedNegatives.length} hard negatives (threshold: ${this.config.minExamplesForRetrain})`,
        stats,
      };
    }

    if (stats.interruptions >= this.config.minExamplesForRetrain / 2) {
      return {
        should: true,
        reason: `High interruption count: ${stats.interruptions}`,
        stats,
      };
    }

    return {
      should: false,
      reason: 'Not enough feedback collected yet',
      stats,
    };
  }

  /**
   * Persist feedback to disk
   */
  async persist(): Promise<void> {
    try {
      // Clean old feedback
      this.pruneOldFeedback();

      const signalsPath = path.join(this.config.feedbackDir, 'signals.json');
      const negativesPath = path.join(this.config.feedbackDir, 'mined_negatives.json');

      await fs.writeFile(signalsPath, JSON.stringify(this.signals, null, 2));
      await fs.writeFile(negativesPath, JSON.stringify(this.minedNegatives, null, 2));

      log.debug(
        {
          signals: this.signals.length,
          negatives: this.minedNegatives.length,
        },
        '💾 Feedback persisted'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to persist feedback');
    }
  }

  /**
   * Remove feedback older than configured age
   */
  private pruneOldFeedback(): void {
    const cutoff = Date.now() - this.config.maxFeedbackAge;
    this.signals = this.signals.filter((s) => s.timestamp.getTime() > cutoff);
    this.minedNegatives = this.minedNegatives.filter((n) => n.minedAt.getTime() > cutoff);
  }

  /**
   * Get feedback statistics
   */
  getStats(): Record<string, unknown> {
    return {
      totalSignals: this.signals.length,
      minedNegatives: this.minedNegatives.length,
      signalsByType: {
        interruption: this.signals.filter((s) => s.type === 'interruption').length,
        tool_success: this.signals.filter((s) => s.type === 'tool_success').length,
        tool_failure: this.signals.filter((s) => s.type === 'tool_failure').length,
        user_correction: this.signals.filter((s) => s.type === 'user_correction').length,
      },
      negativesBySource: {
        interruption: this.minedNegatives.filter((n) => n.source === 'interruption').length,
        tool_failure: this.minedNegatives.filter((n) => n.source === 'tool_failure').length,
        user_correction: this.minedNegatives.filter((n) => n.source === 'user_correction').length,
        low_confidence_wrong: this.minedNegatives.filter((n) => n.source === 'low_confidence_wrong')
          .length,
      },
      retrainSuggestion: this.shouldSuggestRetrain(),
    };
  }

  /**
   * Clear all feedback
   */
  async reset(): Promise<void> {
    this.signals = [];
    this.minedNegatives = [];
    await this.persist();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let feedbackInstance: FTISFeedbackLoop | null = null;

export function getFTISFeedbackLoop(): FTISFeedbackLoop {
  if (!feedbackInstance) {
    feedbackInstance = new FTISFeedbackLoop();
  }
  return feedbackInstance;
}

export async function initializeFTISFeedbackLoop(
  config?: Partial<FeedbackLoopConfig>
): Promise<FTISFeedbackLoop> {
  if (!feedbackInstance) {
    feedbackInstance = new FTISFeedbackLoop(config);
  }
  await feedbackInstance.initialize();
  return feedbackInstance;
}

export function resetFTISFeedbackLoop(): void {
  feedbackInstance = null;
}
