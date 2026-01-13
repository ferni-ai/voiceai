/**
 * Humanization Signal Emitter
 *
 * Bridges the backend DeepHumanizationEngine to the frontend Ferni EQ system.
 * Sends real-time signals about conversation dynamics so the avatar can respond
 * BEFORE the words arrive - creating the "they understand me" feeling.
 *
 * This is a critical piece of making Ferni feel truly human.
 *
 * @module @ferni/humanization-signal-emitter
 */
export type HumanizationSignalType = 'breakthrough' | 'vulnerability' | 'disengagement' | 'high_engagement' | 'mind_change' | 'memory_callback' | 'running_joke' | 'physical_presence' | 'spontaneous_thought' | 'mood_drift' | 'silence_moment' | 'anticipation' | 'evidence_presented' | 'topic_weight_shift' | 'relationship_milestone' | 'repair_needed' | 'aftercare_needed' | 'subtext_detected' | 'emotional_arc_peak' | 'emotional_arc_release' | 'concern_detected' | 'proactive_memory' | 'voice_state_detected' | 'need_predicted' | 'emotional_trajectory' | 'emotional_bond_deepen' | 'protective_instinct' | 'spontaneous_delight' | 'inside_joke_callback' | 'superhuman_observation' | 'visible_vulnerability' | 'temporal_insight' | 'meta_relationship_moment' | 'somatic_presence' | 'anticipatory_presence' | 'repair_needed' | 'aftercare_needed' | 'subtext_detected';
export interface HumanizationSignalPayload {
    signalType: HumanizationSignalType;
    content?: string;
    memoryAge?: string;
    topic?: string;
    intensity?: number;
    mood?: {
        energy: number;
        engagement: number;
        emotionalLoad: number;
    };
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    silenceDuration?: number;
    silenceReason?: 'processing' | 'emotional' | 'invitation' | 'presence';
    concernLevel?: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
    concernType?: string;
    recommendedApproach?: string;
    voiceState?: string;
    predictedNeed?: string;
    emotionalTrajectory?: string;
    memoryType?: string;
    bondType?: 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern';
    bondLevel?: number;
    protectionTrigger?: string;
    delightType?: string;
    jokePhase?: 'new' | 'established' | 'legacy';
    jokeContent?: string;
    observationType?: 'linguistic' | 'behavioral' | 'emotional' | 'relationship';
    observationContent?: string;
    vulnerabilityType?: string;
    temporalInsight?: string;
    metaRelationshipType?: string;
    somaticCue?: string;
    metadata?: Record<string, unknown>;
}
export interface MemoryCallbackPayload {
    quotedPhrase: string;
    context: string;
    whenMentioned: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
}
export interface ConversationRhythmPayload {
    userPacing: 'rapid' | 'moderate' | 'slow' | 'contemplative';
    avgTurnLength: number;
    pausePattern: 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
    energyTrend: 'rising' | 'stable' | 'falling' | 'oscillating';
}
export interface EmotionalArcPayload {
    phase: 'opening' | 'building' | 'peak' | 'release' | 'closing';
    intensity: number;
    dominantEmotion: string;
    turnsSincePeak?: number;
}
type SendDataCallback = (type: string, payload: Record<string, unknown>) => Promise<void>;
/**
 * Initialize the signal emitter with a callback to send data to frontend
 */
export declare function initHumanizationSignalEmitter(sendData: SendDataCallback): void;
/**
 * Enable/disable signal emission
 */
export declare function setSignalEmitterEnabled(enabled: boolean): void;
/**
 * Emit a humanization signal to the frontend
 */
export declare function emitHumanizationSignal(payload: HumanizationSignalPayload): Promise<void>;
/**
 * Emit a memory callback signal with specific quoted content
 */
export declare function emitMemoryCallback(payload: MemoryCallbackPayload): Promise<void>;
/**
 * Emit conversation rhythm update
 */
export declare function emitConversationRhythm(payload: ConversationRhythmPayload): Promise<void>;
/**
 * Emit emotional arc update
 */
export declare function emitEmotionalArc(payload: EmotionalArcPayload): Promise<void>;
/**
 * Signal that a breakthrough moment was detected
 */
export declare function signalBreakthrough(intensity?: number): Promise<void>;
/**
 * Signal that vulnerability was detected
 */
export declare function signalVulnerability(intensity?: number): Promise<void>;
/**
 * Signal that user seems disengaged
 */
export declare function signalDisengagement(): Promise<void>;
/**
 * Signal high engagement
 */
export declare function signalHighEngagement(intensity?: number): Promise<void>;
/**
 * Signal that Ferni is changing their mind
 */
export declare function signalMindChange(): Promise<void>;
/**
 * Signal a memory callback with specific content
 */
export declare function signalMemoryCallback(quotedPhrase: string, context: string, whenMentioned: string, emotionalWeight?: 'light' | 'medium' | 'heavy'): Promise<void>;
/**
 * Signal a running joke/inside reference
 */
export declare function signalRunningJoke(content?: string): Promise<void>;
/**
 * Signal physical presence awareness
 */
export declare function signalPhysicalPresence(): Promise<void>;
/**
 * Signal spontaneous thought
 */
export declare function signalSpontaneousThought(): Promise<void>;
/**
 * Signal mood drift with current mood state
 */
export declare function signalMoodDrift(mood: HumanizationSignalPayload['mood']): Promise<void>;
/**
 * Signal an intentional silence moment
 */
