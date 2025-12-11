/**
 * Orchestrator Integration Tests
 *
 * End-to-end tests for the ConversationOrchestrator and
 * humanizer integration layer.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  // Core orchestrator
  ConversationOrchestrator,
  // Humanizer integration
  createOrchestratedHumanizer,
  getConversationOrchestrator,
  // Metrics
  getMetricsCollector,
  getOrchestratedHumanizer,
  // Config
  orchestratorConfig,
  resetAllMetrics,
  resetAllOrchestratedHumanizers,
  resetAllOrchestrators,
  resetConfigAdapter,
  resetConversationOrchestrator,
  // Performance
  resetPerformanceOptimizations,
} from '../orchestrator/index.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Orchestrator Integration', () => {
  const testSessionId = 'integration-test-session';
  const testPersonaId = 'ferni';
  const testUserId = 'test-user';

  beforeEach(() => {
    resetAllOrchestrators();
    resetConfigAdapter();
    resetAllMetrics();
    resetPerformanceOptimizations();
    resetAllOrchestratedHumanizers();
  });

  afterEach(() => {
    resetAllOrchestrators();
    resetConfigAdapter();
    resetAllMetrics();
    resetPerformanceOptimizations();
    resetAllOrchestratedHumanizers();
  });

  // ==========================================================================
  // FULL ORCHESTRATION TESTS
  // ==========================================================================

  describe('Full Orchestration Pipeline', () => {
    it('should orchestrate a simple response', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      const result = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Hello, how are you?',
        rawResponse: "I'm doing well, thanks for asking!",
      });

      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
      expect(Array.isArray(result.appliedFeatures)).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.timing).toBeDefined();
    });

    it('should apply humanization features', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      const result = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 5, // Later turn for more features
        sessionMinutes: 10,
        userMessage: 'I need some advice on my career.',
        rawResponse:
          'I think you should consider focusing on what brings you joy. Career satisfaction comes from alignment with your values.',
        wasPersonalSharing: true,
      });

      // Should have applied some features
      expect(result.appliedFeatures.length).toBeGreaterThan(0);
    });

    it('should handle emotional content appropriately', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      const result = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 3,
        sessionMinutes: 5,
        userMessage: "I've been really struggling lately. Things have been hard.",
        userEmotion: 'sad',
        rawResponse: "I hear you. That sounds really challenging. I'm here for you.",
        wasPersonalSharing: true,
        isSeriousContext: true,
      });

      // Should have emotional guidance
      expect(result.pacing).toBeDefined();
      // Pacing should be slower for emotional content
      expect(['normal', 'slower']).toContain(result.pacing);
    });

    it('should record metrics', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Test message',
        rawResponse: 'Test response',
      });

      const collector = getMetricsCollector(testSessionId, testPersonaId);
      const metrics = collector.getMetrics();

      expect(metrics.totalOrchestrations).toBe(1);
      expect(metrics.phases.total.count).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      // Empty response should not crash
      const result = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: '',
        rawResponse: '',
      });

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });

  // ==========================================================================
  // CONFIG INTEGRATION TESTS
  // ==========================================================================

  describe('Config Integration', () => {
    it('should apply persona presets', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);

      // Set therapeutic persona
      orchestrator.setPersona('ferni');
      orchestratorConfig.applyPreset('therapeutic');

      const state = orchestratorConfig.getState();
      expect(state.orchestratorFeatures.silencePresence).toBe(true);
    });

    it('should disable features via config', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      // Disable advanced humanization
      orchestratorConfig.disable('advancedHumanization');

      const result = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 5,
        sessionMinutes: 10,
        userMessage: 'Test message',
        rawResponse: 'Test response with advice.',
      });

      // Should not have advanced humanization features
      const advancedFeatures = result.appliedFeatures.filter((f) => f.startsWith('adv_'));
      expect(advancedFeatures.length).toBe(0);
    });

    it('should apply minimal preset for speed', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      orchestratorConfig.applyPreset('minimal');

      const state = orchestratorConfig.getState();
      expect(state.orchestratorFeatures.advancedHumanization).toBe(false);
      expect(state.orchestratorFeatures.deepHumanization).toBe(false);
    });
  });

  // ==========================================================================
  // HUMANIZER INTEGRATION TESTS
  // ==========================================================================

  describe('Humanizer Integration', () => {
    it('should create orchestrated humanizer', () => {
      const humanizer = createOrchestratedHumanizer(testSessionId, testPersonaId, testUserId);

      expect(humanizer).toBeDefined();
      expect(humanizer.humanizeResponseAsync).toBeDefined();
      expect(humanizer.setPersona).toBeDefined();
      expect(humanizer.reset).toBeDefined();
    });

    it('should humanize response via integration', async () => {
      const humanizer = createOrchestratedHumanizer(testSessionId, testPersonaId, testUserId);

      const result = await humanizer.humanizeResponseAsync(
        'This is a response that could be humanized.',
        {
          personaId: testPersonaId,
          turnNumber: 3,
          userMessage: 'How should I approach this?',
          topic: 'career',
        }
      );

      expect(result.text).toBeDefined();
      expect(result.ssml).toBeDefined();
      expect(result.appliedFeatures).toBeDefined();
      expect(result.orchestratorMetadata).toBeDefined();
      expect(result.orchestratorMetadata?.timing).toBeDefined();
    });

    it('should get singleton humanizer', () => {
      const humanizer1 = getOrchestratedHumanizer(testSessionId, testPersonaId);
      const humanizer2 = getOrchestratedHumanizer(testSessionId, testPersonaId);

      expect(humanizer1).toBe(humanizer2);
    });

    it('should track session time', async () => {
      const humanizer = createOrchestratedHumanizer(testSessionId, testPersonaId);

      const minutes = humanizer.getSessionMinutes();
      expect(typeof minutes).toBe('number');
      expect(minutes).toBeGreaterThanOrEqual(0);
    });

    it('should provide access to underlying orchestrator', () => {
      const humanizer = createOrchestratedHumanizer(testSessionId, testPersonaId);

      const orchestrator = humanizer.getOrchestrator();
      expect(orchestrator).toBeInstanceOf(ConversationOrchestrator);
    });
  });

  // ==========================================================================
  // PERFORMANCE TESTS
  // ==========================================================================

  describe('Performance', () => {
    it('should complete orchestration quickly', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      const startTime = Date.now();

      await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Quick test',
        rawResponse: 'Quick response',
      });

      const duration = Date.now() - startTime;

      // Should complete within 500ms for simple cases
      expect(duration).toBeLessThan(500);
    });

    it('should benefit from caching on repeated analysis', async () => {
      const orchestrator = getConversationOrchestrator(testSessionId);
      orchestrator.setPersona(testPersonaId);

      // First orchestration
      const result1 = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Same message for caching test',
        rawResponse: 'Response',
      });

      // Second orchestration with same message (should use cache)
      const result2 = await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: testSessionId,
        userId: testUserId,
        turnNumber: 2,
        sessionMinutes: 1,
        userMessage: 'Same message for caching test', // Same message
        rawResponse: 'Another response',
      });

      // Both should succeed
      expect(result1.text).toBeDefined();
      expect(result2.text).toBeDefined();

      // Check metrics for cache hits
      const collector = getMetricsCollector(testSessionId, testPersonaId);
      const metrics = collector.getMetrics();
      expect(metrics.cache.hits).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // MULTI-SESSION TESTS
  // ==========================================================================

  describe('Multi-Session', () => {
    it('should handle multiple sessions independently', async () => {
      const session1 = getConversationOrchestrator('session-1');
      const session2 = getConversationOrchestrator('session-2');

      session1.setPersona('ferni');
      session2.setPersona('peter-john');

      const result1 = await session1.orchestrate({
        personaId: 'ferni',
        sessionId: 'session-1',
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Message for Ferni',
        rawResponse: 'Response from Ferni',
      });

      const result2 = await session2.orchestrate({
        personaId: 'peter-john',
        sessionId: 'session-2',
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Message for Peter',
        rawResponse: 'Response from Peter',
      });

      expect(result1.text).toBeDefined();
      expect(result2.text).toBeDefined();

      // Check that metrics are separate
      const collector1 = getMetricsCollector('session-1', 'ferni');
      const collector2 = getMetricsCollector('session-2', 'peter-john');

      expect(collector1.getMetrics().totalOrchestrations).toBe(1);
      expect(collector2.getMetrics().totalOrchestrations).toBe(1);
    });

    it('should reset individual sessions', async () => {
      const orchestrator = getConversationOrchestrator('reset-session');
      orchestrator.setPersona(testPersonaId);

      await orchestrator.orchestrate({
        personaId: testPersonaId,
        sessionId: 'reset-session',
        turnNumber: 1,
        sessionMinutes: 0,
        userMessage: 'Test',
        rawResponse: 'Response',
      });

      resetConversationOrchestrator('reset-session');

      // New orchestrator should be fresh
      const newOrchestrator = getConversationOrchestrator('reset-session');
      expect(newOrchestrator.getSessionMinutes()).toBe(0);
    });
  });
});
