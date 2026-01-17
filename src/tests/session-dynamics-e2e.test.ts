/**
 * E2E Tests for Session Dynamics
 *
 * Tests the full integration of SessionDynamicsEngine:
 * - Phase transitions based on turn count
 * - Context injection for LLM guidance
 * - Cleanup on session end
 * - Integration with turn processor
 *
 * @module tests/session-dynamics-e2e
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSessionDynamicsEngine,
  resetSessionDynamicsEngine,
  resetAllSessionDynamicsEngines,
  type ConversationPhase,
} from '../conversation/humanization/session-dynamics.js';
import {
  updateSessionDynamics,
  buildSessionDynamicsInjection,
  getSessionPhase,
  getSessionDynamicsState,
  mapToLegacyPhase,
  cleanupSessionDynamics,
} from '../agents/integrations/session-dynamics-integration.js';

describe('Session Dynamics E2E', () => {
  const sessionId = 'test-session-e2e-dynamics';

  beforeEach(() => {
    // Reset all engines before each test
    resetAllSessionDynamicsEngines();
  });

  afterEach(() => {
    // Clean up after each test
    cleanupSessionDynamics(sessionId);
  });

  describe('Phase Transitions', () => {
    it('should start in opening phase', () => {
      const phase = getSessionPhase(sessionId);
      expect(phase).toBe('opening');
    });

    it('should transition through all phases based on turn count', () => {
      const phaseTransitions: Array<{ turnCount: number; expectedPhase: ConversationPhase }> = [
        { turnCount: 1, expectedPhase: 'opening' },
        { turnCount: 3, expectedPhase: 'opening' },
        { turnCount: 4, expectedPhase: 'warming' },
        { turnCount: 8, expectedPhase: 'warming' },
        { turnCount: 9, expectedPhase: 'engaged' },
        { turnCount: 15, expectedPhase: 'engaged' },
        { turnCount: 20, expectedPhase: 'engaged' },
        { turnCount: 21, expectedPhase: 'deepening' },
        { turnCount: 35, expectedPhase: 'deepening' },
        { turnCount: 36, expectedPhase: 'winding' },
        { turnCount: 50, expectedPhase: 'winding' },
        { turnCount: 51, expectedPhase: 'extended' },
        { turnCount: 100, expectedPhase: 'extended' },
      ];

      for (const { turnCount, expectedPhase } of phaseTransitions) {
        const result = updateSessionDynamics({
          sessionId,
          turnCount,
        });

        expect(result.phase).toBe(expectedPhase);
      }
    });

    it('should detect phase changes and report them', () => {
      // Start in opening
      let result = updateSessionDynamics({ sessionId, turnCount: 1 });
      expect(result.phaseChanged).toBe(false); // First update, still opening
      expect(result.phase).toBe('opening');

      // Still opening at turn 3
      result = updateSessionDynamics({ sessionId, turnCount: 3 });
      expect(result.phaseChanged).toBe(false);
      expect(result.phase).toBe('opening');

      // Transition to warming at turn 4
      result = updateSessionDynamics({ sessionId, turnCount: 4 });
      expect(result.phaseChanged).toBe(true);
      expect(result.phase).toBe('warming');

      // Still warming at turn 5
      result = updateSessionDynamics({ sessionId, turnCount: 5 });
      expect(result.phaseChanged).toBe(false);
      expect(result.phase).toBe('warming');
    });

    it('should return phase behavior with each update', () => {
      const result = updateSessionDynamics({ sessionId, turnCount: 10 });

      expect(result.behavior).toBeDefined();
      expect(result.behavior.questionStyle).toBe('deep_exploratory');
      expect(result.behavior.responseLength).toBe('matches_user');
      expect(result.behavior.vulnerability).toBe('matched');
    });
  });

  describe('Context Injection', () => {
    it('should not inject for early opening phase', () => {
      updateSessionDynamics({ sessionId, turnCount: 1 });
      const injection = buildSessionDynamicsInjection(sessionId);

      // Early opening doesn't inject (it's implicit)
      expect(injection).toBeNull();
    });

    it('should inject session dynamics context after opening', () => {
      updateSessionDynamics({ sessionId, turnCount: 5 });
      const injection = buildSessionDynamicsInjection(sessionId);

      expect(injection).not.toBeNull();
      expect(injection?.category).toBe('session_dynamics');
      expect(injection?.content).toContain('SESSION PHASE: WARMING');
      expect(injection?.priority).toBeGreaterThanOrEqual(55);
    });

    it('should include response guidance in injection', () => {
      updateSessionDynamics({ sessionId, turnCount: 15 });
      const injection = buildSessionDynamicsInjection(sessionId);

      expect(injection?.content).toContain('Response length:');
      expect(injection?.content).toContain('Question style:');
      expect(injection?.content).toContain('Personal sharing:');
      expect(injection?.content).toContain('Vulnerability:');
    });

    it('should have higher priority for deep phases', () => {
      updateSessionDynamics({ sessionId, turnCount: 25 });
      const injection = buildSessionDynamicsInjection(sessionId);

      // Deepening phase gets priority 60
      expect(injection?.priority).toBe(60);
    });
  });

  describe('Legacy Phase Mapping', () => {
    it('should map opening to opening', () => {
      expect(mapToLegacyPhase('opening')).toBe('opening');
    });

    it('should map warming and engaged to exploring', () => {
      expect(mapToLegacyPhase('warming')).toBe('exploring');
      expect(mapToLegacyPhase('engaged')).toBe('exploring');
    });

    it('should map deepening to supporting', () => {
      expect(mapToLegacyPhase('deepening')).toBe('supporting');
    });

    it('should map winding and extended to closing', () => {
      expect(mapToLegacyPhase('winding')).toBe('closing');
      expect(mapToLegacyPhase('extended')).toBe('closing');
    });
  });

  describe('State Persistence', () => {
    it('should maintain state across updates', () => {
      updateSessionDynamics({ sessionId, turnCount: 5, userEnergy: 'high' });
      updateSessionDynamics({ sessionId, turnCount: 6, topicWeight: 'heavy' });
      updateSessionDynamics({ sessionId, turnCount: 7, wasDeepMoment: true });

      const state = getSessionDynamicsState(sessionId);

      expect(state.turnCount).toBe(7);
      expect(state.hadDeepMoment).toBe(true);
    });

    it('should track peak energy', () => {
      // Simulate energy changes
      updateSessionDynamics({ sessionId, turnCount: 5, userEnergy: 'low' });
      updateSessionDynamics({ sessionId, turnCount: 6, userEnergy: 'high' });
      updateSessionDynamics({ sessionId, turnCount: 7, userEnergy: 'medium' });

      const state = getSessionDynamicsState(sessionId);

      // Peak should be >= current since we had a high energy moment
      expect(state.peakEnergy).toBeGreaterThanOrEqual(state.currentEnergy);
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up session dynamics completely', () => {
      // Build up some state
      updateSessionDynamics({ sessionId, turnCount: 20, wasDeepMoment: true });

      // Verify state exists
      const stateBefore = getSessionDynamicsState(sessionId);
      expect(stateBefore.phase).toBe('engaged');
      expect(stateBefore.hadDeepMoment).toBe(true);

      // Clean up
      cleanupSessionDynamics(sessionId);

      // Getting phase again should create fresh engine
      const stateAfter = getSessionDynamicsState(sessionId);
      expect(stateAfter.phase).toBe('opening');
      expect(stateAfter.hadDeepMoment).toBe(false);
      expect(stateAfter.turnCount).toBe(0);
    });
  });

  describe('SessionDynamicsEngine Direct API', () => {
    it('should provide question style descriptions', () => {
      const engine = getSessionDynamicsEngine(sessionId);
      engine.update({ turnCount: 10 });

      const questionStyle = engine.getQuestionStyleDescription();
      expect(questionStyle).toContain('deeper');
    });

    it('should provide response length guidance', () => {
      const engine = getSessionDynamicsEngine(sessionId);
      engine.update({ turnCount: 15 });

      const guidance = engine.getResponseLengthGuidance();
      expect(guidance.min).toBeLessThan(guidance.max);
      expect(guidance.ideal).toBeGreaterThanOrEqual(guidance.min);
      expect(guidance.ideal).toBeLessThanOrEqual(guidance.max);
    });

    it('should check behavior appropriateness', () => {
      const engine = getSessionDynamicsEngine(sessionId);

      // In opening phase
      engine.update({ turnCount: 1 });
      expect(engine.isBehaviorAppropriate('avoid deep probing')).toBe(true);

      // In engaged phase
      engine.update({ turnCount: 12 });
      expect(engine.isBehaviorAppropriate('deep callbacks')).toBe(true);
    });

    it('should suggest wind-down only in late phases', () => {
      const engine = getSessionDynamicsEngine(sessionId);

      // Early - should not suggest
      engine.update({ turnCount: 10 });
      expect(engine.shouldSuggestWindDown()).toBe(false);

      // Extended phase - might suggest (probabilistic)
      engine.update({ turnCount: 55 });
      // Can't assert true because it's probabilistic, just test it doesn't throw
      const suggestion = engine.shouldSuggestWindDown();
      expect(typeof suggestion).toBe('boolean');
    });

    it('should reset properly', () => {
      const engine = getSessionDynamicsEngine(sessionId);
      engine.update({ turnCount: 30, wasDeepMoment: true });

      expect(engine.getState().phase).toBe('deepening');
      expect(engine.getState().hadDeepMoment).toBe(true);

      engine.reset();

      expect(engine.getState().phase).toBe('opening');
      expect(engine.getState().hadDeepMoment).toBe(false);
      expect(engine.getState().turnCount).toBe(0);
    });
  });

  describe('Energy-based Phase Behavior', () => {
    it('should have appropriate energy ranges for each phase', () => {
      const phaseEnergyChecks: Array<{ turnCount: number; minEnergy: number; maxEnergy: number }> =
        [
          { turnCount: 2, minEnergy: 0.5, maxEnergy: 0.7 }, // opening
          { turnCount: 6, minEnergy: 0.6, maxEnergy: 0.8 }, // warming
          { turnCount: 12, minEnergy: 0.7, maxEnergy: 0.95 }, // engaged
          { turnCount: 25, minEnergy: 0.5, maxEnergy: 0.85 }, // deepening
          { turnCount: 40, minEnergy: 0.4, maxEnergy: 0.7 }, // winding
          { turnCount: 55, minEnergy: 0.4, maxEnergy: 0.6 }, // extended
        ];

      for (const { turnCount, minEnergy, maxEnergy } of phaseEnergyChecks) {
        resetSessionDynamicsEngine(sessionId);
        const result = updateSessionDynamics({ sessionId, turnCount });

        expect(result.behavior.energyRange[0]).toBeCloseTo(minEnergy, 1);
        expect(result.behavior.energyRange[1]).toBeCloseTo(maxEnergy, 1);
      }
    });
  });

  describe('Natural Wind-Down Detection', () => {
    it('should force winding phase when user initiates wind-down', () => {
      // Build up to engaged phase
      updateSessionDynamics({ sessionId, turnCount: 15 });
      expect(getSessionPhase(sessionId)).toBe('engaged');

      // User initiates wind-down (says goodbye, thanks, etc.)
      const result = updateSessionDynamics({
        sessionId,
        turnCount: 25,
        userInitiatedWindDown: true,
      });

      // Should jump to winding phase
      expect(result.phase).toBe('winding');
    });
  });
});
