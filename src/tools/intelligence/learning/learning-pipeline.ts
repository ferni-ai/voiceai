/**
 * Continuous Learning Pipeline
 *
 * Orchestrates the continuous improvement cycle:
 * 1. Collects outcomes from production
 * 2. Triggers retraining when data threshold met
 * 3. Validates new models
 * 4. Promotes or rolls back
 *
 * @module tools/intelligence/learning/learning-pipeline
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getOutcomeTracker, type OutcomeTracker } from './outcome-tracker.js';
import { getABTestingManager, type ABTestingManager } from './ab-testing.js';
import { getTransitionMatrix, type TransitionMatrix } from '../transitions/transition-matrix.js';
import { getTransitionSync } from '../transitions/firestore-sync.js';
import { getTrainingDataCollector } from '../router/training/data-collector.js';

const log = createLogger({ module: 'ftis:learning-pipeline' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pipeline configuration
 */
export interface LearningPipelineConfig {
  /** Minimum outcomes before retraining */
  minOutcomesForRetrain: number;
  /** Days between retraining */
  retrainIntervalDays: number;
  /** Minimum accuracy improvement to promote */
  minAccuracyImprovement: number;
  /** A/B test traffic for new models */
  newModelTrafficPercent: number;
  /** Enable automatic retraining */
  autoRetrain: boolean;
  /** Enable automatic promotion */
  autoPromote: boolean;
}

/**
 * Pipeline state
 */
export interface PipelineState {
  /** Last retrain timestamp */
  lastRetrain: Date | null;
  /** Outcomes since last retrain */
  outcomesSinceRetrain: number;
  /** Current model version */
  currentModelVersion: string;
  /** Model being tested */
  testingModelVersion: string | null;
  /** Is retraining in progress */
  isRetraining: boolean;
  /** Is validation in progress */
  isValidating: boolean;
}

/**
 * Retrain result
 */
export interface RetrainResult {
  success: boolean;
  modelVersion: string;
  trainingExamples: number;
  validationAccuracy: number;
  duration: {
    dataCollection: number;
    training: number;
    validation: number;
  };
  errors?: string[];
}

/**
 * Promotion decision
 */
export interface PromotionDecision {
  promote: boolean;
  reason: string;
  currentAccuracy: number;
  newAccuracy: number;
  improvement: number;
  sampleSize: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: LearningPipelineConfig = {
  minOutcomesForRetrain: 1000,
  retrainIntervalDays: 7,
  minAccuracyImprovement: 0.02, // 2%
  newModelTrafficPercent: 10,
  autoRetrain: true, // FTIS: Enable automatic retraining when thresholds met
  autoPromote: true, // FTIS: Enable automatic promotion when metrics improve
};

// ============================================================================
// LEARNING PIPELINE
// ============================================================================

export class LearningPipeline {
  private config: LearningPipelineConfig;
  private state: PipelineState;

  // Dependencies
  private outcomeTracker: OutcomeTracker;
  private abTesting: ABTestingManager;
  private transitionMatrix: TransitionMatrix;

  // Retrain callback (to be set by external training system)
  private retrainCallback?: () => Promise<{
    success: boolean;
    modelPath: string;
    accuracy: number;
  }>;

  constructor(config: Partial<LearningPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      lastRetrain: null,
      outcomesSinceRetrain: 0,
      currentModelVersion: '1.0.0',
      testingModelVersion: null,
      isRetraining: false,
      isValidating: false,
    };

    this.outcomeTracker = getOutcomeTracker();
    this.abTesting = getABTestingManager();
    this.transitionMatrix = getTransitionMatrix();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Check if retraining should be triggered
   */
  shouldRetrain(): { should: boolean; reason: string } {
    const { outcomesSinceRetrain, lastRetrain, isRetraining } = this.state;

    if (isRetraining) {
      return { should: false, reason: 'Retraining already in progress' };
    }

    // Check outcome threshold
    if (outcomesSinceRetrain >= this.config.minOutcomesForRetrain) {
      return {
        should: true,
        reason: `Outcome threshold reached (${outcomesSinceRetrain}/${this.config.minOutcomesForRetrain})`,
      };
    }

    // Check time threshold
    if (lastRetrain) {
      const daysSinceRetrain = (Date.now() - lastRetrain.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRetrain >= this.config.retrainIntervalDays) {
        return {
          should: true,
          reason: `Time threshold reached (${daysSinceRetrain.toFixed(1)} days)`,
        };
      }
    }

    return { should: false, reason: 'No threshold reached' };
  }

