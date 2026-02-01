/**
 * Behavior System E2E Tests
 *
 * End-to-end tests for the bidirectional behavior system:
 * 1. Backend detection → Frontend signal
 * 2. LLM tool call → Frontend signal
 * 3. AliveOrchestrator events → Behavior mode shifts
 * 4. Advanced humanization integration
 *
 * These tests verify the complete flow from detection to frontend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// ============================================================================
// E2E FLOW TESTS
// ============================================================================

describe('Behavior System E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Detection → Frontend Signal Flow', () => {
    it('should create mode shift signal when voice tremor detected', async () => {
      const { dispatchBehaviorEvents, createModeShiftSignal } =
        await import('../agents/realtime/behavior-event-dispatcher.js');

      const context = {
        emotionalState: {
          primary: 'anxious',
          intensity: 0.8,
          distressLevel: 0.6,
          trajectory: 'declining' as const,
        },
        previousEmotionalState: {
          primary: 'neutral',
          intensity: 0.3,
        },
        hourOfDay: 14,
        topicWeight: 'heavy' as const,
        relationshipStage: 'developing',
        turnCount: 5,
        // Trigger voice tremor detection
        voiceFeatures: {
          tremor: 0.8, // High tremor
          pitch: 150,
          energy: 0.5,
        },
      };

      const injectFn = vi.fn();
      const events = dispatchBehaviorEvents(context, injectFn);

      // Should detect emotional shift
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.event === 'emotional_shift')).toBe(true);

      // Create signal for frontend
      const signal = createModeShiftSignal('presence', 'emotional_shift_detected');
      expect(signal.type).toBe('mode_shift');
      expect(signal.mode).toBe('presence');
      expect(signal.timestamp).toBeDefined();
    });

    it('should create hold space signal when extended silence detected', async () => {
      const { dispatchBehaviorEvents, createHoldSpaceSignal } =
        await import('../agents/realtime/behavior-event-dispatcher.js');

      const context = {
        emotionalState: {
          primary: 'sad',
          intensity: 0.7,
          distressLevel: 0.5,
          trajectory: 'stable' as const,
        },
        hourOfDay: 14,
        topicWeight: 'heavy' as const,
        relationshipStage: 'established',
        turnCount: 8,
        // Trigger extended silence detection
        silenceDuration: 15000, // 15 seconds of silence
      };

      const injectFn = vi.fn();
      const events = dispatchBehaviorEvents(context, injectFn);

      // Should detect extended silence
      expect(events.some((e) => e.event === 'extended_silence')).toBe(true);

      // Create signal for frontend
      const signal = createHoldSpaceSignal(5000, 'extended_silence');
      expect(signal.type).toBe('hold_space');
      expect(signal.duration).toBe(5000);
    });

    it('should create processing signal', async () => {
      const { createProcessingSignal } =
        await import('../agents/realtime/behavior-event-dispatcher.js');

      const startSignal = createProcessingSignal(true, 'thinking');
      expect(startSignal.type).toBe('processing_start');
      expect(startSignal.expression).toBe('thinking');

      const endSignal = createProcessingSignal(false, 'thinking');
      expect(endSignal.type).toBe('processing_end');
    });

    it('should create pacing change signal', async () => {
      const { createPacingChangeSignal } =
        await import('../agents/realtime/behavior-event-dispatcher.js');

      const signal = createPacingChangeSignal('slower', 'late_night');
      expect(signal.type).toBe('pacing_change');
      expect(signal.pacing).toBe('slower');
      expect(signal.reason).toBe('late_night');
    });
  });

  describe('LLM Tool → Frontend Signal Flow', () => {
    it('should return signal data from shiftMode tool', async () => {
      const { getToolDefinitions } = await import('../tools/domains/behavior/index.js');

      const definitions = await getToolDefinitions();
      const shiftModeDef = definitions.find((d) => d.id === 'shiftMode');

      expect(shiftModeDef).toBeDefined();
      expect(shiftModeDef?.domain).toBe('behavior');

      // Create tool and execute
      const ctx = {
        userId: 'test-user',
        agentId: 'ferni',
        agentDisplayName: 'Ferni',
        services: {
          has: () => false,
          get: () => undefined,
          getOptional: () => undefined,
        },
      };

      const tool = shiftModeDef!.create(ctx);
      const result = await tool.execute({ mode: 'presence', reason: 'test' });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('presence');
      expect(result.signal).toBeDefined();
      expect(result.signal.type).toBe('mode_shift');
    });

    it('should return pause values from holdSpace tool', async () => {
      const { getToolDefinitions } = await import('../tools/domains/behavior/index.js');

      const definitions = await getToolDefinitions();
      const holdSpaceDef = definitions.find((d) => d.id === 'holdSpace');

      expect(holdSpaceDef).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'ferni',
        agentDisplayName: 'Ferni',
        services: {
          has: () => false,
          get: () => undefined,
          getOptional: () => undefined,
        },
      };

      const tool = holdSpaceDef!.create(ctx);
      const result = await tool.execute({ duration: 'medium', reason: 'emotional moment' });

      expect(result.success).toBe(true);
      expect(result.duration).toBe(5000); // medium = 5000ms
      expect(result.ssml).toContain('break');
      expect(result.signal).toBeDefined();
    });

    it('should compose context-aware processing phrases', async () => {
      const { getToolDefinitions } = await import('../tools/domains/behavior/index.js');

      const definitions = await getToolDefinitions();
      const processingDef = definitions.find((d) => d.id === 'processing');

      expect(processingDef).toBeDefined();

      const ctx = {
        userId: 'test-user',
        agentId: 'ferni',
        agentDisplayName: 'Ferni',
        services: {
          has: () => false,
          get: () => undefined,
          getOptional: () => undefined,
        },
      };

      const tool = processingDef!.create(ctx);
      const result = await tool.execute({ type: 'thinking', weight: 'medium' });

      expect(result.success).toBe(true);
      expect(result.phrase).toBeDefined();
      expect(result.ssml).toContain('break');
      expect(result.prePause).toBeDefined();
      expect(result.postPause).toBeDefined();
    });
  });

  describe('Advanced Humanization Integration', () => {
    it('should load advanced humanization for personas', async () => {
      const { loadAdvancedHumanization, clearAdvancedHumanizationCache } =
        await import('../personas/bundles/advanced-humanization-loader.js');

      // Clear cache first
      clearAdvancedHumanizationCache();

      // Try loading for maya-santos (has advanced humanization)
      const mayaHumanization = await loadAdvancedHumanization('maya-santos');

      // May or may not exist in test environment, but should not throw
      if (mayaHumanization) {
        expect(mayaHumanization.schema_version).toBe(2);
        expect(mayaHumanization.subtext_responses).toBeDefined();
        expect(mayaHumanization.emotional_aftercare).toBeDefined();
      }
    });

    it('should select contextual humanization based on state', async () => {
      const { getContextualHumanization, loadAdvancedHumanization } =
        await import('../personas/bundles/advanced-humanization-loader.js');

      const humanization = await loadAdvancedHumanization('maya-santos');

      if (humanization) {
        // Test with high distress context
        const result = await getContextualHumanization({
          personaId: 'maya-santos',
          relationshipStage: 'developing',
          emotionalIntensity: 0.8,
          distressLevel: 0.7,
          userEnergy: 'low',
          needsAftercare: true,
        });

        // Should return aftercare or energy regulation
        if (result) {
          expect(['aftercare_holding', 'aftercare_grounding', 'energy', 'affirmation']).toContain(
            result.type
          );
          expect(result.phrase).toBeDefined();
          expect(result.ssml).toBeDefined();
        }
      }
    });

    it('should return subtext response when detected', async () => {
      const { getContextualHumanization, loadAdvancedHumanization } =
        await import('../personas/bundles/advanced-humanization-loader.js');

      const humanization = await loadAdvancedHumanization('maya-santos');

      if (humanization) {
        const result = await getContextualHumanization({
          personaId: 'maya-santos',
          relationshipStage: 'established', // Must be established for subtext
          emotionalIntensity: 0.5,
          distressLevel: 0.3,
          userEnergy: 'medium',
          subtextDetected: 'deflection',
        });

        // Should return subtext response
        if (result) {
          expect(result.type).toBe('subtext');
          expect(result.phrase).toBeDefined();
        }
      }
    });
  });

  describe('ProcessingIntelligence Integration', () => {
    it('should compose processing expressions with correct structure', async () => {
      const { composeProcessingExpression, formatProcessingAsSSML } =
        await import('../intelligence/processing-intelligence.js');

      const result = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 14,
        personaId: 'ferni',
      });

      expect(result.phrase).toBeDefined();
      expect(result.prePause).toBeGreaterThan(0);
      expect(result.postPause).toBeGreaterThan(0);

      const ssml = formatProcessingAsSSML(result);
      expect(ssml).toContain('break');
      expect(ssml).toContain(result.phrase);
    });

    it('should adjust pauses for late night', async () => {
      const { composeProcessingExpression } =
        await import('../intelligence/processing-intelligence.js');

      const dayResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 14, // Afternoon
      });

      const nightResult = composeProcessingExpression({
        trigger: 'thinking',
        weight: 'medium',
        hourOfDay: 2, // 2 AM
      });

      // Late night should have longer pauses
      expect(nightResult.prePause).toBeGreaterThan(dayResult.prePause);
      expect(nightResult.postPause).toBeGreaterThan(dayResult.postPause);
    });

    it('should adjust pauses for new relationships', async () => {
      const { composeProcessingExpression } =
        await import('../intelligence/processing-intelligence.js');

      const newResult = composeProcessingExpression({
        trigger: 'emotional',
        weight: 'heavy',
        relationshipStage: 'new',
      });

      const establishedResult = composeProcessingExpression({
        trigger: 'emotional',
        weight: 'heavy',
        relationshipStage: 'established',
      });

      // New relationships should have LONGER pauses (more explicit signals needed)
      expect(newResult.prePause).toBeGreaterThan(establishedResult.prePause);
    });
  });

  describe('Complete Flow Integration', () => {
    it('should handle full turn processing with behavior signals', async () => {
      // This test verifies the complete flow:
      // 1. Turn arrives with emotional content
      // 2. Behavior events are detected
      // 3. Signals would be emitted to frontend
      // 4. LLM receives events in context

      const { dispatchBehaviorEvents } =
        await import('../agents/realtime/behavior-event-dispatcher.js');

      // Simulate a heavy emotional turn
      const context = {
        emotionalState: {
          primary: 'sad',
          intensity: 0.9,
          distressLevel: 0.8,
          trajectory: 'declining' as const,
        },
        previousEmotionalState: {
          primary: 'neutral',
          intensity: 0.3,
        },
        hourOfDay: 2, // Late night
        topicWeight: 'heavy' as const,
        relationshipStage: 'established',
        turnCount: 15,
      };

      const injections: Array<{ role: string; content: string }> = [];
      const injectFn = (role: string, content: string) => {
        injections.push({ role, content });
      };

      const events = dispatchBehaviorEvents(context, injectFn);

      // Should detect multiple events
      expect(events.length).toBeGreaterThan(0);

      // Should inject into LLM context
      expect(injections.length).toBeGreaterThan(0);
      expect(injections[0].role).toBe('system');
      expect(injections[0].content).toContain('[SYSTEM_EVENT]');

      // Verify suggested responses exist
      const hasMode = events.some((e) => e.suggestedResponse?.mode);
      const hasPacing = events.some((e) => e.suggestedResponse?.pacing);
      expect(hasMode || hasPacing).toBe(true);
    });
  });
});
