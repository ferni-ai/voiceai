/**
 * Platt Scaling Calibration
 *
 * Implements Platt scaling for confidence calibration using logistic regression.
 * This transforms raw confidence scores into well-calibrated probabilities.
 *
 * Reference: Platt, J. (1999). "Probabilistic Outputs for Support Vector Machines"
 *
 * @module tools/intelligence/platt-scaling
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'platt-scaling' });

// ============================================================================
// TYPES
// ============================================================================

export interface PlattParameters {
  /** Slope parameter (A in sigmoid) */
  A: number;
  /** Intercept parameter (B in sigmoid) */
  B: number;
  /** Number of samples used to fit */
  sampleCount: number;
  /** ECE before calibration */
  eceBefore: number;
  /** ECE after calibration */
  eceAfter: number;
  /** Last updated timestamp */
  updatedAt: Date;
}

export interface CalibrationSample {
  /** Raw confidence score (0-1) */
  rawConfidence: number;
  /** Whether the prediction was correct (0 or 1) */
  correct: number;
}

export interface PlattScalerConfig {
  /** Minimum samples before fitting */
  minSamples?: number;
  /** Maximum samples to keep in buffer */
  maxSamples?: number;
  /** Learning rate for gradient descent */
  learningRate?: number;
  /** Max iterations for fitting */
  maxIterations?: number;
  /** Convergence threshold */
  convergenceThreshold?: number;
}

// ============================================================================
// PLATT SCALER CLASS
// ============================================================================

/**
 * Platt Scaler for confidence calibration.
 *
 * Uses logistic regression to learn the mapping:
 *   P(correct | confidence) = 1 / (1 + exp(A * confidence + B))
 *
 * The parameters A and B are learned from (confidence, outcome) pairs.
 */
export class PlattScaler {
  private parameters: PlattParameters | null = null;
  private sampleBuffer: CalibrationSample[] = [];
  private config: Required<PlattScalerConfig>;

  constructor(config: PlattScalerConfig = {}) {
    this.config = {
      minSamples: config.minSamples ?? 100,
      maxSamples: config.maxSamples ?? 10000,
      learningRate: config.learningRate ?? 0.01,
      maxIterations: config.maxIterations ?? 1000,
      convergenceThreshold: config.convergenceThreshold ?? 1e-6,
    };
  }

  /**
   * Add a calibration sample (prediction + outcome).
   */
  addSample(rawConfidence: number, wasCorrect: boolean): void {
    this.sampleBuffer.push({
      rawConfidence: Math.max(0.001, Math.min(0.999, rawConfidence)), // Clip to avoid log(0)
      correct: wasCorrect ? 1 : 0,
    });

    // Keep buffer bounded
    if (this.sampleBuffer.length > this.config.maxSamples) {
      // Remove oldest samples
      this.sampleBuffer = this.sampleBuffer.slice(-this.config.maxSamples);
    }
  }

  /**
   * Add multiple samples at once.
   */
  addSamples(samples: CalibrationSample[]): void {
    for (const sample of samples) {
      this.addSample(sample.rawConfidence, sample.correct === 1);
    }
  }

  /**
   * Fit the Platt scaling parameters using L-BFGS-style optimization.
   * Returns true if fitting was successful.
   */
  fit(): boolean {
    if (this.sampleBuffer.length < this.config.minSamples) {
      log.debug(
        { samples: this.sampleBuffer.length, required: this.config.minSamples },
        'Not enough samples for Platt scaling'
      );
      return false;
    }

    const samples = this.sampleBuffer;
    const n = samples.length;

    // Convert confidences to log-odds (logits) for stability
    const logits = samples.map((s) => Math.log(s.rawConfidence / (1 - s.rawConfidence)));
    const targets = samples.map((s) => s.correct);

    // Calculate ECE before calibration
    const eceBefore = this.calculateECE(
      samples.map((s) => s.rawConfidence),
      targets
    );

    // Initialize parameters
    let A = 0;
    let B = 0;

    // Gradient descent with momentum
    let gradA = 0;
    let gradB = 0;
    const momentum = 0.9;
    const lr = this.config.learningRate;

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      // Compute predictions: sigmoid(A * logit + B)
      const preds = logits.map((logit) => this.sigmoid(A * logit + B));

      // Compute gradients (negative log-likelihood)
      let dA = 0;
      let dB = 0;
      for (let i = 0; i < n; i++) {
        const diff = preds[i] - targets[i];
        dA += diff * logits[i];
        dB += diff;
      }
      dA /= n;
      dB /= n;

      // Update with momentum
      gradA = momentum * gradA + lr * dA;
      gradB = momentum * gradB + lr * dB;
      A -= gradA;
      B -= gradB;

      // Check convergence
      if (Math.abs(dA) < this.config.convergenceThreshold &&
          Math.abs(dB) < this.config.convergenceThreshold) {
        log.debug({ iterations: iter, A, B }, 'Platt scaling converged');
        break;
      }
    }

