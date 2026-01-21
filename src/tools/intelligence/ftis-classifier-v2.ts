/**
 * FTIS Classifier V2 - Production-Ready Hierarchical Classification
 *
 * Uses transformers.js for unified tokenization + ONNX inference.
 * Features:
 * - Proper BPE tokenization via HuggingFace transformers.js
 * - LRU embedding cache to avoid re-computation
 * - Lazy model loading with warmup
 * - Gemini fallback for low-confidence predictions
 * - Full observability metrics
 *
 * @module tools/intelligence/ftis-classifier-v2
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/safe-logger.js';
import { FTISCalibration, getFTISCalibration } from './ftis-calibration.js';
import { FTISDecisionBoundary, getFTISDecisionBoundary } from './ftis-decision-boundary.js';

const log = createLogger({ module: 'ftis-v2' });

// ============================================================================
// TYPES
// ============================================================================

export interface ClassificationResult {
  /** Super-category (e.g., "media", "calendar", "emotional") */
  superCategory: string;
  /** Fine category (e.g., "play_music", "alarm_set", "calm_support") */
  fineCategory: string;
  /** Confidence score for super-category (0-1) */
  superConfidence: number;
  /** Confidence score for fine category (0-1) */
  fineConfidence: number;
  /** Combined confidence (super * fine) */
  combinedConfidence: number;
  /** Whether Gemini fallback was used */
  usedFallback: boolean;
  /** Mapped tool IDs for the fine category */
  toolIds: string[];
  /** Classification latency in ms */
  latencyMs: number;
  /** Top 3 alternative categories with scores */
  alternatives?: Array<{ category: string; confidence: number }>;
  /** Whether the query was detected as open intent (should go to LLM) */
  isOpenIntent?: boolean;
  /** Reason for open intent classification */
  openIntentReason?: 'within_boundary' | 'outside_class' | 'outside_global' | 'no_boundary_data';
  /** Boundary-adjusted confidence (lower if near/outside boundary) */
  boundaryAdjustedConfidence?: number;
  /** Distance to class boundary centroid */
  boundaryDistance?: number;
  /** Class boundary radius */
  boundaryRadius?: number;
  /** Calibrated confidence after BaseCal recalibration */
  calibratedConfidence?: number;
  /** Final effective confidence (after all adjustments) - USE THIS FOR ROUTING DECISIONS */
  effectiveConfidence: number;
}

export interface ClassifierConfig {
  /** Path to models directory */
  modelsDir: string;
  /** Confidence threshold for Gemini fallback */
  fallbackThreshold: number;
  /** Whether to enable Gemini fallback */
  enableFallback: boolean;
  /** Maximum sequence length for tokenizer */
  maxLength: number;
  /** Maximum embedding cache size */
  maxCacheSize: number;
  /** Whether to enable metrics collection */
  enableMetrics: boolean;
}

export interface ClassifierMetrics {
  totalClassifications: number;
  averageLatencyMs: number;
  fallbackUsageRate: number;
  cacheHitRate: number;
  confidenceDistribution: {
    high: number; // >0.9
    medium: number; // 0.7-0.9
    low: number; // <0.7
  };
  categoryDistribution: Map<string, number>;
  errorCount: number;
}

interface LabelMap {
  [label: string]: number;
}

interface CategoryCentroid {
  category: string;
  superCategory: string;
  centroid: number[];
  examples: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: ClassifierConfig = {
  modelsDir: path.join(__dirname, '../../../models/ftis-merged'),
  fallbackThreshold: 0.85,
  enableFallback: true,
  maxLength: 64,
  maxCacheSize: 10000,
  enableMetrics: true,
};

// ============================================================================
// LRU EMBEDDING CACHE
// ============================================================================

class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest (first) entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.cache.size,
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

// ============================================================================
// TRANSFORMERS.JS INTEGRATION (via unified loader)
// ============================================================================

import {
  createInferenceSession,
  createPipeline,
  createTokenizer,
  getOnnxRuntime,
  runPipelineProtected,
} from '../../utils/transformers-loader.js';

let tokenizer: any = null;
let featureExtractor: any = null;
let featureExtractorReady = false;

async function initializeTransformersForFTIS(): Promise<void> {
  if (tokenizer && featureExtractor && featureExtractorReady) return;

  try {
    // Use unified loader to avoid OrtEnv conflicts
    tokenizer = await createTokenizer('Xenova/all-MiniLM-L6-v2');

    featureExtractor = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'cpu',
    });

