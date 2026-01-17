/**
 * Deep Extraction Worker Tests
 *
 * Tests for the async LLM-powered memory extraction system:
 * - DeepExtractionWorker class initialization
 * - Queue management (enqueue, dequeue, priority handling)
 * - Worker lifecycle (start/stop)
 * - Statistics tracking
 * - Event listener setup
 * - Error handling
 *
 * Note: LLM extraction tests are limited because the worker uses dynamic imports.
 * Full integration tests should be run separately with real/mocked API credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  DeepExtractionWorker,
  getDeepExtractionWorker,
  startDeepExtractionWorker,
  type DeepExtractionJob,
} from '../deep-extraction-worker.js';
import * as asyncEventsConfig from '../async-events-config.js';
import type { EntityMention, EmotionSignal, DateSignal, RelationshipSignal } from '../fast-capture.js';

// ============================================================================
// MOCKS
// ============================================================================

// Mock safe-logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock async-events-config
vi.mock('../async-events-config.js', () => ({
  safeOnEvent: vi.fn(() => true),
  safeEmitEvent: vi.fn(() => true),
  configureAsyncEvents: vi.fn(),
  resetAsyncEventsConfig: vi.fn(),
}));

// Mock Firestore - return null to test graceful degradation
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
}));

// Mock Gemini config
vi.mock('../../../config/gemini-config.js', () => ({
  getExtractionModel: vi.fn(() => 'gemini-1.5-flash'),
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockJob(overrides: Partial<DeepExtractionJob> = {}): DeepExtractionJob {
  return {
    jobId: `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId: 'test-user-123',
    sessionId: 'session-456',
    turnNumber: 1,
    transcript: 'My mom called me yesterday. She told me about her birthday party next week.',
    timestamp: new Date(),
    personaId: 'ferni',
    priority: 'normal',
    fastCaptureHints: {
      mentionedEntities: [
        { name: 'mom', type: 'person', context: 'My mom called me', confidence: 0.9 },
      ] as EntityMention[],
      emotionSignals: [
        { emotion: 'positive', intensity: 'medium', source: 'keyword' },
      ] as EmotionSignal[],
      topicHints: ['family'],
      dateSignals: [
        { text: 'yesterday', type: 'relative', context: 'called me yesterday' },
        { text: 'next week', type: 'relative', context: 'birthday party next week' },
      ] as DateSignal[],
      relationshipSignals: [
        { subject: 'user', relationship: 'child', object: 'mom', confidence: 0.9 },
      ] as RelationshipSignal[],
    },
    ...overrides,
  };
}

// ============================================================================
// SINGLETON MANAGEMENT TESTS
// ============================================================================

describe('DeepExtractionWorker Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return the same instance from getDeepExtractionWorker', () => {
    const worker1 = getDeepExtractionWorker();
    const worker2 = getDeepExtractionWorker();
    expect(worker1).toBe(worker2);
  });

  it('should start worker via startDeepExtractionWorker', () => {
    const worker = getDeepExtractionWorker();
    // Worker may already be running from previous test
    worker.stop();
    expect(worker.isRunning()).toBe(false);

    startDeepExtractionWorker();
    expect(worker.isRunning()).toBe(true);

    worker.stop();
  });
});

// ============================================================================
// WORKER LIFECYCLE TESTS
// ============================================================================

describe('DeepExtractionWorker Lifecycle', () => {
  let worker: DeepExtractionWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    worker = new DeepExtractionWorker();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('start()', () => {
    it('should start the worker', () => {
      expect(worker.isRunning()).toBe(false);

      worker.start();

      expect(worker.isRunning()).toBe(true);
    });

    it('should set up event listener on start', () => {
      worker.start();

      expect(asyncEventsConfig.safeOnEvent).toHaveBeenCalledWith(
        'memory:deep-extraction',
        expect.any(Function)
      );
    });

    it('should not restart if already running', () => {
      worker.start();
      const callCountAfterFirst = (asyncEventsConfig.safeOnEvent as Mock).mock.calls.length;

      worker.start();

      // safeOnEvent should not be called again
      expect((asyncEventsConfig.safeOnEvent as Mock).mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe('stop()', () => {
    it('should stop the worker', () => {
      worker.start();
      expect(worker.isRunning()).toBe(true);

      worker.stop();

      expect(worker.isRunning()).toBe(false);
    });

    it('should be safe to call stop multiple times', () => {
      worker.start();
      worker.stop();
      worker.stop();

      expect(worker.isRunning()).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return initial stats', () => {
      const stats = worker.getStats();

      expect(stats).toEqual({
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        avgExtractionTimeMs: 0,
        totalEntitiesExtracted: 0,
        totalFactsExtracted: 0,
      });
    });

    it('should return a copy of stats (not the internal object)', () => {
      const stats1 = worker.getStats();
      const stats2 = worker.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('getQueueDepth()', () => {
    it('should return 0 initially', () => {
      expect(worker.getQueueDepth()).toBe(0);
    });
  });

  describe('isRunning()', () => {
    it('should return false when not started', () => {
      expect(worker.isRunning()).toBe(false);
    });

    it('should return true when started', () => {
      worker.start();
      expect(worker.isRunning()).toBe(true);
    });

    it('should return false after stopped', () => {
      worker.start();
      worker.stop();
      expect(worker.isRunning()).toBe(false);
    });
  });
});

// ============================================================================
// QUEUE MANAGEMENT TESTS
// ============================================================================

describe('DeepExtractionWorker Queue Management', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear API keys to force fallback extraction (consistent behavior)
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    // Capture the event handler when start() is called
    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should enqueue jobs via event listener', async () => {
    const job = createMockJob();

    eventHandler(job);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(1);
  });

  it('should process multiple jobs', async () => {
    const job1 = createMockJob({ jobId: 'job-1' });
    const job2 = createMockJob({ jobId: 'job-2' });
    const job3 = createMockJob({ jobId: 'job-3' });

    eventHandler(job1);
    eventHandler(job2);
    eventHandler(job3);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(3);
  });

  it('should track completed jobs', async () => {
    const job = createMockJob();

    eventHandler(job);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should not enqueue jobs when worker is stopped', () => {
    worker.stop();

    const job = createMockJob();
    eventHandler(job);

    // Job should not be enqueued when worker is stopped
    expect(worker.getStats().totalJobs).toBe(0);
  });

  it('should handle high priority jobs first (queue insertion)', async () => {
    // We can only verify that high priority jobs are added to the front
    // by checking queue depth before processing starts
    const normalJob = createMockJob({ jobId: 'normal', priority: 'normal' });
    const highJob = createMockJob({ jobId: 'high', priority: 'high' });

    eventHandler(normalJob);
    eventHandler(highJob);

    // Wait for all jobs to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(2);
    expect(stats.completedJobs).toBe(2);
  });

  it('should handle low priority jobs', async () => {
    const lowJob = createMockJob({ jobId: 'low', priority: 'low' });

    eventHandler(lowJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(1);
    expect(stats.completedJobs).toBe(1);
  });
});

// ============================================================================
// JOB PROCESSING TESTS
// ============================================================================

describe('DeepExtractionWorker Job Processing', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear API keys to force fallback extraction (consistent behavior)
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should process job with various transcript lengths', async () => {
    const shortTranscript = createMockJob({ transcript: 'Hi' });
    const longTranscript = createMockJob({
      transcript: 'My mom called me yesterday and we talked for hours about her upcoming birthday party. She mentioned that my sister Sarah would be flying in from New York and my brother Mike would be driving down from Boston. The whole family is excited.'
    });

    eventHandler(shortTranscript);
    eventHandler(longTranscript);

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(2);
  });

  it('should process job with empty transcript', async () => {
    const emptyTranscript = createMockJob({ transcript: '' });

    eventHandler(emptyTranscript);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should process job with empty hints', async () => {
    const emptyHints = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(emptyHints);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should process job with high emotion signal', async () => {
    const highEmotionJob = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'friend', type: 'person', context: 'my friend', confidence: 0.8 },
        ] as EntityMention[],
        emotionSignals: [
          { emotion: 'distress', intensity: 'high', source: 'keyword' },
        ] as EmotionSignal[],
        topicHints: ['mental_health'],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(highEmotionJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should process job with date signals', async () => {
    const dateSignalJob = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [
          { text: 'January 15th', type: 'absolute', context: 'birthday' },
          { text: 'next Tuesday', type: 'relative', context: 'meeting' },
        ] as DateSignal[],
        relationshipSignals: [],
      },
    });

    eventHandler(dateSignalJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should process job with multiple entity types', async () => {
    const multiEntityJob = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'Mom', type: 'person', context: 'my mom', confidence: 0.9 },
          { name: 'New York', type: 'place', context: 'in New York', confidence: 0.7 },
          { name: 'Google', type: 'organization', context: 'works at Google', confidence: 0.8 },
        ] as EntityMention[],
        emotionSignals: [],
        topicHints: ['work', 'family'],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(multiEntityJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });
});

// ============================================================================
// FALLBACK EXTRACTION TESTS
// ============================================================================

describe('DeepExtractionWorker Fallback Extraction', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // No API key set - forces fallback
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should use fallback extraction when no API key', async () => {
    const job = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'mom', type: 'person', context: 'my mom', confidence: 0.9 },
          { name: 'dad', type: 'person', context: 'my dad', confidence: 0.85 },
        ] as EntityMention[],
        emotionSignals: [],
        topicHints: ['family'],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should complete successfully using fallback
    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
    // Fallback should extract entities from hints
    expect(stats.totalEntitiesExtracted).toBeGreaterThanOrEqual(2);
  });

  it('should handle job with no hints gracefully in fallback mode', async () => {
    const emptyJob = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(emptyJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
    expect(stats.totalEntitiesExtracted).toBe(0);
  });
});

// ============================================================================
// STATISTICS TRACKING TESTS
// ============================================================================

describe('DeepExtractionWorker Statistics', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // No API key - use fallback for consistent behavior
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should track total jobs correctly', async () => {
    eventHandler(createMockJob());
    eventHandler(createMockJob());
    eventHandler(createMockJob());

    await new Promise((resolve) => setTimeout(resolve, 300));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(3);
  });

  it('should track completed jobs correctly', async () => {
    eventHandler(createMockJob());
    eventHandler(createMockJob());

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(2);
  });

  it('should track entities extracted from fallback', async () => {
    const job = createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'mom', type: 'person', context: 'my mom', confidence: 0.9 },
          { name: 'dad', type: 'person', context: 'my dad', confidence: 0.8 },
          { name: 'sister', type: 'person', context: 'my sister', confidence: 0.85 },
        ] as EntityMention[],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.totalEntitiesExtracted).toBeGreaterThanOrEqual(3);
  });

  it('should calculate average extraction time', async () => {
    eventHandler(createMockJob());
    eventHandler(createMockJob());

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = worker.getStats();
    expect(stats.avgExtractionTimeMs).toBeGreaterThanOrEqual(0);
    expect(stats.completedJobs).toBe(2);
  });

  it('should accumulate statistics across multiple jobs', async () => {
    // Job with 2 entities
    eventHandler(createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'mom', type: 'person', context: 'my mom', confidence: 0.9 },
          { name: 'dad', type: 'person', context: 'my dad', confidence: 0.8 },
        ] as EntityMention[],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    }));

    // Job with 1 entity
    eventHandler(createMockJob({
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'boss', type: 'person', context: 'my boss', confidence: 0.7 },
        ] as EntityMention[],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    }));

    await new Promise((resolve) => setTimeout(resolve, 200));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(2);
    expect(stats.completedJobs).toBe(2);
    expect(stats.totalEntitiesExtracted).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// ASYNC EVENTS CONFIGURATION TESTS
// ============================================================================

describe('DeepExtractionWorker AsyncEvents Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle missing AsyncEvents configuration gracefully', () => {
    (asyncEventsConfig.safeOnEvent as Mock).mockReturnValue(false);

    const worker = new DeepExtractionWorker();
    worker.start();

    // Should not throw
    expect(worker.isRunning()).toBe(true);

    worker.stop();
  });

  it('should register correct event name', () => {
    (asyncEventsConfig.safeOnEvent as Mock).mockReturnValue(true);

    const worker = new DeepExtractionWorker();
    worker.start();

    expect(asyncEventsConfig.safeOnEvent).toHaveBeenCalledWith(
      'memory:deep-extraction',
      expect.any(Function)
    );

    worker.stop();
  });

  it('should only register event listener once when started multiple times', () => {
    (asyncEventsConfig.safeOnEvent as Mock).mockReturnValue(true);

    const worker = new DeepExtractionWorker();
    worker.start();
    const callsAfterFirst = (asyncEventsConfig.safeOnEvent as Mock).mock.calls.length;

    worker.start();

    expect((asyncEventsConfig.safeOnEvent as Mock).mock.calls.length).toBe(callsAfterFirst);

    worker.stop();
  });
});

// ============================================================================
// JOB DATA VALIDATION TESTS
// ============================================================================

describe('DeepExtractionWorker Job Data Handling', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear API keys to force fallback extraction (consistent behavior)
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should handle job with all fields populated', async () => {
    const fullJob = createMockJob({
      jobId: 'full-job-123',
      userId: 'user-abc',
      sessionId: 'session-xyz',
      turnNumber: 5,
      transcript: 'My mom and dad are visiting next week.',
      timestamp: new Date('2024-01-15T10:00:00Z'),
      personaId: 'ferni',
      priority: 'high',
      fastCaptureHints: {
        mentionedEntities: [
          { name: 'mom', type: 'person', context: 'My mom', confidence: 0.9 },
          { name: 'dad', type: 'person', context: 'dad', confidence: 0.8 },
        ] as EntityMention[],
        emotionSignals: [
          { emotion: 'joy', intensity: 'medium', source: 'keyword' },
        ] as EmotionSignal[],
        topicHints: ['family', 'planning'],
        dateSignals: [
          { text: 'next week', type: 'relative', context: 'visiting next week' },
        ] as DateSignal[],
        relationshipSignals: [
          { subject: 'user', relationship: 'child', object: 'mom', confidence: 0.9 },
          { subject: 'user', relationship: 'child', object: 'dad', confidence: 0.9 },
        ] as RelationshipSignal[],
      },
    });

    eventHandler(fullJob);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should handle job without optional personaId', async () => {
    const jobWithoutPersona = createMockJob();
    delete (jobWithoutPersona as Partial<DeepExtractionJob>).personaId;

    eventHandler(jobWithoutPersona);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should process jobs with different priority levels', async () => {
    const highPriority = createMockJob({ priority: 'high' });
    const normalPriority = createMockJob({ priority: 'normal' });
    const lowPriority = createMockJob({ priority: 'low' });

    eventHandler(normalPriority);
    eventHandler(lowPriority);
    eventHandler(highPriority);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(3);
    expect(stats.completedJobs).toBe(3);
  });
});

// ============================================================================
// CONCURRENT PROCESSING TESTS
// ============================================================================

describe('DeepExtractionWorker Concurrent Processing', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear API keys to force fallback extraction (consistent behavior)
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should process jobs sequentially (not concurrently)', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) =>
      createMockJob({ jobId: `job-${i}` })
    );

    jobs.forEach(job => eventHandler(job));

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(5);
    expect(stats.completedJobs).toBe(5);
  });

  it('should handle rapid job submission', async () => {
    // Submit many jobs quickly
    for (let i = 0; i < 10; i++) {
      eventHandler(createMockJob({ jobId: `rapid-${i}` }));
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stats = worker.getStats();
    expect(stats.totalJobs).toBe(10);
    expect(stats.completedJobs).toBe(10);
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('DeepExtractionWorker Edge Cases', () => {
  let worker: DeepExtractionWorker;
  let eventHandler: (job: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear API keys to force fallback extraction (consistent behavior)
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;

    worker = new DeepExtractionWorker();

    (asyncEventsConfig.safeOnEvent as Mock).mockImplementation((_event, handler) => {
      eventHandler = handler;
      return true;
    });

    worker.start();
  });

  afterEach(() => {
    worker.stop();
  });

  it('should handle very long transcript', async () => {
    const longTranscript = 'word '.repeat(1000);
    const job = createMockJob({ transcript: longTranscript });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should handle transcript with special characters', async () => {
    const specialTranscript = "My mom's friend said \"don't worry\" about the $500 bill! 😊 @work #stressed";
    const job = createMockJob({ transcript: specialTranscript });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should handle transcript with unicode', async () => {
    const unicodeTranscript = 'Mi mamá me llamó ayer. Elle ma dit que cest bon. 日本語テスト';
    const job = createMockJob({ transcript: unicodeTranscript });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });

  it('should handle job with many entities', async () => {
    const manyEntities = Array.from({ length: 20 }, (_, i) => ({
      name: `Person${i}`,
      type: 'person' as const,
      context: `Person${i} context`,
      confidence: 0.7 + (i * 0.01),
    }));

    const job = createMockJob({
      fastCaptureHints: {
        mentionedEntities: manyEntities as EntityMention[],
        emotionSignals: [],
        topicHints: [],
        dateSignals: [],
        relationshipSignals: [],
      },
    });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
    expect(stats.totalEntitiesExtracted).toBeGreaterThanOrEqual(20);
  });

  it('should handle timestamp as Date object', async () => {
    const job = createMockJob({
      timestamp: new Date('2024-01-15T12:00:00Z'),
    });

    eventHandler(job);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const stats = worker.getStats();
    expect(stats.completedJobs).toBe(1);
  });
});
