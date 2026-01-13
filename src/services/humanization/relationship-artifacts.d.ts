/**
 * Relationship Artifacts Service
 *
 * Tracks the SPECIFIC moments that make each relationship unique:
 * - Shared breakthroughs (moments of realization)
 * - Inside references (jokes, shared experiences)
 * - User vocabulary (their unique words/phrases)
 * - Communication rhythm (how THEY communicate)
 *
 * This transforms relationships from "number of conversations" into
 * a rich tapestry of shared history that Ferni can draw from.
 *
 * "Remember when you told me about your father?"
 * "The Tuesday thing" (inside reference)
 * "You said 'recalibrate' - I love that word"
 *
 * @module @ferni/relationship-artifacts
 */
/**
 * A shared breakthrough moment - when something clicked for the user
 * These are GOLD for callbacks
 */
export interface SharedBreakthrough {
    id: string;
    turn: number;
    timestamp: number;
    /** What the user realized */
    whatHappened: string;
    /** What Ferni shared in response (if anything personal) */
    whatFerniShared?: string;
    /** How they reacted (for gauging emotional weight) */
    userReaction: 'quiet' | 'emotional' | 'aha' | 'relief' | 'tears';
    /** The topic that triggered this */
    topic: string;
    /** Natural callback phrase */
    callbackPhrase: string;
    /** Times this has been referenced */
    timesReferenced: number;
    /** Last time referenced */
    lastReferenced?: number;
}
/**
 * An inside reference - something only WE would understand
 */
export interface InsideReference {
    id: string;
    origin: string;
    phrase: string;
    fullContext: string;
    turnCreated: number;
    timestamp: number;
    /** Type of inside reference */
    type: 'joke' | 'shorthand' | 'callback' | 'nickname' | 'metaphor';
    /** How many times used */
    timesUsed: number;
    /** Last usage */
    lastUsed?: number;
    /** Whether the user has used it back (confirms it landed) */
    userUsedItBack: boolean;
}
/**
 * A word or phrase the user uniquely uses
 * Ferni can mirror these back naturally
 */
export interface UserVocabulary {
    word: string;
    frequency: number;
    firstHeard: number;
    lastHeard: number;
    /** Context where they use it */
    contexts: string[];
    /** Whether Ferni has mirrored it back */
    ferniHasMirrored: boolean;
    /** Category of vocabulary */
    category: 'emotional' | 'descriptor' | 'filler' | 'technical' | 'unique';
}
/**
 * Their communication rhythm - how THEY talk
 */
export interface CommunicationRhythm {
    /** How they typically greet */
    typicalGreeting?: string;
    /** Average response length (words) */
    avgResponseLength: number;
    /** When they tend to open up */
    opensUpWhen: 'immediately' | 'after_warmup' | 'late_session' | 'late_night' | 'varies';
    /** How they signal they want to end */
    exitSignals: string[];
    /** Topics that make them go deep */
    depthTriggers: string[];
    /** Topics they deflect from */
    deflectionTopics: string[];
    /** Their energy pattern */
    energyPattern: 'builds_up' | 'starts_high' | 'consistent' | 'peaks_and_valleys';
    /** How they express agreement */
    agreementStyle: string[];
    /** How they express disagreement */
    disagreementStyle: string[];
}
/**
 * Full relationship artifacts for a user-persona pair
 */
export interface RelationshipArtifacts {
    personaId: string;
    userId: string;
    breakthroughs: SharedBreakthrough[];
    insideReferences: InsideReference[];
    userVocabulary: UserVocabulary[];
    communicationRhythm: CommunicationRhythm;
    firstInteraction: number;
    lastInteraction: number;
    totalTurns: number;
    deepestMomentTurn?: number;
    deepestMomentTopic?: string;
    mostJoyfulMomentTurn?: number;
}
/**
 * Context for analyzing a turn for artifacts
 */
