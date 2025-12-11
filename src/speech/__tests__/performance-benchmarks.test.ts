/**
 * Speech Pipeline Performance Benchmarks
 *
 * Establishes performance baselines for critical speech operations.
 * Use these benchmarks to:
 * - Detect performance regressions
 * - Validate optimization improvements
 * - Set SLOs for speech pipeline operations
 *
 * Run with: npm test -- --run src/speech/__tests__/performance-benchmarks.test.ts
 *
 * @module performance-benchmarks.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Services to benchmark
import {
  getHumanListeningPipeline,
  resetAllHumanListeningPipelines,
  type HumanListeningContext,
} from '../human-listening-pipeline.js';

import {
  calculateDynamicSpeed,
  type SpeedControlContext,
} from '../adaptive-ssml/dynamic-speed-control.js';

import {
  RealTimeAudioAnalyzer,
  type RealTimeAnalyzerConfig,
} from '../audio-prosody/real-time-analyzer.js';

import {
  detectPhraseBoundary,
  estimateSyntacticCompleteness,
} from '../enhanced-turn-prediction.js';

import {
  humanizeText,
  mapContextToEmotion,
  type EmotionContext,
} from '../advanced-humanization.js';

import {
  cleanupSpeechSession,
  registerSpeechSession,
} from '../session-cleanup.js';

import type { ProsodyFeatures } from '../audio-prosody.js';

// ============================================================================
// BENCHMARK CONFIGURATION
// ============================================================================

const BENCHMARK_CONFIG = {
  // Number of iterations for each benchmark
  iterations: 100,

  // Performance targets (in milliseconds)
  targets: {
    // Human listening pipeline
    humanListeningFull: 100,    // Full analysis should be < 100ms
    humanListeningQuick: 10,    // Quick analysis should be < 10ms

    // Dynamic speed calculation
    dynamicSpeedCalc: 1,        // Should be < 1ms

    // Phrase boundary detection
    phraseBoundary: 0.5,        // Should be < 0.5ms

    // Syntactic completeness
    syntacticCheck: 0.5,        // Should be < 0.5ms

    // Text humanization
    textHumanize: 5,            // Should be < 5ms

    // Real-time audio chunk processing
    audioChunkProcess: 5,       // Should be < 5ms per chunk

    // Session cleanup
    sessionCleanup: 50,         // Should be < 50ms
  },
};

// ============================================================================
// TEST HELPERS
// ============================================================================

const createMockProsody = (overrides: Partial<ProsodyFeatures> = {}): ProsodyFeatures => ({
  pitchMean: 150,
  pitchVariance: 20,
  pitchRange: 50,
  pitchContour: 'flat',
  energyMean: -20,
  energyVariance: 5,
  energyPeaks: 2,
  speechRate: 4,
  pauseDuration: 200,
  pauseFrequency: 3,
  jitter: 0.01,
  shimmer: 0.02,
  breathiness: 0.1,
  utteranceDuration: 2000,
  speakingRatio: 0.8,
  ...overrides,
});

const createMockListeningContext = (
  sessionId: string,
  overrides: Partial<HumanListeningContext> = {}
): HumanListeningContext => ({
  sessionId,
  text: 'I feel like things are getting better, but sometimes I still worry about the future.',
  turnNumber: 5,
  ...overrides,
});

const createMockSpeedContext = (
  overrides: Partial<SpeedControlContext> = {}
): SpeedControlContext => ({
  userEngagement: 0.7,
  contentComplexity: 0.4,
  emotionalIntensity: 0.5,
  baseSpeed: 1.0,
  userWPM: 140,
  topicWeight: 'medium',
  turnNumber: 5,
  ...overrides,
});

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  target: number;
  passed: boolean;
}

/**
 * Run a benchmark and return statistics
 */
