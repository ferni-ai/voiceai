/**
 * Memory Lifecycle Tests
 *
 * Tests for decay, consolidation, and preference prediction.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { StoredMemory } from '../../unified-store/types.js';
import { DecayManager, resetDecayManager } from '../decay-manager.js';
import { ConsolidationManager, resetConsolidationManager } from '../consolidation-manager.js';
import { PreferencePredictor, resetPreferencePredictor, type PreferenceDataPoint } from '../preference-predictor.js';
import { ScheduledMaintenance, resetScheduledMaintenance } from '../scheduled-maintenance.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockMemory(overrides: Partial<StoredMemory> = {}): StoredMemory {
  const now = new Date();
  return {
    id: `mem_${Math.random().toString(36).slice(2)}`,
    userId: 'test-user',
    type: 'entity',
    content: 'Test memory content',
    embedding: [],
    createdAt: now,
    lastAccessedAt: now,
    updatedAt: now,
    accessCount: 1,
    emotionalWeight: 0.5,
    strength: 1.0,
    importance: 0.5,
    isProtected: false,
    isActiveCommitment: false,
    topics: [],
    personaIds: [],
    peopleMentioned: [],
    metadata: {},
    storageLayer: 'memory',
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// DECAY MANAGER TESTS
// ============================================================================

describe('Decay Manager', () => {
  let manager: DecayManager;

  beforeEach(() => {
    resetDecayManager();
    manager = new DecayManager();
  });

  afterEach(() => {
    resetDecayManager();
  });

  it('should calculate decay for recently accessed memory', () => {
    const memory = createMockMemory({
      strength: 1.0,
      lastAccessedAt: new Date(),
    });

    const result = manager.calculateDecay(memory);

    expect(result.newStrength).toBeCloseTo(1.0, 1);
    expect(result.decayAmount).toBeLessThan(0.1);
    expect(result.shouldCleanup).toBe(false);
  });

  it('should apply more decay to old memories', () => {
    const recentMemory = createMockMemory({
      strength: 1.0,
      lastAccessedAt: new Date(),
    });

    const oldMemory = createMockMemory({
      strength: 1.0,
      lastAccessedAt: daysAgo(30),
    });

    const recentResult = manager.calculateDecay(recentMemory);
    const oldResult = manager.calculateDecay(oldMemory);

    expect(oldResult.newStrength).toBeLessThan(recentResult.newStrength);
    expect(oldResult.decayAmount).toBeGreaterThan(recentResult.decayAmount);
  });

  it('should protect high emotional weight memories', () => {
    const normalMemory = createMockMemory({
      strength: 0.5,
      emotionalWeight: 0.2,
      lastAccessedAt: daysAgo(30),
    });

    const emotionalMemory = createMockMemory({
      strength: 0.5,
      emotionalWeight: 0.9,
      lastAccessedAt: daysAgo(30),
    });

    const normalResult = manager.calculateDecay(normalMemory);
    const emotionalResult = manager.calculateDecay(emotionalMemory);

    // Emotional memory should decay less
    expect(emotionalResult.newStrength).toBeGreaterThan(normalResult.newStrength);
    expect(emotionalResult.protectionFactors.some((f) => f.type === 'emotional')).toBe(true);
  });

  it('should protect active commitments', () => {
    const memory = createMockMemory({
      strength: 0.3,
      isActiveCommitment: true,
      lastAccessedAt: daysAgo(60),
    });

    const result = manager.calculateDecay(memory);

    expect(result.protectionFactors.some((f) => f.type === 'commitment')).toBe(true);
    expect(result.shouldCleanup).toBe(false);
  });

  it('should protect explicitly protected memories', () => {
    const memory = createMockMemory({
      strength: 0.1,
      isProtected: true,
      lastAccessedAt: daysAgo(400),
    });

    const result = manager.calculateDecay(memory);

    expect(result.protectionFactors.some((f) => f.type === 'explicit')).toBe(true);
    expect(result.shouldCleanup).toBe(false);
  });

  it('should protect frequently accessed memories', () => {
    const rarelyAccessed = createMockMemory({
      strength: 0.5,
      accessCount: 1,
      lastAccessedAt: daysAgo(30),
    });

    const frequentlyAccessed = createMockMemory({
      strength: 0.5,
      accessCount: 20,
      lastAccessedAt: daysAgo(30),
    });

    const rareResult = manager.calculateDecay(rarelyAccessed);
    const frequentResult = manager.calculateDecay(frequentlyAccessed);

    expect(frequentResult.newStrength).toBeGreaterThan(rareResult.newStrength);
    expect(frequentResult.protectionFactors.some((f) => f.type === 'frequency')).toBe(true);
  });

  it('should mark very old weak memories for cleanup', () => {
    const memory = createMockMemory({
      strength: 0.05,
      lastAccessedAt: daysAgo(400),
      isProtected: false,
      isActiveCommitment: false,
    });

    const result = manager.calculateDecay(memory);

    expect(result.shouldCleanup).toBe(true);
    expect(result.cleanupReason).toBeDefined();
  });

  it('should process batch of memories', async () => {
    const memories = [
      createMockMemory({ strength: 1.0, lastAccessedAt: new Date() }),
      createMockMemory({ strength: 0.8, lastAccessedAt: daysAgo(10) }),
      createMockMemory({ strength: 0.5, lastAccessedAt: daysAgo(30) }),
    ];

    const result = await manager.applyDecay(memories);

    expect(result.processed).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// CONSOLIDATION MANAGER TESTS
// ============================================================================

describe('Consolidation Manager', () => {
  let manager: ConsolidationManager;

  beforeEach(() => {
    resetConsolidationManager();
    manager = new ConsolidationManager();
  });

  afterEach(() => {
    resetConsolidationManager();
  });

  it('should find consolidation groups with high similarity', () => {
    // Create similar embeddings
    const embedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const embedding2 = [0.11, 0.19, 0.31, 0.39, 0.51]; // Very similar

    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['career', 'goals'],
        type: 'entity',
        embedding: embedding1,
        createdAt: daysAgo(30),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['career', 'goals'],
        type: 'entity',
        embedding: embedding2,
        createdAt: daysAgo(20),
      }),
      createMockMemory({
        id: 'mem3',
        topics: ['family', 'health'],
        type: 'insight',
        embedding: [0.9, 0.8, 0.7, 0.6, 0.5], // Different
        createdAt: daysAgo(15),
      }),
    ];

    const groups = manager.findConsolidationGroups(memories);

    // Should group mem1 and mem2 together (similar embeddings + topics + type)
    expect(groups.length).toBeGreaterThan(0);
    const firstGroup = groups[0];
    expect(firstGroup.members.length).toBeGreaterThanOrEqual(2);
  });

  it('should not consolidate protected memories', () => {
    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['career'],
        isProtected: true,
        createdAt: daysAgo(30),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['career'],
        createdAt: daysAgo(20),
      }),
    ];

    const groups = manager.findConsolidationGroups(memories);

    // Protected memory should not be in any group
    for (const group of groups) {
      expect(group.members.some((m) => m.id === 'mem1')).toBe(false);
    }
  });

  it('should not consolidate active commitments', () => {
    const memories = [
      createMockMemory({
        id: 'mem1',
        topics: ['career'],
        isActiveCommitment: true,
        createdAt: daysAgo(30),
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['career'],
        createdAt: daysAgo(20),
      }),
    ];

    const groups = manager.findConsolidationGroups(memories);

    for (const group of groups) {
      expect(group.members.some((m) => m.id === 'mem1')).toBe(false);
    }
  });

  it('should consolidate group into single memory', async () => {
    const members = [
      createMockMemory({
        id: 'mem1',
        topics: ['career', 'goals'],
        peopleMentioned: ['Boss'],
        importance: 0.8,
        emotionalWeight: 0.6,
        accessCount: 5,
      }),
      createMockMemory({
        id: 'mem2',
        topics: ['career', 'promotion'],
        peopleMentioned: ['HR'],
        importance: 0.5,
        emotionalWeight: 0.7,
        accessCount: 3,
      }),
    ];

    const group = {
      representative: members[0],
      members,
      averageSimilarity: 0.9,
      combinedTopics: ['career', 'goals', 'promotion'],
      combinedPeople: ['Boss', 'HR'],
      maxEmotionalWeight: 0.7,
    };

    const result = await manager.consolidateGroup(group);

    expect(result.consolidated).toBeDefined();
    expect(result.consolidated!.topics).toContain('career');
    expect(result.consolidated!.topics).toContain('promotion');
    expect(result.consolidated!.peopleMentioned).toContain('Boss');
    expect(result.consolidated!.peopleMentioned).toContain('HR');
    expect(result.consolidated!.emotionalWeight).toBe(0.7);
    expect(result.consolidated!.importance).toBe(0.8);
    expect(result.consolidated!.accessCount).toBe(8);
    expect(result.originalIds).toHaveLength(2);
  });

  it('should estimate storage reduction', () => {
    const memories = [
      createMockMemory({ id: 'mem1', topics: ['career', 'goals'], createdAt: daysAgo(30) }),
      createMockMemory({ id: 'mem2', topics: ['career', 'goals'], createdAt: daysAgo(20) }),
      createMockMemory({ id: 'mem3', topics: ['family'], createdAt: daysAgo(15) }),
    ];

    const estimate = manager.estimateReduction(memories);

    expect(estimate.currentCount).toBe(3);
    expect(estimate.estimatedCount).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// PREFERENCE PREDICTOR TESTS
// ============================================================================

describe('Preference Predictor', () => {
  let predictor: PreferencePredictor;

  beforeEach(() => {
    resetPreferencePredictor();
    predictor = new PreferencePredictor();
  });

  afterEach(() => {
    resetPreferencePredictor();
  });

  it('should record and predict preferences', () => {
    const userId = 'test-user';

    // Record positive responses for career topic
    for (let i = 0; i < 10; i++) {
      predictor.recordDataPoint(userId, {
        subject: 'career',
        subjectType: 'topic',
        response: 0.9, // High engagement
        timestamp: new Date(),
      });
    }

    const prediction = predictor.predictPreference(userId, 'career', 'topic');

    expect(prediction.predictedReceptivity).toBeGreaterThan(0.7);
    expect(prediction.confidence).toBeGreaterThan(0.5);
    // Use toBeCloseTo for floating point comparison
    expect(prediction.dataPoints).toBeCloseTo(10, 5);
  });

  it('should predict low receptivity for deflected topics', () => {
    const userId = 'test-user';

    // Record negative responses
    for (let i = 0; i < 10; i++) {
      predictor.recordDataPoint(userId, {
        subject: 'politics',
        subjectType: 'topic',
        response: 0.1, // Deflected
        timestamp: new Date(),
      });
    }

    const prediction = predictor.predictPreference(userId, 'politics', 'topic');

    expect(prediction.predictedReceptivity).toBeLessThan(0.3);
  });

  it('should return neutral prediction for unknown topics', () => {
    const userId = 'test-user';

    const prediction = predictor.predictPreference(userId, 'unknown', 'topic');

    expect(prediction.predictedReceptivity).toBe(0.5);
    expect(prediction.confidence).toBeLessThan(0.3);
    expect(prediction.dataPoints).toBe(0);
  });

  it('should get positive and negative preferences', () => {
    const userId = 'test-user';

    // Record positive for career
    for (let i = 0; i < 10; i++) {
      predictor.recordDataPoint(userId, {
        subject: 'career',
        subjectType: 'topic',
        response: 0.9,
        timestamp: new Date(),
      });
    }

    // Record negative for politics
    for (let i = 0; i < 10; i++) {
      predictor.recordDataPoint(userId, {
        subject: 'politics',
        subjectType: 'topic',
        response: 0.1,
        timestamp: new Date(),
      });
    }

    const positive = predictor.getPositivePreferences(userId);
    const negative = predictor.getNegativePreferences(userId);

    expect(positive.some((p) => p.subject === 'career')).toBe(true);
    expect(negative.some((p) => p.subject === 'politics')).toBe(true);
  });

  it('should export and import preferences', () => {
    const userId = 'test-user';

    // Record some data
    predictor.recordDataPoint(userId, {
      subject: 'career',
      subjectType: 'topic',
      response: 0.9,
      timestamp: new Date(),
    });

    // Export
    const exported = predictor.exportPreferences(userId);
    expect(exported.aggregated.length).toBeGreaterThan(0);
    expect(exported.dataPoints.length).toBeGreaterThan(0);

    // Reset and import
    resetPreferencePredictor();
    const newPredictor = new PreferencePredictor();
    newPredictor.importPreferences(userId, exported);

    const prediction = newPredictor.predictPreference(userId, 'career', 'topic');
    expect(prediction.dataPoints).toBeGreaterThan(0);
  });
});

// ============================================================================
// SCHEDULED MAINTENANCE TESTS
// ============================================================================

describe('Scheduled Maintenance', () => {
  let maintenance: ScheduledMaintenance;

  beforeEach(() => {
    resetScheduledMaintenance();
    maintenance = new ScheduledMaintenance();
  });

  afterEach(() => {
    resetScheduledMaintenance();
  });

  it('should have default jobs configured', () => {
    const jobs = maintenance.getJobs();

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((j) => j.type === 'decay')).toBe(true);
    expect(jobs.some((j) => j.type === 'consolidation')).toBe(true);
    expect(jobs.some((j) => j.type === 'cleanup')).toBe(true);
  });

  it('should run decay job', async () => {
    const memories = [
      createMockMemory({ strength: 1.0, lastAccessedAt: daysAgo(10) }),
      createMockMemory({ strength: 0.8, lastAccessedAt: daysAgo(20) }),
    ];

    const result = await maintenance.runJob(
      'daily-decay',
      'test-user',
      async () => memories
    );

    expect(result.success).toBe(true);
    expect(result.itemsProcessed).toBe(2);
  });

  it('should calculate health stats', async () => {
    const memories = [
      createMockMemory({ strength: 1.0 }), // Healthy (>0.5)
      createMockMemory({ strength: 0.6 }), // Healthy (>0.5)
      createMockMemory({ strength: 0.3 }), // Decaying (0.1-0.5)
      createMockMemory({ strength: 0.05, isProtected: true }), // At risk (<0.1), Protected
      createMockMemory({ strength: 0.8, isActiveCommitment: true }), // Healthy, Commitment
    ];

    const stats = await maintenance.getHealthStats(memories);

    expect(stats.totalMemories).toBe(5);
    expect(stats.healthyMemories).toBe(3); // 1.0, 0.6, 0.8 are > 0.5
    expect(stats.decayingMemories).toBe(1); // 0.3 is between 0.1-0.5
    expect(stats.atRiskMemories).toBe(1); // 0.05 is < 0.1
    expect(stats.protectedMemories).toBe(1);
    expect(stats.activeCommitments).toBe(1);
  });

  it('should enable/disable jobs', () => {
    maintenance.setJobEnabled('daily-decay', false);
    const jobs = maintenance.getJobs();
    const decayJob = jobs.find((j) => j.name === 'daily-decay');

    expect(decayJob?.enabled).toBe(false);
  });

  it('should track running job state', () => {
    // Jobs should not be running initially
    expect(maintenance.isJobRunning('daily-decay')).toBe(false);
  });
});
