/**
 * Emotional Journey Orchestrator
 *
 * > "We want people to smile, to laugh, to be vulnerable, and maybe to cry."
 *
 * This orchestrator coordinates all the emotional systems to create a
 * seamless journey that brings people through the full range of human emotion.
 *
 * The Journey Phases:
 * 1. ARRIVAL - Warm welcome, recognition, anticipation
 * 2. EXPLORATION - Curiosity, stories, delightful surprises
 * 3. DEEPENING - Vulnerability unlocks, trust building
 * 4. BREAKTHROUGH - Coaching intervention, paradoxical when needed
 * 5. CELEBRATION - Growth reflection, wins, joy
 * 6. DEPARTURE - Meaningful goodbye, thinking-of-you seeds
 *
 * Key Coordination Rules:
 * - Never fire delightful surprises during vulnerability moments
 * - Stories unlock AFTER trust is established
 * - Paradoxical intervention overrides direct advice when resistance detected
 * - Celebrate effort, not just outcomes
 * - High emotion mode reduces noise - focus on what matters
 *
 * @module EmotionalJourneyOrchestrator
 */
export type JourneyPhase = 'arrival' | 'exploration' | 'deepening' | 'breakthrough' | 'celebration' | 'departure';
export type EmotionalMomentType = 'warm_welcome' | 'delightful_surprise' | 'vulnerability_invitation' | 'protective_embrace' | 'breakthrough_insight' | 'celebration_of_effort' | 'meaningful_farewell';
export interface EmotionalContext {
    userId: string;
    sessionId: string;
    turnCount: number;
    sessionCount: number;
    relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    userEmotion: string;
    emotionIntensity: number;
    distressLevel: number;
    voiceEmotion?: {
        arousal: number;
        valence: number;
        speechRate?: number;
    };
    isFirstTurn: boolean;
    isLastTurn?: boolean;
    resistanceDetected: boolean;
    vulnerabilityShared: boolean;
    wasAdviceGiven: boolean;
    topicsTouched: string[];
}
export interface JourneyDecision {
    /** Current phase of the emotional journey */
    phase: JourneyPhase;
    /** Type of emotional moment to create */
    momentType: EmotionalMomentType | null;
    /** Whether high-emotion mode should be active (reduces context noise) */
    highEmotionMode: boolean;
    /** Systems that should be ACTIVE this turn */
    activateSystems: string[];
    /** Systems that should be SUPPRESSED this turn */
    suppressSystems: string[];
    /** Story to potentially offer (if unlocked) */
    storyOpportunity?: {
        storyId: string;
        introduction: string;
        fitScore: number;
    };
    /** Coaching approach to use */
    coachingMode: 'direct' | 'exploratory' | 'paradoxical' | 'celebratory' | 'supportive';
    /** Guidance for the LLM */
    guidance: string;
    /** Why this decision was made */
    reasoning: string;
}
/**
 * Orchestrate the emotional journey for this turn
 *
 * This is the master coordination function that ensures all systems
 * work together to create smiles, laughter, vulnerability, and tears.
 */
export declare function orchestrateEmotionalJourney(ctx: EmotionalContext): JourneyDecision;
/**
 * Build emotional context from available session data
 * Use this to create the EmotionalContext from existing services
 */
export declare function buildEmotionalContext(params: {
    userId: string;
    sessionId: string;
    turnCount: number;
    sessionCount: number;
    relationshipStage?: string;
    emotion?: {
        primary: string;
        intensity?: number;
        distressLevel?: number;
    };
    voiceEmotion?: {
        arousal?: number;
        valence?: number;
        speechRate?: number;
    };
    resistanceDetected?: boolean;
    vulnerabilityShared?: boolean;
    wasAdviceGiven?: boolean;
    topicsTouched?: string[];
    isLastTurn?: boolean;
}): EmotionalContext;
declare const _default: {
    orchestrateEmotionalJourney: typeof orchestrateEmotionalJourney;
    buildEmotionalContext: typeof buildEmotionalContext;
};
export default _default;
//# sourceMappingURL=emotional-journey-orchestrator.d.ts.map