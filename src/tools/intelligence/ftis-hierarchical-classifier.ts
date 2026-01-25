/**
 * FTIS Hierarchical Classifier
 *
 * Two-stage classification for tool routing:
 * - Stage 1: Super-category classification (10 categories)
 * - Stage 2: Fine-category classification (70 categories)
 *
 * With Gemini embedding fallback for low-confidence predictions.
 *
 * @module tools/intelligence/ftis-hierarchical-classifier
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/safe-logger.js';
import {
  getOnnxRuntime,
  createInferenceSession,
  runInferenceProtected,
} from '../../utils/transformers-loader.js';

const log = createLogger({ module: 'ftis-hierarchical' });

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
}

export interface HierarchicalClassifierConfig {
  /** Path to models directory */
  modelsDir: string;
  /** Confidence threshold for Gemini fallback */
  fallbackThreshold: number;
  /** Whether to enable Gemini fallback */
  enableFallback: boolean;
  /** Maximum sequence length for tokenizer */
  maxLength: number;
}

interface LabelMap {
  [label: string]: number;
}

interface Stage2Model {
  session: any; // onnxruntime.InferenceSession
  labelMap: LabelMap;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_CONFIG: HierarchicalClassifierConfig = {
  modelsDir: path.join(__dirname, '../../../models/ftis-merged'),
  fallbackThreshold: 0.85,
  enableFallback: true,
  maxLength: 64,
};

// ============================================================================
// TOKENIZER
// ============================================================================

import { getSimpleTokenizer, type SimpleTokenizer } from './simple-tokenizer.js';

let tokenizer: SimpleTokenizer | null = null;
let tokenizerPath: string = '';

// Note: ONNX runtime is now imported from transformers-loader.ts
// which provides crash protection via circuit breaker and timeouts.

// ============================================================================
// HIERARCHICAL CLASSIFIER
// ============================================================================

export class HierarchicalClassifier {
  private config: HierarchicalClassifierConfig;
  private initialized = false;

  // Stage 1 model (super-categories)
  private stage1Session: any = null;
  private stage1LabelMap: LabelMap = {};

  // Stage 2 models (fine categories per super-category)
  private stage2Models: Map<string, Stage2Model> = new Map();

  // Tool mapping
  private categoryToTools: Record<string, string[]> = {};