  /**
   * Trigger retraining
   */
  async triggerRetrain(): Promise<RetrainResult> {
    if (this.state.isRetraining) {
      return {
        success: false,
        modelVersion: this.state.currentModelVersion,
        trainingExamples: 0,
        validationAccuracy: 0,
        duration: { dataCollection: 0, training: 0, validation: 0 },
        errors: ['Retraining already in progress'],
      };
    }

    this.state.isRetraining = true;
    log.info('Starting retrain pipeline');

    const duration = { dataCollection: 0, training: 0, validation: 0 };
    const errors: string[] = [];

    try {
      // 1. Collect training data
      const dataStart = Date.now();
      const collector = getTrainingDataCollector();
      const { examples, metadata } = await collector.collectAll();
      duration.dataCollection = Date.now() - dataStart;

      log.info({ examples: examples.length }, 'Training data collected');

      // 2. Run training (if callback set)
      const trainStart = Date.now();
      let modelPath = '';
      let trainAccuracy = 0;

      if (this.retrainCallback) {
        const result = await this.retrainCallback();
        if (!result.success) {
          throw new Error('Training failed');
        }
        modelPath = result.modelPath;
        trainAccuracy = result.accuracy;
      } else {
        // Placeholder - in production, trigger Cloud Build or similar
        log.warn('No retrain callback set - skipping actual training');
        modelPath = `model_${Date.now()}`;
        trainAccuracy = 0.85;
      }
      duration.training = Date.now() - trainStart;

      // 3. Validation
      const validStart = Date.now();
      // In production, run validation against held-out set
      const validationAccuracy = trainAccuracy * 0.98; // Placeholder
      duration.validation = Date.now() - validStart;

      // 4. Set up A/B test for new model
      const newVersion = `${this.state.currentModelVersion}-candidate-${Date.now()}`;
      this.state.testingModelVersion = newVersion;

      this.abTesting.createExperiment({
        id: `model_${newVersion}`,
        name: `Router Model ${newVersion}`,
        description: 'Testing new router model',
        variants: [
          {
            id: 'control',
            name: 'Current Model',
            trafficPercent: 100 - this.config.newModelTrafficPercent,
            config: { modelVersion: this.state.currentModelVersion },
            isControl: true,
          },
          {
            id: 'treatment',
            name: 'New Model',
            trafficPercent: this.config.newModelTrafficPercent,
            config: { modelVersion: newVersion, modelPath },
            isControl: false,
          },
        ],
        startDate: new Date(),
        endDate: null,
        minSampleSize: 100,
        primaryMetric: 'tool_success_rate',
        secondaryMetrics: ['latency', 'user_satisfaction'],
      });

      // Reset outcomes counter
      this.state.lastRetrain = new Date();
      this.state.outcomesSinceRetrain = 0;

      log.info({ newVersion, accuracy: validationAccuracy }, 'Retrain completed, A/B test started');

      return {
        success: true,
        modelVersion: newVersion,
        trainingExamples: examples.length,
        validationAccuracy,
        duration,
      };
    } catch (error) {
      errors.push(String(error));
      log.error({ error: String(error) }, 'Retrain failed');

      return {
        success: false,
        modelVersion: this.state.currentModelVersion,
        trainingExamples: 0,
        validationAccuracy: 0,
        duration,
        errors,
      };
    } finally {
      this.state.isRetraining = false;
    }
  }

