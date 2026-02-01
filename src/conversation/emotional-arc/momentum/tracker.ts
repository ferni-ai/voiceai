/**
 * Emotional Momentum Tracker
 *
 * Track emotional trajectory within conversation, not just point-in-time emotion.
 *
 * Key insight: Know trajectory to predict and intervene
 * - Started anxious → improved after venting → declined when family mentioned
 * - Can predict: "Likely to end sad if we stay on family"
 * - Can intervene: "Redirect to what improved mood earlier"
 *
 * @module @ferni/conversation/emotional-arc/momentum/tracker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  IEmotionalMomentumTracker,
  EmotionalMomentum,
  EmotionSnapshot,
  EmotionalTrajectory,
  TurningPoint,
  TrajectoryPrediction,
  InterventionGuidance,
} from './types.js';
import {
  THRESHOLDS,
  MAGNITUDE_THRESHOLDS,
  INTERVENTION_SCRIPTS,
  TRAJECTORY_INTERVENTION_MAP,
  emotionToValence,
  RISK_FACTOR_PATTERNS,
} from './constants.js';

const log = createLogger({ module: 'EmotionalMomentumTracker' });

// ============================================================================
// TRACKER IMPLEMENTATION
// ============================================================================

export class EmotionalMomentumTracker implements IEmotionalMomentumTracker {
  /** Sessions map */
  private sessions = new Map<string, EmotionalMomentum>();

  // ==========================================================================
  // CORE METHODS
  // ==========================================================================

  recordTurn(sessionId: string, snapshot: Omit<EmotionSnapshot, 'timestamp'>): void {
    const fullSnapshot: EmotionSnapshot = {
      ...snapshot,
      timestamp: new Date(),
    };

    // Auto-calculate valence from emotion if not provided or zero
    if (fullSnapshot.valence === 0 && fullSnapshot.emotion) {
      fullSnapshot.valence = emotionToValence(fullSnapshot.emotion);
    }

    // Get or create momentum (without adding initial snapshot twice)
    let momentum = this.sessions.get(sessionId);
    const isFirstTurn = !momentum;

    if (!momentum) {
      momentum = {
        sessionId,
        startingState: fullSnapshot,
        currentState: fullSnapshot,
        snapshots: [],
        trajectory: 'stable-positive',
        turningPoints: [],
        prediction: {
          likelyEndState: fullSnapshot.emotion,
          confidence: 0.5,
          turnsUntilPeak: null,
          turnsUntilTrough: null,
          riskFactors: [],
        },
        interventionNeeded: false,
      };
      this.sessions.set(sessionId, momentum);
    }

    // Check for turning point (only if not first turn)
    if (!isFirstTurn) {
      const turningPoint = this.detectTurningPoint(momentum.currentState, fullSnapshot);

      if (turningPoint) {
        momentum.turningPoints.push(turningPoint);
        log.debug(
          {
            sessionId,
            turn: turningPoint.turn,
            direction: turningPoint.direction,
            magnitude: turningPoint.magnitude,
            topic: turningPoint.topic,
          },
          'Emotional turning point detected'
        );
      }
    }

    // Update state
    momentum.snapshots.push(fullSnapshot);
    momentum.currentState = fullSnapshot;

    // Update trajectory
    momentum.trajectory = this.calculateTrajectory(momentum.snapshots);

    // Update prediction
    momentum.prediction = this.predictTrajectory(momentum);

    // Check intervention need
    const intervention = this.checkInterventionInternal(momentum);
    momentum.interventionNeeded = intervention !== null;
    momentum.suggestedIntervention = intervention || undefined;

    log.debug(
      {
        sessionId,
        turn: fullSnapshot.turn,
        emotion: fullSnapshot.emotion,
        valence: fullSnapshot.valence,
        trajectory: momentum.trajectory,
        interventionNeeded: momentum.interventionNeeded,
      },
      'Emotional momentum updated'
    );
  }

  getMomentum(sessionId: string): EmotionalMomentum | null {
    return this.sessions.get(sessionId) || null;
  }

  checkIntervention(sessionId: string): InterventionGuidance | null {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return null;
    return this.checkInterventionInternal(momentum);
  }

  getSafeTopics(sessionId: string): string[] {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return [];

    return momentum.turningPoints
      .filter((tp) => tp.direction === 'up' && tp.magnitude !== 'slight')
      .map((tp) => tp.topic)
      .filter((topic): topic is string => Boolean(topic));
  }

  getRiskyTopics(sessionId: string): string[] {
    const momentum = this.sessions.get(sessionId);
    if (!momentum) return [];

    return momentum.turningPoints
      .filter((tp) => tp.direction === 'down' && tp.magnitude !== 'slight')
      .map((tp) => tp.topic)
      .filter((topic): topic is string => Boolean(topic));
  }

  getTrajectory(sessionId: string): EmotionalTrajectory {
    const momentum = this.sessions.get(sessionId);
    return momentum?.trajectory || 'stable-positive';
  }

  reset(sessionId: string): void {
    this.sessions.delete(sessionId);
    log.debug({ sessionId }, 'Emotional momentum reset');
  }

  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, momentum] of this.sessions) {
      const lastUpdate = momentum.currentState.timestamp.getTime();
      if (now - lastUpdate > THRESHOLDS.sessionMaxAge) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log.debug({ cleaned }, 'Cleaned up old momentum sessions');
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private detectTurningPoint(
    previous: EmotionSnapshot,
    current: EmotionSnapshot
  ): TurningPoint | null {
    const valenceShift = current.valence - previous.valence;

    // Need significant shift
    if (Math.abs(valenceShift) < THRESHOLDS.turningPointValenceShift) {
      return null;
    }

    return {
      turn: current.turn,
      trigger: current.trigger || 'unknown',
      topic: current.topic || 'unknown',
      direction: valenceShift > 0 ? 'up' : 'down',
      magnitude: this.getMagnitude(valenceShift),
      valenceShift,
    };
  }

  private getMagnitude(valenceShift: number): 'slight' | 'moderate' | 'significant' {
    const absShift = Math.abs(valenceShift);

    if (absShift >= MAGNITUDE_THRESHOLDS.significant.min) {
      return 'significant';
    }
    if (absShift >= MAGNITUDE_THRESHOLDS.moderate.min) {
      return 'moderate';
    }
    return 'slight';
  }

  private calculateTrajectory(snapshots: EmotionSnapshot[]): EmotionalTrajectory {
    if (snapshots.length < THRESHOLDS.minSnapshotsForTrajectory) {
      // Not enough data - assume stable based on current valence
      const current = snapshots[snapshots.length - 1];
      return current.valence >= 0 ? 'stable-positive' : 'stable-negative';
    }

    const recent = snapshots.slice(-THRESHOLDS.recentSnapshotWindow);
    const valences = recent.map((s) => s.valence);

    const trend = this.calculateTrend(valences);
    const volatility = this.calculateVolatility(valences);
    const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;

    // Check for spiral-down (accelerating negative)
    if (this.isSpiralingDown(valences)) {
      return 'spiral-down';
    }

    // High volatility
    if (volatility > THRESHOLDS.volatilityThreshold) {
      return 'volatile';
    }

    // Check for recovery (was negative, now improving)
    if (avgValence < 0 && trend > THRESHOLDS.trendThreshold) {
      return 'recovering';
    }

    // Clear trends
    if (trend > THRESHOLDS.trendThreshold) {
      return 'improving';
    }
    if (trend < -THRESHOLDS.trendThreshold) {
      return 'declining';
    }

    // Stable
    return avgValence >= 0 ? 'stable-positive' : 'stable-negative';
  }

  private calculateTrend(valences: number[]): number {
    if (valences.length < 2) return 0;

    // Simple linear regression slope
    const n = valences.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += valences[i];
      sumXY += i * valences[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  private calculateVolatility(valences: number[]): number {
    if (valences.length < 2) return 0;

    const mean = valences.reduce((a, b) => a + b, 0) / valences.length;
    const squaredDiffs = valences.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / valences.length;

    return Math.sqrt(variance);
  }

  private isSpiralingDown(valences: number[]): boolean {
    if (valences.length < 3) return false;

    // Check if consistently declining with low valence
    const recentThree = valences.slice(-3);
    const allNegative = recentThree.every((v) => v < 0);
    const declining = recentThree[2] < recentThree[1] && recentThree[1] < recentThree[0];
    const veryNegative = recentThree[2] < THRESHOLDS.spiralDownValenceThreshold;

    return allNegative && declining && veryNegative;
  }

  private predictTrajectory(momentum: EmotionalMomentum): TrajectoryPrediction {
    const { snapshots, trajectory, turningPoints } = momentum;
    const current = momentum.currentState;

    const riskFactors: string[] = [];

    // Check for consecutive negative emotions
    const recentNegative = snapshots
      .slice(-RISK_FACTOR_PATTERNS.consecutiveNegative)
      .filter((s) => s.valence < 0).length;

    if (recentNegative >= RISK_FACTOR_PATTERNS.consecutiveNegative) {
      riskFactors.push('consecutive_negative_emotions');
    }

    // Check for rapid changes
    if (turningPoints.length > 0) {
      const recentShifts = turningPoints.slice(-2);
      const hasRapidChange = recentShifts.some(
        (tp) => Math.abs(tp.valenceShift) > RISK_FACTOR_PATTERNS.rapidChangeThreshold
      );
      if (hasRapidChange) {
        riskFactors.push('rapid_emotional_changes');
      }
    }

    // Check for sensitive topics
    if (
      current.topic &&
      RISK_FACTOR_PATTERNS.sensitiveTopics.includes(current.topic.toLowerCase())
    ) {
      riskFactors.push('sensitive_topic');
    }

    // Predict end state
    let likelyEndState = current.emotion;
    let confidence = 0.5;

    switch (trajectory) {
      case 'improving':
        likelyEndState = 'hopeful';
        confidence = 0.7;
        break;
      case 'declining':
        likelyEndState = 'sad';
        confidence = 0.6;
        break;
      case 'spiral-down':
        likelyEndState = 'overwhelmed';
        confidence = 0.8;
        break;
      case 'volatile':
        confidence = 0.3;
        break;
      case 'recovering':
        likelyEndState = 'calm';
        confidence = 0.6;
        break;
    }

    return {
      likelyEndState,
      confidence,
      turnsUntilPeak: trajectory === 'improving' ? 3 : null,
      turnsUntilTrough: trajectory === 'declining' ? 3 : null,
      riskFactors,
    };
  }

  private checkInterventionInternal(momentum: EmotionalMomentum): InterventionGuidance | null {
    const { trajectory, snapshots, prediction } = momentum;

    // Spiral down - immediate intervention
    if (trajectory === 'spiral-down') {
      const safeTopics = this.getSafeTopicsFromMomentum(momentum);
      return {
        type: 'ground',
        timing: 'immediate',
        script: this.pickScript('ground'),
        avoidTopics: this.getRiskyTopicsFromMomentum(momentum),
        returnToTopic: safeTopics[0],
      };
    }

    // Declining for too many turns
    if (trajectory === 'declining') {
      const declineTurns = this.countDeclineTurns(snapshots);
      if (declineTurns >= THRESHOLDS.declineTurnsForIntervention) {
        return {
          type: 'validate',
          timing: 'next-turn',
          script: this.pickScript('validate'),
          avoidTopics: this.getRiskyTopicsFromMomentum(momentum),
        };
      }
    }

    // Volatile - redirect
    if (trajectory === 'volatile' && prediction.riskFactors.length >= 2) {
      return {
        type: 'redirect',
        timing: 'natural-pause',
        script: this.pickScript('redirect'),
        avoidTopics: [],
      };
    }

    // No intervention needed
    return null;
  }

  private getSafeTopicsFromMomentum(momentum: EmotionalMomentum): string[] {
    return momentum.turningPoints
      .filter((tp) => tp.direction === 'up' && tp.magnitude !== 'slight')
      .map((tp) => tp.topic)
      .filter((topic): topic is string => Boolean(topic));
  }

  private getRiskyTopicsFromMomentum(momentum: EmotionalMomentum): string[] {
    return momentum.turningPoints
      .filter((tp) => tp.direction === 'down' && tp.magnitude !== 'slight')
      .map((tp) => tp.topic)
      .filter((topic): topic is string => Boolean(topic));
  }

  private countDeclineTurns(snapshots: EmotionSnapshot[]): number {
    if (snapshots.length < 2) return 0;

    let count = 0;
    for (let i = snapshots.length - 1; i > 0; i--) {
      if (snapshots[i].valence < snapshots[i - 1].valence) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private pickScript(type: InterventionGuidance['type']): string {
    const scripts = INTERVENTION_SCRIPTS[type];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: EmotionalMomentumTracker | null = null;

/**
 * Get singleton instance
 */
export function getEmotionalMomentumTracker(): IEmotionalMomentumTracker {
  if (!instance) {
    instance = new EmotionalMomentumTracker();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createEmotionalMomentumTracker(): IEmotionalMomentumTracker {
  return new EmotionalMomentumTracker();
}

/**
 * Reset singleton (for testing)
 */
export function resetEmotionalMomentumTracker(): void {
  instance = null;
}
