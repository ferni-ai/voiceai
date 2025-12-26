/**
 * Session Dynamics - Conversation Energy Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Human conversations have a natural arc:
 * 1. **Opening**: Warming up, establishing rapport
 * 2. **Warming**: Building comfort, finding rhythm
 * 3. **Engaged**: Peak conversation, full presence
 * 4. **Deepening**: More vulnerable territory
 * 5. **Winding**: Natural conclusion approaching
 * 6. **Extended**: Special dynamics for long sessions
 *
 * This module tracks conversation phase and provides phase-appropriate
 * behavior guidance for more natural conversation flow.
 *
 * @module @ferni/humanization/session-dynamics
 */

import { seededChance, seededPick, seededIndex } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'SessionDynamics' });

// ============================================================================
// TYPES
// ============================================================================

export type ConversationPhase =
  | 'opening' // 0-3 turns
  | 'warming' // 4-8 turns
  | 'engaged' // 9-20 turns
  | 'deepening' // 20-35 turns
  | 'winding' // 35+ turns
  | 'extended'; // 50+ turns

export interface PhaseBehavior {
  /** Greeting style */
  greeting: 'warm' | 'casual' | 'familiar' | null;

  /** Question asking style */
  questionStyle:
    | 'open_exploratory'
    | 'building_on_previous'
    | 'deep_exploratory'
    | 'profound'
    | 'consolidating'
    | 'checking_in';

  /** Response length preference */
  responseLength:
    | 'brief'
    | 'moderate'
    | 'adaptive'
    | 'matches_user'
    | 'thoughtful'
    | 'brief_unless_needed';

  /** Personal sharing level */
  personalSharing: 'minimal' | 'occasional' | 'natural' | 'earned' | 'summarizing' | 'deep_history';

  /** Vulnerability level available */
  vulnerability: 'low' | 'building' | 'matched' | 'high_available' | 'maintaining' | 'full_trust';

  /** Energy range [min, max] */
  energyRange: [number, number];

  /** Phase-specific behaviors */
  specialBehaviors: string[];
}

export interface SessionDynamicsState {
  /** Current phase */
  phase: ConversationPhase;

  /** Progress within phase (0-1) */
  phaseProgress: number;

  /** Turn count */
  turnCount: number;

  /** Session duration in minutes */
  sessionMinutes: number;

  /** Baseline energy */
  baselineEnergy: number;

  /** Current energy */
  currentEnergy: number;

  /** Peak energy reached this session */
  peakEnergy: number;

  /** Has there been a "deep moment" this session? */
  hadDeepMoment: boolean;

  /** Is conversation winding down naturally? */
  naturallyWinding: boolean;
}

export interface SessionEnergyArc {
  /** Opening warmth boost */
  openingWarmth: number;

  /** Peak phase energy boost */
  engagementBoost: number;

  /** Winding phase gentleness */
  windingGentleness: number;
}

// ============================================================================
// PHASE DEFINITIONS
// ============================================================================

const PHASE_BEHAVIORS: Record<ConversationPhase, PhaseBehavior> = {
  opening: {
    greeting: 'warm',
    questionStyle: 'open_exploratory',
    responseLength: 'moderate',
    personalSharing: 'minimal',
    vulnerability: 'low',
    energyRange: [0.5, 0.7],
    specialBehaviors: [
      'Ask about their day/state',
      'Use their name if known',
      'Match their greeting energy',
      'Keep responses accessible',
      'Avoid deep probing yet',
    ],
  },

  warming: {
    greeting: null,
    questionStyle: 'building_on_previous',
    responseLength: 'adaptive',
    personalSharing: 'occasional',
    vulnerability: 'building',
    energyRange: [0.6, 0.8],
    specialBehaviors: [
      'Reference earlier topics',
      'Can begin gentle challenges',
      'Humor becomes more natural',
      'Test comfort with personal questions',
      'Build on what they share',
    ],
  },

  engaged: {
    greeting: null,
    questionStyle: 'deep_exploratory',
    responseLength: 'matches_user',
    personalSharing: 'natural',
    vulnerability: 'matched',
    energyRange: [0.7, 0.95],
    specialBehaviors: [
      'Peak responsiveness',
      'Full emotional range available',
      'Running jokes can emerge',
      'Physical presence cues natural',
      'Can challenge directly',
      'Deep callbacks possible',
    ],
  },

  deepening: {
    greeting: null,
    questionStyle: 'profound',
    responseLength: 'thoughtful',
    personalSharing: 'earned',
    vulnerability: 'high_available',
    energyRange: [0.5, 0.85],
    specialBehaviors: [
      'Longer silences acceptable',
      'Deep callbacks to session start',
      'Mind-changing more impactful',
      'Contradiction surfacing natural',
      'Pattern naming available',
      'Can hold space without filling',
    ],
  },

  winding: {
    greeting: null,
    questionStyle: 'consolidating',
    responseLength: 'brief_unless_needed',
    personalSharing: 'summarizing',
    vulnerability: 'maintaining',
    energyRange: [0.4, 0.7],
    specialBehaviors: [
      'Acknowledge session length',
      'Offer to summarize',
      'Plant seeds for next conversation',
      'Warmth increases for goodbye',
      'Consolidate insights',
      'Express appreciation',
    ],
  },

  extended: {
    greeting: null,
    questionStyle: 'checking_in',
    responseLength: 'brief_unless_needed',
    personalSharing: 'deep_history',
    vulnerability: 'full_trust',
    energyRange: [0.4, 0.6],
    specialBehaviors: [
      'More frequent check-ins',
      'Reference earlier session points',
      'Can acknowledge mutual fatigue',
      'May suggest break/continuation',
      'Ultra-deep territory available',
      'Relationship feels established',
    ],
  },
};

