/**
 * Orchestrator Debug & Monitoring Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearABTests,
  clearSessionRecords,
  createABTest,
  createProfiler,
  endABTest,
  exportSession,
  getABTestStats,
  getABTestVariant,
  getDebugSnapshot,
  getHealthStatus,
  getSessionRecords,
  getSystemHealth,
  orchestratorDebug,
  profileOrchestration,
  recordOrchestration,
  resetAllMetrics,
  resetAllOrchestrators,
  resetConfigAdapter,
  resetPerformanceOptimizations,
  type ABTestConfig,
  type OrchestratorInput,
  type OrchestratorOutput,
} from '../orchestrator/index.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Orchestrator Debug', () => {
  const testSessionId = 'debug-test-session';
  const testPersonaId = 'ferni';

  beforeEach(() => {
    resetAllOrchestrators();
    resetConfigAdapter();
    resetAllMetrics();
    resetPerformanceOptimizations();
    clearSessionRecords();
    clearABTests();
  });

  afterEach(() => {
    resetAllOrchestrators();
    resetConfigAdapter();
    resetAllMetrics();
    resetPerformanceOptimizations();
    clearSessionRecords();
    clearABTests();
  });

  // ==========================================================================
  // DEBUG SNAPSHOT TESTS
  // ==========================================================================

  describe('Debug Snapshots', () => {
    it('should get debug snapshot', () => {
      const snapshot = getDebugSnapshot(testSessionId, testPersonaId);

      expect(snapshot).toBeDefined();
      expect(snapshot.sessionId).toBe(testSessionId);
      expect(snapshot.personaId).toBe(testPersonaId);
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.config).toBeDefined();
      expect(snapshot.metrics).toBeDefined();
      expect(snapshot.health).toBeDefined();
    });

    it('should include health indicators', () => {
      const snapshot = getDebugSnapshot(testSessionId, testPersonaId);

      expect(snapshot.health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(snapshot.health.status);
      expect(Array.isArray(snapshot.health.issues)).toBe(true);
      expect(Array.isArray(snapshot.health.recommendations)).toBe(true);
    });

    it('should include performance data', () => {
      const snapshot = getDebugSnapshot(testSessionId, testPersonaId);

      expect(snapshot.performance).toBeDefined();
      expect(typeof snapshot.performance.cacheSize).toBe('number');
      expect(snapshot.performance.circuitBreakers).toBeDefined();
    });
  });

  // ==========================================================================
  // HEALTH STATUS TESTS
  // ==========================================================================

  describe('Health Status', () => {
    it('should get health status', () => {
      const health = getHealthStatus(testSessionId);

      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(typeof health.avgLatency).toBe('number');
      expect(typeof health.p95Latency).toBe('number');
      expect(typeof health.errorRate).toBe('number');
      expect(typeof health.cacheHitRate).toBe('number');
    });

    it('should start as healthy with no data', () => {
      const health = getHealthStatus(testSessionId);
      expect(health.status).toBe('healthy');
    });

    it('should get system health', () => {
      const systemHealth = getSystemHealth();

      expect(systemHealth).toBeDefined();
      expect(typeof systemHealth.activeSessions).toBe('number');
      expect(typeof systemHealth.totalOrchestrations).toBe('number');
      expect(typeof systemHealth.avgLatency).toBe('number');
      expect(typeof systemHealth.errorRate).toBe('number');
      expect(systemHealth.status).toBeDefined();
    });
  });

  // ==========================================================================
  // SESSION RECORDING TESTS
  // ==========================================================================

  describe('Session Recording', () => {
    const mockInput: OrchestratorInput = {
      personaId: testPersonaId,
      sessionId: testSessionId,
      turnNumber: 1,
      sessionMinutes: 0,
      userMessage: 'Test message',
      rawResponse: 'Test response',
    };

    const mockOutput: OrchestratorOutput = {
      text: 'Humanized response',
      ssml: '<speak>Humanized response</speak>',
      appliedFeatures: ['speech_naturalization', 'vocal_humanization'],
      emotionalGuidance: null,
      pacing: 'normal',
      metadata: {
        timing: { analysis: 10, intelligence: 20, humanization: 30, output: 5, total: 65 },
        confidence: { analysis: 0.8, intelligence: 0.7, overall: 0.75 },
      },
    };

    it('should record orchestration', () => {
      recordOrchestration(testSessionId, mockInput, mockOutput);

      const records = getSessionRecords(testSessionId);
      expect(records.length).toBe(1);
      expect(records[0].turn).toBe(1);
    });

    it('should get session records', () => {
      recordOrchestration(testSessionId, mockInput, mockOutput);
      recordOrchestration(testSessionId, { ...mockInput, turnNumber: 2 }, mockOutput);

      const records = getSessionRecords(testSessionId);
      expect(records.length).toBe(2);
    });

    it('should export session as JSON', () => {
      recordOrchestration(testSessionId, mockInput, mockOutput);

      const exported = exportSession(testSessionId);
      expect(typeof exported).toBe('string');

      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    it('should clear session records', () => {
      recordOrchestration(testSessionId, mockInput, mockOutput);
      expect(getSessionRecords(testSessionId).length).toBe(1);

      clearSessionRecords(testSessionId);
      expect(getSessionRecords(testSessionId).length).toBe(0);
    });

    it('should return empty array for unknown session', () => {
      const records = getSessionRecords('nonexistent');
      expect(records).toEqual([]);
    });
  });

  // ==========================================================================
  // A/B TESTING TESTS
  // ==========================================================================

  describe('A/B Testing', () => {
    // Create fresh config for each test to avoid stale timestamps
    const getTestConfig = (): ABTestConfig => ({
      name: 'orchestrator-rollout',
      enabled: true,
      variants: {
        control: { useOrchestrator: false },
        treatment: { useOrchestrator: true, preset: 'therapeutic' },
      },
      trafficPercentage: 50,
      startTime: Date.now() - 1000, // 1 second ago
    });

    it('should create A/B test', () => {
      createABTest(getTestConfig());

      const stats = getABTestStats('orchestrator-rollout');
      expect(stats).toBeDefined();
    });

    it('should get variant for user', () => {
      createABTest(getTestConfig());

      const result = getABTestVariant('orchestrator-rollout', 'user-123');
      expect(result).toBeDefined();
      expect(['control', 'treatment']).toContain(result?.variant);
      expect(result?.config).toBeDefined();
    });

    it('should return consistent variant for same user', () => {
      createABTest(getTestConfig());

      const result1 = getABTestVariant('orchestrator-rollout', 'user-abc');
      const result2 = getABTestVariant('orchestrator-rollout', 'user-abc');

      expect(result1?.variant).toBe(result2?.variant);
    });

    it('should return null for disabled test', () => {
      createABTest({ ...getTestConfig(), enabled: false });

      const result = getABTestVariant('orchestrator-rollout', 'user-123');
      expect(result).toBeNull();
    });

    it('should return null for unknown test', () => {
      const result = getABTestVariant('nonexistent-test', 'user-123');
      expect(result).toBeNull();
    });

    it('should end A/B test', () => {
      createABTest(getTestConfig());
      endABTest('orchestrator-rollout');

      const result = getABTestVariant('orchestrator-rollout', 'user-123');
      expect(result).toBeNull();
    });

    it('should get A/B test stats', () => {
      createABTest(getTestConfig());

      // Assign some users - getVariant stores assignments
      const v1 = getABTestVariant('orchestrator-rollout', 'user-1');
      const v2 = getABTestVariant('orchestrator-rollout', 'user-2');
      const v3 = getABTestVariant('orchestrator-rollout', 'user-3');

      // Verify we got assignments
      expect(v1).not.toBeNull();
      expect(v2).not.toBeNull();
      expect(v3).not.toBeNull();

      const stats = getABTestStats('orchestrator-rollout');
      expect(stats).toBeDefined();
      // Stats should show the assignments (3 total)
      expect(stats!.controlCount + stats!.treatmentCount).toBe(3);
    });

    it('should clear A/B tests', () => {
      createABTest(getTestConfig());
      clearABTests();

      const stats = getABTestStats('orchestrator-rollout');
      expect(stats).toBeNull();
    });
  });

  // ==========================================================================
  // PROFILING TESTS
  // ==========================================================================

  describe('Profiling', () => {
    it('should profile async operation', async () => {
      const { result, profile } = await profileOrchestration('test-op', async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
        return 'completed';
      });

      expect(result).toBe('completed');
      expect(profile.name).toBe('test-op');
      expect(profile.durationMs).toBeGreaterThan(0);
    });

    it('should create profiler with marks', () => {
      const profiler = createProfiler();

      profiler.mark('start');
      profiler.mark('middle');
      profiler.mark('end');

      const marks = profiler.getMarks();
      expect(marks.length).toBe(3);
      expect(marks[0].name).toBe('start');
      expect(marks[1].name).toBe('middle');
      expect(marks[2].name).toBe('end');
    });

    it('should calculate deltas between marks', () => {
      const profiler = createProfiler();

      profiler.mark('a');
      profiler.mark('b');

      const marks = profiler.getMarks();
      expect(marks[1].delta).toBeGreaterThanOrEqual(0);
    });

    it('should reset profiler', () => {
      const profiler = createProfiler();

      profiler.mark('test');
      expect(profiler.getMarks().length).toBe(1);

      profiler.reset();
      expect(profiler.getMarks().length).toBe(0);
    });
  });

  // ==========================================================================
  // ORCHESTRATOR DEBUG API TESTS
  // ==========================================================================

  describe('orchestratorDebug API', () => {
    it('should expose all methods', () => {
      expect(orchestratorDebug.getSnapshot).toBeDefined();
      expect(orchestratorDebug.getHealth).toBeDefined();
      expect(orchestratorDebug.getSystemHealth).toBeDefined();
      expect(orchestratorDebug.record).toBeDefined();
      expect(orchestratorDebug.getRecords).toBeDefined();
      expect(orchestratorDebug.export).toBeDefined();
      expect(orchestratorDebug.clearRecords).toBeDefined();
      expect(orchestratorDebug.createTest).toBeDefined();
      expect(orchestratorDebug.getVariant).toBeDefined();
      expect(orchestratorDebug.getTestStats).toBeDefined();
      expect(orchestratorDebug.endTest).toBeDefined();
      expect(orchestratorDebug.clearTests).toBeDefined();
      expect(orchestratorDebug.profile).toBeDefined();
      expect(orchestratorDebug.createProfiler).toBeDefined();
      expect(orchestratorDebug.logSummary).toBeDefined();
      expect(orchestratorDebug.logFeatures).toBeDefined();
    });

    it('should work via unified API', () => {
      const snapshot = orchestratorDebug.getSnapshot(testSessionId, testPersonaId);
      expect(snapshot).toBeDefined();
    });
  });
});
