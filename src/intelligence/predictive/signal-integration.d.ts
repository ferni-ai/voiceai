/**
 * Signal Integration - Better Than Human v4
 *
 * Feeds data from turn processing into the 8 superhuman predictive capabilities.
 *
 * This module connects the existing analysis pipeline to the new predictive
 * systems, allowing them to learn from every conversation.
 *
 * Integration points:
 * - Turn processing → Multiple capability updates
 * - Topic detection → Avoidance, Conversation Prep
 * - Emotion detection → Pre-trajectory, Cognitive Fingerprint
 * - Conversation outcomes → Intervention Timing, Breakthrough
 * - Session events → Life Phase, Ripple Effects
 *
 * @module intelligence/predictive/signal-integration
 */
import { type ConversationNeed } from './conversation-preparation.js';
import { type DecisionStyle, type StressResponse } from './cognitive-fingerprint.js';
import { type LifeDomain, type EventType } from './ripple-effect-prediction.js';
import { type InterventionType } from './intervention-timing.js';
/**
 * Process a conversation turn through all superhuman capabilities
 *
 * Call this after every turn to feed the prediction systems.
 *
 * @param userId - User ID
 * @param turnData - Data from the turn
 */
export declare function processTurnForSuperhumanLearning(userId: string, turnData: {
    userMessage: string;
    emotion?: {
        primary?: string;
        intensity?: number;
        valence?: 'positive' | 'negative' | 'neutral';
        distressLevel?: number;
        isVenting?: boolean;
        needsSupport?: boolean;
    };
    topic?: {
        primary?: string;
        secondary?: string[];
        category?: string;
    };
    conversationContext?: {
        turnCount?: number;
        sessionDuration?: number;
        daysSinceLastConversation?: number;
    };
    responseData?: {
        responseType?: string;
        depth?: 'surface' | 'moderate' | 'deep';
        userEngagement?: number;
    };
}): Promise<void>;
/**
 * Record intervention outcome from turn
 *
 * Call this when we can evaluate how an intervention landed.
 *
 * @param userId - User ID
 * @param intervention - What intervention was attempted
 * @param outcome - How it went
 */
export declare function recordInterventionFromTurn(userId: string, intervention: InterventionType, outcome: {
    success: boolean;
    emotionalState?: string;
    topic?: string;
    userResponse?: 'engaged' | 'deflected' | 'ignored' | 'rejected';
}): void;
/**
 * Record a breakthrough moment
 *
 * Call this when user has a breakthrough/insight.
 *
 * @param userId - User ID
 * @param breakthrough - Breakthrough details
 */
export declare function recordBreakthroughMoment(userId: string, breakthrough: {
    topic: string;
    type: 'self_understanding' | 'pattern_recognition' | 'belief_shift' | 'emotional_release' | 'decision_clarity' | 'relationship_insight' | 'value_alignment' | 'acceptance' | 'integration';
    catalyst: 'question' | 'reflection' | 'connection' | 'emotion' | 'external_event';
}): void;
/**
 * Record a life domain event
 *
 * Call this when user mentions a significant life event.
 *
 * @param userId - User ID
 * @param event - Event details
 */
export declare function recordLifeEvent(userId: string, event: {
    domain: LifeDomain;
    eventType: EventType;
    magnitude: number;
    description: string;
}): void;
/**
 * Record a decision being made
 *
 * Call this when user makes or discusses a decision.
 *
 * @param userId - User ID
 * @param decision - Decision details
 */
export declare function recordDecisionMade(userId: string, decision: {
    style: DecisionStyle;
    timeToDecision: number;
    outcome?: 'satisfied' | 'regret' | 'neutral';
}): void;
/**
 * Record stress response observed
 *
 * Call this when user exhibits stress response.
 *
 * @param userId - User ID
 * @param response - Stress response details
 */
export declare function recordStressObserved(userId: string, response: {
    style: StressResponse;
    stressLevel: number;
    trigger?: string;
}): void;
/**
 * Record vulnerability moment
 *
 * Call this when user shows vulnerability.
 *
 * @param userId - User ID
 * @param vulnerability - Vulnerability details
 */
export declare function recordVulnerabilityMoment(userId: string, vulnerability: {
    style: 'direct' | 'indirect' | 'physical' | 'deflected';
    topic: string;
    warmupMinutes: number;
    safetyFactor?: string;
}): void;
/**
 * Process session start
 *
 * Call at beginning of conversation.
 *
 * @param userId - User ID
 * @param sessionData - Session context
 */
export declare function processSessionStart(userId: string, sessionData: {
    daysSinceLastConversation?: number;
    scheduledTime?: Date;
    externalEvents?: string[];
}): Promise<void>;
/**
 * Process session end
 *
 * Call at end of conversation.
 *
 * @param userId - User ID
 * @param sessionSummary - Session summary data
 */
export declare function processSessionEnd(userId: string, sessionSummary: {
    topicsDiscussed: string[];
    primaryNeed?: ConversationNeed;
    emotionalArc?: string;
    satisfactionLevel?: number;
    breakthroughs?: string[];
}): Promise<void>;
export declare const signalIntegration: {
    processTurnForSuperhumanLearning: typeof processTurnForSuperhumanLearning;
    recordInterventionFromTurn: typeof recordInterventionFromTurn;
    recordBreakthroughMoment: typeof recordBreakthroughMoment;
    recordLifeEvent: typeof recordLifeEvent;
    recordDecisionMade: typeof recordDecisionMade;
    recordStressObserved: typeof recordStressObserved;
    recordVulnerabilityMoment: typeof recordVulnerabilityMoment;
    processSessionStart: typeof processSessionStart;
    processSessionEnd: typeof processSessionEnd;
};
export default signalIntegration;
//# sourceMappingURL=signal-integration.d.ts.map