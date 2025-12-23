/**
 * Advanced Semantic Router
 *
 * Comprehensive tool routing system with:
 * - Learned retrieval (fine-tuned from datasets + corrections)
 * - Tool chain prediction (multi-step sequences)
 * - Uncertainty quantification (calibrated probabilities)
 * - User personalization (per-user preferences)
 * - Active learning (continuous improvement)
 * - **Optimized workers** (background processing, caching, parallelization)
 *
 * @module tools/semantic-router/advanced
 */

// Core components
export {
  LearnedRetriever,
  getLearnedRetriever,
  initializeLearnedRetriever,
} from './learned-retriever.js';

export { ToolChainPredictor, getChainPredictor } from './tool-chain-predictor.js';

export { UncertaintyCalibrator, getCalibrator } from './uncertainty.js';
export type { CalibratedResult } from './uncertainty.js';

export {
  PersonalizationEngine,
  getPersonalizationEngine,
  initializePersonalization,
  flushPersonalizationProfiles,
} from './personalization.js';
export type { UserProfile } from './personalization.js';

export {
  ActiveLearningEngine,
  getActiveLearningEngine,
  recordCorrection,
  recordSuccess,
} from './active-learning.js';

// Dataset utilities
export {
  loadCombinedTrainingData,
  loadGorillaDataset,
  loadToolBenchPatterns,
  generateSyntheticExamples,
  exportForSentenceTransformers,
  exportForClassification,
  logRoutingDecision,
} from './datasets.js';
export type { TrainingExample, DatasetStats } from './datasets.js';

// Worker optimizations
export {
  // Embedding worker - background computation + caching
  EmbeddingWorker,
  getEmbeddingWorker,
  COMMON_QUERIES,

  // Scoring worker - parallel tool scoring
  ScoringWorker,
  getScoringWorker,

  // Pipeline optimizer - orchestrates all workers
  PipelineOptimizer,
  getPipelineOptimizer,

  // Thread pool - CPU-bound parallelism
  ThreadPool,
  getThreadPool,
} from './workers/index.js';

// ============================================================================
// SIMPLIFIED TYPES FOR ADVANCED MODULE
// ============================================================================

/** Simplified match result for advanced routing */
export interface AdvancedToolMatch {
  toolId: string;
  confidence: number;
  matchedKeywords: string[];
  embeddingSimilarity: number;
  personalizationBoost?: number;
}

/** Learning metrics interface */
export interface LearningMetrics {
  totalCorrections: number;
  correctionRate: number;
  accuracyImprovement: number;
  averageConfidenceGap: number;
  mostConfusedPairs: Array<{ from: string; to: string; count: number }>;
}

/** Calibration metrics interface */
export interface CalibrationMetrics {
  expectedCalibrationError: number;
  brierScore: number;
  reliability: number;
}

// ============================================================================
// ADVANCED ROUTER
// ============================================================================

import { getLearnedRetriever, initializeLearnedRetriever } from './learned-retriever.js';
import { getChainPredictor } from './tool-chain-predictor.js';
import { getCalibrator, CalibratedResult } from './uncertainty.js';
import { getPersonalizationEngine } from './personalization.js';
import { getActiveLearningEngine } from './active-learning.js';
import type { SemanticToolDefinition } from '../types.js';

/**
 * Advanced Router - combines all systems
 */
export class AdvancedSemanticRouter {
  private initialized = false;

  /**
   * Initialize all advanced systems
   */
  async initialize(tools: SemanticToolDefinition[]): Promise<void> {
    await initializeLearnedRetriever(tools);
    this.initialized = true;
  }

  /**
   * Route a query through the full advanced pipeline
   */
  async route(
    query: string,
    userId: string,
    context?: {
      conversationHistory?: string[];
      time?: Date;
      contextTag?: string;
    }
  ): Promise<{
    primaryMatch: AdvancedToolMatch | null;
    calibrated: CalibratedResult | null;
    chain: ReturnType<ToolChainPredictor['predict']> extends Promise<infer T> ? T : never;
    personalized: boolean;
  }> {
    if (!this.initialized) {
      throw new Error('AdvancedSemanticRouter not initialized');
    }

    // 1. Get matches from learned retriever
    const retriever = getLearnedRetriever();
    const retrievalResults = await retriever.retrieve(query, 5);

    if (retrievalResults.length === 0) {
      return { primaryMatch: null, calibrated: null, chain: null, personalized: false };
    }

    // 2. Convert to internal format
    const matches: AdvancedToolMatch[] = retrievalResults.map((r) => ({
      toolId: r.toolId,
      confidence: r.score,
      matchedKeywords: r.matchedKeywords,
      embeddingSimilarity: r.embeddingSimilarity,
    }));

    // 3. Apply personalization
    const personalization = getPersonalizationEngine();
    const personalizedMatches = personalization.personalize(userId, matches as never[], {
      query,
      time: context?.time || new Date(),
      contextTag: context?.contextTag,
    }) as AdvancedToolMatch[];

    // 4. Calibrate results
    const calibrator = getCalibrator();
    const calibratedResults = calibrator.calibrate(personalizedMatches as never[], { query });

    // 5. Predict tool chain
    const chainPredictor = getChainPredictor();
    const chain = await chainPredictor.predict(query, personalizedMatches[0] as never, [], userId);

    const wasPersonalized =
      (personalizedMatches[0] as { personalizationBoost?: number })?.personalizationBoost !==
      undefined;

    return {
      primaryMatch: personalizedMatches[0] ?? null,
      calibrated: calibratedResults[0] ?? null,
      chain,
      personalized: wasPersonalized,
    };
  }

  /**
   * Get learning metrics across all systems
   */
  getMetrics(): {
    learning: LearningMetrics;
    calibration: CalibrationMetrics;
  } {
    return {
      learning: getActiveLearningEngine().getMetrics(),
      calibration: getCalibrator().getCalibrationMetrics(),
    };
  }
}

// Need to import this for the return type
import { ToolChainPredictor } from './tool-chain-predictor.js';

// Singleton
let advancedRouterInstance: AdvancedSemanticRouter | null = null;

export function getAdvancedRouter(): AdvancedSemanticRouter {
  if (!advancedRouterInstance) {
    advancedRouterInstance = new AdvancedSemanticRouter();
  }
  return advancedRouterInstance;
}
