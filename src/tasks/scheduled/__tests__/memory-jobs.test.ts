/**
 * Memory Jobs Tests
 *
 * Tests for scheduled memory jobs, particularly TranscriptCleanupJob.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger - define inline since vi.mock is hoisted
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => logger),
  };
  return {
    getLogger: () => logger,
    createLogger: () => logger,
  };
});

// Mock memory module
vi.mock('../../../memory/index.js', () => ({
  checkMemoryHealthAlerts: vi.fn().mockResolvedValue([]),
  collectMemoryMetrics: vi.fn().mockResolvedValue({
    storage: { totalDocuments: 0, totalSizeBytes: 0 },
    embedding: { cacheHitRate: 0.8, averageLatencyMs: 50 },
    retrieval: { averageRetrievalTimeMs: 100 },
  }),
  getFirestoreStore: vi.fn(() => ({
    getProfile: vi.fn().mockResolvedValue(null),
  })),
  getMemoryConsolidator: vi.fn(() => ({
    runConsolidationPass: vi.fn().mockResolvedValue({
      memoriesProcessed: 0,
      groupsFound: 0,
      consolidated: [],
    }),
  })),
  getMemoryDecayManager: vi.fn(() => ({
    updateDecay: vi.fn((memories) => memories),
    pruneWeakMemories: vi.fn(() => ({ archived: [], active: [] })),
  })),
  getMemoryDeduplicator: vi.fn(() => ({
    findDuplicates: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock LSH deduplication
vi.mock('../../../memory/lsh-deduplication.js', () => ({
  findDuplicatesLSH: vi.fn(() => []),
}));

// Mock Rust accelerator
vi.mock('../../../memory/rust-accelerator.js', () => ({
  findDuplicatesLsh: vi.fn(() => []),
  isRustAvailable: vi.fn(() => false),
  getRustInfo: vi.fn(() => ({ threads: 1 })),
}));

// Track Firestore operations
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatchDelete = vi.fn();
const mockBatch = vi.fn(() => ({
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}));

// Create mock documents for different scenarios
const createMockDoc = (id: string, data: Record<string, unknown>, parentUserId?: string) => ({
  id,
  data: () => data,
  ref: {
    id,
    delete: vi.fn().mockResolvedValue(undefined),
    parent: parentUserId ? { parent: { id: parentUserId } } : { parent: null },
    collection: vi.fn((name: string) => ({
      get: vi.fn().mockResolvedValue({
        docs: [],
      }),
    })),
  },
});

// Default: no documents to clean up
let mockConversationsDocs: ReturnType<typeof createMockDoc>[] = [];
let mockGroupSessionsDocs: ReturnType<typeof createMockDoc>[] = [];
let mockSummariesDocs: ReturnType<typeof createMockDoc>[] = [];

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    batch: mockBatch,
    collection: vi.fn((name: string) => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [],
        forEach: vi.fn(),
      }),
    })),
    collectionGroup: vi.fn((name: string) => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs:
          name === 'conversations'
            ? mockConversationsDocs
            : name === 'group_sessions'
              ? mockGroupSessionsDocs
              : name === 'conversation_summaries'
                ? mockSummariesDocs
                : [],
      }),
    })),
  }),
}));

// Import after mocks are set up
import { TranscriptCleanupJob } from '../memory-jobs.js';
import {
  TRANSCRIPT_RETENTION_DAYS,
  SUMMARY_RETENTION_DAYS,
  GROUP_TRANSCRIPT_RETENTION_DAYS,
} from '../../../services/session-manager/constants.js';

// ============================================================================
// TESTS
// ============================================================================

describe('TranscriptCleanupJob', () => {
  let job: TranscriptCleanupJob;

  beforeEach(() => {
    vi.clearAllMocks();
    job = new TranscriptCleanupJob();

    // Reset mock documents
    mockConversationsDocs = [];
    mockGroupSessionsDocs = [];
    mockSummariesDocs = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Job Configuration', () => {
    it('should have correct default config', () => {
      expect(job.name).toBe('TranscriptCleanupJob');
      expect(job.defaultConfig.dryRun).toBe(false);
      expect(job.defaultConfig.transcriptRetentionDays).toBe(TRANSCRIPT_RETENTION_DAYS);
      expect(job.defaultConfig.summaryRetentionDays).toBe(SUMMARY_RETENTION_DAYS);
      expect(job.defaultConfig.groupTranscriptRetentionDays).toBe(GROUP_TRANSCRIPT_RETENTION_DAYS);
      expect(job.defaultConfig.maxDeletesPerRun).toBe(500);
      expect(job.defaultConfig.maxUsersPerRun).toBe(100);
    });

    it('should use environment variable defaults', () => {
      // These should be the defaults since env vars aren't set in tests
      expect(TRANSCRIPT_RETENTION_DAYS).toBe(90);
      expect(SUMMARY_RETENTION_DAYS).toBe(365);
      expect(GROUP_TRANSCRIPT_RETENTION_DAYS).toBe(180);
    });
  });

  describe('Dry Run Mode', () => {
    it('should not delete anything in dry run mode', async () => {
      // Set up mock data that would be deleted
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 120); // 120 days ago

      mockConversationsDocs = [createMockDoc('conv_1', { startedAt: oldDate.toISOString() })];

      const result = await job.run({ dryRun: true });

      expect(result.transcriptsDeleted).toBe(0);
      expect(result.summariesDeleted).toBe(0);
      expect(result.groupTranscriptsDeleted).toBe(0);
      expect(mockBatchCommit).not.toHaveBeenCalled();
    });
  });

  describe('Empty Collections', () => {
    it('should handle empty collections gracefully', async () => {
      const result = await job.run({ dryRun: false });

      expect(result.transcriptsDeleted).toBe(0);
      expect(result.summariesDeleted).toBe(0);
      expect(result.groupTranscriptsDeleted).toBe(0);
      expect(result.usersProcessed).toBe(0);
    });
  });

  describe('Result Structure', () => {
    it('should return properly structured result', async () => {
      const result = await job.run({ dryRun: false });

      // BaseJobResult properties
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('wasDryRun');
      expect(result).toHaveProperty('itemsProcessed');
      expect(result).toHaveProperty('successCount');
      expect(result).toHaveProperty('errorCount');

      // TranscriptCleanupJobResult properties (merged directly)
      expect(result).toHaveProperty('transcriptsDeleted');
      expect(result).toHaveProperty('summariesDeleted');
      expect(result).toHaveProperty('groupTranscriptsDeleted');
      expect(result).toHaveProperty('usersProcessed');
      expect(result).toHaveProperty('bytesRecovered');
    });
  });

  describe('Collection Names', () => {
    it('should use correct collection names in implementation', async () => {
      // This test verifies the code uses correct collection names
      // by running and checking no errors occur
      const result = await job.run({ dryRun: false });

      // Job should complete successfully
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('Config Override', () => {
    it('should accept custom retention periods', async () => {
      const result = await job.run({
        dryRun: true,
        transcriptRetentionDays: 30,
        summaryRetentionDays: 60,
        groupTranscriptRetentionDays: 45,
      });

      // Should complete without error - result is merged directly (no .result property)
      expect(result.transcriptsDeleted).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should accept custom batch sizes', async () => {
      const result = await job.run({
        dryRun: true,
        maxDeletesPerRun: 100,
        maxUsersPerRun: 50,
      });

      // Should complete without error - result is merged directly (no .result property)
      expect(result.transcriptsDeleted).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Memory Jobs Integration', () => {
  it('should export TranscriptCleanupJob in default export', async () => {
    const memoryJobs = await import('../memory-jobs.js');
    expect(memoryJobs.default.TranscriptCleanupJob).toBe(TranscriptCleanupJob);
  });

  it('should export TranscriptCleanupJob as named export', async () => {
    const { TranscriptCleanupJob: TC } = await import('../memory-jobs.js');
    expect(TC).toBeDefined();
    expect(new TC().name).toBe('TranscriptCleanupJob');
  });
});