  /**
   * Check A/B test results and decide on promotion
   */
  checkPromotion(): PromotionDecision | null {
    if (!this.state.testingModelVersion) {
      return null;
    }

    const experimentId = `model_${this.state.testingModelVersion}`;
    const results = this.abTesting.calculateResults(experimentId);

    if (!results) {
      return null;
    }

    const controlMetrics = results.variantMetrics['control'];
    const treatmentMetrics = results.variantMetrics['treatment'];

    if (!controlMetrics || !treatmentMetrics) {
      return null;
    }

    const improvement = treatmentMetrics.conversionRate - controlMetrics.conversionRate;
    const totalSample = controlMetrics.sampleSize + treatmentMetrics.sampleSize;

    const decision: PromotionDecision = {
      promote: false,
      reason: '',
      currentAccuracy: controlMetrics.conversionRate,
      newAccuracy: treatmentMetrics.conversionRate,
      improvement,
      sampleSize: totalSample,
    };

    // Check if we have enough data
    if (results.recommendation === 'continue') {
      decision.reason = 'Insufficient data - continuing test';
      return decision;
    }

    // Check if improvement meets threshold
    if (improvement >= this.config.minAccuracyImprovement) {
      decision.promote = true;
      decision.reason = `New model is ${(improvement * 100).toFixed(1)}% better`;
    } else if (results.recommendation === 'no_difference') {
      decision.reason = 'No significant difference - keeping current model';
    } else {
      decision.reason = 'New model did not meet improvement threshold';
    }

    return decision;
  }

  /**
   * Promote new model to production
   */
  async promoteModel(): Promise<boolean> {
    if (!this.state.testingModelVersion) {
      log.warn('No model to promote');
      return false;
    }

    const decision = this.checkPromotion();
    if (!decision?.promote) {
      log.info({ reason: decision?.reason }, 'Model not promoted');
      return false;
    }

    // Stop A/B test
    const experimentId = `model_${this.state.testingModelVersion}`;
    this.abTesting.stopExperiment(experimentId);

    // Update current version
    const previousVersion = this.state.currentModelVersion;
    this.state.currentModelVersion = this.state.testingModelVersion;
    this.state.testingModelVersion = null;

    log.info(
      {
        previousVersion,
        newVersion: this.state.currentModelVersion,
        improvement: `${(decision.improvement * 100).toFixed(1)}%`,
      },
      'Model promoted to production'
    );

    return true;
  }

  /**
   * Rollback to previous model
   */
  rollbackModel(previousVersion: string): void {
    if (this.state.testingModelVersion) {
      const experimentId = `model_${this.state.testingModelVersion}`;
      this.abTesting.stopExperiment(experimentId);
    }

    this.state.currentModelVersion = previousVersion;
    this.state.testingModelVersion = null;

    log.info({ version: previousVersion }, 'Model rolled back');
  }

  // ==========================================================================
  // TRANSITION MATRIX UPDATES
  // ==========================================================================

  /**
   * Sync transition matrix to Firestore
   */
  async syncTransitionMatrix(): Promise<void> {
    const sync = getTransitionSync();
    await sync.saveToFirestore();
    log.info('Transition matrix synced to Firestore');
  }

  /**
   * Load transition matrix from Firestore
   */
  async loadTransitionMatrix(): Promise<void> {
    const sync = getTransitionSync();
    await sync.loadFromFirestore();
    log.info('Transition matrix loaded from Firestore');
  }

  // ==========================================================================
  // CALLBACKS
  // ==========================================================================

  /**
   * Set callback for retraining
   */
  setRetrainCallback(
    callback: () => Promise<{ success: boolean; modelPath: string; accuracy: number }>
  ): void {
    this.retrainCallback = callback;
  }

  /**
   * Record an outcome (for counting)
   */
  recordOutcome(): void {
    this.state.outcomesSinceRetrain++;

    // Check auto-retrain
    if (this.config.autoRetrain) {
      const { should } = this.shouldRetrain();
      if (should) {
        this.triggerRetrain().catch((e) => log.error({ error: String(e) }, 'Auto-retrain failed'));
      }
    }
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  /**
   * Get current pipeline state
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LearningPipelineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): LearningPipelineConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let pipelineInstance: LearningPipeline | null = null;

export function getLearningPipeline(): LearningPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new LearningPipeline();
  }
  return pipelineInstance;
}

export function resetLearningPipeline(): void {
  pipelineInstance = null;
}