function runBenchmark(
  name: string,
  fn: () => void,
  target: number,
  iterations = BENCHMARK_CONFIG.iterations
): BenchmarkResult {
  const times: number[] = [];

  // Warmup (5 iterations)
  for (let i = 0; i < 5; i++) {
    fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  // Calculate statistics
  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / iterations;

  const result: BenchmarkResult = {
    name,
    iterations,
    totalMs: Math.round(total * 100) / 100,
    avgMs: Math.round(avg * 1000) / 1000,
    minMs: Math.round(sorted[0] * 1000) / 1000,
    maxMs: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
    p50Ms: Math.round(sorted[Math.floor(iterations * 0.5)] * 1000) / 1000,
    p95Ms: Math.round(sorted[Math.floor(iterations * 0.95)] * 1000) / 1000,
    p99Ms: Math.round(sorted[Math.floor(iterations * 0.99)] * 1000) / 1000,
    target,
    passed: avg < target,
  };

  return result;
}

/**
 * Run an async benchmark
 */
async function runAsyncBenchmark(
  name: string,
  fn: () => Promise<void>,
  target: number,
  iterations = BENCHMARK_CONFIG.iterations
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 3; i++) {
    await fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = total / iterations;

  return {
    name,
    iterations,
    totalMs: Math.round(total * 100) / 100,
    avgMs: Math.round(avg * 1000) / 1000,
    minMs: Math.round(sorted[0] * 1000) / 1000,
    maxMs: Math.round(sorted[sorted.length - 1] * 1000) / 1000,
    p50Ms: Math.round(sorted[Math.floor(iterations * 0.5)] * 1000) / 1000,
    p95Ms: Math.round(sorted[Math.floor(iterations * 0.95)] * 1000) / 1000,
    p99Ms: Math.round(sorted[Math.floor(iterations * 0.99)] * 1000) / 1000,
    target,
    passed: avg < target,
  };
}

/**
 * Log benchmark result
 */
function logBenchmarkResult(result: BenchmarkResult): void {
  const status = result.passed ? '✅' : '❌';
  console.log(`
${status} ${result.name}
   avg: ${result.avgMs}ms (target: <${result.target}ms)
   min: ${result.minMs}ms | p50: ${result.p50Ms}ms | p95: ${result.p95Ms}ms | p99: ${result.p99Ms}ms | max: ${result.maxMs}ms
   total: ${result.totalMs}ms over ${result.iterations} iterations
`);
}

// ============================================================================
// BENCHMARKS
// ============================================================================

describe('Performance Benchmarks', () => {
  const sessionId = 'benchmark-session';

  beforeEach(() => {
    registerSpeechSession(sessionId);
  });

  afterEach(() => {
    cleanupSpeechSession(sessionId, { reason: 'normal', verbose: false });
  });

  // -------------------------------------------------------------------------
  // HUMAN LISTENING PIPELINE
  // -------------------------------------------------------------------------

  describe('Human Listening Pipeline', () => {
    it('should complete quick analysis within target', () => {
      const pipeline = getHumanListeningPipeline(sessionId);

      const result = runBenchmark(
        'HumanListening.quickAnalyze',
        () => {
          pipeline.quickAnalyze('I think this is going well, maybe.', 3);
        },
        BENCHMARK_CONFIG.targets.humanListeningQuick
      );

      logBenchmarkResult(result);

      // Quick analysis should be very fast
      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.humanListeningQuick);
    });

    it('should complete full analysis within target', async () => {
      const pipeline = getHumanListeningPipeline(sessionId);
      const context = createMockListeningContext(sessionId);

      const result = await runAsyncBenchmark(
        'HumanListening.analyze (full)',
        async () => {
          await pipeline.analyze(context);
        },
        BENCHMARK_CONFIG.targets.humanListeningFull,
        50 // Fewer iterations for async
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.humanListeningFull);
    });
  });

  // -------------------------------------------------------------------------
  // DYNAMIC SPEED CONTROL
  // -------------------------------------------------------------------------

  describe('Dynamic Speed Control', () => {
    it('should calculate speed within target', () => {
      const context = createMockSpeedContext();

      const result = runBenchmark(
        'DynamicSpeed.calculate',
        () => {
          calculateDynamicSpeed(context);
        },
        BENCHMARK_CONFIG.targets.dynamicSpeedCalc
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.dynamicSpeedCalc);
    });
  });

  // -------------------------------------------------------------------------
  // PHRASE BOUNDARY DETECTION
  // -------------------------------------------------------------------------

  describe('Phrase Boundary Detection', () => {
    it('should detect phrase boundaries within target', () => {
      const currentProsody = createMockProsody({ pitchMean: 120 });
      const previousProsody = createMockProsody({ pitchMean: 160 });

      const result = runBenchmark(
        'PhraseBoundary.detect',
        () => {
          detectPhraseBoundary(currentProsody, previousProsody);
        },
        BENCHMARK_CONFIG.targets.phraseBoundary
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.phraseBoundary);
    });
  });

  // -------------------------------------------------------------------------
  // SYNTACTIC COMPLETENESS
  // -------------------------------------------------------------------------

  describe('Syntactic Completeness', () => {
    it('should check syntactic completeness within target', () => {
      const texts = [
        'I think we should move forward.',
        'What do you think about',
        'Yes.',
        'The thing is, I was wondering if maybe',
      ];

      const result = runBenchmark(
        'SyntacticCompleteness.estimate',
        () => {
          for (const text of texts) {
            estimateSyntacticCompleteness(text);
          }
        },
        BENCHMARK_CONFIG.targets.syntacticCheck * texts.length
      );

      logBenchmarkResult(result);

      expect(result.avgMs / texts.length).toBeLessThan(BENCHMARK_CONFIG.targets.syntacticCheck);
    });
  });

  // -------------------------------------------------------------------------
  // TEXT HUMANIZATION
  // -------------------------------------------------------------------------

  describe('Text Humanization', () => {
    it('should humanize text within target', () => {
      const text = 'I understand how you feel. That must be really difficult.';
      const context: EmotionContext = {
        agentIntent: 'comforting',
        userEmotion: 'sad',
        topicWeight: 'heavy',
        relationshipStage: 'friend',
        personaId: 'ferni',
      };

      const result = runBenchmark(
        'TextHumanization.humanize',
        () => {
          humanizeText(text, {
            personaId: 'ferni',
            emotionContext: context,
            fillers: true,
            breathGroups: true,
            rhythmVariation: true,
            emotionMapping: true,
          });
        },
        BENCHMARK_CONFIG.targets.textHumanize
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.textHumanize);
    });

    it('should map emotions within target', () => {
      const contexts: EmotionContext[] = [
        { agentIntent: 'comforting', userEmotion: 'sad', topicWeight: 'heavy', relationshipStage: 'friend' },
        { agentIntent: 'celebrating', userEmotion: 'happy', topicWeight: 'light', relationshipStage: 'friend' },
        { agentIntent: 'supportive', userEmotion: 'anxious', topicWeight: 'medium', relationshipStage: 'friend' },
      ];

      const result = runBenchmark(
        'EmotionMapping.map',
        () => {
          for (const ctx of contexts) {
            mapContextToEmotion(ctx);
          }
        },
        1 // Should be < 1ms total for all 3
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // REAL-TIME AUDIO ANALYZER
  // -------------------------------------------------------------------------

  describe('Real-Time Audio Analyzer', () => {
    it('should process audio chunks within target', () => {
      const analyzer = new RealTimeAudioAnalyzer({
        sampleRate: 16000,
        windowSize: 512,
      });

      // Generate mock audio samples
      const chunkSize = 256;
      const chunk = new Float32Array(chunkSize);
      for (let i = 0; i < chunkSize; i++) {
        chunk[i] = Math.sin(i * 0.1) * 0.5;
      }

      const result = runBenchmark(
        'RealTimeAnalyzer.processChunk',
        () => {
          analyzer.processChunk(chunk);
        },
        BENCHMARK_CONFIG.targets.audioChunkProcess
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.audioChunkProcess);

      analyzer.reset();
    });
  });

  // -------------------------------------------------------------------------
  // SESSION CLEANUP
  // -------------------------------------------------------------------------

  describe('Session Cleanup', () => {
    it('should clean up session within target', () => {
      // Note: We create new sessions for each iteration
      let cleanupSessionId: string;

      const result = runBenchmark(
        'SessionCleanup.cleanup',
        () => {
          cleanupSessionId = `cleanup-${Date.now()}-${Math.random()}`;
          registerSpeechSession(cleanupSessionId);

          // Initialize some services (like a real session would)
          getHumanListeningPipeline(cleanupSessionId);

          // Now clean up
          cleanupSpeechSession(cleanupSessionId, { reason: 'normal', verbose: false });
        },
        BENCHMARK_CONFIG.targets.sessionCleanup,
        30 // Fewer iterations due to overhead
      );

      logBenchmarkResult(result);

      expect(result.avgMs).toBeLessThan(BENCHMARK_CONFIG.targets.sessionCleanup);
    });
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------

  describe('Performance Summary', () => {
    it('should generate performance baseline report', () => {
      console.log('\n📊 PERFORMANCE BASELINE REPORT\n');
      console.log('========================================');
      console.log(`Date: ${new Date().toISOString()}`);
      console.log(`Iterations: ${BENCHMARK_CONFIG.iterations}`);
      console.log('========================================\n');

      console.log('Targets:');
      Object.entries(BENCHMARK_CONFIG.targets).forEach(([key, value]) => {
        console.log(`  ${key}: <${value}ms`);
      });

      console.log('\n========================================\n');

      // This test always passes - it's just for reporting
      expect(true).toBe(true);
    });
  });
});
