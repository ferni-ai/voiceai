/**
 * FTIS BaseCal Confidence Calibration
 *
 * Implements the BaseCal (2026) approach to fix overconfident predictions.
 * Uses base model signals to detect when fine-tuned model is overconfident.
 *
 * Key insight: When fine-tuned model is confident but base model is uncertain,
 * the prediction is likely wrong.
 *
 * @module tools/intelligence/classifier-calibration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'classifier-calibration' });

// ============================================================================
// TYPES
// ============================================================================

interface CalibrationWeights {
  layer_0_weight: number[][];
  layer_0_bias: number[];
  layer_3_weight: number[][];
  layer_3_bias: number[];
  layer_5_weight: number[][];
  layer_5_bias: number[];
}

interface CalibrationModel {
  weights: CalibrationWeights;
  metadata: {
    final_val_loss: number;
    final_ece: number;
    train_samples: number;
    val_samples: number;
  };
  input_features: string[];
}

export interface CalibrationInput {
  /** Fine-tuned model confidence (max softmax) */
  fineConfidence: number;
  /** Base model confidence (similarity to centroid) */
  baseConfidence: number;
  /** Fine-tuned model prediction entropy */
  fineEntropy: number;
  /** Base model prediction entropy */
  baseEntropy: number;
}

export interface CalibrationResult {
  /** Calibrated confidence score */
  calibratedConfidence: number;
  /** Original fine-tuned confidence */
  originalConfidence: number;
  /** Whether calibration reduced confidence (sign of potential misclassification) */
  confidenceReduced: boolean;
  /** Confidence reduction amount */
  reductionAmount: number;
}

// ============================================================================
// NEURAL NETWORK INFERENCE (Pure TypeScript)
// ============================================================================

/**
 * Simple feed-forward network inference
 * Matches the BaseCal network architecture from training
 */
class BaseCalNetwork {
  private layer0Weight: number[][];
  private layer0Bias: number[];
  private layer3Weight: number[][];
  private layer3Bias: number[];
  private layer5Weight: number[][];
  private layer5Bias: number[];

  constructor(weights: CalibrationWeights) {
    this.layer0Weight = weights.layer_0_weight;
    this.layer0Bias = weights.layer_0_bias;
    this.layer3Weight = weights.layer_3_weight;
    this.layer3Bias = weights.layer_3_bias;
    this.layer5Weight = weights.layer_5_weight;
    this.layer5Bias = weights.layer_5_bias;
  }

  /**
   * ReLU activation
   */
  private relu(x: number[]): number[] {
    return x.map((v) => Math.max(0, v));
  }

  /**
   * Sigmoid activation
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Linear layer: output = input @ weight.T + bias
   */
  private linear(input: number[], weight: number[][], bias: number[]): number[] {
    const output: number[] = [];
    for (let i = 0; i < weight.length; i++) {
      let sum = bias[i];
      for (let j = 0; j < input.length; j++) {
        sum += input[j] * weight[i][j];
      }
      output.push(sum);
    }
    return output;
  }

  /**
   * Forward pass through the network
   */
  forward(features: number[]): number {
    // Layer 0: Linear(5, 32) + ReLU
    let x = this.linear(features, this.layer0Weight, this.layer0Bias);
    x = this.relu(x);

    // Dropout is skipped in inference

    // Layer 3: Linear(32, 16) + ReLU
    x = this.linear(x, this.layer3Weight, this.layer3Bias);
    x = this.relu(x);

    // Layer 5: Linear(16, 1) + Sigmoid
    const out = this.linear(x, this.layer5Weight, this.layer5Bias);
    return this.sigmoid(out[0]);
  }
}

// ============================================================================
// FTIS CALIBRATION MANAGER
// ============================================================================

export class FTISCalibration {
  private stage1Calibration: BaseCalNetwork | null = null;
  private stage2Calibrations = new Map<string, BaseCalNetwork>();
  private stage1Centroids: number[][] | null = null;
  private stage2Centroids = new Map<string, number[][]>();
  private initialized = false;
  private calibrationDir: string;

