/**
 * Audio Analysis Worker Pool
 *
 * Uses Node.js worker_threads to offload CPU-intensive audio analysis
 * from the main event loop. This prevents prosody analysis from
 * causing audio dropouts or latency spikes.
 *
 * Operations offloaded:
 * - Prosody feature extraction (pitch, energy, rate)
 * - Voice emotion classification
 * - Laughter detection
 * - Speech/silence boundary detection
 *
 * Architecture:
 * - Pool of N worker threads (default: 2)
 * - Round-robin job distribution
 * - Automatic scaling based on load
 */

/* eslint-disable no-await-in-loop -- Sequential processing required for worker thread management */

import { Worker, isMainThread } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLogger } from '../utils/safe-logger.js';

// Get the directory of this module for worker file resolution
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

const log = createLogger({ module: 'AudioAnalysisPool' });

// ============================================================================
// TYPES
// ============================================================================

export interface AudioAnalysisJob {
  id: string;
  type: 'prosody' | 'emotion' | 'laughter' | 'boundaries';
  audioData: Float32Array;
  sampleRate: number;
  sessionId: string;
}

export interface AudioAnalysisResult {
  jobId: string;
  type: AudioAnalysisJob['type'];
  result: ProsodyResult | EmotionResult | LaughterResult | BoundaryResult;
  durationMs: number;
}

export interface ProsodyResult {
  pitchMean: number;
  pitchRange: number;
  pitchVariance: number;
  energyMean: number;
  energyVariance: number;
  speechRate: number;
  pauseFrequency: number;
  pauseDuration: number;
}

export interface EmotionResult {
  primary: string;
  secondary?: string;
  confidence: number;
  arousal: number;
  valence: number;
}

export interface LaughterResult {
  isLaughing: boolean;
  confidence: number;
  laughType?: 'genuine' | 'polite' | 'nervous';
  duration?: number;
}

export interface BoundaryResult {
  speechSegments: Array<{ start: number; end: number }>;
  silenceSegments: Array<{ start: number; end: number }>;
  breathPauses: Array<{ position: number; duration: number }>;
}

// ============================================================================
// WORKER POOL
// ============================================================================

// Backpressure: max jobs queued before rejecting
const MAX_QUEUE_DEPTH = 100;

