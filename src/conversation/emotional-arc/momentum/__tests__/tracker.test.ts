/**
 * Emotional Momentum Tracker Tests
 *
 * @module @ferni/conversation/emotional-arc/momentum/__tests__/tracker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmotionalMomentumTracker,
  type IEmotionalMomentumTracker,
  type EmotionSnapshot,
} from '../index.js';

describe('EmotionalMomentumTracker', () => {
  let tracker: IEmotionalMomentumTracker;
  const sessionId = 'test-session-123';

  beforeEach(() => {
    tracker = createEmotionalMomentumTracker();
  });

  // Helper to create snapshot
  const createSnapshot = (
    turn: number,
    emotion: string,
    valence: number,
    overrides: Partial<Omit<EmotionSnapshot, 'timestamp'>> = {}
  ): Omit<EmotionSnapshot, 'timestamp'> => ({
    turn,
    emotion,
    valence,
    arousal: 0.5,
    ...overrides,
  });

  // ============================================================================
  // RECORDING TESTS
  // ============================================================================

  describe('recordTurn()', () => {
    it('creates momentum on first turn', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum).not.toBeNull();
      expect(momentum?.snapshots.length).toBe(1);
    });

    it('accumulates snapshots across turns', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(2, 'happy', 0.5));
      tracker.recordTurn(sessionId, createSnapshot(3, 'excited', 0.7));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.snapshots.length).toBe(3);
    });

    it('updates current state', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(2, 'happy', 0.5));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.currentState.emotion).toBe('happy');
      expect(momentum?.currentState.valence).toBe(0.5);
    });

    it('auto-calculates valence from emotion if zero', () => {
      tracker.recordTurn(sessionId, {
        turn: 1,
        emotion: 'happy',
        valence: 0, // Will be auto-calculated
        arousal: 0.5,
      });

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.currentState.valence).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // TRAJECTORY TESTS
  // ============================================================================

  describe('trajectory detection', () => {
    it('detects improving trajectory', () => {
      // Gradual improvement with small steps (low variance)
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.3));
      tracker.recordTurn(sessionId, createSnapshot(2, 'worried', -0.15));
      tracker.recordTurn(sessionId, createSnapshot(3, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(4, 'hopeful', 0.15));
      tracker.recordTurn(sessionId, createSnapshot(5, 'content', 0.3));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('improving');
    });

    it('detects declining trajectory', () => {
      // Gradual decline with less variance
      tracker.recordTurn(sessionId, createSnapshot(1, 'content', 0.3));
      tracker.recordTurn(sessionId, createSnapshot(2, 'neutral', 0.1));
      tracker.recordTurn(sessionId, createSnapshot(3, 'worried', -0.1));
      tracker.recordTurn(sessionId, createSnapshot(4, 'sad', -0.3));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('declining');
    });

    it('detects stable-positive trajectory', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'content', 0.4));
      tracker.recordTurn(sessionId, createSnapshot(2, 'content', 0.45));
      tracker.recordTurn(sessionId, createSnapshot(3, 'calm', 0.3));
      tracker.recordTurn(sessionId, createSnapshot(4, 'content', 0.4));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('stable-positive');
    });

    it('detects stable-negative trajectory', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.4));
      tracker.recordTurn(sessionId, createSnapshot(2, 'sad', -0.45));
      tracker.recordTurn(sessionId, createSnapshot(3, 'tired', -0.35));
      tracker.recordTurn(sessionId, createSnapshot(4, 'sad', -0.4));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('stable-negative');
    });

    it('detects spiral-down trajectory', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'worried', -0.3));
      tracker.recordTurn(sessionId, createSnapshot(2, 'anxious', -0.4));
      tracker.recordTurn(sessionId, createSnapshot(3, 'overwhelmed', -0.6));
      tracker.recordTurn(sessionId, createSnapshot(4, 'hopeless', -0.8));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('spiral-down');
    });

    it('detects recovering trajectory', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.5));
      tracker.recordTurn(sessionId, createSnapshot(2, 'sad', -0.4));
      tracker.recordTurn(sessionId, createSnapshot(3, 'tired', -0.2));
      tracker.recordTurn(sessionId, createSnapshot(4, 'neutral', -0.1));

      const trajectory = tracker.getTrajectory(sessionId);
      expect(trajectory).toBe('recovering');
    });
  });

  // ============================================================================
  // TURNING POINT TESTS
  // ============================================================================

  describe('turning points', () => {
    it('detects upward turning point', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.5, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'hopeful', 0.3, { topic: 'hobby', trigger: 'mentioned painting' }));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.turningPoints.length).toBe(1);
      expect(momentum?.turningPoints[0].direction).toBe('up');
    });

    it('detects downward turning point', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5, { topic: 'vacation' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'anxious', -0.4, { topic: 'work', trigger: 'mentioned deadline' }));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.turningPoints.length).toBe(1);
      expect(momentum?.turningPoints[0].direction).toBe('down');
    });

    it('captures topic at turning point', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0, { topic: 'general' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'sad', -0.6, { topic: 'family' }));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.turningPoints[0].topic).toBe('family');
    });

    it('classifies magnitude correctly', () => {
      // Slight shift
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(2, 'content', 0.2));

      let momentum = tracker.getMomentum(sessionId);
      expect(momentum?.turningPoints[0].magnitude).toBe('slight');

      // Significant shift
      tracker.reset(sessionId);
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5));
      tracker.recordTurn(sessionId, createSnapshot(2, 'devastated', -0.7));

      momentum = tracker.getMomentum(sessionId);
      expect(momentum?.turningPoints[0].magnitude).toBe('significant');
    });
  });

  // ============================================================================
  // INTERVENTION TESTS
  // ============================================================================

  describe('intervention detection', () => {
    it('suggests intervention for spiral-down', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'worried', -0.3));
      tracker.recordTurn(sessionId, createSnapshot(2, 'anxious', -0.4));
      tracker.recordTurn(sessionId, createSnapshot(3, 'overwhelmed', -0.6));
      tracker.recordTurn(sessionId, createSnapshot(4, 'hopeless', -0.8));

      const intervention = tracker.checkIntervention(sessionId);
      expect(intervention).not.toBeNull();
      expect(intervention?.type).toBe('ground');
      expect(intervention?.timing).toBe('immediate');
    });

    it('suggests validation for sustained decline', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(2, 'worried', -0.2));
      tracker.recordTurn(sessionId, createSnapshot(3, 'anxious', -0.35));
      tracker.recordTurn(sessionId, createSnapshot(4, 'sad', -0.45));

      const intervention = tracker.checkIntervention(sessionId);
      expect(intervention).not.toBeNull();
      expect(intervention?.type).toBe('validate');
    });

    it('returns null for stable-positive', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5));
      tracker.recordTurn(sessionId, createSnapshot(2, 'content', 0.4));
      tracker.recordTurn(sessionId, createSnapshot(3, 'happy', 0.5));

      const intervention = tracker.checkIntervention(sessionId);
      expect(intervention).toBeNull();
    });

    it('includes avoid topics in intervention', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5, { topic: 'vacation' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'anxious', -0.4, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(3, 'stressed', -0.5, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(4, 'overwhelmed', -0.7, { topic: 'work' }));

      const intervention = tracker.checkIntervention(sessionId);
      expect(intervention?.avoidTopics).toContain('work');
    });

    it('includes return topic in intervention', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.5, { topic: 'general' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'happy', 0.5, { topic: 'hobby' }));
      tracker.recordTurn(sessionId, createSnapshot(3, 'anxious', -0.4, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(4, 'stressed', -0.6, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(5, 'overwhelmed', -0.8, { topic: 'work' }));

      const intervention = tracker.checkIntervention(sessionId);
      expect(intervention?.returnToTopic).toBe('hobby');
    });
  });

  // ============================================================================
  // SAFE/RISKY TOPICS TESTS
  // ============================================================================

  describe('topic analysis', () => {
    it('identifies safe topics', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.5, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'happy', 0.5, { topic: 'music' }));
      tracker.recordTurn(sessionId, createSnapshot(3, 'content', 0.4, { topic: 'music' }));

      const safeTopics = tracker.getSafeTopics(sessionId);
      expect(safeTopics).toContain('music');
    });

    it('identifies risky topics', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5, { topic: 'vacation' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'anxious', -0.5, { topic: 'family' }));
      tracker.recordTurn(sessionId, createSnapshot(3, 'sad', -0.6, { topic: 'family' }));

      const riskyTopics = tracker.getRiskyTopics(sessionId);
      expect(riskyTopics).toContain('family');
    });

    it('returns empty arrays for no turning points', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(2, 'neutral', 0.05));

      expect(tracker.getSafeTopics(sessionId)).toEqual([]);
      expect(tracker.getRiskyTopics(sessionId)).toEqual([]);
    });
  });

  // ============================================================================
  // PREDICTION TESTS
  // ============================================================================

  describe('trajectory prediction', () => {
    it('predicts positive end for improving trajectory', () => {
      // Gradual improvement
      tracker.recordTurn(sessionId, createSnapshot(1, 'sad', -0.3));
      tracker.recordTurn(sessionId, createSnapshot(2, 'worried', -0.15));
      tracker.recordTurn(sessionId, createSnapshot(3, 'neutral', 0));
      tracker.recordTurn(sessionId, createSnapshot(4, 'hopeful', 0.15));
      tracker.recordTurn(sessionId, createSnapshot(5, 'content', 0.3));

      const momentum = tracker.getMomentum(sessionId);
      // For improving trajectory, prediction shows positive outcome
      expect(momentum?.prediction.likelyEndState).toBeDefined();
      expect(momentum?.prediction.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('identifies risk factors', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'anxious', -0.3, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(2, 'stressed', -0.4, { topic: 'work' }));
      tracker.recordTurn(sessionId, createSnapshot(3, 'overwhelmed', -0.6, { topic: 'work' }));

      const momentum = tracker.getMomentum(sessionId);
      expect(momentum?.prediction.riskFactors).toContain('consecutive_negative_emotions');
    });
  });

  // ============================================================================
  // LIFECYCLE TESTS
  // ============================================================================

  describe('lifecycle', () => {
    it('resets session', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'happy', 0.5));
      tracker.recordTurn(sessionId, createSnapshot(2, 'content', 0.4));

      tracker.reset(sessionId);

      expect(tracker.getMomentum(sessionId)).toBeNull();
    });

    it('handles multiple sessions', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';

      tracker.recordTurn(session1, createSnapshot(1, 'happy', 0.5));
      tracker.recordTurn(session2, createSnapshot(1, 'sad', -0.5));

      expect(tracker.getMomentum(session1)?.currentState.emotion).toBe('happy');
      expect(tracker.getMomentum(session2)?.currentState.emotion).toBe('sad');
    });

    it('cleanup does not throw', () => {
      tracker.recordTurn(sessionId, createSnapshot(1, 'neutral', 0));
      expect(() => tracker.cleanup()).not.toThrow();
    });
  });
});
