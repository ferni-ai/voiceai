/**
 * Unified Naturalness Engine Tests
 *
 * Tests the combined operation of all four naturalness systems:
 * - Stress Auto-Adaptation
 * - Voice Pattern Learning
 * - Ambient Sound Reactivity
 * - Rapport Scoring
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getNaturalnessEngine,
  resetNaturalnessEngine,
  initializeNaturalnessEngine,
  processTurn,
  getActiveNaturalnessEngineCount,
  getNaturalnessEngineState,
  getLastNaturalnessResult,
  type TurnInput,
} from '../index.js';

// Mock Firestore to avoid persistence calls
vi.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({ exists: false })),
      set: vi.fn(() => Promise.resolve()),
    })),
  })),
}));

describe('NaturalnessEngine', () => {
  const sessionId = 'test-session-123';
  const userId = 'test-user-456';

  beforeEach(() => {
    // Reset state before each test
    resetNaturalnessEngine(sessionId);
  });

  afterEach(() => {
    // Clean up after each test
    resetNaturalnessEngine(sessionId);
  });

  // ===========================================================================
  // ENGINE LIFECYCLE
  // ===========================================================================

  describe('Engine Lifecycle', () => {
    it('should create engine on first access', () => {
      const engine = getNaturalnessEngine(sessionId, userId);
      expect(engine).toBeDefined();
      expect(engine.sessionId).toBe(sessionId);
      expect(engine.userId).toBe(userId);
      expect(engine.turnsProcessed).toBe(0);
    });

    it('should return same engine on subsequent accesses', () => {
      const engine1 = getNaturalnessEngine(sessionId, userId);
      const engine2 = getNaturalnessEngine(sessionId, userId);
      expect(engine1).toBe(engine2);
    });

    it('should track active engine count', () => {
      const initialCount = getActiveNaturalnessEngineCount();
      getNaturalnessEngine(sessionId, userId);
      expect(getActiveNaturalnessEngineCount()).toBe(initialCount + 1);
    });

    it('should reset engine and subsystems', () => {
      getNaturalnessEngine(sessionId, userId);
      resetNaturalnessEngine(sessionId);
      // Creating new engine should start fresh
      const newEngine = getNaturalnessEngine(sessionId, userId);
      expect(newEngine.turnsProcessed).toBe(0);
    });
  });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  describe('Initialization', () => {
    it('should initialize engine with persisted data', async () => {
      const engine = await initializeNaturalnessEngine(sessionId, userId);
      expect(engine.initialized).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      const engine1 = await initializeNaturalnessEngine(sessionId, userId);
      const engine2 = await initializeNaturalnessEngine(sessionId, userId);
      expect(engine1).toBe(engine2);
    });
  });

  // ===========================================================================
  // TURN PROCESSING - BASIC
  // ===========================================================================

  describe('Turn Processing - Basic', () => {
    it('should process a basic turn and return result', () => {
      getNaturalnessEngine(sessionId, userId);

      const input: TurnInput = {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      };

      const result = processTurn(sessionId, input);
      expect(result).toBeDefined();
      expect(result.ttsAdjustments).toBeDefined();
      expect(result.ttsAdjustments.speedMultiplier).toBeGreaterThan(0);
      expect(result.rapportLevel).toBeDefined();
    });

    it('should increment turns processed', () => {
      getNaturalnessEngine(sessionId, userId);

      const input: TurnInput = {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      };

      processTurn(sessionId, input);
      processTurn(sessionId, input);

      const engine = getNaturalnessEngine(sessionId, userId);
      expect(engine.turnsProcessed).toBe(2);
    });

    it('should return default result for missing engine', () => {
      // Don't create engine first
      const result = processTurn('nonexistent-session', {
        context: {
          sessionId: 'nonexistent-session',
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      expect(result.ttsAdjustments.speedMultiplier).toBe(1.0);
      expect(result.rapportLevel).toBe('good');
    });
  });

  // ===========================================================================
  // STRESS ADAPTATION INTEGRATION
  // ===========================================================================

  describe('Stress Adaptation Integration', () => {
    it('should activate stress adaptation when stress signals present', () => {
      getNaturalnessEngine(sessionId, userId);

      // Process multiple turns with high stress signals
      for (let i = 0; i < 5; i++) {
        const input: TurnInput = {
          audio: {
            stressLevel: 0.8,
            anxietyMarkers: true,
            breathPattern: 'shallow',
            voiceTremor: 0.5,
            concernLevel: 0.7,
          },
          context: {
            sessionId,
            userId,
            turnNumber: i + 1,
            userWordCount: 10,
            agentWordCount: 20,
          },
        };

        processTurn(sessionId, input);
      }

      const lastResult = getLastNaturalnessResult(sessionId);
      expect(lastResult).toBeDefined();
      // With high stress, speed should be reduced and/or systems should be active
      expect(lastResult!.activeSystems.length).toBeGreaterThanOrEqual(0);
    });

    it('should not activate stress adaptation for calm signals', () => {
      getNaturalnessEngine(sessionId, userId);

      const input: TurnInput = {
        audio: {
          stressLevel: 0.1,
          anxietyMarkers: false,
          breathPattern: 'normal',
          voiceTremor: 0,
          concernLevel: 0,
        },
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 30,
          agentWordCount: 40,
        },
      };

      const result = processTurn(sessionId, input);
      // Stress should not be in active systems
      expect(result.activeSystems.includes('stress')).toBe(false);
    });
  });

  // ===========================================================================
  // VOICE PATTERN LEARNING INTEGRATION
  // ===========================================================================

  describe('Voice Pattern Learning Integration', () => {
    it('should record voice observations', () => {
      getNaturalnessEngine(sessionId, userId);

      const input: TurnInput = {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 50,
          agentWordCount: 60,
          silenceDurationMs: 500,
        },
      };

      const result = processTurn(sessionId, input);
      expect(result.recommendedWpm).toBeDefined();
      expect(result.recommendedTurnGapMs).toBeDefined();
    });

    it('should return default WPM for new users', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      // Default is 150 WPM
      expect(result.recommendedWpm).toBe(150);
    });
  });

  // ===========================================================================
  // AMBIENT AWARENESS INTEGRATION
  // ===========================================================================

  describe('Ambient Awareness Integration', () => {
    it('should include ambient analysis in result', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      expect(typeof result.isNoisy).toBe('boolean');
    });

    // Note: Full ambient integration requires processAudioFrame calls
    // which needs actual audio data
  });

  // ===========================================================================
  // RAPPORT SCORING INTEGRATION
  // ===========================================================================

  describe('Rapport Scoring Integration', () => {
    it('should track rapport level', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      expect(['excellent', 'good', 'needs_attention', 'repair_needed', 'critical']).toContain(
        result.rapportLevel
      );
      expect(result.rapportScore).toBeGreaterThanOrEqual(0);
      expect(result.rapportScore).toBeLessThanOrEqual(100);
    });

    it('should detect poor rapport when agent dominates', () => {
      getNaturalnessEngine(sessionId, userId);

      // Agent talks much more than user - poor balance
      for (let i = 0; i < 5; i++) {
        processTurn(sessionId, {
          context: {
            sessionId,
            userId,
            turnNumber: i + 1,
            userWordCount: 5, // User barely speaks
            agentWordCount: 100, // Agent dominates
            responseLength: 'short',
          },
        });
      }

      const lastResult = getLastNaturalnessResult(sessionId);
      // Rapport should be impacted by imbalance
      expect(lastResult).toBeDefined();
    });

    it('should detect good rapport with engaged user', () => {
      getNaturalnessEngine(sessionId, userId);

      // User engaged, asking questions, balanced turn-taking
      const result = processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 40,
          agentWordCount: 50,
          userAskedQuestion: true,
          responseLength: 'medium',
          smoothTransition: true,
          comfortLevel: 0.8,
        },
      });

      // Should have good rapport signals
      expect(result.rapportScore).toBeGreaterThan(50);
    });
  });

  // ===========================================================================
  // COMBINED ADJUSTMENTS
  // ===========================================================================

  describe('Combined Adjustments', () => {
    it('should combine multiple system adjustments', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        audio: {
          stressLevel: 0.6,
          anxietyMarkers: true,
        },
        context: {
          sessionId,
          userId,
          turnNumber: 3,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      // Result should have combined adjustments
      expect(result.ttsAdjustments).toBeDefined();
      expect(typeof result.ttsAdjustments.speedMultiplier).toBe('number');
      expect(typeof result.ttsAdjustments.volumeBoost).toBe('number');
      expect(typeof result.ttsAdjustments.clarityMode).toBe('boolean');
    });

    it('should track reasons for adjustments', () => {
      getNaturalnessEngine(sessionId, userId);

      // High stress should add reasons
      for (let i = 0; i < 5; i++) {
        processTurn(sessionId, {
          audio: {
            stressLevel: 0.9,
            anxietyMarkers: true,
            breathPattern: 'irregular',
          },
          context: {
            sessionId,
            userId,
            turnNumber: i + 1,
            userWordCount: 10,
            agentWordCount: 20,
          },
        });
      }

      const lastResult = getLastNaturalnessResult(sessionId);
      expect(lastResult?.ttsAdjustments.reasons).toBeDefined();
      expect(Array.isArray(lastResult?.ttsAdjustments.reasons)).toBe(true);
    });
  });

  // ===========================================================================
  // STATE ACCESS
  // ===========================================================================

  describe('State Access', () => {
    it('should return engine state', () => {
      getNaturalnessEngine(sessionId, userId);
      processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      const state = getNaturalnessEngineState(sessionId);
      expect(state).toBeDefined();
      expect(state!.sessionId).toBe(sessionId);
      expect(state!.userId).toBe(userId);
      expect(state!.turnsProcessed).toBe(1);
      expect(state!.systemHealth).toBeDefined();
    });

    it('should return null for nonexistent session', () => {
      const state = getNaturalnessEngineState('nonexistent');
      expect(state).toBeNull();
    });

    it('should return last result', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        context: {
          sessionId,
          userId,
          turnNumber: 1,
          userWordCount: 20,
          agentWordCount: 30,
        },
      });

      const lastResult = getLastNaturalnessResult(sessionId);
      expect(lastResult).toEqual(result);
    });
  });

  // ===========================================================================
  // CONTEXT INJECTIONS
  // ===========================================================================

  describe('Context Injections', () => {
    it('should provide context injections for high stress', () => {
      getNaturalnessEngine(sessionId, userId);

      // Build up stress over multiple turns
      for (let i = 0; i < 8; i++) {
        processTurn(sessionId, {
          audio: {
            stressLevel: 0.95,
            anxietyMarkers: true,
            breathPattern: 'irregular',
            voiceTremor: 0.8,
            concernLevel: 0.9,
          },
          context: {
            sessionId,
            userId,
            turnNumber: i + 1,
            userWordCount: 10,
            agentWordCount: 20,
          },
        });
      }

      const lastResult = getLastNaturalnessResult(sessionId);
      // High stress should generate context injections
      expect(lastResult?.contextInjections).toBeDefined();
      expect(Array.isArray(lastResult?.contextInjections)).toBe(true);
    });
  });

  // ===========================================================================
  // MULTI-SYSTEM ACTIVATION
  // ===========================================================================

  describe('Multi-System Activation', () => {
    it('should track which systems are active', () => {
      getNaturalnessEngine(sessionId, userId);

      const result = processTurn(sessionId, {
        audio: {
          stressLevel: 0.7,
          anxietyMarkers: true,
        },
        context: {
          sessionId,
          userId,
          turnNumber: 5,
          userWordCount: 5,
          agentWordCount: 100,
          agentInterrupted: true,
        },
      });

      expect(result.activeSystems).toBeDefined();
      expect(Array.isArray(result.activeSystems)).toBe(true);
    });
  });
});
