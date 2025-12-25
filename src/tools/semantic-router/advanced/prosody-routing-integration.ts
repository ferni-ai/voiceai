/**
 * Prosody Routing Integration
 *
 * Connects real audio prosody analysis to semantic routing decisions.
 * This is the bridge between:
 * - AudioProsodyExtractor (raw audio → prosody signals)
 * - SemanticRouter (intent → tool)
 *
 * The integration enables:
 * - Real-time tool boosting based on voice signals
 * - Crisis/distress detection for safety routing
 * - Personalized baseline learning
 * - Prosody-aware confidence adjustment
 *
 * @module tools/semantic-router/advanced/prosody-routing-integration
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  AudioProsodyExtractor,
  AcousticFeatures,
  getAudioProsodyExtractor,
} from './audio-prosody-extractor.js';
import {
  VoiceProsodySignals,
  ToolBoostDecision,
  analyzeVoiceProsodyForToolBoost,
  performBetterThanHumanAnalysis,
  recordEmotionalDataPoint,
} from './better-than-human.js';
import type { SemanticToolMatch } from '../types.js';

const log = createLogger({ module: 'semantic-router:prosody-integration' });

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for prosody-aware routing */
export interface ProsodyRoutingConfig {
  // Enable/disable prosody-aware routing
  enabled: boolean;
  // Minimum confidence to apply prosody boost
  minConfidenceForBoost: number;
  // Maximum boost multiplier
  maxBoostMultiplier: number;
  // Suppress multiplier (for suppressed tools)
  suppressMultiplier: number;
  // Emergency detection threshold
  emergencyThreshold: number;
  // Learn user baseline over time
  learnBaseline: boolean;
  // Minimum samples before baseline learning
  minSamplesForBaseline: number;
}

/** Result of prosody-aware routing adjustment */
export interface ProsodyRoutingAdjustment {
  // Original matches (unchanged)
  originalMatches: SemanticToolMatch[];
  // Adjusted matches with prosody boosts applied
  adjustedMatches: SemanticToolMatch[];
  // Tools that were boosted
  boostedTools: string[];
  // Tools that were suppressed
  suppressedTools: string[];
  // Detected emergency/crisis state
  emergencyDetected: boolean;
  // Prosody signals used
  prosodySignals: VoiceProsodySignals | null;
  // Confidence in prosody analysis
  prosodyConfidence: number;
  // Reason for adjustments
  reason: string;
}

/** User session prosody state */
interface UserProsodyState {
  userId: string;
  sessionId: string;
  // Prosody extractor for this session
  extractor: AudioProsodyExtractor;
  // Accumulated samples for baseline
  sampleCount: number;
  // Learned baseline
  baseline: AcousticFeatures | null;
  // Recent prosody signals (for trend detection)
  recentSignals: VoiceProsodySignals[];
  // Emergency state tracking
  emergencySignals: number;
  // Last update timestamp
  lastUpdate: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ProsodyRoutingConfig = {
  enabled: true,
  minConfidenceForBoost: 0.3,
  maxBoostMultiplier: 1.5,
  suppressMultiplier: 0.5,
  emergencyThreshold: 0.8,
  learnBaseline: true,
  minSamplesForBaseline: 50,
};

// ============================================================================
// PROSODY ROUTING ENGINE
// ============================================================================

export class ProsodyRoutingEngine {
  private config: ProsodyRoutingConfig;
  private userStates = new Map<string, UserProsodyState>();

