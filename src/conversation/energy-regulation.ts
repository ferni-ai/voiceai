/**
 * Energy Regulation System
 *
 * > "Sometimes we match. Sometimes we gently lead."
 *
 * Sophisticated management of conversational energy:
 *
 * - **Energy Matching**: Mirror user's energy for rapport
 * - **Energy Leading**: Gently shift energy when helpful
 * - **Protective Grounding**: Bring down escalating distress
 * - **Uplift**: Gradually energize when appropriate
 * - **Stabilization**: Create calm, consistent presence
 *
 * The key insight: sometimes matching energy helps,
 * sometimes leading them somewhere better does.
 *
 * @module @ferni/energy-regulation
 */

import { createLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';

const logger = createLogger({ module: 'EnergyRegulation' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();

// ============================================================================
// TYPES
// ============================================================================

export type EnergyLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

export type EnergyValence = 'negative' | 'neutral' | 'positive';

export type RegulationStrategy =
  | 'match' // Mirror their energy
  | 'lead_up' // Gently raise energy
  | 'lead_down' // Gently lower energy
  | 'ground' // Create stability
  | 'contain' // Hold space without adding
  | 'celebrate' // Match and amplify positive
  | 'stabilize'; // Return to baseline

export interface EnergyState {
  /** Energy level (0-1) */
  level: number;

  /** Valence (-1 to 1) */
  valence: number;

  /** Stability (0-1) - how consistent is their energy */
  stability: number;

  /** Trajectory */
  trajectory: 'rising' | 'falling' | 'stable' | 'volatile';

  /** Categorized level */
  levelCategory: EnergyLevel;

  /** Categorized valence */
  valenceCategory: EnergyValence;
}

export interface RegulationDecision {
  /** Strategy to use */
  strategy: RegulationStrategy;

  /** Target energy level (0-1) */
  targetLevel: number;

  /** Target valence (-1 to 1) */
  targetValence: number;

  /** Strength of intervention (0-1) */
  interventionStrength: number;

  /** Reasoning */
  reasoning: string;

  /** Guidance for response */
  responseGuidance: EnergyGuidance;
}

export interface EnergyGuidance {
  /** Pace of speech */
  pace: 'slower' | 'normal' | 'faster';

  /** Volume/intensity */
  intensity: 'softer' | 'normal' | 'stronger';

  /** Affect in voice */
  affect: 'warmer' | 'calmer' | 'brighter' | 'steadier' | 'normal';

  /** Response length tendency */
  lengthTendency: 'shorter' | 'normal' | 'longer';

  /** Use of exclamations */
  exclamations: 'avoid' | 'minimal' | 'natural' | 'encouraged';

  /** Pause usage */
  pauses: 'more' | 'normal' | 'fewer';
}

export interface EnergyHistory {
  turn: number;
  state: EnergyState;
  timestamp: number;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** High energy indicators */
const HIGH_ENERGY_PATTERNS = [
  /!{2,}/, // Multiple exclamation marks
  /oh my (god|gosh)/i,
  /i can'?t (believe|wait)/i,
  /(so|really|very|super|extremely) (excited|happy|pumped|thrilled)/i,
  /this is (amazing|incredible|awesome|great)/i,
  /yes!+/i,
  /finally/i,
  /guess what/i,
];

/** Low energy indicators */
const LOW_ENERGY_PATTERNS = [
  /\.{3,}/, // Trailing off
  /^(yeah|ok|okay|sure|fine|whatever)\.?$/i,
  /i (guess|suppose|don'?t know)/i,
  /meh/i,
  /^(hmm|mm|uh)/i,
  /exhausted|tired|drained/i,
  /i (just )?can'?t/i,
  /what'?s the point/i,
];

/** Positive valence indicators */
const POSITIVE_VALENCE_PATTERNS = [
  /(happy|excited|thrilled|grateful|glad|relieved|hopeful)/i,
  /thank (you|god)/i,
  /(love|loving|loved) (it|this|that)/i,
  /(great|good|wonderful|amazing) (news|day|time)/i,
  /i did it/i,
  /it (worked|happened)/i,
  /ha(ha)+|lol|lmao/i,
];

/** Negative valence indicators */
const NEGATIVE_VALENCE_PATTERNS = [
  /(sad|angry|frustrated|annoyed|upset|hurt|scared|anxious|worried)/i,
  /(hate|hating|hated)/i,
  /i can'?t (take|stand|deal|handle)/i,
  /it'?s (awful|terrible|horrible|the worst)/i,
  /why (does|do|did|is|am) (this|i|everything)/i,
  /(ugh|argh|sigh)/i,
];

/** Escalation indicators */
const ESCALATION_PATTERNS = [
  /i just keep/i,
  /more and more/i,
  /getting worse/i,
  /can'?t stop/i,
  /every (time|day|single)/i,
  /always|never/i,
];

// ============================================================================
// ENERGY REGULATION ENGINE
// ============================================================================

export class EnergyRegulationEngine {
  private energyHistory: EnergyHistory[] = [];
  private currentUserEnergy: EnergyState;
  private agentTargetEnergy: EnergyState;
  private turnCount = 0;

  // Config
  private readonly HISTORY_SIZE = 10;
  private readonly LEAD_RATE = 0.15; // How much to lead per turn
  private readonly MATCH_THRESHOLD = 0.2; // How close is "matching"

  constructor() {
    this.currentUserEnergy = this.createDefaultState();
    this.agentTargetEnergy = this.createDefaultState();
    logger.debug('EnergyRegulationEngine initialized');
  }

  /**
   * Process user message and detect energy state
   *
   * @param userMessage - User's message
   * @param turnCount - Current turn
   * @param prosodyHints - Optional voice prosody hints
   * @returns Detected energy state
   */
  detectEnergy(
    userMessage: string,
    turnCount: number,
    prosodyHints?: {
      speechRate?: number;
      volume?: number;
      pitchVariance?: number;
    }
  ): EnergyState {
    this.turnCount = turnCount;

    // Analyze text for energy level
    let level = 0.5;
    let valence = 0;

    // Check high energy patterns
    const highMatches = HIGH_ENERGY_PATTERNS.filter((p) => p.test(userMessage)).length;
    const lowMatches = LOW_ENERGY_PATTERNS.filter((p) => p.test(userMessage)).length;

    level += highMatches * 0.12;
    level -= lowMatches * 0.12;

    // Check valence patterns
    const positiveMatches = POSITIVE_VALENCE_PATTERNS.filter((p) => p.test(userMessage)).length;
    const negativeMatches = NEGATIVE_VALENCE_PATTERNS.filter((p) => p.test(userMessage)).length;

    valence += positiveMatches * 0.2;
    valence -= negativeMatches * 0.2;

    // Message length hints
    // 🦀 Use Rust for O(1) word counting
    const wordCount = RUST_COUNTING_AVAILABLE
      ? countWordsRust(userMessage)
      : userMessage.split(/\s+/).length;
    if (wordCount > 80) level += 0.1; // Long = engaged
    if (wordCount < 5) level -= 0.1; // Short = disengaged

    // Punctuation hints
    const exclamationCount = (userMessage.match(/!/g) || []).length;
    const questionCount = (userMessage.match(/\?/g) || []).length;
    level += Math.min(0.15, exclamationCount * 0.05);
    level += Math.min(0.1, questionCount * 0.03);

    // Incorporate prosody if available
    if (prosodyHints) {
      if (prosodyHints.speechRate !== undefined) {
        // Fast = high energy, slow = low energy
        level += (prosodyHints.speechRate - 1) * 0.2;
      }
      if (prosodyHints.volume !== undefined) {
        level += (prosodyHints.volume - 0.5) * 0.2;
      }
      if (prosodyHints.pitchVariance !== undefined) {
        // High variance = emotional
        level += prosodyHints.pitchVariance * 0.1;
      }
    }

    // Clamp values
    level = Math.max(0, Math.min(1, level));
    valence = Math.max(-1, Math.min(1, valence));

    // Calculate stability from history
    const stability = this.calculateStability();

    // Calculate trajectory
    const trajectory = this.calculateTrajectory(level);

    const state: EnergyState = {
      level,
      valence,
      stability,
      trajectory,
      levelCategory: this.categorizeLevel(level),
      valenceCategory: this.categorizeValence(valence),
    };

    // Record history
    this.energyHistory.push({ turn: turnCount, state, timestamp: Date.now() });
    if (this.energyHistory.length > this.HISTORY_SIZE) {
      this.energyHistory.shift();
    }

    this.currentUserEnergy = state;

    logger.debug(
      {
        level: state.level.toFixed(2),
        valence: state.valence.toFixed(2),
        trajectory: state.trajectory,
        levelCategory: state.levelCategory,
      },
      '⚡ Energy detected'
    );

    return state;
  }

  /**
   * Decide how to regulate energy
   *
   * @param userState - User's current energy state
   * @param context - Additional context
   * @returns Regulation decision
   */
  decide(
    userState: EnergyState,
    context: {
      isEmotionalContent?: boolean;
      isCrisis?: boolean;
      turnCount: number;
      comfortLevel?: number;
    }
  ): RegulationDecision {
    let strategy: RegulationStrategy = 'match';
    let targetLevel = userState.level;
    let targetValence = userState.valence;
    let interventionStrength = 0.3;
    let reasoning = '';

    // Crisis always grounds
    if (context.isCrisis) {
      strategy = 'ground';
      targetLevel = 0.4;
      targetValence = 0.1;
      interventionStrength = 0.7;
      reasoning = 'Crisis detected - grounding to provide stability';
    }
    // Very high negative energy - lead down
    else if (userState.level > 0.75 && userState.valence < -0.3) {
      strategy = 'lead_down';
      targetLevel = userState.level - this.LEAD_RATE * 2;
      targetValence = userState.valence + this.LEAD_RATE;
      interventionStrength = 0.6;
      reasoning = 'High negative energy - gently leading toward calm';
    }
    // Escalating negative - contain and ground
    else if (userState.trajectory === 'rising' && userState.valence < -0.2) {
      strategy = 'contain';
      targetLevel = 0.5;
      targetValence = 0;
      interventionStrength = 0.5;
      reasoning = 'Escalating negative energy - containing';
    }
    // Very low energy - gentle lift
    else if (userState.level < 0.25 && userState.valence >= -0.2) {
      strategy = 'lead_up';
      targetLevel = userState.level + this.LEAD_RATE;
      targetValence = Math.min(0.3, userState.valence + 0.1);
      interventionStrength = 0.4;
      reasoning = 'Low energy - gentle lift';
    }
    // High positive - celebrate!
    else if (userState.level > 0.7 && userState.valence > 0.3) {
      strategy = 'celebrate';
      targetLevel = userState.level;
      targetValence = userState.valence;
      interventionStrength = 0.8;
      reasoning = 'High positive energy - matching and celebrating';
    }
    // Volatile - stabilize
    else if (userState.stability < 0.3) {
      strategy = 'stabilize';
      targetLevel = 0.5;
      targetValence = 0.1;
      interventionStrength = 0.4;
      reasoning = 'Volatile energy - stabilizing';
    }
    // Default: match with slight positivity
    else {
      strategy = 'match';
      targetLevel = userState.level;
      targetValence = userState.valence + 0.05; // Slight positive offset
      interventionStrength = 0.3;
      reasoning = 'Stable state - matching energy';
    }

    // Get response guidance
    const responseGuidance = this.getResponseGuidance(strategy, userState, targetLevel);

    this.agentTargetEnergy = {
      level: targetLevel,
      valence: targetValence,
      stability: 0.8, // Agent stays stable
      trajectory: 'stable',
      levelCategory: this.categorizeLevel(targetLevel),
      valenceCategory: this.categorizeValence(targetValence),
    };

    logger.debug(
      {
        strategy,
        targetLevel: targetLevel.toFixed(2),
        interventionStrength: interventionStrength.toFixed(2),
        reasoning,
      },
      '🎚️ Energy regulation decision'
    );

    return {
      strategy,
      targetLevel,
      targetValence,
      interventionStrength,
      reasoning,
      responseGuidance,
    };
  }

  /**
   * Get current energy state
   */
  getCurrentState(): {
    user: EnergyState;
    agentTarget: EnergyState;
  } {
    return {
      user: { ...this.currentUserEnergy },
      agentTarget: { ...this.agentTargetEnergy },
    };
  }

  /**
   * Get energy history
   */
  getHistory(): EnergyHistory[] {
    return [...this.energyHistory];
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.energyHistory = [];
    this.currentUserEnergy = this.createDefaultState();
    this.agentTargetEnergy = this.createDefaultState();
    this.turnCount = 0;
    logger.debug('EnergyRegulationEngine reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createDefaultState(): EnergyState {
    return {
      level: 0.5,
      valence: 0,
      stability: 0.7,
      trajectory: 'stable',
      levelCategory: 'moderate',
      valenceCategory: 'neutral',
    };
  }

  private categorizeLevel(level: number): EnergyLevel {
    if (level < 0.2) return 'very_low';
    if (level < 0.4) return 'low';
    if (level < 0.6) return 'moderate';
    if (level < 0.8) return 'high';
    return 'very_high';
  }

  private categorizeValence(valence: number): EnergyValence {
    if (valence < -0.2) return 'negative';
    if (valence > 0.2) return 'positive';
    return 'neutral';
  }

  private calculateStability(): number {
    if (this.energyHistory.length < 3) return 0.7;

    const recentLevels = this.energyHistory.slice(-5).map((h) => h.state.level);
    const mean = recentLevels.reduce((a, b) => a + b, 0) / recentLevels.length;
    const variance =
      recentLevels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentLevels.length;

    // Low variance = high stability
    return Math.max(0, 1 - Math.sqrt(variance) * 3);
  }

  private calculateTrajectory(currentLevel: number): EnergyState['trajectory'] {
    if (this.energyHistory.length < 2) return 'stable';

    const recentLevels = this.energyHistory.slice(-3).map((h) => h.state.level);
    recentLevels.push(currentLevel);

    // Check for consistent direction
    let rising = 0;
    let falling = 0;
    for (let i = 1; i < recentLevels.length; i++) {
      if (recentLevels[i] > recentLevels[i - 1] + 0.05) rising++;
      else if (recentLevels[i] < recentLevels[i - 1] - 0.05) falling++;
    }

    if (rising >= 2) return 'rising';
    if (falling >= 2) return 'falling';
    if (rising >= 1 && falling >= 1) return 'volatile';
    return 'stable';
  }

  private getResponseGuidance(
    strategy: RegulationStrategy,
    userState: EnergyState,
    targetLevel: number
  ): EnergyGuidance {
    const guidance: EnergyGuidance = {
      pace: 'normal',
      intensity: 'normal',
      affect: 'normal',
      lengthTendency: 'normal',
      exclamations: 'natural',
      pauses: 'normal',
    };

    switch (strategy) {
      case 'lead_down':
      case 'ground':
        guidance.pace = 'slower';
        guidance.intensity = 'softer';
        guidance.affect = 'calmer';
        guidance.lengthTendency = 'shorter';
        guidance.exclamations = 'avoid';
        guidance.pauses = 'more';
        break;

      case 'lead_up':
        guidance.pace = 'normal';
        guidance.intensity = 'normal';
        guidance.affect = 'brighter';
        guidance.lengthTendency = 'normal';
        guidance.exclamations = 'minimal';
        guidance.pauses = 'normal';
        break;

      case 'celebrate':
        guidance.pace = 'faster';
        guidance.intensity = 'stronger';
        guidance.affect = 'brighter';
        guidance.lengthTendency = 'normal';
        guidance.exclamations = 'encouraged';
        guidance.pauses = 'fewer';
        break;

      case 'contain':
        guidance.pace = 'slower';
        guidance.intensity = 'normal';
        guidance.affect = 'steadier';
        guidance.lengthTendency = 'shorter';
        guidance.exclamations = 'avoid';
        guidance.pauses = 'more';
        break;

      case 'stabilize':
        guidance.pace = 'normal';
        guidance.intensity = 'normal';
        guidance.affect = 'steadier';
        guidance.lengthTendency = 'normal';
        guidance.exclamations = 'minimal';
        guidance.pauses = 'normal';
        break;

      case 'match':
      default:
        // Match based on user state
        if (userState.level < 0.4) {
          guidance.pace = 'slower';
          guidance.affect = 'warmer';
        } else if (userState.level > 0.7) {
          guidance.pace = 'faster';
          guidance.affect = 'brighter';
          guidance.exclamations = 'natural';
        }
        break;
    }

    return guidance;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';

const energyRegulationRegistry = createSessionRegistry(
  (sessionId: string) => new EnergyRegulationEngine(),
  { name: 'EnergyRegulation', cleanup: (engine) => engine.reset(), verbose: false }
);

registerGlobalRegistry(energyRegulationRegistry);

export function getEnergyRegulationEngine(sessionId: string): EnergyRegulationEngine {
  return energyRegulationRegistry.get(sessionId);
}

export function resetEnergyRegulationEngine(sessionId: string): void {
  const engine = energyRegulationRegistry.get(sessionId);
  engine.reset();
}

export function clearEnergyRegulationEngine(sessionId: string): void {
  energyRegulationRegistry.reset(sessionId);
}

export function getActiveEnergyRegulationCount(): number {
  return energyRegulationRegistry.getActiveCount();
}

export default EnergyRegulationEngine;
