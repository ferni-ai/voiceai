/**
 * Optimized Audio Processing
 *
 * PERFORMANCE OPTIMIZATION: Reduces CPU overhead from audio processing
 * by using frame decimation and intelligent feature toggling.
 *
 * Key optimizations:
 * 1. Frame decimation - Process every Nth frame for non-critical analyzers
 * 2. Priority tiers - Critical analyzers (VAD) run always, others can be throttled
 * 3. Adaptive processing - Reduce processing when latency is critical
 * 4. Batched analysis - Collect frames and analyze in batches
 *
 * @module performance/optimized-audio-processing
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'OptimizedAudioProcessing' });

// ============================================================================
// TYPES
// ============================================================================

export interface AudioProcessingConfig {
  /**
   * Frame decimation rate for non-critical analyzers
   * E.g., 4 means process every 4th frame
   * @default 4
   */
  decimationRate?: number;
  /**
   * Enable speaker change detection (CPU intensive)
   * @default true in normal mode, false in low-latency mode
   */
  enableSpeakerDetection?: boolean;
  /**
   * Enable breath pause detection
   * @default true
   */
  enableBreathDetection?: boolean;
  /**
   * Enable Gemini emotion analysis (most CPU intensive)
   * @default false (experimental)
   */
  enableGeminiEmotion?: boolean;
  /**
   * Enable prosody analysis
   * @default true
   */
  enableProsodyAnalysis?: boolean;
  /**
   * Low latency mode - aggressively reduces processing
   * @default false
   */
  lowLatencyMode?: boolean;
  /**
   * Batch size for prosody analysis (frames)
   * @default 10
   */
  prosodyBatchSize?: number;
}

export interface FrameProcessingResult {
  /** Whether the frame was fully processed */
  processed: boolean;
  /** Which analyzers ran */
  analyzersRun: string[];
  /** Frame number (for decimation tracking) */
  frameNumber: number;
}

export interface AudioProcessingMetrics {
  totalFrames: number;
  processedFrames: number;
  skippedFrames: number;
  decimationRate: number;
  avgProcessingTimeMs: number;
  analyzersEnabled: string[];
}

// ============================================================================
// AUDIO PROCESSING OPTIMIZER
// ============================================================================

export class AudioProcessingOptimizer {
  private config: Required<AudioProcessingConfig>;
  private frameCount = 0;
  private processedCount = 0;
  private skippedCount = 0;
  private processingTimes: number[] = [];
  private prosodyBuffer: Array<{ data: Int16Array; sampleRate: number; channels: number }> = [];

  constructor(config: AudioProcessingConfig = {}) {
    const lowLatency = config.lowLatencyMode ?? false;

    this.config = {
      decimationRate: config.decimationRate ?? (lowLatency ? 8 : 4),
      enableSpeakerDetection: config.enableSpeakerDetection ?? !lowLatency,
      enableBreathDetection: config.enableBreathDetection ?? true,
      enableGeminiEmotion: config.enableGeminiEmotion ?? false,
      enableProsodyAnalysis: config.enableProsodyAnalysis ?? true,
      lowLatencyMode: lowLatency,
      prosodyBatchSize: config.prosodyBatchSize ?? (lowLatency ? 20 : 10),
    };

    log.debug({ config: this.config }, 'Audio processing optimizer initialized');
  }

  /**
   * Determine if a frame should be processed by non-critical analyzers
   * Uses frame decimation to reduce processing load
   */
  shouldProcessFrame(): boolean {
    this.frameCount++;

    // Always process every Nth frame
    return this.frameCount % this.config.decimationRate === 0;
  }

  /**
   * Check if speaker detection should run
   */
  shouldRunSpeakerDetection(): boolean {
    return this.config.enableSpeakerDetection && this.shouldProcessFrame();
  }

  /**
   * Check if breath detection should run
   */
  shouldRunBreathDetection(): boolean {
    return this.config.enableBreathDetection;
  }

  /**
   * Check if prosody analysis should run on this frame
   */
  shouldRunProsodyAnalysis(): boolean {
    return this.config.enableProsodyAnalysis;
  }

  /**
   * Check if Gemini emotion analysis should run
   */
  shouldRunGeminiEmotion(): boolean {
    return this.config.enableGeminiEmotion && this.shouldProcessFrame();
  }

