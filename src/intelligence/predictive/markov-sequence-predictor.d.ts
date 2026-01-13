/**
 * Markov Sequence Predictor
 *
 * TRUE PREDICTIVE INTELLIGENCE: Learn behavioral sequences and predict next states.
 *
 * This uses a Markov chain to learn patterns like:
 * - "After talking about work stress → user often mentions sleep issues"
 * - "Morning conversations → typically lead to energy discussions"
 * - "After milestone celebrations → user often sets new goals"
 *
 * Unlike rule-based systems that say "if Sunday → anxious", this LEARNS from actual
 * user behavior what tends to follow what.
 *
 * Key Features:
 * - First-order and second-order Markov chains
 * - Decay-weighted learning (recent patterns matter more)
 * - Cross-user pattern transfer for cold start
 * - Confidence calibration based on observation count
 *
 * @module intelligence/predictive/markov-sequence-predictor
 */
import { type MarkovPersistenceData } from './persistence.js';
/** Observable states we track */
export type ObservableState = 'emotion:anxious' | 'emotion:stressed' | 'emotion:calm' | 'emotion:happy' | 'emotion:sad' | 'emotion:frustrated' | 'emotion:excited' | 'emotion:overwhelmed' | 'emotion:neutral' | 'topic:work' | 'topic:relationships' | 'topic:health' | 'topic:finances' | 'topic:family' | 'topic:goals' | 'topic:habits' | 'topic:sleep' | 'topic:exercise' | 'topic:social' | 'topic:creativity' | 'topic:career' | 'behavior:venting' | 'behavior:seeking_advice' | 'behavior:celebrating' | 'behavior:processing' | 'behavior:planning' | 'behavior:reflecting' | 'behavior:avoiding' | 'temporal:morning' | 'temporal:afternoon' | 'temporal:evening' | 'temporal:late_night' | 'temporal:weekend' | 'temporal:weekday';
/** Transition observation */
interface TransitionObservation {
    from: ObservableState;
    to: ObservableState;
    timestamp: number;
    context?: {
        dayOfWeek: number;
        hourOfDay: number;
        sessionLength: number;
    };
}
/** Transition probability with metadata */
interface TransitionProbability {
    probability: number;
    observations: number;
    lastSeen: number;
    confidence: 'low' | 'medium' | 'high' | 'very_high';
}
/** First-order Markov chain (P(next | current)) */
type FirstOrderChain = Map<ObservableState, Map<ObservableState, TransitionProbability>>;
/** Second-order Markov chain (P(next | current, previous)) */
type SecondOrderChain = Map<string, Map<ObservableState, TransitionProbability>>;
/** User's learned patterns */
interface UserPatternProfile {
    userId: string;
    firstOrder: FirstOrderChain;
    secondOrder: SecondOrderChain;
    totalObservations: number;
    lastUpdated: number;
    priorStrength: number;
}
/** Prediction result */
export interface SequencePrediction {
    /** Current state */
    currentState: ObservableState;
    /** Previous state (if known) */
    previousState?: ObservableState;
    /** Predicted next states with probabilities */
    predictions: Array<{
        state: ObservableState;
        probability: number;
        confidence: 'low' | 'medium' | 'high' | 'very_high';
        reasoning: string;
    }>;
    /** Whether prediction is trustworthy */
    isReliable: boolean;
    /** Source of prediction */
    source: 'personal' | 'community' | 'prior' | 'mixed';
}
/**
 * Record a state transition observation
 *
 * @param userId - User to learn from
 * @param from - Previous state
 * @param to - Current state
 * @param context - Optional temporal context
 */
export declare function recordTransition(userId: string, from: ObservableState, to: ObservableState, context?: TransitionObservation['context']): void;
/**
 * Record a second-order transition (with previous state context)
 */
export declare function recordSecondOrderTransition(userId: string, previous: ObservableState, current: ObservableState, next: ObservableState): void;
/**
 * Predict the most likely next states
 *
 * @param userId - User to predict for
 * @param currentState - Current observed state
 * @param previousState - Optional previous state for 2nd-order prediction
 * @returns Prediction with probabilities and confidence
 */
export declare function predictNextStates(userId: string, currentState: ObservableState, previousState?: ObservableState): SequencePrediction;
/**
 * Extract observable states from a conversation turn
 *
 * @param text - User message
 * @param emotion - Detected emotion (if any)
 * @param topic - Detected topic (if any)
 * @param timestamp - When the message was sent
 * @returns Array of observable states
 */
export declare function extractStatesFromTurn(text: string, emotion?: string, topic?: string, timestamp?: Date): ObservableState[];
/**
 * Save user's Markov profile to Firestore
 */
export declare function saveUserProfile(userId: string): Promise<void>;
/**
 * Load user's Markov profile from memory
 * (Firestore loading happens async on first access)
 */
export declare function loadUserProfile(userId: string): Promise<UserPatternProfile | null>;
/**
 * Get Markov data for persistence (called by persistence layer)
 */
export declare function getMarkovDataForPersistence(userId: string): MarkovPersistenceData | null;
declare const _default: {
    recordTransition: typeof recordTransition;
    recordSecondOrderTransition: typeof recordSecondOrderTransition;
    predictNextStates: typeof predictNextStates;
    extractStatesFromTurn: typeof extractStatesFromTurn;
    saveUserProfile: typeof saveUserProfile;
    loadUserProfile: typeof loadUserProfile;
    getMarkovDataForPersistence: typeof getMarkovDataForPersistence;
};
export default _default;
//# sourceMappingURL=markov-sequence-predictor.d.ts.map