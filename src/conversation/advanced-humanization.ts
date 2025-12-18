/**
 * Advanced Humanization Orchestrator
 *
 * > "The whole is greater than the sum of its parts."
 *
 * Coordinates all 10 advanced humanization capabilities:
 *
 * 1. **Subtext Detection** - Read between the lines
 * 2. **Emotional Aftercare** - Guide back to equilibrium
 * 3. **Conversational Repair** - Recover from miscommunication
 * 4. **Hope Injection** - Subtle forward-looking language
 * 5. **Curiosity Engine** - Genuine interest in their life
 * 6. **Energy Regulation** - Lead vs match energy
 * 7. **Micro-Affirmations** - Tiny validations throughout
 * 8. **Temporal Context** - Life rhythm awareness
 * 9. **Relationship Events** - Track milestones
 * 10. **Paradoxical Intervention** - Know when advice backfires
 *
 * This orchestrator provides a unified interface for the voice agent
 * to leverage all these capabilities intelligently.
 *
 * @module @ferni/advanced-humanization
 */

import { createLogger } from '../utils/safe-logger.js';

// Import all engines
import {
  getSubtextDetectionEngine,
  resetSubtextDetectionEngine,
  type SubtextDetection,
} from './subtext-detection.js';

import {
  getEmotionalAftercareEngine,
  resetEmotionalAftercareEngine,
  type AftercareGuidance,
  type AftercareState,
} from './emotional-aftercare.js';

import {
  getConversationalRepairEngine,
  resetConversationalRepairEngine,
  type RepairDecision,
} from './conversational-repair.js';

import {
  getHopeInjectionEngine,
  resetHopeInjectionEngine,
  type HopeGuidance,
} from './hope-injection.js';

import { getCuriosityEngine, type CuriosityPrompt } from './curiosity-engine.js';

import {
  getEnergyRegulationEngine,
  resetEnergyRegulationEngine,
  type EnergyState,
  type RegulationDecision,
} from './energy-regulation.js';

import {
  getMicroAffirmationEngine,
  resetMicroAffirmationEngine,
  type AffirmationDecision,
} from './micro-affirmations.js';

import {
  getTemporalContextEngine,
  type TemporalGuidance,
  type TemporalState,
} from './temporal-context.js';

import {
  getRelationshipEventsEngine,
  type MilestoneOpportunity,
  type RelationshipState,
} from './relationship-events.js';

import {
  getParadoxicalInterventionEngine,
  resetParadoxicalInterventionEngine,
  type InterventionDecision,
  type ResistanceDetection,
} from './paradoxical-intervention.js';

const logger = createLogger({ module: 'AdvancedHumanization' });

// ============================================================================
// TYPES
// ============================================================================

export interface AdvancedHumanizationContext {
  /** User's message */
  userMessage: string;

  /** Current turn count */
  turnCount: number;

  /** Session ID */
  sessionId: string;

  /** User ID (for cross-session features) */
  userId: string;

  /** Detected emotion (optional) */
  detectedEmotion?: string;

  /** Detected valence (-1 to 1) */
  valence?: number;

  /** Detected arousal (0-1) */
  arousal?: number;

  /** Was advice just given? */
  wasAdviceGiven?: boolean;

  /** Recent topics */
  recentTopics?: string[];

  /** Relationship depth */
  relationshipDepth?: 'new' | 'developing' | 'established' | 'deep';

  /** Prosody hints from audio analysis */
  prosodyHints?: {
    speechRate?: number;
    volume?: number;
    pitchVariance?: number;
  };

  /** Is this near the end of conversation? */
  isNearEnd?: boolean;
}

export interface AdvancedHumanizationResult {
  // ========================================================================
  // DETECTIONS (what we noticed)
  // ========================================================================

  /** Subtext detected in user message */
  subtext: SubtextDetection;

  /** Resistance to advice detected */
  resistance: ResistanceDetection;

  /** User's current energy state */
  energyState: EnergyState;

  // ========================================================================
  // GUIDANCE (how to respond)
  // ========================================================================

  /** Emotional aftercare status */
  aftercare: {
    state: AftercareState;
    guidance: AftercareGuidance;
  };

  /** Energy regulation recommendation */
  energyGuidance: RegulationDecision;

