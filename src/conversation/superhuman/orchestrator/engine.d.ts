/**
 * Better Than Human - Main Orchestrator Engine
 *
 * @module @ferni/superhuman/orchestrator/engine
 */
import { type BetterThanHumanContent } from '../content-loader.js';
import type { BetterThanHumanContext, BetterThanHumanInsight, RelationshipStage } from '../types.js';
export declare class BetterThanHumanOrchestrator {
    private userId;
    private sessionId;
    private personaId;
    private emotionalMemory;
    private anticipatoryPresence;
    private linguisticMirroring;
    private spontaneousDelight;
    private visibleVulnerability;
    private protectiveInstincts;
    private evolvingJokes;
    private teamCoherence;
    private temporalEmotional;
    private metaRelationship;
    private somaticPresence;
    private superhumanObservations;
    private turnCount;
    private sessionCount;
    private content;
    private sessionEnergySum;
    private sessionEnergyCount;
    private sessionConcernsDetected;
    constructor(userId: string, sessionId: string, personaId: string, sessionCount?: number);
    private loadContent;
    getContent(): BetterThanHumanContent;
    /**
     * Analyze a turn and get all superhuman insights
     */
    analyze(context: BetterThanHumanContext): BetterThanHumanInsight;
    applyMirroring(response: string): string;
    applyInsights(response: string, insight: BetterThanHumanInsight, maxActions?: number): string;
    private learnFromMessage;
    recordSessionStart(): void;
    recordSessionEnd(context: {
        topics: string[];
        emotionalTone: string;
        keyMoments?: string[];
    }): void;
    private calculateOverallConfidence;
    getRelationshipStage(): RelationshipStage;
    getBondMetrics(): {
        warmth: number;
        trust: number;
        protectiveness: number;
        admiration: number;
        concern: number;
        stage: RelationshipStage;
    };
    export(): {
        emotionalBond: import("../types.js").EmotionalBond;
        anticipation: import("../types.js").UserPatternProfile;
        linguistic: Omit<import("../types.js").LinguisticProfile, "preferredTerms"> & {
            preferredTerms: [string, string][];
        };
        jokes: import("../types.js").EvolvingJoke[];
        team: {
            handoffNotes: import("../types.js").TeamHandoffNote[];
            sharedObservations: string[];
            sharedPreferences: [string, string][];
            personaTopicHistory: [string, string[]][];
        };
        temporal: import("../types.js").TemporalEmotionalProfile;
        metaRelationship: {
            milestones: import("../types.js").RelationshipMilestone[];
            stage: RelationshipStage;
            sessionCount: number;
        };
        observations: {
            observations: import("../../../services/superhuman/observations.js").SuperhumanObservation[];
            patternCounts: [string, number][];
        };
        sessionCount: number;
    };
    import(data: ReturnType<BetterThanHumanOrchestrator['export']>): void;
    reset(): void;
}
export default BetterThanHumanOrchestrator;
//# sourceMappingURL=engine.d.ts.map