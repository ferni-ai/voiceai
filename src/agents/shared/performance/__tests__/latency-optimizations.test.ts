/**
 * Latency Optimizations Integration Tests
 *
 * Validates that WS1-WS4 latency optimization workstreams:
 * - Respect their feature flags (disabled by default)
 * - Produce expected outputs when enabled
 * - Integrate correctly with the e2e-latency-tracker
 *
 * @module agents/shared/performance/__tests__/latency-optimizations
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS — must be before imports that use them
// ============================================================================

// Mock dynamic imports used by SpeculativeContextBuilder
vi.mock('../../../../intelligence/predictive/index.js', () => ({
  getPredictiveIntelligenceContext: vi.fn().mockResolvedValue('predictive context data'),
}));

vi.mock('../../../processors/injection-builders.js', () => ({
  buildCrossPersonaInsightsInjection: vi.fn().mockResolvedValue({
    category: 'cross-persona',
    content: 'cross-persona insights',
    priority: 70,
  }),
}));

// Mock speculative TTS (used by cache-aware-tts)
vi.mock('../../../../services/performance/speculative-tts.js', () => ({
  getTTSWithSpeculation: vi.fn().mockResolvedValue({ cached: false, audio: new ArrayBuffer(0) }),
  warmupTTSVoice: vi.fn().mockResolvedValue(undefined),
  speculateTTS: vi.fn().mockResolvedValue(undefined),
}));

// Mock conversational audio cache
vi.mock('../../conversational-audio-cache.js', () => ({
  getCachedAudio: vi.fn().mockReturnValue(null),
}));

// Mock greeting audio prewarm
vi.mock('../greeting-audio-prewarm.js', () => ({
  getPrewarmedGreetingAudio: vi.fn().mockReturnValue(null),
}));

// Mock SSML processor
vi.mock('../../../../speech/tts-gateway/ssml/index.js', () => ({
  getSSMLProcessor: vi.fn().mockReturnValue({
    parse: (text: string) => ({ cleanText: text }),
    createBufferTransform: () =>
      new TransformStream({ transform(chunk, ctrl) { ctrl.enqueue(chunk); } }),
  }),
}));

// Mock unified TTS cache
vi.mock('../../../../services/tts/index.js', () => ({
  getTTSCache: vi.fn().mockReturnValue(null),
}));

// Mock AudioFrame (LiveKit native dependency)
vi.mock('@livekit/rtc-node', () => ({
  AudioFrame: class MockAudioFrame {
    data: Int16Array;
    sampleRate: number;
    channels: number;
    samplesPerChannel: number;
    constructor(data: Int16Array, sr: number, ch: number, spc: number) {
      this.data = data;
      this.sampleRate = sr;
      this.channels = ch;
      this.samplesPerChannel = spc;
    }
  },
}));

// Mock LiveKit agents voice module
vi.mock('@livekit/agents', () => ({
  voice: {
    Agent: {
      default: {
        ttsNode: vi.fn().mockResolvedValue(null),
      },
    },
  },
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  isOptimizationEnabled,
  getAllFlagStatuses,
  logFlagStatus,
} from '../latency-feature-flags.js';

import { SpeculativeContextBuilder } from '../speculative-context-builder.js';

import {
  analyzeEndpoint,
  type VoiceFeatures,
} from '../../vad-semantic-endpointer.js';

import {
  categorizeQuery,
  compressInjectionContent,
  getCompressionMetrics,
} from '../../prompt-compressor.js';

import {
  getCacheAwareTTSMetrics,
  resetCacheAwareTTSMetrics,
  processTTSWithCache,
} from '../cache-aware-tts.js';

import {
  startTurn,
  markProcessingStarted,
  markLLMRequestSent,
  markLLMFirstToken,
  markLLMComplete,
  markTTSFirstAudio,
  markAudioStarted,
  getLatencyStats,
  getCurrentTimeline,
} from '../../e2e-latency-tracker.js';

import type { ContextInjection } from '../../../../types/context-injection-types.js';

// ============================================================================
// HELPERS
// ============================================================================

function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

function clearEnv(key: string): void {
  delete process.env[key];
}

const WS_ENV_VARS = [
  'ENABLE_SPECULATIVE_CONTEXT',
  'ENABLE_SEMANTIC_VAD',
  'ENABLE_PROMPT_COMPRESSION',
  'ENABLE_CACHE_WARMING',
];

function enableAll(): void {
  for (const v of WS_ENV_VARS) setEnv(v, 'true');
}

function disableAll(): void {
  for (const v of WS_ENV_VARS) clearEnv(v);
}

function makeInjections(count: number, priorityBase = 50): ContextInjection[] {
  return Array.from({ length: count }, (_, i) => ({
    category: `cat-${i}`,
    content: `Injection content sentence one. Sentence two. Sentence three. Sentence four.`,
    priority: priorityBase + i * 10,
  }));
}

// ============================================================================
// TESTS
// ============================================================================

describe('Latency Feature Flags', () => {
  afterEach(() => disableAll());

  it('all flags are disabled by default', () => {
    disableAll();
    const statuses = getAllFlagStatuses();
    for (const [, status] of Object.entries(statuses)) {
      expect(status.enabled).toBe(false);
    }
  });

  it('enables individual flags via env vars', () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');
    expect(isOptimizationEnabled('SPECULATIVE_CONTEXT')).toBe(true);
    expect(isOptimizationEnabled('SEMANTIC_VAD')).toBe(false);
  });

  it('returns false for unknown flag names', () => {
    expect(isOptimizationEnabled('NONEXISTENT_FLAG')).toBe(false);
  });

  it('getAllFlagStatuses returns all four workstreams', () => {
    const statuses = getAllFlagStatuses();
    expect(Object.keys(statuses)).toHaveLength(4);
    expect(statuses).toHaveProperty('SPECULATIVE_CONTEXT');
    expect(statuses).toHaveProperty('SEMANTIC_VAD');
    expect(statuses).toHaveProperty('PROMPT_COMPRESSION');
    expect(statuses).toHaveProperty('CACHE_WARMING');
  });

  it('logFlagStatus runs without error', () => {
    enableAll();
    expect(() => logFlagStatus()).not.toThrow();
  });
});

// ============================================================================

describe('WS1: Speculative Context Builder', () => {
  let builder: SpeculativeContextBuilder;

  beforeEach(() => {
    builder = new SpeculativeContextBuilder();
    disableAll();
  });

  afterEach(() => disableAll());

  it('skips build when flag is disabled', async () => {
    await builder.buildSpeculative('sess-1', 'hello world', {
      userId: 'u1',
      sessionId: 'sess-1',
      personaId: 'ferni',
      services: {},
    });

    const result = builder.validateAndMerge('sess-1', 'hello world');
    expect(result.valid).toBe(false);
    expect(result.injections).toBeUndefined();
  });

  it('builds and validates speculative context when enabled', async () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');

    await builder.buildSpeculative('sess-2', 'tell me about my habits', {
      userId: 'u1',
      sessionId: 'sess-2',
      personaId: 'ferni',
      services: {},
    });

    // Validate with similar final transcript (< 30% divergence)
    const result = builder.validateAndMerge('sess-2', 'tell me about my habits');
    expect(result.valid).toBe(true);
    expect(result.injections).toBeDefined();
    expect(result.injections!.length).toBeGreaterThan(0);
  });

  it('invalidates when final transcript diverges > 30%', async () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');

    await builder.buildSpeculative('sess-3', 'tell me about my habits', {
      userId: 'u1',
      sessionId: 'sess-3',
      personaId: 'ferni',
      services: {},
    });

    // Completely different transcript
    const result = builder.validateAndMerge('sess-3', 'play some jazz music please');
    expect(result.valid).toBe(false);
  });

  it('expires cache entries after TTL', async () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');

    await builder.buildSpeculative('sess-4', 'hello', {
      userId: 'u1',
      sessionId: 'sess-4',
      personaId: 'ferni',
      services: {},
    });

    // Advance time beyond 5s TTL
    vi.useFakeTimers();
    vi.advanceTimersByTime(6000);

    const result = builder.validateAndMerge('sess-4', 'hello');
    expect(result.valid).toBe(false);

    vi.useRealTimers();
  });

  it('cleanup removes session entries', async () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');

    await builder.buildSpeculative('sess-5', 'test', {
      userId: 'u1',
      sessionId: 'sess-5',
      personaId: 'ferni',
      services: {},
    });

    builder.cleanup('sess-5');

    const result = builder.validateAndMerge('sess-5', 'test');
    expect(result.valid).toBe(false);
  });
});

// ============================================================================

describe('WS2: Semantic VAD Endpointer', () => {
  afterEach(() => disableAll());

  it('returns default 500ms when flag is disabled', () => {
    disableAll();
    const result = analyzeEndpoint('What is the weather?');
    expect(result.recommendedVADMs).toBe(500);
    expect(result.signals).toContain('disabled');
    expect(result.confidence).toBe(0);
  });

  it('returns shorter VAD for questions when enabled', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    const result = analyzeEndpoint('What is the weather?');

    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.recommendedVADMs).toBeLessThan(400);
    expect(result.signals).toContain('question_mark');
  });

  it('returns longer VAD for incomplete thoughts', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    const result = analyzeEndpoint('I was thinking about and');

    expect(result.confidence).toBeLessThan(0.5);
    expect(result.recommendedVADMs).toBeGreaterThan(300);
    expect(result.signals).toContain('incomplete_thought');
  });

  it('detects trailing off patterns', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    const result = analyzeEndpoint('Well I mean um');

    expect(result.signals).toContain('trailing_off');
    expect(result.recommendedVADMs).toBeGreaterThan(300);
  });

  it('incorporates voice features', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    const voiceFeatures: VoiceFeatures = {
      pitchTrend: 'falling',
      energy: 0.1,
    };

    const withVoice = analyzeEndpoint('Okay.', voiceFeatures);
    const withoutVoice = analyzeEndpoint('Okay.');

    expect(withVoice.confidence).toBeGreaterThan(withoutVoice.confidence);
    expect(withVoice.signals).toContain('falling_pitch');
    expect(withVoice.signals).toContain('low_energy');
  });

  it('returns max VAD for empty transcripts', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    const result = analyzeEndpoint('');
    expect(result.recommendedVADMs).toBe(450);
    expect(result.signals).toContain('empty');
  });

  it('clamps confidence to [0, 1]', () => {
    setEnv('ENABLE_SEMANTIC_VAD', 'true');
    // Multiple boosting signals: question + exclamation + falling pitch + low energy
    const result = analyzeEndpoint('Really?!', { pitchTrend: 'falling', energy: 0.05 });
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================

describe('WS3: Prompt Compressor', () => {
  afterEach(() => disableAll());

  describe('categorizeQuery', () => {
    it('categorizes greetings as simple', () => {
      expect(categorizeQuery('hello')).toBe('simple');
      expect(categorizeQuery('hey')).toBe('simple');
      expect(categorizeQuery('good morning')).toBe('simple');
    });

    it('categorizes yes/no as simple', () => {
      expect(categorizeQuery('yes')).toBe('simple');
      expect(categorizeQuery('nope')).toBe('simple');
      expect(categorizeQuery('sure')).toBe('simple');
    });

    it('categorizes emotional content as complex', () => {
      expect(categorizeQuery('I feel really anxious about the meeting tomorrow and I am worried')).toBe('complex');
    });

    it('categorizes multi-part queries as complex', () => {
      expect(categorizeQuery('Can you check my habits and also look at my schedule')).toBe('complex');
    });

    it('categorizes moderate-length questions as moderate', () => {
      expect(categorizeQuery('What did we talk about last time regarding my exercise routine')).toBe('moderate');
    });
  });

  describe('compressInjectionContent', () => {
    it('returns injections unchanged when flag is disabled', () => {
      disableAll();
      const injections = makeInjections(5);
      const result = compressInjectionContent(injections, 'simple');
      expect(result).toHaveLength(5);
    });

    it('filters low-priority injections for simple queries', () => {
      setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
      const injections = makeInjections(5, 50); // priorities: 50, 60, 70, 80, 90
      const result = compressInjectionContent(injections, 'simple');

      // Simple: only priority >= 80
      expect(result.length).toBeLessThan(injections.length);
      for (const inj of result) {
        expect(inj.priority).toBeGreaterThanOrEqual(80);
      }
    });

    it('truncates low-priority content for simple queries to 1 sentence', () => {
      setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
      const injections: ContextInjection[] = [
        {
          category: 'high',
          content: 'First sentence. Second sentence. Third sentence.',
          priority: 90,
        },
      ];
      const result = compressInjectionContent(injections, 'simple');
      expect(result[0].content).toBe('First sentence.');
    });

    it('preserves all injections for complex queries', () => {
      setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
      const injections = makeInjections(5, 30); // low priorities
      const result = compressInjectionContent(injections, 'complex');
      expect(result).toHaveLength(5);
    });

    it('filters moderate queries at priority >= 50', () => {
      setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
      const injections: ContextInjection[] = [
        { category: 'low', content: 'Low priority.', priority: 30 },
        { category: 'mid', content: 'Mid priority.', priority: 60 },
        { category: 'high', content: 'High priority.', priority: 90 },
      ];
      const result = compressInjectionContent(injections, 'moderate');
      expect(result).toHaveLength(2); // 60 and 90
    });

    it('tracks compression metrics', () => {
      setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
      const injections = makeInjections(5, 50);
      compressInjectionContent(injections, 'simple');

      const metrics = getCompressionMetrics();
      expect(metrics.totalCompressed).toBeGreaterThan(0);
      expect(metrics.avgCompressionRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.avgCompressionRatio).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================

describe('WS4: Cache-Aware TTS', () => {
  beforeEach(() => {
    resetCacheAwareTTSMetrics();
    disableAll();
  });

  afterEach(() => disableAll());

  it('tracks metrics on cache miss', async () => {
    const mockDefaultTTS = vi.fn().mockResolvedValue(
      new ReadableStream({ start(c) { c.close(); } })
    );

    await processTTSWithCache(
      'Hello, how are you doing today?',
      { voiceId: 'ferni', sessionId: 'test-sess' },
      mockDefaultTTS
    );

    const metrics = getCacheAwareTTSMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.cacheHits).toBe(0);
  });

  it('bypasses cache for very short text', async () => {
    const mockDefaultTTS = vi.fn().mockResolvedValue(
      new ReadableStream({ start(c) { c.close(); } })
    );

    await processTTSWithCache(
      'Hi',
      { voiceId: 'ferni', minCacheCheckLength: 5 },
      mockDefaultTTS
    );

    const metrics = getCacheAwareTTSMetrics();
    expect(metrics.cacheBypassedSmallText).toBe(1);
    expect(mockDefaultTTS).toHaveBeenCalledWith('Hi');
  });

  it('skips cache entirely when enableCache is false', async () => {
    const mockDefaultTTS = vi.fn().mockResolvedValue(
      new ReadableStream({ start(c) { c.close(); } })
    );

    await processTTSWithCache(
      'This is a longer sentence for testing.',
      { voiceId: 'ferni', enableCache: false },
      mockDefaultTTS
    );

    const metrics = getCacheAwareTTSMetrics();
    // Request counted but cache not checked → falls through to default
    expect(metrics.totalRequests).toBe(1);
    expect(mockDefaultTTS).toHaveBeenCalled();
  });

  it('resetCacheAwareTTSMetrics clears all counters', () => {
    // Metrics should start clean
    const metrics = getCacheAwareTTSMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.cacheMisses).toBe(0);
    expect(metrics.totalSavedLatencyMs).toBe(0);
  });
});

// ============================================================================

describe('E2E Latency Tracker — activeOptimizations', () => {
  afterEach(() => disableAll());

  it('records no active optimizations when all flags are off', () => {
    disableAll();
    startTurn('sess-opt-1', 'test');
    const timeline = getCurrentTimeline('sess-opt-1');

    expect(timeline).not.toBeNull();
    expect(timeline!.activeOptimizations).toEqual([]);
  });

  it('records active optimizations when flags are on', () => {
    setEnv('ENABLE_SPECULATIVE_CONTEXT', 'true');
    setEnv('ENABLE_SEMANTIC_VAD', 'true');

    startTurn('sess-opt-2', 'test');
    const timeline = getCurrentTimeline('sess-opt-2');

    expect(timeline).not.toBeNull();
    expect(timeline!.activeOptimizations).toContain('SPECULATIVE_CONTEXT');
    expect(timeline!.activeOptimizations).toContain('SEMANTIC_VAD');
    expect(timeline!.activeOptimizations).not.toContain('PROMPT_COMPRESSION');
    expect(timeline!.activeOptimizations).not.toContain('CACHE_WARMING');
  });

  it('records all optimizations when all flags are on', () => {
    enableAll();

    startTurn('sess-opt-3', 'test');
    const timeline = getCurrentTimeline('sess-opt-3');

    expect(timeline).not.toBeNull();
    expect(timeline!.activeOptimizations).toHaveLength(4);
  });
});

// ============================================================================

describe('E2E Latency Tracker — full timeline', () => {
  it('tracks complete turn lifecycle', () => {
    const turnId = startTurn('sess-lifecycle', 'hello');
    markProcessingStarted(turnId);
    markLLMRequestSent(turnId, 'test');
    markLLMFirstToken(turnId);
    markLLMComplete(turnId);
    markTTSFirstAudio(turnId);
    markAudioStarted(turnId);

    const stats = getLatencyStats();
    expect(stats.recentTimelines.length).toBeGreaterThanOrEqual(1);

    const last = stats.recentTimelines[stats.recentTimelines.length - 1];
    expect(last.turnId).toBe(turnId);
    expect(last.e2eTotal).toBeDefined();
    expect(last.llmTTFB).toBeDefined();
  });

  it('handles session-based lookup', () => {
    const sessionId = 'sess-lookup';
    startTurn(sessionId, 'lookup test');
    markProcessingStarted(sessionId);

    const timeline = getCurrentTimeline(sessionId);
    expect(timeline).not.toBeNull();
    expect(timeline!.processingStarted).toBeDefined();
    expect(timeline!.processingLatency).toBeDefined();
  });
});

// ============================================================================

describe('Cross-workstream integration', () => {
  afterEach(() => disableAll());

  it('prompt compressor + semantic VAD work together', () => {
    setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
    setEnv('ENABLE_SEMANTIC_VAD', 'true');

    // A simple greeting — should get short VAD and aggressive compression
    const vadResult = analyzeEndpoint('Hey!');
    expect(vadResult.confidence).toBeGreaterThan(0.5);
    expect(vadResult.recommendedVADMs).toBeLessThan(350);

    const complexity = categorizeQuery('Hey!');
    expect(complexity).toBe('simple');

    const injections = makeInjections(5, 40);
    const compressed = compressInjectionContent(injections, complexity);
    expect(compressed.length).toBeLessThan(injections.length);
  });

  it('complex queries get full context and patient VAD', () => {
    setEnv('ENABLE_PROMPT_COMPRESSION', 'true');
    setEnv('ENABLE_SEMANTIC_VAD', 'true');

    const transcript = 'I feel really overwhelmed and';
    const vadResult = analyzeEndpoint(transcript);
    // Incomplete thought + emotional => low confidence, longer wait
    expect(vadResult.recommendedVADMs).toBeGreaterThan(300);

    const complexity = categorizeQuery(transcript);
    expect(complexity).toBe('complex');

    const injections = makeInjections(5, 30);
    const compressed = compressInjectionContent(injections, complexity);
    // Complex queries keep full context
    expect(compressed).toHaveLength(5);
  });
});
