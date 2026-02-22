/**
 * Context Injection A/B Experiment Tracker
 *
 * Extends the existing injection-tracker.ts with A/B experiment capabilities.
 * The injection-tracker handles per-turn tracking and user reaction analysis;
 * this module adds:
 *
 * 1. A/B experiment framework for injection categories
 * 2. Deterministic user→variant assignment (sticky across sessions)
 * 3. Category-level effectiveness analysis (with vs without)
 * 4. Experiment result comparison (control vs treatment)
 * 5. Firestore persistence for offline analysis
 *
 * Integration:
 *   buildContextInjections() → shouldModifyInjection() to check experiments
 *     → recordInjections() logs snapshot
 *     → existing injection-tracker handles reaction capture
 *     → recordOutcome() correlates with engagement signals
 *
 * @module intelligence/context-outcome-tracker
 */

import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'context-outcome-tracker' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A snapshot of which injections were applied for a single turn.
 */
export interface InjectionSnapshot {
  /** Session ID */
  sessionId: string;
  /** Turn number within session */
  turnNumber: number;
  /** User ID (for cross-session analysis) */
  userId: string;
  /** Persona active during this turn */
  personaId: string;
  /** Categories of injections applied */
  categories: string[];
  /** Total injection count */
  injectionCount: number;
  /** Sum of priorities (higher = more aggressive injection) */
  totalPriority: number;
  /** Whether an A/B experiment variant was active */
  experimentVariant?: string;
  /** Experiment ID if running */
  experimentId?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Outcome signals collected after the LLM responds and user reacts.
 */
export interface TurnOutcome {
  /** Did the user continue the conversation? */
  userContinued: boolean;
  /** Engagement signal: user response length relative to their average */
  responseEngagement: 'high' | 'medium' | 'low' | 'none';
  /** Sentiment shift from previous turn (-1 to 1) */
  sentimentDelta: number;
  /** Was the turn a topic shift (possible disengagement)? */
  wasTopicShift: boolean;
  /** Did the user express gratitude or positive feedback? */
  positiveFeedback: boolean;
  /** Did the user express frustration or negative feedback? */
  negativeFeedback: boolean;
  /** Time between LLM response and user's next message (ms) */
  responseLatencyMs: number;
  /** Whether user interrupted the AI (barge-in) */
  wasInterrupted: boolean;
}

/**
 * Complete injection-outcome record for a single turn.
 */
export interface InjectionOutcomeRecord {
  id: string;
  injection: InjectionSnapshot;
  outcome: TurnOutcome | null;
  createdAt: Date;
}

/**
 * Aggregated effectiveness score for an injection category.
 */
export interface CategoryEffectiveness {
  category: string;
  /** Number of turns where this category was injected */
  sampleSize: number;
  /** Average engagement when present vs absent */
  engagementLift: number;
  /** Average sentiment delta when present */
  avgSentimentDelta: number;
  /** Rate of positive feedback when present */
  positiveFeedbackRate: number;
  /** Rate of user continuation when present */
  continuationRate: number;
  /** Statistical confidence (0-1) */
  confidence: number;
}

/**
 * A/B variant configuration for injection experiments.
 */
export interface InjectionExperimentConfig {
  /** Experiment ID */
  id: string;
  /** Description of what's being tested */
  description: string;
  /** Categories to A/B test */
  targetCategories: string[];
  /** Control: include these categories as normal */
  controlBehavior: 'include';
  /** Treatment: what to do with target categories */
  treatmentBehavior: 'exclude' | 'boost' | 'reduce';
  /** Traffic split (0-1, portion going to treatment) */
  treatmentTrafficPercent: number;
  /** Whether experiment is active */
  active: boolean;
}

// ============================================================================
// CONTEXT OUTCOME TRACKER
// ============================================================================

export class ContextOutcomeTracker {
  private db: FirebaseFirestore.Firestore | null = null;

  /** Buffer of records pending Firestore write */
  private buffer: InjectionOutcomeRecord[] = [];
  private readonly BUFFER_SIZE = 30;
  private readonly FLUSH_INTERVAL_MS = 60_000;
  private flushTimer: NodeJS.Timeout | null = null;