class AudioAnalysisWorkerPool {
  private workers: Worker[] = [];
  private jobQueue: Array<{
    job: AudioAnalysisJob;
    resolve: (r: AudioAnalysisResult) => void;
    reject: (e: Error) => void;
  }> = [];
  private pendingJobs = new Map<
    string,
    { resolve: (r: AudioAnalysisResult) => void; reject: (e: Error) => void }
  >();
  private activeJobs = new Map<string, { worker: Worker; startTime: number }>();
  private currentWorkerIndex = 0;
  private poolSize: number;
  private isShuttingDown = false;
  private stats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    avgProcessingMs: 0,
    processingTimes: [] as number[],
  };

  // PERFORMANCE: Increased default from 2 to 4 for better parallelism
  constructor(poolSize = 4) {
    this.poolSize = poolSize;
  }

  /**
   * Initialize the worker pool
   */
  initialize(): void {
    if (!isMainThread) {
      throw new Error('AudioAnalysisWorkerPool must be initialized from main thread');
    }

    log.info({ poolSize: this.poolSize }, 'Initializing audio analysis worker pool');

    for (let i = 0; i < this.poolSize; i++) {
      const worker = this.createWorker();
      this.workers.push(worker);
    }

    log.info({ workerCount: this.workers.length }, 'Audio analysis worker pool ready');
  }

  /**
   * Create a worker thread
   *
   * SECURITY: Worker code is loaded from a separate file, NOT via eval().
   * This prevents code injection vulnerabilities.
   */
  private createWorker(): Worker {
    // Load worker from separate file (secure - no eval)
    const workerPath = join(currentDir, 'audio-analysis-worker-thread.js');
    const worker = new Worker(workerPath);

    worker.on('message', (result: AudioAnalysisResult | { jobId: string; error: string }) => {
      const active = this.activeJobs.get(result.jobId);
      if (active) {
        this.activeJobs.delete(result.jobId);

        // Get pending job callbacks and clean up
        const pending = this.pendingJobs.get(result.jobId);
        if (pending) {
          this.pendingJobs.delete(result.jobId);

          if ('error' in result) {
            pending.reject(new Error(result.error));
            this.stats.failedJobs++;
          } else {
            pending.resolve(result);

            // Update stats
            this.stats.completedJobs++;
            this.stats.processingTimes.push(result.durationMs);
            if (this.stats.processingTimes.length > 100) {
              this.stats.processingTimes.shift();
            }
            this.stats.avgProcessingMs =
              this.stats.processingTimes.reduce((a, b) => a + b, 0) /
              this.stats.processingTimes.length;
          }
        }
      }

      // Process next job
      this.processNextJob();
    });

    worker.on('error', (error) => {
      log.warn({ error: String(error) }, 'Audio analysis worker error');
    });

    return worker;
  }

  /**
   * Submit an analysis job
   */
  async analyze(job: AudioAnalysisJob): Promise<AudioAnalysisResult> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    // Backpressure check
    if (this.jobQueue.length >= MAX_QUEUE_DEPTH) {
      throw new Error('Audio analysis queue full (backpressure)');
    }

    this.stats.totalJobs++;

    return new Promise((resolve, reject) => {
      this.pendingJobs.set(job.id, { resolve, reject });
      this.jobQueue.push({ job, resolve, reject });
      this.processNextJob();
    });
  }

  /**
   * Process next job in queue
   */
  private processNextJob(): void {
    if (this.jobQueue.length === 0) return;
    if (this.workers.length === 0) return;

    // Find available worker
    const availableWorker = this.workers[this.currentWorkerIndex];
    if (availableWorker === null) return;
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;

    // Remove from queue (prevents memory leak)
    const queueItem = this.jobQueue.shift();
    if (!queueItem) return;
    const { job } = queueItem;

    // Transfer audio data to worker
    this.activeJobs.set(job.id, { worker: availableWorker, startTime: Date.now() });
    availableWorker.postMessage(job);
  }

  /**
   * Get pool stats
   */
  getStats(): typeof this.stats & { activeJobs: number; queueLength: number } {
    return {
      ...this.stats,
      activeJobs: this.activeJobs.size,
      queueLength: this.jobQueue.length,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Wait for active jobs
    while (this.activeJobs.size > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    }

    // Terminate workers
    for (const worker of this.workers) {
      await worker.terminate();
    }

    this.workers = [];
    log.info('Audio analysis worker pool shut down');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let poolInstance: AudioAnalysisWorkerPool | null = null;

/**
 * Get the audio analysis worker pool
 */
export function getAudioAnalysisPool(): AudioAnalysisWorkerPool {
  if (poolInstance) {
    return poolInstance;
  }
  // Create new instance (non-concurrent singleton creation)
  const instance = new AudioAnalysisWorkerPool(2);
  poolInstance = instance;
  return instance;
}

/**
 * Initialize the audio analysis worker pool
 */
export function initializeAudioAnalysisPool(): void {
  const pool = getAudioAnalysisPool();
  pool.initialize();
}

/**
 * Shutdown the audio analysis worker pool
 */
export async function shutdownAudioAnalysisPool(): Promise<void> {
  const instance = poolInstance;
  if (instance) {
    poolInstance = null;
    await instance.shutdown();
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Analyze prosody features (offloaded to worker)
 */
export async function analyzeProsodyAsync(
  audioData: Float32Array,
  sampleRate: number,
  sessionId: string
): Promise<ProsodyResult> {
  const pool = getAudioAnalysisPool();
  const result = await pool.analyze({
    id: `prosody_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'prosody',
    audioData,
    sampleRate,
    sessionId,
  });
  return result.result as ProsodyResult;
}

/**
 * Classify emotion from audio (offloaded to worker)
 */
export async function classifyEmotionAsync(
  audioData: Float32Array,
  sampleRate: number,
  sessionId: string
): Promise<EmotionResult> {
  const pool = getAudioAnalysisPool();
  const result = await pool.analyze({
    id: `emotion_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'emotion',
    audioData,
    sampleRate,
    sessionId,
  });
  return result.result as EmotionResult;
}

/**
 * Detect laughter (offloaded to worker)
 */
export async function detectLaughterAsync(
  audioData: Float32Array,
  sampleRate: number,
  sessionId: string
): Promise<LaughterResult> {
  const pool = getAudioAnalysisPool();
  const result = await pool.analyze({
    id: `laughter_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: 'laughter',
    audioData,
    sampleRate,
    sessionId,
  });
  return result.result as LaughterResult;
}

export default AudioAnalysisWorkerPool;