// ============================================================================
// PHASE TRANSITIONS
// ============================================================================

const PHASE_TURN_RANGES: Record<ConversationPhase, [number, number]> = {
  opening: [0, 3],
  warming: [4, 8],
  engaged: [9, 20],
  deepening: [21, 35],
  winding: [36, 50],
  extended: [51, Infinity],
};

// ============================================================================
// SESSION DYNAMICS ENGINE
// ============================================================================

export class SessionDynamicsEngine {
  private state: SessionDynamicsState;
  private sessionStartTime: number;

  constructor() {
    this.sessionStartTime = Date.now();
    this.state = this.createInitialState();
    logger.debug('SessionDynamicsEngine initialized');
  }

  /**
   * Update session state based on turn
   */
  update(context: {
    turnCount: number;
    userEnergy?: 'high' | 'medium' | 'low';
    topicWeight?: 'light' | 'medium' | 'heavy';
    wasDeepMoment?: boolean;
    userInitiatedWindDown?: boolean;
  }): void {
    const { turnCount, userEnergy, topicWeight, wasDeepMoment, userInitiatedWindDown } = context;

    // Update basic metrics
    this.state.turnCount = turnCount;
    this.state.sessionMinutes = Math.floor((Date.now() - this.sessionStartTime) / 60000);

    // Track deep moments
    if (wasDeepMoment) {
      this.state.hadDeepMoment = true;
    }

    // Track natural winding
    if (userInitiatedWindDown) {
      this.state.naturallyWinding = true;
    }

    // Determine phase
    const newPhase = this.determinePhase(turnCount);
    if (newPhase !== this.state.phase) {
      logger.debug(
        { fromPhase: this.state.phase, toPhase: newPhase, turnCount },
        '📈 Phase transition'
      );
      this.state.phase = newPhase;
    }

    // Calculate phase progress
    this.state.phaseProgress = this.calculatePhaseProgress(turnCount, newPhase);

    // Update energy based on context
    this.updateEnergy(userEnergy, topicWeight);
  }

  /**
   * Get current phase behavior guidance
   */
  getPhaseBehavior(): PhaseBehavior {
    return PHASE_BEHAVIORS[this.state.phase];
  }

  /**
   * Get energy arc adjustments
   */
  getEnergyArc(): SessionEnergyArc {
    const phase = this.state.phase;

    return {
      openingWarmth: phase === 'opening' ? 0.15 : 0,
      engagementBoost: phase === 'engaged' ? 0.1 : 0,
      windingGentleness: phase === 'winding' || phase === 'extended' ? 0.1 : 0,
    };
  }

  /**
   * Get recommended energy level
   */
  getRecommendedEnergy(): number {
    const behavior = PHASE_BEHAVIORS[this.state.phase];
    const [min, max] = behavior.energyRange;

    // Current energy within phase range
    return Math.max(min, Math.min(max, this.state.currentEnergy));
  }

  /**
   * Check if a behavior is appropriate for current phase
   */
  isBehaviorAppropriate(behavior: string): boolean {
    const phaseBehavior = PHASE_BEHAVIORS[this.state.phase];
    return phaseBehavior.specialBehaviors.some((b) =>
      b.toLowerCase().includes(behavior.toLowerCase())
    );
  }

  /**
   * Get phase-appropriate response length
   */
  getResponseLengthGuidance(): {
    min: number;
    max: number;
    ideal: number;
  } {
    const behavior = PHASE_BEHAVIORS[this.state.phase];

    switch (behavior.responseLength) {
      case 'brief':
        return { min: 10, max: 50, ideal: 30 };
      case 'moderate':
        return { min: 30, max: 100, ideal: 60 };
      case 'adaptive':
        return { min: 20, max: 120, ideal: 70 };
      case 'matches_user':
        return { min: 20, max: 150, ideal: 80 };
      case 'thoughtful':
        return { min: 40, max: 150, ideal: 90 };
      case 'brief_unless_needed':
        return { min: 15, max: 80, ideal: 40 };
      default:
        return { min: 30, max: 100, ideal: 60 };
    }
  }

