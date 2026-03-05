/**
 * FTIS Hierarchical Classifier
 *
 * Two-stage ONNX classifier for domain + meta-tool routing.
 * Stage 1: Classifies user query → domain (e.g., "music", "habits", "wisdom")
 * Stage 2: Classifies "[domain] user query" → meta-tool within that domain
 *
 * Combined confidence = stage1_confidence * stage2_confidence
 *
 * @module semantic-router/advanced/intelligent/hierarchical-classifier
 */

import path from 'path';
import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'hierarchical-classifier' });

// ============================================================================
// TYPES
// ============================================================================

export interface HierarchicalClassifierConfig {
  /** Path to V7 Stage 1 model directory */
  stage1Dir: string;
  /** Path to V7 Stage 2 model directory */
  stage2Dir: string;
  /** Maximum sequence length */
  maxLength: number;
  /** Minimum combined confidence threshold */
  threshold: number;
  /** Top-K predictions to return */
  topK: number;
  /** Number of threads (0 = auto) */
  numThreads?: number;
}

export interface DomainPrediction {
  domain: string;
  confidence: number;
}

export interface MetaToolPrediction {
  metaTool: string;
  confidence: number;
}

export interface HierarchicalPrediction {
  domain: string;
  domainConfidence: number;
  metaTool: string;
  metaToolConfidence: number;
  /** Combined confidence = domainConfidence * metaToolConfidence */
  combinedConfidence: number;
}