    // Calculate ECE after calibration
    const calibratedConfidences = samples.map((s) => {
      const logit = Math.log(s.rawConfidence / (1 - s.rawConfidence));
      return this.sigmoid(A * logit + B);
    });
    const eceAfter = this.calculateECE(calibratedConfidences, targets);

    this.parameters = {
      A,
      B,
      sampleCount: n,
      eceBefore,
      eceAfter,
      updatedAt: new Date(),
    };

    log.info(
      {
        A: A.toFixed(4),
        B: B.toFixed(4),
        samples: n,
        eceBefore: eceBefore.toFixed(4),
        eceAfter: eceAfter.toFixed(4),
        improvement: ((1 - eceAfter / eceBefore) * 100).toFixed(1) + '%',
      },
      '✅ Platt scaling fitted'
    );

    return true;
  }

  /**
   * Apply Platt scaling to calibrate a raw confidence score.
   */
  calibrate(rawConfidence: number): number {
    if (!this.parameters) {
      return rawConfidence;
    }

    // Clip to avoid log(0)
    const clipped = Math.max(0.001, Math.min(0.999, rawConfidence));

    // Convert to logit
    const logit = Math.log(clipped / (1 - clipped));

    // Apply Platt transformation
    return this.sigmoid(this.parameters.A * logit + this.parameters.B);
  }

  /**
   * Calibrate a batch of confidence scores.
   */
  calibrateBatch(rawConfidences: number[]): number[] {
    return rawConfidences.map((c) => this.calibrate(c));
  }

  /**
   * Get current Platt parameters.
   */
  getParameters(): PlattParameters | null {
    return this.parameters;
  }

  /**
   * Set Platt parameters (for loading from persistence).
   */
  setParameters(params: PlattParameters): void {
    this.parameters = params;
  }

  /**
   * Get sample buffer stats.
   */
  getBufferStats(): { count: number; positiveRate: number } {
    const count = this.sampleBuffer.length;
    const positiveCount = this.sampleBuffer.filter((s) => s.correct === 1).length;
    return {
      count,
      positiveRate: count > 0 ? positiveCount / count : 0,
    };
  }

  /**
   * Clear sample buffer (after persisting to storage).
   */
  clearBuffer(): void {
    this.sampleBuffer = [];
  }

  /**
   * Check if calibration is ready to use.
   */
  isReady(): boolean {
    return this.parameters !== null;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private sigmoid(x: number): number {
    // Numerically stable sigmoid
    if (x >= 0) {
      return 1 / (1 + Math.exp(-x));
    } else {
      const expX = Math.exp(x);
      return expX / (1 + expX);
    }
  }

  /**
   * Calculate Expected Calibration Error (ECE).
   * Measures how well-calibrated confidence scores are.
   */
  private calculateECE(confidences: number[], outcomes: number[], numBins = 10): number {
    const bins: { confidenceSum: number; correctSum: number; count: number }[] = Array.from(
      { length: numBins },
      () => ({ confidenceSum: 0, correctSum: 0, count: 0 })
    );

    // Assign samples to bins
    for (let i = 0; i < confidences.length; i++) {
      const binIndex = Math.min(Math.floor(confidences[i] * numBins), numBins - 1);
      bins[binIndex].confidenceSum += confidences[i];
      bins[binIndex].correctSum += outcomes[i];
      bins[binIndex].count++;
    }

    // Calculate ECE
    let ece = 0;
    const n = confidences.length;
    for (const bin of bins) {
      if (bin.count > 0) {
        const avgConfidence = bin.confidenceSum / bin.count;
        const accuracy = bin.correctSum / bin.count;
        ece += (bin.count / n) * Math.abs(accuracy - avgConfidence);
      }
    }

    return ece;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalScaler: PlattScaler | null = null;

/**
 * Get the global Platt scaler instance.
 */
export function getPlattScaler(): PlattScaler {
  if (!globalScaler) {
    globalScaler = new PlattScaler();
  }
  return globalScaler;
}

/**
 * Initialize the Platt scaler with custom config.
 */
export function initializePlattScaler(config?: PlattScalerConfig): PlattScaler {
  globalScaler = new PlattScaler(config);
  return globalScaler;
}

/**
 * Reset the Platt scaler (for testing).
 */
export function resetPlattScaler(): void {
  globalScaler = null;
}