    // CRITICAL: Warm up the pipeline with a test inference using protected wrapper
    // This ensures the ONNX session is fully initialized before any concurrent use
    // Without this, the first real inference may fail with "Session not initialized"
    try {
      // Use runPipelineProtected to properly handle native binding issues
      const warmupResult = await runPipelineProtected(
        featureExtractor,
        'warmup test',
        { pooling: 'mean', normalize: true }
      );
      // Verify we actually got a valid result
      if (warmupResult && warmupResult.data) {
        featureExtractorReady = true;
        log.info('✅ Feature extractor warmed up successfully');
      } else {
        log.warn('Feature extractor warmup returned empty result - disabling');
        featureExtractor = null;
        featureExtractorReady = false;
      }
    } catch (warmupError) {
      // Warmup failure means the ONNX session didn't initialize properly
      // Mark the extractor as not ready to prevent repeated failures
      log.warn(
        { error: String(warmupError).slice(0, 120) },
        'Feature extractor warmup failed - boundary checking disabled (classification still works)'
      );
      featureExtractor = null;
      featureExtractorReady = false;
    }

    log.info('✅ Transformers.js initialized via unified loader');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to initialize transformers.js');
    throw error;
  }
}

async function getTokenizer(): Promise<any> {
  if (!tokenizer) {
    await initializeTransformersForFTIS();
  }
  return tokenizer;
}

async function getFeatureExtractor(): Promise<any> {
  if (!featureExtractor || !featureExtractorReady) {
    await initializeTransformersForFTIS();
  }
  // Return null if warmup failed - this signals to callers to skip embedding
  return featureExtractorReady ? featureExtractor : null;
}

// ============================================================================
// ONNX MODEL MANAGER (using unified loader with proper session options)
// ============================================================================

class ModelManager {
  private sessions = new Map<string, any>();
  private labelMaps = new Map<string, LabelMap>();
  private ort: any = null;

  async loadOnnxRuntime(): Promise<any> {
    if (this.ort) return this.ort;
    // Use unified loader to get properly configured ONNX runtime
    this.ort = await getOnnxRuntime();
    return this.ort;
  }

  async loadModel(modelPath: string, labelMapPath: string): Promise<string> {
    const modelKey = modelPath;

    if (this.sessions.has(modelKey)) {
      return modelKey;
    }

    // Use unified loader with proper session options to prevent crashes
    const session = await createInferenceSession(modelPath, {
      intraOpNumThreads: 2, // Limit internal parallelism
      interOpNumThreads: 1, // Sequential operator execution
      executionMode: 'sequential',
      graphOptimizationLevel: 'all',
    });
    const labelMap: LabelMap = JSON.parse(await fs.readFile(labelMapPath, 'utf-8'));

    this.sessions.set(modelKey, session);
    this.labelMaps.set(modelKey, labelMap);

    return modelKey;
  }

  getSession(modelKey: string): any {
    return this.sessions.get(modelKey);
  }

  getLabelMap(modelKey: string): LabelMap | undefined {
    return this.labelMaps.get(modelKey);
  }

