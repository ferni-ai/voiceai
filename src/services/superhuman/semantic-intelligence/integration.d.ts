/**
 * Semantic Intelligence Integration
 *
 * This file bridges the turn handler to all 6 "Better Than Human V3" semantic intelligence systems.
 * It extracts relevant data from each user turn and feeds it to the appropriate systems.
 *
 * CRITICAL: This is the missing piece that makes our semantic intelligence actually work!
 * Without this integration, the systems have no data flowing into them.
 *
 * @module services/superhuman/semantic-intelligence/integration
 */
/**
 * Data extracted from a user turn for semantic intelligence
 */
export interface TurnSemanticData {
    userId: string;
    sessionId: string;
    personaId: string;
    turnNumber: number;
    userText: string;
    topic?: string;
    topics?: string[];
    textEmotion?: string;
    textEmotionIntensity?: number;
    voiceEmotion?: string;
    voiceEmotionConfidence?: number;
    voiceEmotionIntensity?: number;
    speechRate?: number;
    pitch?: number;
    energy?: number;
    breathiness?: number;
    timestamp: Date;
    dayOfWeek: number;
    hourOfDay: number;
    turnsSinceStart: number;
    sessionCount?: number;
    relationshipStage?: string;
    mentionedPerson?: string;
}
/**
 * Context when agent gives advice (for counterfactual tracking)
 */
export interface AgentAdviceContext {
    userId: string;
    sessionId: string;
    personaId: string;
    timestamp: Date;
    adviceText: string;
    topic: string;
    category: 'behavioral' | 'emotional' | 'relational' | 'practical' | 'philosophical';
    userSituation?: string;
    userEmotion?: string;
}
/**
 * Process a user turn through all semantic intelligence systems.
 *
 * This is the main entry point called from turn-handler.ts.
 * It extracts relevant data and feeds it to each system in parallel.
 *
 * IMPORTANT: This runs as fire-and-forget to not block turn processing.
 */
export declare function processSemanticIntelligence(data: TurnSemanticData): Promise<void>;
/**
 * Record when the agent gives advice.
 * Called from response generation when advice is detected.
 *
 * This enables counterfactual memory: "Last time I suggested X, and it didn't work"
 */
export declare function recordAgentAdvice(advice: AgentAdviceContext): Promise<void>;
/**
 * Track Ferni's commitments in her response (V3.2).
 * Call this after generating an agent response.
 */
export declare function trackFerniCommitments(userId: string, responseText: string, context: {
    topic?: string;
    person?: string;
    userMessage?: string;
}): Promise<void>;
/**
 * Record when user follows through (or doesn't) on advice.
 * Called when we detect follow-up to previous advice.
 */
export declare function recordAdviceOutcome(userId: string, adviceId: string, outcome: {
    followed: boolean;
    result: 'positive' | 'negative' | 'neutral' | 'mixed';
    userFeedback?: string;
}): Promise<void>;
/**
 * Detect if user is reporting on advice outcome.
 * Call this on each turn to check for followup to previous advice.
 *
 * V3.1: Now uses semantic matching to find the most relevant advice,
 * not just the most recent one.
 */
export declare function detectAdviceOutcome(userId: string, userText: string): Promise<void>;
interface DomainSignal {
    domain: string;
    signal: string;
    intensity?: number;
}
/**
 * Extract domain signals from user text for correlation mining
 */
declare function extractDomainSignals(text: string): DomainSignal[];
/**
 * Detect emotional catalysts (life events that shift emotional trajectories)
 */
declare function detectEmotionalCatalyst(text: string): string | undefined;
/**
 * Extract linguistic markers for growth tracking
 */
declare function extractLinguisticMarkers(text: string): string[];
/**
 * Detect cognitive patterns (problem-solving style, thought patterns)
 */
declare function detectCognitivePatterns(text: string): string[];
/**
 * Extract key concepts for threading
 */
declare function extractKeyConcepts(text: string): string[];
/**
 * Warm up semantic intelligence caches for a user.
 * Call this on session connect to preload user data.
 *
 * This pre-loads Firestore data into memory caches for faster context building.
 */
export declare function warmupSemanticIntelligence(userId: string): Promise<void>;
export { extractDomainSignals, detectEmotionalCatalyst, extractLinguisticMarkers, detectCognitivePatterns, extractKeyConcepts, };
//# sourceMappingURL=integration.d.ts.map