export interface HierarchicalClassificationOutput {
  predictions: HierarchicalPrediction[];
  domainPredictions: DomainPrediction[];
  latencyMs: number;
  stage1LatencyMs: number;
  stage2LatencyMs: number;
  source: 'onnx-v7';
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

type OnnxRouterType = {
  predict(query: string): {
    predictions: Array<{ toolId: string; confidence: number }>;
    latencyMs: number;
  };
  getNumTools(): number;
  getLabels(): string[];
  warmup(): number;
};

let stage1Router: OnnxRouterType | null = null;
let stage2Router: OnnxRouterType | null = null;
let initPromise: Promise<void> | null = null;
let initError: Error | null = null;

// ============================================================================
// CONFIG
// ============================================================================

function getDefaultConfig(): HierarchicalClassifierConfig {
  const modelsRoot = path.resolve(process.cwd(), 'models');

  return {
    stage1Dir: path.join(modelsRoot, 'ferni-router-v7-stage1'),
    stage2Dir: path.join(modelsRoot, 'ferni-router-v7-stage2'),
    maxLength: 128,
    threshold: 0.1,
    topK: 5,
    numThreads: parseInt(process.env.ORT_NUM_THREADS || '0', 10),
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the FTIS hierarchical classifier.
 * Loads both Stage 1 (domain) and Stage 2 (meta-tool) ONNX models.
 */
export async function initializeHierarchicalClassifier(
  config: Partial<HierarchicalClassifierConfig> = {}
): Promise<void> {
  if (stage1Router && stage2Router) return;
  if (initPromise) return initPromise;
  if (initError) throw initError;

  initPromise = doInitialize(config);
  return initPromise;
}

async function doInitialize(config: Partial<HierarchicalClassifierConfig>): Promise<void> {
  const startTime = Date.now();

  try {
    if (process.env.DISABLE_ONNX_CLASSIFIER === 'true') {
      throw new Error('ONNX classifier disabled via DISABLE_ONNX_CLASSIFIER');
    }

    const fullConfig = { ...getDefaultConfig(), ...config };
    const fs = await import('fs');

    // Check both model directories exist
    const stage1ModelPath = path.join(fullConfig.stage1Dir, 'model.onnx');
    const stage2ModelPath = path.join(fullConfig.stage2Dir, 'model.onnx');

    if (!fs.existsSync(stage1ModelPath)) {
      throw new Error(`V7 Stage 1 model not found: ${stage1ModelPath}`);
    }
    if (!fs.existsSync(stage2ModelPath)) {
      throw new Error(`V7 Stage 2 model not found: ${stage2ModelPath}`);
    }

    const { OnnxRouter } = await import('@ferni/perf');

    // Initialize Stage 1: Domain classifier
    stage1Router = new OnnxRouter({
      modelPath: stage1ModelPath,
      tokenizerPath: path.join(fullConfig.stage1Dir, 'tokenizer.json'),
      labelMapPath: path.join(fullConfig.stage1Dir, 'label_map.json'),
      maxLength: fullConfig.maxLength,
      threshold: fullConfig.threshold,
      topK: fullConfig.topK,
      numThreads: fullConfig.numThreads,
    }) as OnnxRouterType;

    // Initialize Stage 2: Meta-tool classifier
    stage2Router = new OnnxRouter({
      modelPath: stage2ModelPath,
      tokenizerPath: path.join(fullConfig.stage2Dir, 'tokenizer.json'),
      labelMapPath: path.join(fullConfig.stage2Dir, 'label_map.json'),
      maxLength: fullConfig.maxLength,
      threshold: fullConfig.threshold,
      topK: fullConfig.topK,
      numThreads: fullConfig.numThreads,
    }) as OnnxRouterType;

    // Warmup both models
    const warmup1Ms = stage1Router.warmup();
    const warmup2Ms = stage2Router.warmup();

    const totalMs = Date.now() - startTime;
    log.info(
      {
        routerVersion: 'v7',
        stage1Labels: stage1Router.getNumTools(),
        stage2Labels: stage2Router.getNumTools(),
        warmup1Ms: warmup1Ms.toFixed(1),
        warmup2Ms: warmup2Ms.toFixed(1),
        totalMs,
      },
      '🧠 FTIS V7 hierarchical classifier initialized (2-stage)'
    );
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    log.warn({ error: String(error) }, 'FTIS V7 hierarchical classifier init failed');
    throw initError;
  }
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

/**
 * Check if the FTIS hierarchical classifier is available.
 */
export function isHierarchicalClassifierAvailable(): boolean {
  return stage1Router !== null && stage2Router !== null;
}

/**
 * Classify user input using the FTIS two-stage model.
 *
 * Stage 1: userQuery → domain predictions
 * Stage 2: "[domain] userQuery" → meta-tool predictions within top domain
 *
 * Combined confidence = domain_confidence * meta_tool_confidence
 */
export function classifyHierarchical(userText: string): HierarchicalClassificationOutput {
  if (!stage1Router || !stage2Router) {
    throw new Error('FTIS hierarchical classifier not initialized');
  }

  // Stage 1: Domain classification
  const stage1Result = stage1Router.predict(userText);
  const domainPredictions: DomainPrediction[] = stage1Result.predictions.map((p) => ({
    domain: p.toolId,
    confidence: p.confidence,
  }));

  // Stage 2: Meta-tool classification for each top domain
  // Input to Stage 2 is "[domain_name] user query" (domain prefix conditioning)
  const predictions: HierarchicalPrediction[] = [];
  let stage2LatencyMs = 0;

  for (const domainPred of domainPredictions.slice(0, 3)) {
    const prefixedQuery = `[${domainPred.domain}] ${userText}`;
    const stage2Result = stage2Router.predict(prefixedQuery);
    stage2LatencyMs += stage2Result.latencyMs;

    for (const toolPred of stage2Result.predictions) {
      const combined = domainPred.confidence * toolPred.confidence;
      predictions.push({
        domain: domainPred.domain,
        domainConfidence: domainPred.confidence,
        metaTool: toolPred.toolId,
        metaToolConfidence: toolPred.confidence,
        combinedConfidence: combined,
      });
    }
  }

  // Sort by combined confidence descending
  predictions.sort((a, b) => b.combinedConfidence - a.combinedConfidence);

  return {
    predictions: predictions.slice(0, 5),
    domainPredictions,
    latencyMs: stage1Result.latencyMs + stage2LatencyMs,
    stage1LatencyMs: stage1Result.latencyMs,
    stage2LatencyMs,
    source: 'onnx-v7',
  };
}

/**
 * Safe version that returns null if classifier is unavailable.
 */
export function classifyHierarchicalSafe(
  userText: string
): HierarchicalClassificationOutput | null {
  if (!stage1Router || !stage2Router) return null;

  try {
    return classifyHierarchical(userText);
  } catch (error) {
    log.debug({ error: String(error) }, 'FTIS hierarchical classification failed');
    return null;
  }
}

/**
 * Get domain labels from Stage 1 model.
 */
export function getV7DomainLabels(): string[] {
  if (!stage1Router) return [];
  return stage1Router.getLabels();
}

/**
 * Get meta-tool labels from Stage 2 model.
 */
export function getV7MetaToolLabels(): string[] {
  if (!stage2Router) return [];
  return stage2Router.getLabels();
}

/**
 * Shutdown the FTIS classifier and release resources.
 */
export function shutdownHierarchicalClassifier(): void {
  stage1Router = null;
  stage2Router = null;
  initPromise = null;
  initError = null;
  log.info('FTIS classifier shut down');
}

/**
 * Detect if FTIS models are available on disk.
 * Returns 'available' if both stage1 and stage2 models exist, 'none' otherwise.
 */
export function detectFTISModels(): 'available' | 'none' {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  const modelsRoot = path.resolve(process.cwd(), 'models');
  const stage1 = path.join(modelsRoot, 'ferni-router-v7-stage1', 'model.onnx');
  const stage2 = path.join(modelsRoot, 'ferni-router-v7-stage2', 'model.onnx');
  if (fs.existsSync(stage1) && fs.existsSync(stage2)) {
    return 'available';
  }
  return 'none';
}
