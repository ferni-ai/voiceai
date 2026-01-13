/**
 * Concern Detection Analyzers
 *
 * Individual analyzer functions for different signal sources:
 * - Linguistic: Word patterns and language analysis
 * - Behavioral: Engagement, response patterns
 * - Prosody: Voice characteristics
 * - Breathing: Breath patterns
 * - Temporal: Time-based patterns
 *
 * @module @ferni/conversation/concern-detection/analyzers
 */
import type { BreathingSignals, ConcernSignal, ConcernType, ProsodySignals, TemporalContext } from './types.js';
export type SignalAdder = (source: ConcernSignal['source'], type: ConcernType, confidence: number, indicator: string) => void;
/**
 * Analyze linguistic patterns in user message
 */
export declare function analyzeLinguistic(text: string, addSignal: SignalAdder, existingSignals: ConcernSignal[]): void;
export interface BehavioralContext {
    engagementLevel?: number;
    responseLatencyMs?: number;
    previousTopics?: string[];
    currentTopic?: string;
}
export interface BehavioralState {
    responseLengthHistory: number[];
    engagementHistory: number[];
    turnCount: number;
}
/**
 * Analyze behavioral patterns in user interaction
 */
export declare function analyzeBehavioral(text: string, context: BehavioralContext, state: BehavioralState, addSignal: SignalAdder): {
    responseLengthHistory: number[];
    engagementHistory: number[];
};
/**
 * Analyze voice prosody signals
 */
export declare function analyzeProsody(prosody: ProsodySignals, addSignal: SignalAdder): void;
/**
 * Analyze breathing patterns
 */
export declare function analyzeBreathing(breathing: BreathingSignals, addSignal: SignalAdder): void;
/**
 * Analyze temporal context patterns
 */
export declare function analyzeTemporal(temporal: TemporalContext, existingSignals: ConcernSignal[], addSignal: SignalAdder): void;
//# sourceMappingURL=analyzers.d.ts.map