  /** Conversational repair recommendation */
  repair: RepairDecision;

  /** Hope injection opportunity */
  hope: HopeGuidance;

  /** Paradoxical intervention recommendation */
  paradoxical: InterventionDecision;

  /** Temporal context */
  temporal: {
    state: TemporalState;
    guidance: TemporalGuidance;
  };

  // ========================================================================
  // INJECTIONS (things to add to response)
  // ========================================================================

  /** Micro-affirmation to include */
  affirmation: AffirmationDecision;

  /** Curiosity prompt to potentially ask */
  curiosityPrompt: CuriosityPrompt | null;

  /** Milestone acknowledgment opportunity */
  milestone: MilestoneOpportunity | null;

  // ========================================================================
  // META (overall guidance)
  // ========================================================================

  /** Should we stop giving direct advice? */
  stopDirectAdvice: boolean;

  /** Overall tone guidance */
  toneGuidance: string;

  /** Response length recommendation */
  lengthGuidance: 'shorter' | 'normal' | 'longer';

  /** Priority actions (most important things to address) */
  priorityActions: string[];
}

export interface SessionStartResult {
  /** Greeting appropriate for time/relationship */
  greeting: string | null;

  /** Event follow-up if applicable */
  eventFollowUp: string | null;

  /** Milestone acknowledgment if applicable */
  milestoneAcknowledgment: string | null;

  /** Temporal context */
  temporalState: TemporalState;

  /** Relationship state */
  relationshipState: RelationshipState;
}

// ============================================================================
// ADVANCED HUMANIZATION ORCHESTRATOR
// ============================================================================

export class AdvancedHumanizationOrchestrator {
  private sessionId: string;
  private userId: string;
  private turnCount = 0;

  // Track last agent message for repair detection
  private lastAgentMessage: string | null = null;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;