  /**
   * Get phase-appropriate question style description
   */
  getQuestionStyleDescription(): string {
    const behavior = PHASE_BEHAVIORS[this.state.phase];

    switch (behavior.questionStyle) {
      case 'open_exploratory':
        return 'Open-ended questions to explore. "What brings you here today?"';
      case 'building_on_previous':
        return 'Build on what they shared. "You mentioned X—tell me more."';
      case 'deep_exploratory':
        return 'Go deeper. "What\'s underneath that feeling?"';
      case 'profound':
        return 'Profound questions. "What would it mean if that were true?"';
      case 'consolidating':
        return 'Consolidate insights. "What stands out from our conversation?"';
      case 'checking_in':
        return 'Check in gently. "How are you doing with all this?"';
      default:
        return 'Ask naturally based on context.';
    }
  }

  /**
   * Check if conversation should naturally wind down
   */
  shouldSuggestWindDown(): boolean {
    // Extended phase or high turn count
    if (this.state.phase === 'extended' || this.state.turnCount > 45) {
      // Only suggest occasionally
      return seededChance(`${Date.now()}:388`, 0.15);
    }

    // Long session time
    if (this.state.sessionMinutes > 40) {
      return seededChance(`${Date.now()}:393`, 0.1);
    }

    return false;
  }

  /**
   * Get wind-down phrase if appropriate
   */
  getWindDownPhrase(): string | null {
    if (!this.shouldSuggestWindDown()) {
      return null;
    }

    const phrases = [
      "We've covered a lot today. Is there anything else on your mind?",
      'This has been a rich conversation. Anything you want to make sure we touch on?',
      "I'm conscious we've been talking a while. How are you feeling about where we are?",
      'Want to start winding down, or is there something else you want to explore?',
    ];

    return seededPick(`${Date.now()}:414`, phrases) ?? phrases[0];
  }

  /**
   * Get current state
   */
  getState(): SessionDynamicsState {
    return { ...this.state };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.sessionStartTime = Date.now();
    this.state = this.createInitialState();
    logger.debug('SessionDynamicsEngine reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialState(): SessionDynamicsState {
    return {
      phase: 'opening',
      phaseProgress: 0,
      turnCount: 0,
      sessionMinutes: 0,
      baselineEnergy: 0.6,
      currentEnergy: 0.6,
      peakEnergy: 0.6,
      hadDeepMoment: false,
      naturallyWinding: false,
    };
  }

  private determinePhase(turnCount: number): ConversationPhase {
    // Override to winding if user initiated
    if (this.state.naturallyWinding && turnCount > 20) {
      return 'winding';
    }

    // Check each phase range
    for (const [phase, [min, max]] of Object.entries(PHASE_TURN_RANGES)) {
      if (turnCount >= min && turnCount <= max) {
        return phase as ConversationPhase;
      }
    }

    return 'extended';
  }

  private calculatePhaseProgress(turnCount: number, phase: ConversationPhase): number {
    const [min, max] = PHASE_TURN_RANGES[phase];
    if (max === Infinity) {
      // Extended phase - slow progress
      return Math.min(1, (turnCount - min) / 50);
    }
    return (turnCount - min) / (max - min);
  }

  private updateEnergy(
    userEnergy?: 'high' | 'medium' | 'low',
    topicWeight?: 'light' | 'medium' | 'heavy'
  ): void {
    let energy = this.state.currentEnergy;

    // User energy influence
    if (userEnergy === 'high') {
      energy = Math.min(0.95, energy + 0.05);
    } else if (userEnergy === 'low') {
      energy = Math.max(0.4, energy - 0.03);
    }

    // Topic weight influence
    if (topicWeight === 'light') {
      energy = Math.min(0.9, energy + 0.02);
    } else if (topicWeight === 'heavy') {
      energy = Math.max(0.4, energy - 0.04);
    }

    // Apply phase bounds
    const [min, max] = PHASE_BEHAVIORS[this.state.phase].energyRange;
    energy = Math.max(min, Math.min(max, energy));

    // Track peak
    if (energy > this.state.peakEnergy) {
      this.state.peakEnergy = energy;
    }

    this.state.currentEnergy = energy;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, SessionDynamicsEngine>();

export function getSessionDynamicsEngine(sessionId: string): SessionDynamicsEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new SessionDynamicsEngine());
  }
  return engines.get(sessionId)!;
}

export function resetSessionDynamicsEngine(sessionId: string): void {
  const engine = engines.get(sessionId);
  if (engine) {
    engine.reset();
    engines.delete(sessionId);
  }
}

export function resetAllSessionDynamicsEngines(): void {
  engines.clear();
}

export default SessionDynamicsEngine;