  /**
   * Add frame to prosody batch
   * Returns true if batch is ready for processing
   */
  addToProsodyBatch(frame: { data: Int16Array; sampleRate: number; channels: number }): boolean {
    if (!this.config.enableProsodyAnalysis) return false;

    this.prosodyBuffer.push(frame);
    return this.prosodyBuffer.length >= this.config.prosodyBatchSize;
  }

  /**
   * Get and clear prosody batch
   */
  getProsodyBatch(): Array<{ data: Int16Array; sampleRate: number; channels: number }> {
    const batch = this.prosodyBuffer;
    this.prosodyBuffer = [];
    return batch;
  }

  /**
   * Record frame processing result
   */
  recordFrameProcessing(processed: boolean, processingTimeMs?: number): void {
    if (processed) {
      this.processedCount++;
    } else {
      this.skippedCount++;
    }

    if (processingTimeMs !== undefined) {
      this.processingTimes.push(processingTimeMs);
      // Keep only last 100 samples
      if (this.processingTimes.length > 100) {
        this.processingTimes.shift();
      }
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): AudioProcessingMetrics {
    const analyzersEnabled: string[] = [];
    if (this.config.enableProsodyAnalysis) analyzersEnabled.push('prosody');
    if (this.config.enableBreathDetection) analyzersEnabled.push('breath');
    if (this.config.enableSpeakerDetection) analyzersEnabled.push('speaker');
    if (this.config.enableGeminiEmotion) analyzersEnabled.push('gemini');

    return {
      totalFrames: this.frameCount,
      processedFrames: this.processedCount,
      skippedFrames: this.skippedCount,
      decimationRate: this.config.decimationRate,
      avgProcessingTimeMs:
        this.processingTimes.length > 0
          ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
          : 0,
      analyzersEnabled,
    };
  }

  /**
   * Switch to low latency mode (reduces processing)
   */
  enableLowLatencyMode(): void {
    if (this.config.lowLatencyMode) return;

    log.info('Switching to low-latency audio processing mode');
    this.config.lowLatencyMode = true;
    this.config.decimationRate = 8;
    this.config.enableSpeakerDetection = false;
    this.config.prosodyBatchSize = 20;
  }

  /**
   * Switch to normal mode (full processing)
   */
  disableLowLatencyMode(): void {
    if (!this.config.lowLatencyMode) return;

    log.info('Switching to normal audio processing mode');
    this.config.lowLatencyMode = false;
    this.config.decimationRate = 4;
    this.config.enableSpeakerDetection = true;
    this.config.prosodyBatchSize = 10;
  }

  /**
   * Reset counters
   */
  reset(): void {
    this.frameCount = 0;
    this.processedCount = 0;
    this.skippedCount = 0;
    this.processingTimes = [];
    this.prosodyBuffer = [];
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const sessionOptimizers = new Map<string, AudioProcessingOptimizer>();

/**
 * Get or create an audio processing optimizer for a session
 */
export function getAudioProcessingOptimizer(
  sessionId: string,
  config?: AudioProcessingConfig
): AudioProcessingOptimizer {
  let optimizer = sessionOptimizers.get(sessionId);
  if (!optimizer) {
    optimizer = new AudioProcessingOptimizer(config);
    sessionOptimizers.set(sessionId, optimizer);
  }
  return optimizer;
}

/**
 * Clear optimizer for a session
 */
export function clearAudioProcessingOptimizer(sessionId: string): void {
  sessionOptimizers.delete(sessionId);
}

/**
 * Get all session metrics
 */
export function getAllAudioProcessingMetrics(): Map<string, AudioProcessingMetrics> {
  const metrics = new Map<string, AudioProcessingMetrics>();
  Array.from(sessionOptimizers.entries()).forEach(([sessionId, optimizer]) => {
    metrics.set(sessionId, optimizer.getMetrics());
  });
  return metrics;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Create a low-latency mode optimizer
 */
export function createLowLatencyOptimizer(sessionId: string): AudioProcessingOptimizer {
  return getAudioProcessingOptimizer(sessionId, { lowLatencyMode: true });
}

/**
 * Create a full-processing optimizer
 */
export function createFullProcessingOptimizer(sessionId: string): AudioProcessingOptimizer {
  return getAudioProcessingOptimizer(sessionId, { lowLatencyMode: false });
}

export default {
  AudioProcessingOptimizer,
  getAudioProcessingOptimizer,
  clearAudioProcessingOptimizer,
  createLowLatencyOptimizer,
  createFullProcessingOptimizer,
  getAllAudioProcessingMetrics,
};
