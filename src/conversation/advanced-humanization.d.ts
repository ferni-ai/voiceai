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
import { type SubtextDetection } from './subtext-detection.js';
import { type AftercareGuidance, type AftercareState } from './emotional-aftercare.js';
import { type RepairDecision } from './conversational-repair.js';
import { type HopeGuidance } from './hope-injection.js';
import { type CuriosityPrompt } from './curiosity-engine.js';
import { type EnergyState, type RegulationDecision } from './energy-regulation.js';
import { type AffirmationDecision } from './micro-affirmations.js';
import { type TemporalGuidance, type TemporalState } from './temporal-context.js';
import { type MilestoneOpportunity, type RelationshipState } from './relationship-events.js';
import { type InterventionDecision, type ResistanceDetection } from './paradoxical-intervention.js';
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
    /** Subtext detected in user message */
    subtext: SubtextDetection;
    /** Resistance to advice detected */
    resistance: ResistanceDetection;
    /** User's current energy state */
    energyState: EnergyState;
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
    /** Micro-affirmation to include */
    affirmation: AffirmationDecision;
    /** Curiosity prompt to potentially ask */
    curiosityPrompt: CuriosityPrompt | null;
    /** Milestone acknowledgment opportunity */
    milestone: MilestoneOpportunity | null;
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
export declare class AdvancedHumanizationOrchestrator {
    private sessionId;
    private userId;
    private turnCount;
    private lastAgentMessage;
    constructor(sessionId: string, userId: string);
    /**
     * Initialize at session start
     * Returns greeting, event follow-ups, milestones, etc.
     */
    startSession(): SessionStartResult;
    /**
     * Process a user turn and get comprehensive guidance
     */
    processTurn(context: AdvancedHumanizationContext): AdvancedHumanizationResult;
    /**
     * Record agent response (for repair detection on next turn)
     */
    recordAgentResponse(response: string): void;
    /**
     * Record that advice was given (for resistance tracking)
     */
    recordAdviceGiven(advice: string): void;
    /**
     * Record if previous advice was accepted or rejected
     */
    recordAdviceOutcome(wasAccepted: boolean): void;
    /**
     * Record a relationship milestone manually
     */
    recordMilestone(type: 'vulnerability' | 'breakthrough' | 'inside_joke', context?: string): void;
    /**
     * Add a shared memory (inside joke, phrase)
     */
    addSharedMemory(content: string, category: 'joke' | 'phrase' | 'reference'): void;
    /**
     * Add a significant date to remember
     */
    addSignificantDate(date: Date, description: string): void;
    /**
     * Get closing message for end of conversation
     */
    getClosing(): {
        phrase: string;
        aftercareNeeded: boolean;
        checkInQuestion: string | null;
    };
    /**
     * Get comprehensive state for debugging
     */
    getState(): {
        turnCount: number;
        aftercare: AftercareState;
        relationship: RelationshipState;
        temporal: TemporalState;
    };
    /**
     * Reset session-scoped engines (not cross-session)
     */
    resetSession(): void;
    private computeToneGuidance;
    private computeLengthGuidance;
    private computePriorityActions;
}
/**
 * Get or create an advanced humanization orchestrator
 */
export declare function getAdvancedHumanization(sessionId: string, userId: string): AdvancedHumanizationOrchestrator;
/**
 * Reset advanced humanization for session
 */
export declare function resetAdvancedHumanization(sessionId: string, userId: string): void;
/**
 * Clear advanced humanization instance
 */
export declare function clearAdvancedHumanization(sessionId: string, userId: string): void;
export default AdvancedHumanizationOrchestrator;
//# sourceMappingURL=advanced-humanization.d.ts.map