export interface TurnAnalysisContext {
    userMessage: string;
    ferniResponse: string;
    turn: number;
    topic?: string;
    emotion?: string;
    emotionalIntensity?: number;
    isBreakthrough?: boolean;
    isVulnerable?: boolean;
}
/**
 * Analyze a turn for potential artifacts
 */
export declare function analyzeTurnForArtifacts(context: TurnAnalysisContext, existingArtifacts: RelationshipArtifacts): {
    newBreakthrough?: Partial<SharedBreakthrough>;
    newReference?: Partial<InsideReference>;
    vocabularyUpdates: Array<{
        word: string;
        category: UserVocabulary['category'];
    }>;
    rhythmUpdates: Partial<CommunicationRhythm>;
};
/**
 * Get the best callback opportunity from artifacts
 * Returns the most impactful, least-recently-used callback
 */
export declare function getBestCallback(artifacts: RelationshipArtifacts, currentContext: {
    topic?: string;
    emotion?: string;
    turn: number;
}): {
    type: 'breakthrough' | 'reference' | 'vocabulary';
    content: string;
    artifactId: string;
} | null;
/**
 * Get vocabulary to mirror in response
 * Returns words the user has used that Ferni can naturally echo
 */
export declare function getVocabularyToMirror(artifacts: RelationshipArtifacts, maxWords?: number): string[];
/**
 * Get or create artifacts for a user-persona pair
 */
export declare function getOrCreateArtifacts(userId: string, personaId: string): RelationshipArtifacts;
/**
 * Record a new breakthrough
 */
export declare function recordBreakthrough(userId: string, personaId: string, breakthrough: Omit<SharedBreakthrough, 'id'>): SharedBreakthrough;
/**
 * Record an inside reference
 */
export declare function recordInsideReference(userId: string, personaId: string, reference: Omit<InsideReference, 'id'>): InsideReference;
/**
 * Update vocabulary tracking
 */
export declare function updateVocabulary(userId: string, personaId: string, word: string, category: UserVocabulary['category'], context?: string): void;
/**
 * Mark that Ferni used a callback
 */
export declare function markCallbackUsed(userId: string, personaId: string, type: 'breakthrough' | 'reference', artifactId: string, turn: number): void;
/**
 * Mark that Ferni mirrored a vocabulary word
 */
export declare function markVocabularyMirrored(userId: string, personaId: string, word: string): void;
/**
 * Mark that user used an inside reference back (confirms it landed!)
 */
export declare function markUserUsedReferenceBack(userId: string, personaId: string, referenceId: string): void;
/**
 * Increment turn count
 */
export declare function incrementTurns(userId: string, personaId: string): void;
/**
 * Get artifacts summary for context injection
 */
export declare function getArtifactsSummary(userId: string, personaId: string): {
    hasBreakthroughs: boolean;
    breakthroughCount: number;
    hasInsideReferences: boolean;
    referenceCount: number;
    topVocabulary: string[];
    communicationStyle: string;
};
/**
 * Clear session artifacts (for testing)
 */
export declare function clearSessionArtifacts(): void;
export declare const relationshipArtifacts: {
    getOrCreate: typeof getOrCreateArtifacts;
    analyze: typeof analyzeTurnForArtifacts;
    getBestCallback: typeof getBestCallback;
    getVocabularyToMirror: typeof getVocabularyToMirror;
    recordBreakthrough: typeof recordBreakthrough;
    recordInsideReference: typeof recordInsideReference;
    updateVocabulary: typeof updateVocabulary;
    incrementTurns: typeof incrementTurns;
    markCallbackUsed: typeof markCallbackUsed;
    markVocabularyMirrored: typeof markVocabularyMirrored;
    markUserUsedReferenceBack: typeof markUserUsedReferenceBack;
    getSummary: typeof getArtifactsSummary;
    clearAll: typeof clearSessionArtifacts;
};
export default relationshipArtifacts;
//# sourceMappingURL=relationship-artifacts.d.ts.map