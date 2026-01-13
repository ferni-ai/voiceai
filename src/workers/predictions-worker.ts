/**
 * Predictions Worker
 *
 * Background worker for processing predictive intelligence operations.
 * Handles pattern recording and prediction generation asynchronously:
 * - Recording observations from conversation turns
 * - Updating pattern confidence scores
 * - Generating predictions for proactive surfacing
 * - Triggering prediction notifications
 *
 * This runs independently of the voice agent, ensuring pattern
 * recording doesn't add latency to conversations.
 *
 * @module workers/predictions-worker
 */

/* eslint-disable no-restricted-imports -- Workers need direct service imports */

import { LocalWorker, type WorkerConfig } from './base-worker.js';
import type { EventPayload } from '../services/async-events/index.js';
import { createLogger } from '../utils/safe-logger.js';

// Predictive coaching imports
import {
  recordObservation,
  generatePredictions,
  clearPatternCache,
  confirmPrediction,
  invalidatePrediction,
  decayStalePatterns,
  type PatternType,
} from '../services/superhuman/predictive-coaching.js';

// cleanForFirestore removed - not used in this worker

// Superhuman observations - now in services layer for proper architecture compliance
import { getSuperhumanObservations } from '../services/superhuman/observations.js';

const log = createLogger({ module: 'PredictionsWorker' });

// ============================================================================
// TYPES
// ============================================================================

export interface ObservationData {
  type: PatternType;
  trigger: string;
  outcome: string;
  emotion?: string;
  dayOfWeek: number;
  hourOfDay: number;
  message?: string;
  topic?: string;
}

export interface PatternUpdateData {
  patternId: string;
  action: 'increment' | 'confirm' | 'invalidate';
  confidence?: number;
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Batch processor for observations.
 * Collects observations and writes them in batches to reduce Firestore calls.
 */
// Backpressure: max observations per user before dropping
const MAX_BATCH_PER_USER = 100;

class ObservationBatcher {
  private batches = new Map<string, Array<{ data: ObservationData; timestamp: number }>>();
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly maxBatchSize = 10;
  private readonly flushIntervalMs = 5000; // 5 seconds

  constructor() {
    this.startFlushInterval();
  }

  /**
   * Add observation to batch
   */
  add(userId: string, data: ObservationData): void {
    let batch = this.batches.get(userId);
    if (!batch) {
      batch = [];
      this.batches.set(userId, batch);
    }

    // Backpressure: drop if user batch is too large
    if (batch.length >= MAX_BATCH_PER_USER) {
      log.warn({ userId, batchSize: batch.length }, 'Backpressure: dropping observation');
      return;
    }

    batch.push({ data, timestamp: Date.now() });

    // Flush if batch is full
    if (batch.length >= this.maxBatchSize) {
      void this.flushUser(userId);
    }
  }

  /**
   * Flush batch for a specific user
   */
  async flushUser(userId: string): Promise<void> {
    const batch = this.batches.get(userId);
    if (!batch || batch.length === 0) return;

    this.batches.delete(userId);

    log.debug({ userId, count: batch.length }, 'Flushing observation batch');

    // Process all observations in parallel
    await Promise.all(
      batch.map(async ({ data }) =>
        recordObservation(userId, {
          type: data.type,
          trigger: data.trigger,
          outcome: data.outcome,
          emotion: data.emotion,
          dayOfWeek: data.dayOfWeek,
          hour: data.hourOfDay,
        }).catch((err) => {
          log.warn({ userId, error: String(err) }, 'Failed to record observation in batch');
        })
      )
    );
  }

  /**
   * Flush all batches
   */
  async flushAll(): Promise<void> {
    const userIds = Array.from(this.batches.keys());
    await Promise.all(userIds.map(async (userId) => this.flushUser(userId)));
  }

  /**
   * Start periodic flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      void this.flushAll();
    }, this.flushIntervalMs);
  }

  /**
   * Stop the batcher
   */
  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    void this.flushAll();
  }
}

// ============================================================================
// PREDICTIONS WORKER
// ============================================================================

export class PredictionsWorker extends LocalWorker {
  private batcher: ObservationBatcher;

  constructor(config?: Partial<WorkerConfig>) {
    super({
      name: 'PredictionsWorker',
      subscriptionName: 'ferni-predictions-sub',
      handleTypes: [
        'prediction:observation',
        'prediction:pattern-update',
        'prediction:generate',
        'prediction:surface',
        'conversation:turn',
        'conversation:end',
      ],
      ...config,
    });

    this.batcher = new ObservationBatcher();
  }