  constructor(modelsDir?: string) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const defaultModelsDir = path.join(__dirname, '../../../models/ftis-merged');
    this.calibrationDir = path.join(modelsDir || defaultModelsDir, 'calibration');
  }

  /**
   * Initialize by loading calibration models
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Load Stage 1 calibration
      const stage1Path = path.join(this.calibrationDir, 'stage1', 'calibration.json');
      try {
        const stage1Data = JSON.parse(await fs.readFile(stage1Path, 'utf-8')) as CalibrationModel;
        this.stage1Calibration = new BaseCalNetwork(stage1Data.weights);

        const stage1CentroidsPath = path.join(this.calibrationDir, 'stage1', 'base_centroids.json');
        this.stage1Centroids = JSON.parse(await fs.readFile(stage1CentroidsPath, 'utf-8'));

        log.debug({ ece: stage1Data.metadata.final_ece }, 'Stage 1 calibration loaded');
      } catch {
        log.warn('Stage 1 calibration not found');
      }

      // Load Stage 2 calibrations
      const calibrationDir = path.join(this.calibrationDir);
      try {
        const entries = await fs.readdir(calibrationDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== 'stage1') {
            const superCat = entry.name;
            const calPath = path.join(calibrationDir, superCat, 'calibration.json');
            const centroidsPath = path.join(calibrationDir, superCat, 'base_centroids.json');

            try {
              const calData = JSON.parse(await fs.readFile(calPath, 'utf-8')) as CalibrationModel;
              this.stage2Calibrations.set(superCat, new BaseCalNetwork(calData.weights));

              const centroids = JSON.parse(await fs.readFile(centroidsPath, 'utf-8'));
              this.stage2Centroids.set(superCat, centroids);

              log.debug(
                { superCat, ece: calData.metadata.final_ece },
                'Stage 2 calibration loaded'
              );
            } catch {
              // Skip categories without calibration
            }
          }
        }
      } catch {
        log.warn('Calibration directory not accessible');
      }

      this.initialized = true;
      log.info(
        {
          stage1: !!this.stage1Calibration,
          stage2Categories: this.stage2Calibrations.size,
        },
        '✅ FTIS Calibration initialized'
      );
      return true;
    } catch (error) {
      log.warn({ error: String(error) }, 'Calibration initialization failed');
      return false;
    }
  }

  /**
   * Check if calibration is available
   */
  isReady(): boolean {
    return (
      this.initialized && (this.stage1Calibration !== null || this.stage2Calibrations.size > 0)
    );
  }

  /**
   * Compute entropy from probability distribution
   */
  private computeEntropy(probs: number[]): number {
    let entropy = 0;
    for (const p of probs) {
      if (p > 0) {
        entropy -= p * Math.log(p);
      }
    }
    return entropy;
  }

  /**
   * Compute softmax from logits
   */
  private softmax(logits: number[]): number[] {
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map((l) => Math.exp(l - maxLogit));
    const sumExp = expLogits.reduce((a, b) => a + b, 0);
    return expLogits.map((e) => e / sumExp);
  }

  /**
   * Compute cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
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

  /**
   * Get base model pseudo-confidence by comparing embedding to centroids
   */
  private getBaseConfidence(
    embedding: number[],
    centroids: number[][]
  ): { confidence: number; entropy: number } {
    // Compute similarities to all centroids
    const similarities = centroids.map((centroid) => this.cosineSimilarity(embedding, centroid));

    // Scale to pseudo-logits
    const pseudoLogits = similarities.map((s) => s * 10);

    // Get probabilities and confidence
    const probs = this.softmax(pseudoLogits);
    const confidence = Math.max(...probs);
    const entropy = this.computeEntropy(probs);

    return { confidence, entropy };
  }

  /**
   * Calibrate Stage 1 confidence
   */
  calibrateStage1(
    fineConfidence: number,
    fineLogits: number[],
    embedding: number[]
  ): CalibrationResult | null {
    if (!this.stage1Calibration || !this.stage1Centroids) {
      return null;
    }

    // Get fine-tuned entropy
    const fineProbs = this.softmax(fineLogits);
    const fineEntropy = this.computeEntropy(fineProbs);

    // Get base model signals
    const { confidence: baseConfidence, entropy: baseEntropy } = this.getBaseConfidence(
      embedding,
      this.stage1Centroids
    );

    // Compute confidence gap
    const confidenceGap = Math.abs(fineConfidence - baseConfidence);

    // Run calibration network
    const features = [fineConfidence, baseConfidence, fineEntropy, baseEntropy, confidenceGap];
    const calibratedConfidence = this.stage1Calibration.forward(features);

    // The network outputs probability of correctness, use it to adjust confidence
    // If P(correct) is low, reduce confidence; if high, keep it
    const adjustedConfidence = fineConfidence * calibratedConfidence;

    return {
      calibratedConfidence: adjustedConfidence,
      originalConfidence: fineConfidence,
      confidenceReduced: adjustedConfidence < fineConfidence,
      reductionAmount: fineConfidence - adjustedConfidence,
    };
  }

  /**
   * Calibrate Stage 2 confidence
   */
  calibrateStage2(
    superCategory: string,
    fineConfidence: number,
    fineLogits: number[],
    embedding: number[]
  ): CalibrationResult | null {
    const calibration = this.stage2Calibrations.get(superCategory);
    const centroids = this.stage2Centroids.get(superCategory);

    if (!calibration || !centroids) {
      return null;
    }

    // Get fine-tuned entropy
    const fineProbs = this.softmax(fineLogits);
    const fineEntropy = this.computeEntropy(fineProbs);

    // Get base model signals
    const { confidence: baseConfidence, entropy: baseEntropy } = this.getBaseConfidence(
      embedding,
      centroids
    );

    // Compute confidence gap
    const confidenceGap = Math.abs(fineConfidence - baseConfidence);

    // Run calibration network
    const features = [fineConfidence, baseConfidence, fineEntropy, baseEntropy, confidenceGap];
    const calibratedConfidence = calibration.forward(features);

    // Adjust confidence based on correctness probability
    const adjustedConfidence = fineConfidence * calibratedConfidence;

    return {
      calibratedConfidence: adjustedConfidence,
      originalConfidence: fineConfidence,
      confidenceReduced: adjustedConfidence < fineConfidence,
      reductionAmount: fineConfidence - adjustedConfidence,
    };
  }

  /**
   * Full calibration pipeline for a classification result
   *
   * @param superCategory - Stage 1 predicted category
   * @param fineCategory - Stage 2 predicted category
   * @param superConfidence - Stage 1 confidence
   * @param fineConfidence - Stage 2 confidence
   * @param superLogits - Stage 1 raw logits (optional)
   * @param fineLogits - Stage 2 raw logits (optional)
   * @param embedding - Query embedding (384-dim from MiniLM)
   */
  calibrate(
    superCategory: string,
    fineCategory: string,
    superConfidence: number,
    fineConfidence: number,
    superLogits: number[] | null,
    fineLogits: number[] | null,
    embedding: number[]
  ): {
    calibratedSuperConfidence: number;
    calibratedFineConfidence: number;
    calibratedCombinedConfidence: number;
    wasReduced: boolean;
  } {
    let calibratedSuper = superConfidence;
    let calibratedFine = fineConfidence;

    // Calibrate Stage 1 if we have logits
    if (superLogits && this.stage1Calibration) {
      const result = this.calibrateStage1(superConfidence, superLogits, embedding);
      if (result) {
        calibratedSuper = result.calibratedConfidence;
        log.debug(
          {
            original: superConfidence.toFixed(3),
            calibrated: calibratedSuper.toFixed(3),
            reduced: result.confidenceReduced,
          },
          'Stage 1 calibration applied'
        );
      }
    }

    // Calibrate Stage 2 if we have logits
    if (fineLogits && this.stage2Calibrations.has(superCategory)) {
      const result = this.calibrateStage2(superCategory, fineConfidence, fineLogits, embedding);
      if (result) {
        calibratedFine = result.calibratedConfidence;
        log.debug(
          {
            superCategory,
            original: fineConfidence.toFixed(3),
            calibrated: calibratedFine.toFixed(3),
            reduced: result.confidenceReduced,
          },
          'Stage 2 calibration applied'
        );
      }
    }

    const calibratedCombined = calibratedSuper * calibratedFine;
    const originalCombined = superConfidence * fineConfidence;

    return {
      calibratedSuperConfidence: calibratedSuper,
      calibratedFineConfidence: calibratedFine,
      calibratedCombinedConfidence: calibratedCombined,
      wasReduced: calibratedCombined < originalCombined,
    };
  }

  /**
   * Get available calibration categories
   */
  getAvailableCategories(): { stage1: boolean; stage2: string[] } {
    return {
      stage1: this.stage1Calibration !== null,
      stage2: [...this.stage2Calibrations.keys()],
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let calibrationInstance: FTISCalibration | null = null;

export function getFTISCalibration(): FTISCalibration {
  if (!calibrationInstance) {
    calibrationInstance = new FTISCalibration();
  }
  return calibrationInstance;
}

export async function initializeFTISCalibration(modelsDir?: string): Promise<FTISCalibration> {
  if (!calibrationInstance) {
    calibrationInstance = new FTISCalibration(modelsDir);
  }
  await calibrationInstance.initialize();
  return calibrationInstance;
}

export function resetFTISCalibration(): void {
  calibrationInstance = null;
}