export declare function signalSilenceMoment(duration: number, reason: 'processing' | 'emotional' | 'invitation' | 'presence' | 'resonance' | 'respect'): Promise<void>;
/**
 * Signal anticipation of user's direction
 */
export declare function signalAnticipation(): Promise<void>;
/**
 * Signal that user presented evidence
 */
export declare function signalEvidencePresented(): Promise<void>;
/**
 * Signal topic weight shift
 */
export declare function signalTopicWeightShift(weight: 'light' | 'medium' | 'heavy'): Promise<void>;
/**
 * Signal relationship milestone
 */
export declare function signalRelationshipMilestone(stage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor'): Promise<void>;
/**
 * Signal emotional arc peak
 */
export declare function signalEmotionalArcPeak(intensity: number): Promise<void>;
/**
 * Signal emotional arc release
 */
export declare function signalEmotionalArcRelease(): Promise<void>;
/**
 * Signal that concern was detected (from unified concern detection)
 */
export declare function signalConcernDetected(level: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis', concernType: string, recommendedApproach: string, intensity: number): Promise<void>;
/**
 * Signal proactive memory surfacing
 */
export declare function signalProactiveMemory(memoryType: string, content: string, intensity: number): Promise<void>;
/**
 * Signal voice state detection (tiredness, stress, etc.)
 */
export declare function signalVoiceStateDetected(voiceState: string, intensity: number): Promise<void>;
/**
 * Signal predicted need (venting, advice, validation, etc.)
 */
export declare function signalNeedPredicted(predictedNeed: string, intensity: number): Promise<void>;
/**
 * Signal emotional trajectory prediction
 */
export declare function signalEmotionalTrajectory(trajectory: string, intensity: number): Promise<void>;
/**
 * Signal emotional bond deepening
 */
export declare function signalEmotionalBondDeepen(bondType: 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern', bondLevel: number): Promise<void>;
/**
 * Signal protective instinct activation
 */
export declare function signalProtectiveInstinct(trigger: string, intensity?: number): Promise<void>;
/**
 * Signal spontaneous delight emission
 */
export declare function signalSpontaneousDelight(delightType: string, intensity?: number): Promise<void>;
/**
 * Signal inside joke callback
 */
export declare function signalInsideJokeCallback(jokePhase: 'new' | 'established' | 'legacy', jokeContent?: string): Promise<void>;
/**
 * Signal superhuman observation surfacing
 */
export declare function signalSuperhumanObservation(observationType: 'linguistic' | 'behavioral' | 'emotional' | 'relationship', observationContent: string): Promise<void>;
/**
 * Signal visible vulnerability expression
 */
export declare function signalVisibleVulnerability(vulnerabilityType: string, intensity?: number): Promise<void>;
/**
 * Signal temporal emotional insight
 */
export declare function signalTemporalInsight(insight: string, intensity?: number): Promise<void>;
/**
 * Signal meta-relationship moment
 */
export declare function signalMetaRelationshipMoment(type: string, intensity?: number): Promise<void>;
/**
 * Signal somatic presence cue
 */
export declare function signalSomaticPresence(cue: string, intensity?: number): Promise<void>;
/**
 * Signal anticipatory presence activation
 */
export declare function signalAnticipatoryPresence(intensity?: number): Promise<void>;
export declare const humanizationSignalEmitter: {
    init: typeof initHumanizationSignalEmitter;
    setEnabled: typeof setSignalEmitterEnabled;
    emit: typeof emitHumanizationSignal;
    emitMemory: typeof emitMemoryCallback;
    emitRhythm: typeof emitConversationRhythm;
    emitArc: typeof emitEmotionalArc;
    breakthrough: typeof signalBreakthrough;
    vulnerability: typeof signalVulnerability;
    disengagement: typeof signalDisengagement;
    highEngagement: typeof signalHighEngagement;
    mindChange: typeof signalMindChange;
    memoryCallback: typeof signalMemoryCallback;
    runningJoke: typeof signalRunningJoke;
    physicalPresence: typeof signalPhysicalPresence;
    spontaneousThought: typeof signalSpontaneousThought;
    moodDrift: typeof signalMoodDrift;
    silenceMoment: typeof signalSilenceMoment;
    anticipation: typeof signalAnticipation;
    evidencePresented: typeof signalEvidencePresented;
    topicWeightShift: typeof signalTopicWeightShift;
    relationshipMilestone: typeof signalRelationshipMilestone;
    emotionalArcPeak: typeof signalEmotionalArcPeak;
    emotionalArcRelease: typeof signalEmotionalArcRelease;
    concernDetected: typeof signalConcernDetected;
    proactiveMemory: typeof signalProactiveMemory;
    voiceStateDetected: typeof signalVoiceStateDetected;
    needPredicted: typeof signalNeedPredicted;
    emotionalTrajectory: typeof signalEmotionalTrajectory;
    emotionalBondDeepen: typeof signalEmotionalBondDeepen;
    protectiveInstinct: typeof signalProtectiveInstinct;
    spontaneousDelight: typeof signalSpontaneousDelight;
    insideJokeCallback: typeof signalInsideJokeCallback;
    superhumanObservation: typeof signalSuperhumanObservation;
    visibleVulnerability: typeof signalVisibleVulnerability;
    temporalInsight: typeof signalTemporalInsight;
    metaRelationshipMoment: typeof signalMetaRelationshipMoment;
    somaticPresence: typeof signalSomaticPresence;
    anticipatoryPresence: typeof signalAnticipatoryPresence;
};
export {};
//# sourceMappingURL=humanization-signal-emitter.d.ts.map