  constructor(config: Partial<HierarchicalClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();
    log.info('🧠 Initializing FTIS Hierarchical Classifier...');

    try {
      const modelsDir = this.config.modelsDir;

      // Check if models exist
      const stage1ModelPath = path.join(modelsDir, 'stage1', 'model.onnx');
      try {
        await fs.access(stage1ModelPath);
      } catch {
        log.warn({ path: stage1ModelPath }, 'FTIS models not found, classifier disabled');
        return;
      }

      // Load Stage 1 model (using protected session creation)
      this.stage1Session = await createInferenceSession(stage1ModelPath);
      this.stage1LabelMap = JSON.parse(
        await fs.readFile(path.join(modelsDir, 'stage1', 'label_map.json'), 'utf-8')
      );
      log.debug({ labels: Object.keys(this.stage1LabelMap).length }, 'Stage 1 model loaded');

      // Load Stage 2 models (using protected session creation)
      for (const superCat of Object.keys(this.stage1LabelMap)) {
        const modelPath = path.join(modelsDir, 'stage2', superCat, 'model.onnx');
        try {
          await fs.access(modelPath);
          const session = await createInferenceSession(modelPath);
          const labelMap = JSON.parse(
            await fs.readFile(path.join(modelsDir, 'stage2', superCat, 'label_map.json'), 'utf-8')
          );
          this.stage2Models.set(superCat, { session, labelMap });
          log.debug({ superCat, labels: Object.keys(labelMap).length }, 'Stage 2 model loaded');
        } catch {
          log.warn({ superCat }, 'Stage 2 model not found');
        }
      }

      // Load tool mapping
      const toolMappingPath = path.join(modelsDir, 'category_to_tools.json');
      try {
        this.categoryToTools = JSON.parse(await fs.readFile(toolMappingPath, 'utf-8'));
        log.debug({ categories: Object.keys(this.categoryToTools).length }, 'Tool mapping loaded');
      } catch {
        log.warn('Tool mapping not found');
      }

      this.initialized = true;
      log.info(
        {
          stage1Labels: Object.keys(this.stage1LabelMap).length,
          stage2Models: this.stage2Models.size,
          toolCategories: Object.keys(this.categoryToTools).length,
          durationMs: Date.now() - startTime,
        },
        '✅ FTIS Hierarchical Classifier initialized'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize FTIS Hierarchical Classifier');
    }
  }

  // ==========================================================================
  // CLASSIFICATION
  // ==========================================================================

  private softmax(logits: Float32Array | number[]): number[] {
    const maxLogit = Math.max(...logits);
    const expLogits = Array.from(logits).map((l) => Math.exp(l - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map((e) => e / sumExp);
  }

  private async runInference(
    session: any,
    text: string,
    labelMap: LabelMap
  ): Promise<{ label: string; confidence: number; allScores: Record<string, number> }> {
    // Initialize tokenizer if needed
    if (!tokenizer) {
      const tokenizerPath = path.join(this.config.modelsDir, 'tokenizer', 'tokenizer.json');
      tokenizer = await getSimpleTokenizer(tokenizerPath);
      log.debug({ vocabSize: tokenizer.vocabSize() }, 'Tokenizer loaded');
    }

    // Encode text
    const encoded = tokenizer.encode(text);

    // Prepare tensors
    const runtime = await getOnnxRuntime();
    const inputIds = new runtime.Tensor('int64', BigInt64Array.from(encoded.input_ids), [
      1,
      this.config.maxLength,
    ]);
    const attentionMask = new runtime.Tensor('int64', BigInt64Array.from(encoded.attention_mask), [
      1,
      this.config.maxLength,
    ]);

    // Run inference (using protected execution with circuit breaker)
    const outputs = await runInferenceProtected(session, {
      input_ids: inputIds,
      attention_mask: attentionMask,
    });

    const logits = outputs.logits.data as Float32Array;
    const probs = this.softmax(logits);

    // Map IDs to labels
    const idToLabel = Object.fromEntries(Object.entries(labelMap).map(([k, v]) => [v, k]));

    // Find best
    let bestIdx = 0;
    let bestProb = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > bestProb) {
        bestProb = probs[i];
        bestIdx = i;
      }
    }

    const allScores: Record<string, number> = {};
    for (let i = 0; i < probs.length; i++) {
      allScores[idToLabel[i] || `unknown_${i}`] = probs[i];
    }

    return {
      label: idToLabel[bestIdx] || `unknown_${bestIdx}`,
      confidence: bestProb,
      allScores,
    };
  }

  /**
   * Classify a query using two-stage hierarchical classification
   */
  async classify(query: string): Promise<ClassificationResult | null> {
    if (!this.initialized || !this.stage1Session) {
      await this.initialize();
      if (!this.stage1Session) {
        log.warn('FTIS Hierarchical Classifier not available');
        return null;
      }
    }

    const startTime = Date.now();

    try {
      // Stage 1: Super-category classification
      const stage1Result = await this.runInference(this.stage1Session, query, this.stage1LabelMap);
      const superCategory = stage1Result.label;
      const superConfidence = stage1Result.confidence;

      // Stage 2: Fine-category classification
      let fineCategory = 'unknown';
      let fineConfidence = 0;

      const stage2Model = this.stage2Models.get(superCategory);
      if (stage2Model) {
        const stage2Result = await this.runInference(
          stage2Model.session,
          query,
          stage2Model.labelMap
        );
        fineCategory = stage2Result.label;
        fineConfidence = stage2Result.confidence;
      }

      let combinedConfidence = superConfidence * fineConfidence;
      let usedFallback = false;
      let finalSuperCategory = superCategory;
      let finalFineCategory = fineCategory;

      // Check if we need Gemini fallback
      if (this.config.enableFallback && combinedConfidence < this.config.fallbackThreshold) {
        log.debug(
          { query: query.slice(0, 50), confidence: combinedConfidence.toFixed(2) },
          '⚠️ Low confidence - attempting Gemini fallback'
        );

        try {
          const { getGeminiFallback } = await import('./gemini-fallback.js');
          const fallback = getGeminiFallback();

          if (fallback.isInitialized()) {
            const fallbackResult = await fallback.classify(query);
            if (fallbackResult && fallbackResult.confidence > combinedConfidence) {
              finalSuperCategory = fallbackResult.superCategory;
              finalFineCategory = fallbackResult.category;
              combinedConfidence = fallbackResult.confidence;
              usedFallback = true;
              log.debug(
                {
                  query: query.slice(0, 30),
                  fallbackCat: finalFineCategory,
                  fallbackConf: fallbackResult.confidence.toFixed(2),
                },
                '✅ Gemini fallback improved classification'
              );
            }
          }
        } catch (error) {
          log.debug({ error: String(error) }, 'Gemini fallback unavailable');
        }
      }

      // Get mapped tools
      const toolIds = this.categoryToTools[finalFineCategory] || [];

      const result: ClassificationResult = {
        superCategory: finalSuperCategory,
        fineCategory: finalFineCategory,
        superConfidence: usedFallback ? combinedConfidence : superConfidence,
        fineConfidence: usedFallback ? combinedConfidence : fineConfidence,
        combinedConfidence,
        usedFallback,
        toolIds,
        latencyMs: Date.now() - startTime,
      };

      log.debug(
        {
          query: query.slice(0, 30),
          super: superCategory,
          fine: fineCategory,
          conf: `${(combinedConfidence * 100).toFixed(0)}%`,
          tools: toolIds.length,
          ms: result.latencyMs,
        },
        '🎯 FTIS classification'
      );

      return result;
    } catch (error) {
      log.error({ error: String(error), query: query.slice(0, 50) }, 'FTIS classification failed');
      return null;
    }
  }

  /**
   * Get tools for a category
   */
  getToolsForCategory(category: string): string[] {
    return this.categoryToTools[category] || [];
  }

  /**
   * Check if classifier is ready
   */
  isReady(): boolean {
    return this.initialized && this.stage1Session !== null;
  }

  /**
   * Get available super-categories
   */
  getSuperCategories(): string[] {
    return Object.keys(this.stage1LabelMap);
  }

  /**
   * Get fine categories for a super-category
   */
  getFineCategories(superCategory: string): string[] {
    const model = this.stage2Models.get(superCategory);
    return model ? Object.keys(model.labelMap) : [];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let classifierInstance: HierarchicalClassifier | null = null;

export function getHierarchicalClassifier(): HierarchicalClassifier {
  if (!classifierInstance) {
    classifierInstance = new HierarchicalClassifier();
  }
  return classifierInstance;
}

export async function initializeHierarchicalClassifier(
  config?: Partial<HierarchicalClassifierConfig>
): Promise<HierarchicalClassifier> {
  if (!classifierInstance) {
    classifierInstance = new HierarchicalClassifier(config);
  }
  await classifierInstance.initialize();
  return classifierInstance;
}

export function resetHierarchicalClassifier(): void {
  classifierInstance = null;
}