  constructor(config?: Partial<ProsodyRoutingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Process audio samples and update prosody state for a user
   */
  processAudio(
    userId: string,
    sessionId: string,
    samples: Float32Array
  ): VoiceProsodySignals | null {
    if (!this.config.enabled) {
      return null;
    }

    const state = this.getOrCreateUserState(userId, sessionId);
    const features = state.extractor.processAudioChunk(samples);

    if (!features) {
      return null;
    }

    state.sampleCount++;
    state.lastUpdate = Date.now();

    // Learn baseline if enabled
    if (
      this.config.learnBaseline &&
      state.sampleCount >= this.config.minSamplesForBaseline &&
      !state.baseline
    ) {
      state.baseline = state.extractor.learnBaseline();
      if (state.baseline) {
        log.info({ userId, sessionId }, 'Learned prosody baseline for user');
      }
    }

    // Convert to prosody signals
    const signals = state.extractor.featuresToProsodySignals(features);

    // Track recent signals
    state.recentSignals.push(signals);
    if (state.recentSignals.length > 10) {
      state.recentSignals.shift();
    }

    // Check for emergency signals
    if (this.isEmergencySignal(signals)) {
      state.emergencySignals++;
      log.warn(
        { userId, sessionId, emergencyCount: state.emergencySignals },
        'Emergency signal detected'
      );
    } else {
      // Decay emergency count
      state.emergencySignals = Math.max(0, state.emergencySignals - 0.1);
    }

    // Record emotional data point for arc tracking
    const emotion = this.inferEmotion(signals);
    recordEmotionalDataPoint(
      userId,
      emotion,
      this.calculateEmotionIntensity(signals),
      signals.valence,
      'voice',
      sessionId
    );

    return signals;
  }

  /**
   * Adjust routing matches based on prosody signals
   */
  adjustRouting(
    userId: string,
    sessionId: string,
    matches: SemanticToolMatch[]
  ): ProsodyRoutingAdjustment {
    if (!this.config.enabled || matches.length === 0) {
      return {
        originalMatches: matches,
        adjustedMatches: matches,
        boostedTools: [],
        suppressedTools: [],
        emergencyDetected: false,
        prosodySignals: null,
        prosodyConfidence: 0,
        reason: 'Prosody routing disabled or no matches',
      };
    }

    const state = this.userStates.get(this.getStateKey(userId, sessionId));
    if (!state || state.recentSignals.length === 0) {
      return {
        originalMatches: matches,
        adjustedMatches: matches,
        boostedTools: [],
        suppressedTools: [],
        emergencyDetected: false,
        prosodySignals: null,
        prosodyConfidence: 0,
        reason: 'No prosody data available',
      };
    }

    // Get aggregated prosody signals
    const prosodySignals = state.extractor.getWindowedProsodySignals();
    if (!prosodySignals) {
      return {
        originalMatches: matches,
        adjustedMatches: matches,
        boostedTools: [],
        suppressedTools: [],
        emergencyDetected: false,
        prosodySignals: null,
        prosodyConfidence: 0,
        reason: 'Could not aggregate prosody signals',
      };
    }

    // Get tool boost decision
    const boostDecision = analyzeVoiceProsodyForToolBoost(prosodySignals);

    // Check for emergency
    const emergencyDetected =
      state.emergencySignals >= 3 ||
      prosodySignals.stressLevel > this.config.emergencyThreshold;

    // Apply adjustments
    const adjustedMatches = this.applyBoosts(
      matches,
      boostDecision,
      emergencyDetected
    );

    // Sort by adjusted confidence
    adjustedMatches.sort((a, b) => b.confidence - a.confidence);

    return {
      originalMatches: matches,
      adjustedMatches,
      boostedTools: boostDecision.boostedTools,
      suppressedTools: boostDecision.suppressedTools,
      emergencyDetected,
      prosodySignals,
      prosodyConfidence: boostDecision.confidence,
      reason: boostDecision.reason,
    };
  }

  /**
   * Get full "Better Than Human" analysis for a user
   */
  getFullAnalysis(userId: string, sessionId: string): ReturnType<typeof performBetterThanHumanAnalysis> | null {
    const state = this.userStates.get(this.getStateKey(userId, sessionId));
    if (!state) {
      return null;
    }

    const prosodySignals = state.extractor.getWindowedProsodySignals();
    const wpm = prosodySignals?.wordsPerMinute;

    return performBetterThanHumanAnalysis(
      userId,
      prosodySignals || undefined,
      wpm
    );
  }

  /**
   * Get prosody stats for debugging/monitoring
   */
  getStats(userId: string, sessionId: string): {
    sampleCount: number;
    hasBaseline: boolean;
    emergencySignals: number;
    recentSignalCount: number;
    lastUpdate: number;
  } | null {
    const state = this.userStates.get(this.getStateKey(userId, sessionId));
    if (!state) {
      return null;
    }

    return {
      sampleCount: state.sampleCount,
      hasBaseline: state.baseline !== null,
      emergencySignals: state.emergencySignals,
      recentSignalCount: state.recentSignals.length,
      lastUpdate: state.lastUpdate,
    };
  }

  /**
   * Clear session state
   */
  clearSession(userId: string, sessionId: string): void {
    const key = this.getStateKey(userId, sessionId);
    this.userStates.delete(key);
    log.debug({ userId, sessionId }, 'Cleared prosody session state');
  }

  /**
   * Clear all state
   */
  clearAll(): void {
    this.userStates.clear();
    log.info('Cleared all prosody routing state');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private getStateKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  private getOrCreateUserState(
    userId: string,
    sessionId: string
  ): UserProsodyState {
    const key = this.getStateKey(userId, sessionId);
    let state = this.userStates.get(key);

    if (!state) {
      state = {
        userId,
        sessionId,
        extractor: new AudioProsodyExtractor(),
        sampleCount: 0,
        baseline: null,
        recentSignals: [],
        emergencySignals: 0,
        lastUpdate: Date.now(),
      };
      this.userStates.set(key, state);
      log.debug({ userId, sessionId }, 'Created new prosody session state');
    }

    return state;
  }

  private isEmergencySignal(signals: VoiceProsodySignals): boolean {
    // High stress + anxiety markers = emergency
    if (
      signals.stressLevel > this.config.emergencyThreshold &&
      signals.anxietyMarkers &&
      signals.anxietyMarkers.length >= 2
    ) {
      return true;
    }

    // Voice tremor + negative valence = distress
    if (signals.voiceTremor && signals.valence < -0.5) {
      return true;
    }

    // Very fast speech + high stress = panic
    if (
      signals.wordsPerMinute &&
      signals.wordsPerMinute > 200 &&
      signals.stressLevel > 0.7
    ) {
      return true;
    }

    return false;
  }

  private inferEmotion(signals: VoiceProsodySignals): string {
    // Simple emotion inference from prosody signals
    if (signals.stressLevel > 0.7) {
      if (signals.valence < -0.3) {
        return signals.anxietyMarkers?.length ? 'anxious' : 'stressed';
      }
      return 'stressed';
    }

    if (signals.arousal > 0.7) {
      if (signals.valence > 0.3) {
        return 'excited';
      }
      return 'agitated';
    }

    if (signals.arousal < 0.3) {
      if (signals.valence < -0.3) {
        return 'sad';
      }
      if (signals.valence > 0.3) {
        return 'calm';
      }
      return 'tired';
    }

    if (signals.valence > 0.3) {
      return 'happy';
    }

    if (signals.valence < -0.3) {
      return 'frustrated';
    }

    return 'neutral';
  }

  private calculateEmotionIntensity(signals: VoiceProsodySignals): number {
    // Combine arousal and stress for intensity
    return Math.min(1, (signals.arousal + signals.stressLevel) / 2);
  }

  private applyBoosts(
    matches: SemanticToolMatch[],
    boostDecision: ToolBoostDecision,
    emergencyDetected: boolean
  ): SemanticToolMatch[] {
    const boostedSet = new Set(boostDecision.boostedTools);
    const suppressedSet = new Set(boostDecision.suppressedTools);

    // If emergency, add crisis tools to boost list
    if (emergencyDetected) {
      boostedSet.add('crisis_support');
      boostedSet.add('emergency_resources');
      boostedSet.add('wellness_checkin');
      boostedSet.add('grounding_exercise');
    }

    return matches.map((match) => {
      let adjustedConfidence = match.confidence;

      // Apply boost
      if (boostedSet.has(match.toolId)) {
        const boost = Math.min(
          this.config.maxBoostMultiplier,
          1 + boostDecision.confidence * 0.5
        );
        adjustedConfidence = Math.min(1, adjustedConfidence * boost);
      }

      // Apply suppression
      if (suppressedSet.has(match.toolId)) {
        adjustedConfidence *= this.config.suppressMultiplier;
      }

      // Only adjust if above minimum confidence
      if (match.confidence < this.config.minConfidenceForBoost) {
        adjustedConfidence = match.confidence;
      }

      return {
        ...match,
        confidence: adjustedConfidence,
        // Add prosody metadata
        metadata: {
          ...match.metadata,
          prosodyBoosted: boostedSet.has(match.toolId),
          prosodySuppressed: suppressedSet.has(match.toolId),
          emergencyContext: emergencyDetected,
        },
      };
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let engineInstance: ProsodyRoutingEngine | null = null;

export function getProsodyRoutingEngine(
  config?: Partial<ProsodyRoutingConfig>
): ProsodyRoutingEngine {
  if (!engineInstance) {
    engineInstance = new ProsodyRoutingEngine(config);
  }
  return engineInstance;
}

export function initializeProsodyRouting(
  config?: Partial<ProsodyRoutingConfig>
): ProsodyRoutingEngine {
  engineInstance = new ProsodyRoutingEngine(config);
  log.info('Prosody routing engine initialized');
  return engineInstance;
}

export function shutdownProsodyRouting(): void {
  if (engineInstance) {
    engineInstance.clearAll();
    engineInstance = null;
    log.info('Prosody routing engine shutdown');
  }
}