  protected async process(payload: EventPayload): Promise<void> {
    const { type, userId, sessionId, data } = payload;

    if (!userId) {
      this.log.debug({ type }, 'Skipping event without userId');
      return;
    }

    switch (type) {
      case 'prediction:observation':
        await this.handleObservation(userId, sessionId, data);
        break;

      case 'prediction:pattern-update':
        await this.handlePatternUpdate(userId, data);
        break;

      case 'prediction:generate':
        await this.handleGeneratePredictions(userId);
        break;

      case 'prediction:surface':
        await this.handleSurfacePrediction(userId, sessionId, data);
        break;

      case 'conversation:turn':
        await this.handleConversationTurn(userId, sessionId, data);
        break;

      case 'conversation:end':
        await this.handleConversationEnd(userId, sessionId);
        break;

      default:
        this.log.debug({ type }, 'Unhandled event type');
    }
  }

  /**
   * Handle observation recording.
   * Adds to batch for efficient Firestore writes.
   */
  private async handleObservation(
    userId: string,
    sessionId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    const observationData = data as unknown as ObservationData;

    this.log.debug(
      { userId, type: observationData.type, trigger: observationData.trigger },
      'Processing observation'
    );

    // Add to batch for efficient processing
    this.batcher.add(userId, observationData);

    // Also analyze with superhuman observations if session available
    if (sessionId && observationData.message) {
      try {
        const engine = getSuperhumanObservations(userId);
        engine.analyzeMessage(observationData.message);
      } catch (err) {
        this.log.debug({ error: String(err) }, 'Superhuman observation analysis skipped');
      }
    }
  }

  /**
   * Handle pattern update (confirm/invalidate prediction accuracy).
   * This implements the feedback loop for learning from prediction outcomes.
   */
  private async handlePatternUpdate(userId: string, data: Record<string, unknown>): Promise<void> {
    const updateData = data as unknown as PatternUpdateData;

    this.log.debug(
      { userId, patternId: updateData.patternId, action: updateData.action },
      'Processing pattern update'
    );

    try {
      switch (updateData.action) {
        case 'confirm':
          // User resonated with prediction - boost confidence
          await confirmPrediction(userId, updateData.patternId);
          this.log.info(
            { userId, patternId: updateData.patternId },
            '✅ Prediction confirmed - pattern strengthened'
          );
          break;

        case 'invalidate':
          // Prediction was wrong - reduce confidence
          await invalidatePrediction(userId, updateData.patternId);
          this.log.info(
            { userId, patternId: updateData.patternId },
            '❌ Prediction invalidated - pattern weakened'
          );
          break;

        case 'increment':
          // Just saw the pattern again - handled via recordObservation
          this.log.debug({ userId, patternId: updateData.patternId }, 'Pattern incremented');
          break;

        default:
          this.log.warn({ userId, action: updateData.action }, 'Unknown pattern update action');
      }

      // Clear cache to force refresh with updated data
      await clearPatternCache(userId);
    } catch (error) {
      this.log.warn(
        { userId, patternId: updateData.patternId, error: String(error) },
        'Failed to process pattern update'
      );
    }
  }

  /**
   * Handle prediction generation request.
   * Triggers prediction generation for a user.
   */
  private async handleGeneratePredictions(userId: string): Promise<void> {
    this.log.debug({ userId }, 'Generating predictions');

    try {
      const predictions = await generatePredictions(userId);

      if (predictions.length > 0) {
        this.log.info(
          { userId, count: predictions.length, topPrediction: predictions[0]?.prediction },
          '🔮 Predictions generated'
        );
      }
    } catch (err) {
      this.log.warn({ userId, error: String(err) }, 'Failed to generate predictions');
    }
  }

  /**
   * Handle prediction surfacing.
   * Records when a prediction was surfaced and tracks outcome for accuracy learning.
   */
  private async handleSurfacePrediction(
    userId: string,
    sessionId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    const { predictionId, outcome, resonance, patternId } = data as {
      predictionId?: string;
      outcome?: 'helpful' | 'neutral' | 'unhelpful';
      resonance?: number; // 0-1 scale
      patternId?: string;
    };

    this.log.debug({ userId, predictionId, outcome, resonance }, 'Recording prediction surface');

    // Track prediction accuracy for learning
    try {
      if (patternId && outcome) {
        // Update pattern confidence based on outcome
        if (outcome === 'helpful' && (resonance === undefined || resonance > 0.6)) {
          // User resonated - boost confidence
          await confirmPrediction(userId, patternId);
          this.log.info(
            { userId, patternId, outcome, resonance },
            '✅ Prediction confirmed - pattern strengthened'
          );
        } else if (outcome === 'unhelpful' || (resonance !== undefined && resonance < 0.3)) {
          // Prediction was off - reduce confidence
          await invalidatePrediction(userId, patternId);
          this.log.info(
            { userId, patternId, outcome, resonance },
            '❌ Prediction invalidated - pattern weakened'
          );
        }
        // 'neutral' outcome - no adjustment (need more data)

        // Clear cache to force refresh
        await clearPatternCache(userId);
      }

      // Also emit an analytics event for tracking
      if (sessionId) {
        const { AsyncEvents } = await import('../services/async-events/index.js');
        AsyncEvents.emit(
          'analytics:interaction',
          {
            interactionType: 'prediction_surface',
            predictionId,
            outcome,
            resonance,
            patternId,
          },
          { userId, sessionId }
        );
      }
    } catch (error) {
      this.log.warn(
        { userId, predictionId, error: String(error) },
        'Failed to track prediction accuracy'
      );
    }
  }