    logger.debug({ sessionId, userId }, '🌟 AdvancedHumanizationOrchestrator initialized');
  }

  /**
   * Initialize at session start
   * Returns greeting, event follow-ups, milestones, etc.
   */
  startSession(): SessionStartResult {
    const temporalEngine = getTemporalContextEngine(this.userId);
    const relationshipEngine = getRelationshipEventsEngine(this.userId);

    // Start new session in relationship engine
    relationshipEngine.startSession();

    // Get temporal context
    const now = new Date();
    const temporalState = temporalEngine.getState(now);
    const temporalGuidance = temporalEngine.getGuidance(1, now);

    // Get relationship state
    const relationshipState = relationshipEngine.getState();

    // Check for milestone opportunity
    const milestone = relationshipEngine.checkMilestoneOpportunity(1);

    // Check for significant dates
    const dateCheck = relationshipEngine.checkSignificantDateProximity(now);

    logger.debug(
      {
        temporalMood: temporalState.mood,
        totalSessions: relationshipState.totalSessions,
        hasMilestone: !!milestone,
      },
      '🌅 Session started'
    );

    return {
      greeting: temporalGuidance.greeting,
      eventFollowUp: temporalGuidance.eventFollowUp || dateCheck,
      milestoneAcknowledgment: milestone?.shouldAcknowledge ? milestone.phrase : null,
      temporalState,
      relationshipState,
    };
  }

  /**
   * Process a user turn and get comprehensive guidance
   */
  processTurn(context: AdvancedHumanizationContext): AdvancedHumanizationResult {
    this.turnCount = context.turnCount;

    // Get all engines
    const subtextEngine = getSubtextDetectionEngine(this.sessionId);
    const aftercareEngine = getEmotionalAftercareEngine(this.sessionId);
    const repairEngine = getConversationalRepairEngine(this.sessionId);
    const hopeEngine = getHopeInjectionEngine(this.sessionId);
    const curiosityEngine = getCuriosityEngine(this.userId);
    const energyEngine = getEnergyRegulationEngine(this.sessionId);
    const affirmationEngine = getMicroAffirmationEngine(this.sessionId);
    const temporalEngine = getTemporalContextEngine(this.userId);
    const relationshipEngine = getRelationshipEventsEngine(this.userId);
    const paradoxicalEngine = getParadoxicalInterventionEngine(this.sessionId);

    // ========================================================================
    // DETECTIONS
    // ========================================================================

    // Detect subtext
    const subtext = subtextEngine.detect({
      userMessage: context.userMessage,
      turnCount: context.turnCount,
      relationshipDepth: context.relationshipDepth || 'developing',
      emotionalState: context.detectedEmotion,
    });

    // Detect energy state
    const energyState = energyEngine.detectEnergy(
      context.userMessage,
      context.turnCount,
      context.prosodyHints
    );

    // Detect resistance to advice
    const resistance = paradoxicalEngine.detectResistance(
      context.userMessage,
      context.turnCount,
      context.wasAdviceGiven || false
    );

    // Record turn for repair detection
    repairEngine.recordTurn('user', context.userMessage, context.turnCount);

    // ========================================================================
    // PROCESS STATE
    // ========================================================================

    // Process emotional aftercare
    const aftercareState = aftercareEngine.processTurn(
      context.userMessage,
      context.turnCount,
      context.detectedEmotion
    );
    const aftercareGuidance = aftercareEngine.getGuidance();

    // Process curiosity (extract life details, threads)
    curiosityEngine.processMessage(context.userMessage, context.turnCount);

    // Extract events for temporal awareness
    temporalEngine.extractEvents(context.userMessage, context.turnCount);

    // ========================================================================
    // GET GUIDANCE
    // ========================================================================

    // Energy regulation decision
    const energyGuidance = energyEngine.decide(energyState, {
      isEmotionalContent: aftercareState.emotionalDebt > 0.3,
      turnCount: context.turnCount,
    });

    // Repair decision
    const repair = repairEngine.analyze(context.userMessage, this.lastAgentMessage || undefined);

    // Hope injection analysis
    const hope = hopeEngine.analyze(context.userMessage, context.turnCount);

    // Paradoxical intervention decision
    const paradoxical = paradoxicalEngine.decide(resistance);

    // Temporal guidance
    const temporalState = temporalEngine.getState();
    const temporalGuidance = temporalEngine.getGuidance(context.turnCount);

    // ========================================================================
    // GET INJECTIONS
    // ========================================================================

    // Micro-affirmation
    const affirmation = affirmationEngine.decide(context.userMessage, context.turnCount);

    // Curiosity prompt
    const curiosityPrompt = curiosityEngine.getCuriosityPrompt(
      context.turnCount,
      context.recentTopics
    );

    // Milestone opportunity
    const milestone = relationshipEngine.checkMilestoneOpportunity(context.turnCount);

    // ========================================================================
    // COMPUTE META GUIDANCE
    // ========================================================================

    const stopDirectAdvice =
      paradoxical.stopDirectAdvice ||
      (resistance.detected && resistance.count >= 2) ||
      aftercareState.priority === 'urgent';

    const toneGuidance = this.computeToneGuidance(
      aftercareGuidance,
      energyGuidance,
      temporalState,
      subtext
    );

    const lengthGuidance = this.computeLengthGuidance(aftercareState, energyState, subtext, repair);

    const priorityActions = this.computePriorityActions(
      subtext,
      aftercareState,
      repair,
      resistance,
      milestone
    );

    // ========================================================================
    // TRACK FIRST-TIME EVENTS
    // ========================================================================

    // Check if this is a vulnerability moment
    if (subtext.type === 'testing_waters' || subtext.type === 'seeking_permission') {
      relationshipEngine.recordFirstEvent('vulnerability', context.userMessage.slice(0, 50));
    }

    // Log comprehensive result
    logger.debug(
      {
        turn: context.turnCount,
        subtext: subtext.type,
        aftercarePhase: aftercareState.phase,
        energy: energyState.levelCategory,
        resistance: resistance.detected,
        stopAdvice: stopDirectAdvice,
        priorityCount: priorityActions.length,
      },
      '🎭 Turn processed'
    );

    return {
      subtext,
      resistance,
      energyState,
      aftercare: {
        state: aftercareState,
        guidance: aftercareGuidance,
      },
      energyGuidance,
      repair,
      hope,
      paradoxical,
      temporal: {
        state: temporalState,
        guidance: temporalGuidance,
      },
      affirmation,
      curiosityPrompt,
      milestone: milestone?.shouldAcknowledge ? milestone : null,
      stopDirectAdvice,
      toneGuidance,
      lengthGuidance,
      priorityActions,
    };
  }

  /**
   * Record agent response (for repair detection on next turn)
   */
  recordAgentResponse(response: string): void {
    this.lastAgentMessage = response;

    const repairEngine = getConversationalRepairEngine(this.sessionId);
    repairEngine.recordTurn('agent', response, this.turnCount);
  }

  /**
   * Record that advice was given (for resistance tracking)
   */
  recordAdviceGiven(advice: string): void {
    // Will be used when user responds
    this.lastAgentMessage = advice;
  }

  /**
   * Record if previous advice was accepted or rejected
   */
  recordAdviceOutcome(wasAccepted: boolean): void {
    const paradoxicalEngine = getParadoxicalInterventionEngine(this.sessionId);
    paradoxicalEngine.recordAdviceResponse(
      this.turnCount,
      this.lastAgentMessage || '',
      wasAccepted ? 'accepted' : 'rejected'
    );
  }

  /**
   * Record a relationship milestone manually
   */
  recordMilestone(type: 'vulnerability' | 'breakthrough' | 'inside_joke', context?: string): void {
    const relationshipEngine = getRelationshipEventsEngine(this.userId);
    relationshipEngine.recordFirstEvent(type, context);
  }

  /**
   * Add a shared memory (inside joke, phrase)
   */
  addSharedMemory(content: string, category: 'joke' | 'phrase' | 'reference'): void {
    const relationshipEngine = getRelationshipEventsEngine(this.userId);
    relationshipEngine.addSharedMemory(content, category);
  }

  /**
   * Add a significant date to remember
   */
  addSignificantDate(date: Date, description: string): void {
    const relationshipEngine = getRelationshipEventsEngine(this.userId);
    relationshipEngine.addSignificantDate(date, description);
  }

  /**
   * Get closing message for end of conversation
   */
  getClosing(): {
    phrase: string;
    aftercareNeeded: boolean;
    checkInQuestion: string | null;
  } {
    const temporalEngine = getTemporalContextEngine(this.userId);
    const aftercareEngine = getEmotionalAftercareEngine(this.sessionId);

    const closing = temporalEngine.getClosing();
    const aftercareState = aftercareEngine.getState();
    const aftercareNeeded = aftercareEngine.shouldSuggestClosing(true);
    const guidance = aftercareEngine.getGuidance();

    return {
      phrase: closing,
      aftercareNeeded,
      checkInQuestion: aftercareNeeded ? guidance.checkInQuestion : null,
    };
  }

  /**
   * Get comprehensive state for debugging
   */
  getState(): {
    turnCount: number;
    aftercare: AftercareState;
    relationship: RelationshipState;
    temporal: TemporalState;
  } {
    const aftercareEngine = getEmotionalAftercareEngine(this.sessionId);
    const relationshipEngine = getRelationshipEventsEngine(this.userId);
    const temporalEngine = getTemporalContextEngine(this.userId);

    return {
      turnCount: this.turnCount,
      aftercare: aftercareEngine.getState(),
      relationship: relationshipEngine.getState(),
      temporal: temporalEngine.getState(),
    };
  }

  /**
   * Reset session-scoped engines (not cross-session)
   */
  resetSession(): void {
    resetSubtextDetectionEngine(this.sessionId);
    resetEmotionalAftercareEngine(this.sessionId);
    resetConversationalRepairEngine(this.sessionId);
    resetHopeInjectionEngine(this.sessionId);
    resetEnergyRegulationEngine(this.sessionId);
    resetMicroAffirmationEngine(this.sessionId);
    resetParadoxicalInterventionEngine(this.sessionId);

    // Reset session on cross-session engines (keeps learned data)
    const temporalEngine = getTemporalContextEngine(this.userId);
    temporalEngine.resetSession();

    const curiosityEngine = getCuriosityEngine(this.userId);
    curiosityEngine.resetSession();

    this.turnCount = 0;
    this.lastAgentMessage = null;

    logger.debug({ sessionId: this.sessionId }, '🔄 Session reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private computeToneGuidance(
    aftercare: AftercareGuidance,
    energy: RegulationDecision,
    temporal: TemporalState,
    subtext: SubtextDetection
  ): string {
    const parts: string[] = [];

    // Aftercare takes priority
    if (aftercare.toneGuidance && aftercare.toneGuidance !== 'normal') {
      parts.push(aftercare.toneGuidance);
    }

    // Energy regulation
    if (energy.responseGuidance.affect !== 'normal') {
      parts.push(`${energy.responseGuidance.affect} affect`);
    }

    // Temporal mood
    if (temporal.mood === 'winding_down') {
      parts.push('gentle, understanding');
    } else if (temporal.mood === 'reflective') {
      parts.push('quiet, thoughtful');
    }

    // Subtext response
    if (subtext.type === 'testing_waters' || subtext.type === 'seeking_permission') {
      parts.push('warm, inviting, safe');
    }

    return parts.length > 0 ? parts.join(', ') : 'warm, present, attentive';
  }

  private computeLengthGuidance(
    aftercare: AftercareState,
    energy: EnergyState,
    subtext: SubtextDetection,
    repair: RepairDecision
  ): 'shorter' | 'normal' | 'longer' {
    // Shorter when:
    // - Very high emotional debt (give them space to process)
    // - Very low energy combined with negative valence (truly struggling)
    // - Repair needed (focus on fixing)
    // - They're testing waters (don't flood them)
    //
    // NOTE: We raised thresholds because "shorter" was triggering too often
    // and stripping Ferni's natural warmth. Being brief is less important
    // than being present and warm.

    if (aftercare.emotionalDebt > 0.7) return 'shorter'; // Raised from 0.6
    if (energy.level < 0.2 && energy.valence < 0) return 'shorter'; // Raised from 0.3, added valence check
    if (repair.shouldRepair) return 'shorter';
    if (subtext.type === 'testing_waters') return 'shorter';

    // Longer when high engagement
    if (energy.level > 0.6 && energy.valence > 0.1) return 'longer'; // Lowered threshold to be more generous

    return 'normal';
  }

  private computePriorityActions(
    subtext: SubtextDetection,
    aftercare: AftercareState,
    repair: RepairDecision,
    resistance: ResistanceDetection,
    milestone: MilestoneOpportunity | null
  ): string[] {
    const actions: string[] = [];

    // Repair is highest priority
    if (repair.shouldRepair && repair.strategy) {
      actions.push(`Repair: ${repair.strategy.phrase}`);
    }

    // Subtext detection
    if (subtext.shouldAct && subtext.gentleProbe) {
      actions.push(`Address subtext: ${subtext.gentleProbe}`);
    }

    // Aftercare
    if (aftercare.priority === 'urgent' || aftercare.priority === 'high') {
      const guidance = getEmotionalAftercareEngine(this.sessionId).getGuidance();
      if (guidance.transitionPhrase) {
        actions.push(`Aftercare: ${guidance.transitionPhrase}`);
      }
    }

    // Resistance
    if (resistance.detected && resistance.count >= 2) {
      actions.push('Stop direct advice - switch to questions');
    }

    // Milestone
    if (milestone?.shouldAcknowledge) {
      actions.push(`Milestone: ${milestone.phrase}`);
    }

    return actions;
  }
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

const orchestrators = new Map<string, AdvancedHumanizationOrchestrator>();

/**
 * Get or create an advanced humanization orchestrator
 */
export function getAdvancedHumanization(
  sessionId: string,
  userId: string
): AdvancedHumanizationOrchestrator {
  const key = `${sessionId}:${userId}`;
  if (!orchestrators.has(key)) {
    orchestrators.set(key, new AdvancedHumanizationOrchestrator(sessionId, userId));
  }
  return orchestrators.get(key)!;
}

/**
 * Reset advanced humanization for session
 */
export function resetAdvancedHumanization(sessionId: string, userId: string): void {
  const key = `${sessionId}:${userId}`;
  const orchestrator = orchestrators.get(key);
  if (orchestrator) {
    orchestrator.resetSession();
  }
}

/**
 * Clear advanced humanization instance
 */
export function clearAdvancedHumanization(sessionId: string, userId: string): void {
  const key = `${sessionId}:${userId}`;
  orchestrators.delete(key);
}

export default AdvancedHumanizationOrchestrator;