  /** In-memory records for real-time analysis (ring buffer) */
  private recentRecords: InjectionOutcomeRecord[] = [];
  private readonly MAX_RECENT = 500;

  /** Active injection snapshots awaiting outcome correlation */
  private pendingSnapshots = new Map<string, InjectionSnapshot>();

  /** Active experiments */
  private experiments = new Map<string, InjectionExperimentConfig>();

  /** User → experiment variant assignments (sticky) */
  private variantAssignments = new Map<string, Map<string, 'control' | 'treatment'>>();

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(db: FirebaseFirestore.Firestore): Promise<void> {
    this.db = db;
    this.startFlushTimer();
    log.info('Context outcome tracker initialized');
  }

  private startFlushTimer(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush().catch((e) => log.error({ error: String(e) }, 'Flush failed'));
    }, this.FLUSH_INTERVAL_MS);
  }

  // ==========================================================================
  // EXPERIMENT MANAGEMENT
  // ==========================================================================

  /**
   * Register an A/B experiment for injection categories.
   */
  registerExperiment(config: InjectionExperimentConfig): void {
    this.experiments.set(config.id, config);
    log.info(
      { experimentId: config.id, categories: config.targetCategories },
      'Injection experiment registered'
    );
  }

  /**
   * Get the variant assignment for a user in an experiment.
   * Assignments are sticky (same user always gets same variant).
   */
  getVariantForUser(
    experimentId: string,
    userId: string
  ): 'control' | 'treatment' | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.active) return null;

    let userAssignments = this.variantAssignments.get(userId);
    if (!userAssignments) {
      userAssignments = new Map();
      this.variantAssignments.set(userId, userAssignments);
    }

    const existing = userAssignments.get(experimentId);
    if (existing) return existing;

    // Deterministic hash-based assignment for consistency
    const hash = simpleHash(`${userId}:${experimentId}`);
    const isInTreatment = (hash % 100) < (experiment.treatmentTrafficPercent * 100);
    const variant = isInTreatment ? 'treatment' : 'control';

    userAssignments.set(experimentId, variant);
    log.debug(
      { experimentId, userId: userId.slice(0, 8), variant },
      'User assigned to experiment variant'
    );
    return variant;
  }

  /**
   * Check if a category should be modified based on active experiments.
   * Returns modification instruction or null if no experiment applies.
   */
  shouldModifyInjection(
    category: string,
    userId: string
  ): { action: 'exclude' | 'boost' | 'reduce'; experimentId: string; variant: string } | null {
    for (const [expId, experiment] of this.experiments) {
      if (!experiment.active) continue;
      if (!experiment.targetCategories.includes(category)) continue;

      const variant = this.getVariantForUser(expId, userId);
      if (variant === 'treatment') {
        return {
          action: experiment.treatmentBehavior,
          experimentId: expId,
          variant: 'treatment',
        };
      }
    }
    return null;
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Record which injections were applied for a turn.
   * Call this after buildContextInjections() completes.
   */
  recordInjections(snapshot: InjectionSnapshot): void {
    const key = `${snapshot.sessionId}:${snapshot.turnNumber}`;
    this.pendingSnapshots.set(key, snapshot);

    // Evict old pending snapshots (shouldn't accumulate beyond ~20 turns)
    if (this.pendingSnapshots.size > 100) {
      const oldest = Array.from(this.pendingSnapshots.keys()).slice(0, 50);
      for (const k of oldest) {
        this.pendingSnapshots.delete(k);
      }
    }
  }

  /**
   * Record the outcome for a turn and correlate with its injections.
   * Call this after the user responds to the AI's turn.
   */
  recordOutcome(
    sessionId: string,
    turnNumber: number,
    outcome: TurnOutcome
  ): void {
    const key = `${sessionId}:${turnNumber}`;
    const snapshot = this.pendingSnapshots.get(key);

    if (!snapshot) {
      log.debug({ sessionId, turnNumber }, 'No injection snapshot for outcome (may be first turn)');
      return;
    }

    this.pendingSnapshots.delete(key);

    const record: InjectionOutcomeRecord = {
      id: `ico_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      injection: snapshot,
      outcome,
      createdAt: new Date(),
    };

    // Store in recent buffer
    this.recentRecords.push(record);
    if (this.recentRecords.length > this.MAX_RECENT) {
      this.recentRecords.shift();
    }

    // Add to Firestore write buffer
    this.buffer.push(record);
    if (this.buffer.length >= this.BUFFER_SIZE) {
      this.flush().catch((e) => log.error({ error: String(e) }, 'Buffer flush failed'));
    }
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Get effectiveness scores for each injection category.
   * Compares turns with vs without each category.
   */
  getCategoryEffectiveness(): CategoryEffectiveness[] {
    const completedRecords = this.recentRecords.filter((r) => r.outcome !== null);
    if (completedRecords.length < 10) return [];

    const allCategories = new Set<string>();
    for (const record of completedRecords) {
      for (const cat of record.injection.categories) {
        allCategories.add(cat);
      }
    }

    const results: CategoryEffectiveness[] = [];

    for (const category of allCategories) {
      const withCategory = completedRecords.filter((r) =>
        r.injection.categories.includes(category)
      );
      const withoutCategory = completedRecords.filter(
        (r) => !r.injection.categories.includes(category)
      );

      if (withCategory.length < 3 || withoutCategory.length < 3) continue;

      const withEngagement = computeEngagementScore(withCategory);
      const withoutEngagement = computeEngagementScore(withoutCategory);

      const avgSentimentWith = average(
        withCategory.map((r) => r.outcome?.sentimentDelta ?? 0)
      );

      const positiveFeedbackWith =
        withCategory.filter((r) => r.outcome?.positiveFeedback).length / withCategory.length;

      const continuationWith =
        withCategory.filter((r) => r.outcome?.userContinued).length / withCategory.length;

      const sampleSize = withCategory.length;
      const confidence = Math.min(1, sampleSize / 50);

      results.push({
        category,
        sampleSize,
        engagementLift: withEngagement - withoutEngagement,
        avgSentimentDelta: avgSentimentWith,
        positiveFeedbackRate: positiveFeedbackWith,
        continuationRate: continuationWith,
        confidence,
      });
    }

    return results.sort((a, b) => b.engagementLift - a.engagementLift);
  }

  /**
   * Get experiment results comparing control vs treatment.
   */
  getExperimentResults(experimentId: string): {
    control: { sampleSize: number; engagement: number; sentimentDelta: number };
    treatment: { sampleSize: number; engagement: number; sentimentDelta: number };
    recommendation: 'continue' | 'adopt_treatment' | 'keep_control' | 'insufficient_data';
  } | null {
    const completedRecords = this.recentRecords.filter(
      (r) => r.outcome !== null && r.injection.experimentId === experimentId
    );

    const control = completedRecords.filter(
      (r) => r.injection.experimentVariant === 'control'
    );
    const treatment = completedRecords.filter(
      (r) => r.injection.experimentVariant === 'treatment'
    );

    if (control.length < 5 || treatment.length < 5) {
      return {
        control: { sampleSize: control.length, engagement: 0, sentimentDelta: 0 },
        treatment: { sampleSize: treatment.length, engagement: 0, sentimentDelta: 0 },
        recommendation: 'insufficient_data',
      };
    }

    const controlEngagement = computeEngagementScore(control);
    const treatmentEngagement = computeEngagementScore(treatment);
    const controlSentiment = average(control.map((r) => r.outcome?.sentimentDelta ?? 0));
    const treatmentSentiment = average(treatment.map((r) => r.outcome?.sentimentDelta ?? 0));

    const engagementDiff = treatmentEngagement - controlEngagement;
    const MIN_SAMPLE = 30;
    const MIN_LIFT = 0.05;

    let recommendation: 'continue' | 'adopt_treatment' | 'keep_control' | 'insufficient_data';
    if (control.length < MIN_SAMPLE || treatment.length < MIN_SAMPLE) {
      recommendation = 'continue';
    } else if (engagementDiff > MIN_LIFT) {
      recommendation = 'adopt_treatment';
    } else if (engagementDiff < -MIN_LIFT) {
      recommendation = 'keep_control';
    } else {
      recommendation = 'continue';
    }

    return {
      control: {
        sampleSize: control.length,
        engagement: controlEngagement,
        sentimentDelta: controlSentiment,
      },
      treatment: {
        sampleSize: treatment.length,
        engagement: treatmentEngagement,
        sentimentDelta: treatmentSentiment,
      },
      recommendation,
    };
  }

  /**
   * Build a context string summarizing injection effectiveness
   * for inclusion in meta-prompts or dashboards.
   */
  buildEffectivenessContext(): string {
    const effectiveness = this.getCategoryEffectiveness();
    if (effectiveness.length === 0) return '';

    const topPerformers = effectiveness
      .filter((e) => e.confidence > 0.3 && e.engagementLift > 0)
      .slice(0, 5);

    const underPerformers = effectiveness
      .filter((e) => e.confidence > 0.3 && e.engagementLift < -0.05)
      .slice(-3);

    const lines: string[] = [];
    if (topPerformers.length > 0) {
      lines.push('## High-Impact Context (keep emphasizing)');
      for (const e of topPerformers) {
        lines.push(
          `- ${e.category}: +${(e.engagementLift * 100).toFixed(1)}% engagement, ` +
          `${(e.continuationRate * 100).toFixed(0)}% continuation (n=${e.sampleSize})`
        );
      }
    }
    if (underPerformers.length > 0) {
      lines.push('## Low-Impact Context (consider reducing)');
      for (const e of underPerformers) {
        lines.push(
          `- ${e.category}: ${(e.engagementLift * 100).toFixed(1)}% engagement (n=${e.sampleSize})`
        );
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  async flush(): Promise<number> {
    if (this.buffer.length === 0 || !this.db) return 0;

    const toFlush = [...this.buffer];
    this.buffer = [];

    try {
      const batch = this.db.batch();
      for (const record of toFlush) {
        const docRef = this.db.collection('context_injection_outcomes').doc(record.id);
        batch.set(docRef, cleanForFirestore({
          ...record,
          injection: {
            ...record.injection,
            timestamp: record.injection.timestamp,
          },
        }));
      }
      await batch.commit();
      log.debug({ count: toFlush.length }, 'Flushed injection outcomes to Firestore');
      return toFlush.length;
    } catch (error) {
      this.buffer = [...toFlush, ...this.buffer];
      log.error({ error: String(error) }, 'Failed to flush injection outcomes');
      return 0;
    }
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    log.info(
      { recordCount: this.recentRecords.length, pendingSnapshots: this.pendingSnapshots.size },
      'Context outcome tracker shutdown'
    );
  }

  getStats(): {
    recentRecords: number;
    pendingSnapshots: number;
    bufferSize: number;
    activeExperiments: number;
  } {
    return {
      recentRecords: this.recentRecords.length,
      pendingSnapshots: this.pendingSnapshots.size,
      bufferSize: this.buffer.length,
      activeExperiments: Array.from(this.experiments.values()).filter((e) => e.active).length,
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function computeEngagementScore(records: InjectionOutcomeRecord[]): number {
  if (records.length === 0) return 0;

  let score = 0;
  for (const r of records) {
    if (!r.outcome) continue;
    const engagementMap = { high: 1, medium: 0.6, low: 0.3, none: 0 };
    score += engagementMap[r.outcome.responseEngagement] || 0;
    score += r.outcome.userContinued ? 0.3 : 0;
    score += r.outcome.positiveFeedback ? 0.2 : 0;
    score -= r.outcome.negativeFeedback ? 0.3 : 0;
    score += Math.max(-0.3, Math.min(0.3, r.outcome.sentimentDelta));
  }
  return score / records.length;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ContextOutcomeTracker | null = null;

export function getContextOutcomeTracker(): ContextOutcomeTracker {
  if (!instance) {
    instance = new ContextOutcomeTracker();
  }
  return instance;
}

export async function initializeContextOutcomeTracker(
  db: FirebaseFirestore.Firestore
): Promise<ContextOutcomeTracker> {
  instance = new ContextOutcomeTracker();
  await instance.initialize(db);
  return instance;
}

export function resetContextOutcomeTracker(): void {
  if (instance) {
    instance.shutdown().catch((err) => {
      log.warn({ error: String(err) }, 'Failed to shutdown context outcome tracker during reset');
    });
  }
  instance = null;
}