  /**
   * Handle conversation turn.
   * Process patterns from each turn in the background.
   */
  private async handleConversationTurn(
    userId: string,
    sessionId: string | undefined,
    data: Record<string, unknown>
  ): Promise<void> {
    const { message, topic, emotion, dayOfWeek, hourOfDay } = data as {
      message?: string;
      topic?: string;
      emotion?: string;
      dayOfWeek?: number;
      hourOfDay?: number;
    };

    if (!message) return;

    // Record temporal pattern
    if (emotion && dayOfWeek !== undefined && hourOfDay !== undefined) {
      this.batcher.add(userId, {
        type: 'temporal',
        trigger: `${getDayName(dayOfWeek)} ${getTimeOfDay(hourOfDay)}`,
        outcome: `emotional state: ${emotion}`,
        emotion,
        dayOfWeek,
        hourOfDay,
      });
    }

    // Record topic pattern
    if (topic && topic !== 'general') {
      this.batcher.add(userId, {
        type: 'behavioral',
        trigger: topic,
        outcome: emotion ? `triggers ${emotion}` : 'discussed',
        emotion,
        dayOfWeek: dayOfWeek ?? new Date().getDay(),
        hourOfDay: hourOfDay ?? new Date().getHours(),
      });
    }

    // Analyze with superhuman observations
    if (sessionId) {
      try {
        const engine = getSuperhumanObservations(userId);
        engine.analyzeMessage(message);
      } catch {
        // Non-fatal
      }
    }
  }

  /**
   * Handle conversation end.
   * Flush batches, apply decay, and generate predictions for next session.
   */
  private async handleConversationEnd(
    userId: string,
    _sessionId: string | undefined
  ): Promise<void> {
    this.log.debug({ userId }, 'Processing conversation end for predictions');

    // Flush any pending observations
    await this.batcher.flushUser(userId);

    // Apply confidence decay to stale patterns
    try {
      const decayedCount = await decayStalePatterns(userId);
      if (decayedCount > 0) {
        this.log.debug({ userId, decayedCount }, '📉 Decayed stale patterns');
      }
    } catch (err) {
      this.log.debug({ error: String(err) }, 'Pattern decay skipped');
    }

    // Generate fresh predictions for next session
    try {
      const predictions = await generatePredictions(userId);
      if (predictions.length > 0) {
        this.log.info(
          { userId, count: predictions.length },
          '🔮 Predictions ready for next session'
        );
      }
    } catch (err) {
      this.log.debug({ error: String(err) }, 'Post-conversation prediction generation skipped');
    }
  }

  /**
   * Override stop to flush batches
   */
  async stop(): Promise<void> {
    this.batcher.stop();
    await super.stop();
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] ?? 'Unknown';
}

function getTimeOfDay(hour: number): string {
  if (hour < 6) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let workerInstance: PredictionsWorker | null = null;
let instanceLock = false;

/**
 * Get or create the predictions worker instance
 */
export function getPredictionsWorker(config?: Partial<WorkerConfig>): PredictionsWorker {
  if (workerInstance) {
    return workerInstance;
  }
  // Create new instance (non-concurrent singleton creation)
  const instance = new PredictionsWorker(config);
  workerInstance = instance;
  return instance;
}

/**
 * Start the predictions worker
 */
export async function startPredictionsWorker(config?: Partial<WorkerConfig>): Promise<void> {
  if (instanceLock) return;
  instanceLock = true;
  try {
    const worker = getPredictionsWorker(config);
    await worker.start();
  } finally {
    // eslint-disable-next-line require-atomic-updates -- Lock variable only modified in this function
    instanceLock = false;
  }
}

/**
 * Stop the predictions worker
 */
export async function stopPredictionsWorker(): Promise<void> {
  const instance = workerInstance;
  if (instance) {
    workerInstance = null;
    await instance.stop();
  }
}

export default PredictionsWorker;