  async runInference(
    modelKey: string,
    inputIds: bigint[],
    attentionMask: bigint[]
  ): Promise<{ label: string; confidence: number; allScores: Map<string, number> }> {
    const session = this.sessions.get(modelKey);
    const labelMap = this.labelMaps.get(modelKey);

    if (!session || !labelMap) {
      throw new Error(`Model not loaded: ${modelKey}`);
    }

    const ort = await this.loadOnnxRuntime();

    const inputTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds), [1, inputIds.length]);
    const maskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask), [
      1,
      attentionMask.length,
    ]);

    const outputs = await session.run({
      input_ids: inputTensor,
      attention_mask: maskTensor,
    });

    const logits = outputs.logits.data as Float32Array;
    const probs = this.softmax(logits);

    // Map IDs to labels
    const idToLabel = new Map<number, string>();
    for (const [label, id] of Object.entries(labelMap)) {
      idToLabel.set(id, label);
    }

    // Find best and build all scores
    let bestIdx = 0;
    let bestProb = probs[0];
    const allScores = new Map<string, number>();

    for (let i = 0; i < probs.length; i++) {
      const label = idToLabel.get(i) || `unknown_${i}`;
      allScores.set(label, probs[i]);
      if (probs[i] > bestProb) {
        bestProb = probs[i];
        bestIdx = i;
      }
    }

    return {
      label: idToLabel.get(bestIdx) || `unknown_${bestIdx}`,
      confidence: bestProb,
      allScores,
    };
  }

  private softmax(logits: Float32Array): number[] {
    const maxLogit = Math.max(...logits);
    const expLogits = Array.from(logits).map((l) => Math.exp(l - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map((e) => e / sumExp);
  }
}

// ============================================================================
// GEMINI FALLBACK
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-004';

async function getGeminiEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as { embedding: { values: number[] } };
    return data.embedding.values;
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ============================================================================
// FTIS CLASSIFIER V2
// ============================================================================

export class FTISClassifierV2 {
  private config: ClassifierConfig;
  private modelManager = new ModelManager();
  private embeddingCache: LRUCache<string, number[]>;
  private centroids: CategoryCentroid[] = [];
  private categoryToTools: Record<string, string[]> = {};
  private stage1ModelKey: string | null = null;
  private stage2ModelKeys = new Map<string, string>();
  private initialized = false;
  private decisionBoundary: FTISDecisionBoundary | null = null;
  private calibration: FTISCalibration | null = null;

  // Metrics
  private metrics: ClassifierMetrics = {
    totalClassifications: 0,
    averageLatencyMs: 0,
    fallbackUsageRate: 0,
    cacheHitRate: 0,
    confidenceDistribution: { high: 0, medium: 0, low: 0 },
    categoryDistribution: new Map(),
    errorCount: 0,
  };
  private latencySum = 0;
  private fallbackCount = 0;

  constructor(config: Partial<ClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingCache = new LRUCache(this.config.maxCacheSize);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();
    log.info('🧠 Initializing FTIS Classifier V2...');

    try {
      // 1. Initialize transformers.js
      await initializeTransformersForFTIS();

      // 2. Load Stage 1 model
      const stage1ModelPath = path.join(this.config.modelsDir, 'stage1', 'model.onnx');
      const stage1LabelPath = path.join(this.config.modelsDir, 'stage1', 'label_map.json');

      try {
        await fs.access(stage1ModelPath);
      } catch {
        log.warn({ path: stage1ModelPath }, 'FTIS models not found');
        return;
      }

      this.stage1ModelKey = await this.modelManager.loadModel(stage1ModelPath, stage1LabelPath);
      const stage1Labels = this.modelManager.getLabelMap(this.stage1ModelKey);
      log.debug({ labels: Object.keys(stage1Labels || {}).length }, 'Stage 1 model loaded');

      // 3. Load Stage 2 models
      if (stage1Labels) {
        for (const superCat of Object.keys(stage1Labels)) {
          const modelPath = path.join(this.config.modelsDir, 'stage2', superCat, 'model.onnx');
          const labelPath = path.join(this.config.modelsDir, 'stage2', superCat, 'label_map.json');

          try {
            await fs.access(modelPath);
            const modelKey = await this.modelManager.loadModel(modelPath, labelPath);
            this.stage2ModelKeys.set(superCat, modelKey);
            const labels = this.modelManager.getLabelMap(modelKey);
            log.debug(
              { superCat, labels: Object.keys(labels || {}).length },
              'Stage 2 model loaded'
            );
          } catch {
            log.warn({ superCat }, 'Stage 2 model not found');
          }
        }
      }

      // 4. Load tool mapping
      const toolMappingPath = path.join(this.config.modelsDir, 'category_to_tools.json');
      try {
        this.categoryToTools = JSON.parse(await fs.readFile(toolMappingPath, 'utf-8'));
      } catch {
        log.warn('Tool mapping not found');
      }

      // 5. Load centroids for fallback
      if (this.config.enableFallback) {
        const centroidsPath = path.join(this.config.modelsDir, 'category_centroids.json');
        try {
          this.centroids = JSON.parse(await fs.readFile(centroidsPath, 'utf-8'));
          log.debug({ count: this.centroids.length }, 'Centroids loaded for fallback');
        } catch {
          log.warn('Centroids not found - fallback disabled');
        }
      }

      // 6. Initialize decision boundary checker for open intent detection
      this.decisionBoundary = getFTISDecisionBoundary();
      const boundaryInitialized = await this.decisionBoundary.initialize();
      if (boundaryInitialized) {
        log.info('✅ Decision boundary checker initialized (ROIC-style open intent detection)');
      } else {
        log.warn('Decision boundaries not available - run train_roic.py to generate');
      }

      // 7. Initialize BaseCal calibration network
      this.calibration = getFTISCalibration();
      const calibrationInitialized = await this.calibration.initialize();
      if (calibrationInitialized) {
        log.info('✅ BaseCal calibration network initialized (confidence recalibration)');
      } else {
        log.warn('Calibration models not available - run train-calibration.py to generate');
      }

      this.initialized = true;
      log.info(
        {
          stage1: !!this.stage1ModelKey,
          stage2Models: this.stage2ModelKeys.size,
          centroids: this.centroids.length,
          toolCategories: Object.keys(this.categoryToTools).length,
          durationMs: Date.now() - startTime,
        },
        '✅ FTIS Classifier V2 initialized'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize FTIS Classifier V2');
      throw error;
    }
  }

  // ==========================================================================
  // TOKENIZATION
  // ==========================================================================

  private async tokenize(text: string): Promise<{ inputIds: bigint[]; attentionMask: bigint[] }> {
    const tok = await getTokenizer();

    const encoded = await tok(text, {
      padding: 'max_length',
      truncation: true,
      max_length: this.config.maxLength,
    });

    // Convert to BigInt arrays
    const inputIds: bigint[] = [];
    const attentionMask: bigint[] = [];

    // Handle different output formats from transformers.js
    const ids = encoded.input_ids?.data || encoded.input_ids;
    const mask = encoded.attention_mask?.data || encoded.attention_mask;

    for (let i = 0; i < this.config.maxLength; i++) {
      inputIds.push(BigInt(ids[i] || 0));
      attentionMask.push(BigInt(mask[i] || 0));
    }

    return { inputIds, attentionMask };
  }

  // ==========================================================================
  // EMBEDDING FOR BOUNDARY CHECKING
  // ==========================================================================

  /**
   * Compute MiniLM embedding for boundary checking using transformers.js feature extractor.
   *
   * NOTE: This is a GRACEFUL DEGRADATION feature. If embedding computation fails:
   * - Boundary checking is skipped (not critical for classification)
   * - Classification still works using ONNX model predictions
   * - No user-facing impact, just slightly less sophisticated confidence calibration
   */
  private async computeEmbedding(text: string): Promise<number[] | null> {
    try {
      const extractor = await getFeatureExtractor();
      if (!extractor) {
        // Feature extractor not available - gracefully skip boundary checking
        // This is expected if warmup failed (session not initialized)
        return null;
      }
      
      // Use the protected wrapper to handle native binding crashes gracefully
      const output = await runPipelineProtected(
        extractor,
        text,
        { pooling: 'mean', normalize: true }
      );
      
      // transformers.js returns a Tensor, convert to array
      if (!output || !output.data) {
        log.debug('Feature extractor returned empty output - skipping boundary check');
        return null;
      }
      
      const embedding = Array.from(output.data as Float32Array);
      return embedding;
    } catch (error) {
      // Boundary checking is optional - log at debug level, not warn
      // Common causes: ONNX session not initialized, model not loaded
      // The classification will still work, just without boundary confidence adjustment
      const errorStr = String(error);
      if (errorStr.includes('Session') || errorStr.includes('not initialized') || errorStr.includes('circuit')) {
        log.debug(
          { error: errorStr.slice(0, 80) },
          'ONNX session not ready for boundary check - using raw confidence (non-critical)'
        );
        // Mark extractor as not ready so we don't keep trying and failing
        featureExtractorReady = false;
      } else {
        log.debug({ error: errorStr.slice(0, 80) }, 'Embedding computation skipped (non-critical)');
      }
      return null;
    }
  }

  // ==========================================================================
  // CLASSIFICATION
  // ==========================================================================

  async classify(query: string): Promise<ClassificationResult | null> {
    // Guard against empty queries - can cause segfaults in native code
    if (!query || query.trim().length === 0) {
      log.debug('Skipping classification for empty query');
      return null;
    }

    if (!this.initialized || !this.stage1ModelKey) {
      await this.initialize();
      if (!this.stage1ModelKey) {
        log.warn('Classifier not ready');
        return null;
      }
    }

    const startTime = Date.now();

    try {
      // Tokenize
      const { inputIds, attentionMask } = await this.tokenize(query);

      // Stage 1: Super-category classification
      const stage1Result = await this.modelManager.runInference(
        this.stage1ModelKey,
        inputIds,
        attentionMask
      );

      const superCategory = stage1Result.label;
      const superConfidence = stage1Result.confidence;

      // Stage 2: Fine-category classification
      let fineCategory = 'unknown';
      let fineConfidence = 0;
      let fineAlternatives: Array<{ category: string; confidence: number }> = [];

      const stage2ModelKey = this.stage2ModelKeys.get(superCategory);
      if (stage2ModelKey) {
        const stage2Result = await this.modelManager.runInference(
          stage2ModelKey,
          inputIds,
          attentionMask
        );
        fineCategory = stage2Result.label;
        fineConfidence = stage2Result.confidence;

        // Get top 3 alternatives
        const sortedScores = [...stage2Result.allScores.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        fineAlternatives = sortedScores.map(([cat, conf]) => ({ category: cat, confidence: conf }));
      }

      let combinedConfidence = superConfidence * fineConfidence;
      let usedFallback = false;
      let finalSuperCategory = superCategory;
      let finalFineCategory = fineCategory;

      // Gemini fallback for low confidence
      if (
        this.config.enableFallback &&
        this.centroids.length > 0 &&
        combinedConfidence < this.config.fallbackThreshold
      ) {
        log.debug(
          { query: query.slice(0, 30), confidence: combinedConfidence.toFixed(2) },
          'Attempting fallback'
        );

        const fallbackResult = await this.classifyWithFallback(query);
        if (fallbackResult && fallbackResult.confidence > combinedConfidence) {
          finalSuperCategory = fallbackResult.superCategory;
          finalFineCategory = fallbackResult.category;
          combinedConfidence = fallbackResult.confidence;
          usedFallback = true;
          this.fallbackCount++;

          log.debug(
            {
              query: query.slice(0, 30),
              fallbackCat: finalFineCategory,
              conf: fallbackResult.confidence.toFixed(2),
            },
            '✅ Fallback improved classification'
          );
        }
      }

      // Get tools
      const toolIds = this.categoryToTools[finalFineCategory] || [];

      // ==========================================================================
      // DECISION BOUNDARY CHECK (ROIC-style open intent detection)
      // ==========================================================================
      let isOpenIntent = false;
      let openIntentReason:
        | 'within_boundary'
        | 'outside_class'
        | 'outside_global'
        | 'no_boundary_data' = 'no_boundary_data';
      let boundaryAdjustedConfidence = combinedConfidence;
      let boundaryDistance: number | undefined;
      let boundaryRadius: number | undefined;

      if (this.decisionBoundary?.isReady()) {
        // Compute embedding for boundary checking
        const embedding = await this.computeEmbedding(query);

        if (embedding) {
          // Check if query is within the predicted class boundary
          const openIntentResult = this.decisionBoundary.checkOpenIntent(
            embedding,
            finalSuperCategory,
            finalFineCategory
          );

          isOpenIntent = openIntentResult.isOpenIntent;
          openIntentReason = openIntentResult.reason;

          if (openIntentResult.boundaryCheck) {
            boundaryDistance = openIntentResult.boundaryCheck.distance;
            boundaryRadius = openIntentResult.boundaryCheck.radius;

            // Adjust confidence based on boundary position
            boundaryAdjustedConfidence = this.decisionBoundary.getAdjustedConfidence(
              combinedConfidence,
              embedding,
              finalSuperCategory,
              finalFineCategory
            );
          }

          // Log boundary check results
          if (isOpenIntent) {
            log.info(
              {
                query: query.slice(0, 40),
                reason: openIntentReason,
                originalConf: combinedConfidence.toFixed(3),
                adjustedConf: boundaryAdjustedConfidence.toFixed(3),
                distance: boundaryDistance?.toFixed(4),
                radius: boundaryRadius?.toFixed(4),
              },
              '🔄 Open intent detected - should pass to LLM'
            );
          } else {
            log.debug(
              {
                query: query.slice(0, 30),
                withinBoundary: true,
                adjustedConf: boundaryAdjustedConfidence.toFixed(3),
              },
              '✅ Within boundary'
            );
          }
        }
      }

      // ==========================================================================
      // BASECAL CALIBRATION (confidence recalibration using base model signals)
      // ==========================================================================
      let calibratedConfidence = boundaryAdjustedConfidence;

      if (this.calibration?.isReady() && !isOpenIntent) {
        // Compute embedding if we haven't already
        const embedding = await this.computeEmbedding(query);

        if (embedding) {
          // Convert allScores to array for calibration (approximation - using softmax as logits)
          const stage1Logits = stage1Result.allScores
            ? Array.from(stage1Result.allScores.values())
            : null;

          // Get stage 2 logits if available
          const stage2Logits =
            stage2ModelKey && fineAlternatives.length > 0
              ? fineAlternatives.map((a) => a.confidence)
              : null;

          const calibrationResult = this.calibration.calibrate(
            finalSuperCategory,
            finalFineCategory,
            superConfidence,
            fineConfidence,
            stage1Logits,
            stage2Logits,
            embedding
          );

          if (calibrationResult) {
            calibratedConfidence = calibrationResult.calibratedCombinedConfidence;

            log.debug(
              {
                query: query.slice(0, 30),
                originalConf: combinedConfidence.toFixed(3),
                boundaryConf: boundaryAdjustedConfidence.toFixed(3),
                calibratedConf: calibratedConfidence.toFixed(3),
                wasReduced: calibrationResult.wasReduced,
              },
              '📊 BaseCal calibration applied'
            );
          }
        }
      }

      // Use the minimum of boundary-adjusted and calibrated confidence
      // This ensures we're conservative when either method suggests lower confidence
      const effectiveConfidence = Math.min(boundaryAdjustedConfidence, calibratedConfidence);

      // Update metrics
      this.updateMetrics(
        combinedConfidence,
        finalSuperCategory,
        usedFallback,
        Date.now() - startTime
      );

      const result: ClassificationResult = {
        superCategory: finalSuperCategory,
        fineCategory: finalFineCategory,
        superConfidence: usedFallback ? combinedConfidence : superConfidence,
        fineConfidence: usedFallback ? combinedConfidence : fineConfidence,
        combinedConfidence,
        usedFallback,
        toolIds,
        latencyMs: Date.now() - startTime,
        alternatives: fineAlternatives,
        // Boundary check results
        isOpenIntent,
        openIntentReason,
        boundaryAdjustedConfidence,
        boundaryDistance,
        boundaryRadius,
        // Calibration results
        calibratedConfidence,
        // Final effective confidence (use this for routing decisions)
        effectiveConfidence,
      };

      log.debug(
        {
          query: query.slice(0, 30),
          super: finalSuperCategory,
          fine: finalFineCategory,
          conf: `${(combinedConfidence * 100).toFixed(0)}%`,
          effectiveConf: `${(effectiveConfidence * 100).toFixed(0)}%`,
          tools: toolIds.length,
          ms: result.latencyMs,
          fallback: usedFallback,
          openIntent: isOpenIntent,
        },
        '🎯 Classification'
      );

      return result;
    } catch (error) {
      this.metrics.errorCount++;
      log.error({ error: String(error), query: query.slice(0, 50) }, 'Classification failed');
      return null;
    }
  }

  private async classifyWithFallback(
    query: string
  ): Promise<{ category: string; superCategory: string; confidence: number } | null> {
    // Check cache
    const cacheKey = `embed:${query}`;
    let embedding: number[] | undefined = this.embeddingCache.get(cacheKey);

    if (!embedding) {
      const newEmbedding = await getGeminiEmbedding(query);
      if (!newEmbedding) return null;
      embedding = newEmbedding;
      this.embeddingCache.set(cacheKey, embedding);
    }

    // Find most similar centroid
    let bestMatch = { category: '', superCategory: '', similarity: -1 };

    for (const centroid of this.centroids) {
      const similarity = cosineSimilarity(embedding, centroid.centroid);
      if (similarity > bestMatch.similarity) {
        bestMatch = {
          category: centroid.category,
          superCategory: centroid.superCategory,
          similarity,
        };
      }
    }

    return bestMatch.similarity > 0
      ? {
          category: bestMatch.category,
          superCategory: bestMatch.superCategory,
          confidence: bestMatch.similarity,
        }
      : null;
  }

  // ==========================================================================
  // METRICS
  // ==========================================================================

  private updateMetrics(
    confidence: number,
    category: string,
    usedFallback: boolean,
    latencyMs: number
  ): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalClassifications++;
    this.latencySum += latencyMs;
    this.metrics.averageLatencyMs = this.latencySum / this.metrics.totalClassifications;

    if (usedFallback) {
      this.metrics.fallbackUsageRate = this.fallbackCount / this.metrics.totalClassifications;
    }

    // Confidence distribution
    if (confidence > 0.9) {
      this.metrics.confidenceDistribution.high++;
    } else if (confidence > 0.7) {
      this.metrics.confidenceDistribution.medium++;
    } else {
      this.metrics.confidenceDistribution.low++;
    }

    // Category distribution
    const count = this.metrics.categoryDistribution.get(category) || 0;
    this.metrics.categoryDistribution.set(category, count + 1);

    // Cache stats
    const cacheStats = this.embeddingCache.getStats();
    this.metrics.cacheHitRate = cacheStats.hitRate;
  }

  getMetrics(): ClassifierMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalClassifications: 0,
      averageLatencyMs: 0,
      fallbackUsageRate: 0,
      cacheHitRate: 0,
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      categoryDistribution: new Map(),
      errorCount: 0,
    };
    this.latencySum = 0;
    this.fallbackCount = 0;
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  isReady(): boolean {
    // DISABLE_FTIS_V2=true prevents ONNX segfaults
    if (process.env.DISABLE_FTIS_V2 === 'true') {
      return false;
    }
    return this.initialized && this.stage1ModelKey !== null;
  }

  getSuperCategories(): string[] {
    if (!this.stage1ModelKey) return [];
    const labelMap = this.modelManager.getLabelMap(this.stage1ModelKey);
    return labelMap ? Object.keys(labelMap) : [];
  }

  getToolsForCategory(category: string): string[] {
    return this.categoryToTools[category] || [];
  }

  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Warmup the classifier by pre-loading models and running a test query
   */
  async warmup(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Run a test classification to warm up the model
    await this.classify('test warmup query');
    log.info('Classifier warmed up');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let classifierInstance: FTISClassifierV2 | null = null;

export function getFTISClassifierV2(): FTISClassifierV2 {
  if (!classifierInstance) {
    classifierInstance = new FTISClassifierV2();
  }
  return classifierInstance;
}

export async function initializeFTISClassifierV2(
  config?: Partial<ClassifierConfig>
): Promise<FTISClassifierV2> {
  if (!classifierInstance) {
    classifierInstance = new FTISClassifierV2(config);
  }
  await classifierInstance.initialize();
  return classifierInstance;
}

export function resetFTISClassifierV2(): void {
  classifierInstance = null;
}
