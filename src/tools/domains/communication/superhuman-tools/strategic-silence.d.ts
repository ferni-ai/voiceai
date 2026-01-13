/**
 * Strategic Silence Coach - Better Than Human Service
 *
 * What no human friend can do: Stop you from reacting emotionally.
 *
 * "Your impulsive responses to your ex tend to backfire - 3 of your last 4
 * quick replies escalated things. When you've waited 24 hours, outcomes are
 * significantly better. Want me to hold this draft and check with you tomorrow?"
 *
 * @module tools/domains/communication/superhuman-tools/strategic-silence
 */
import type { StrategicSilenceRecord } from './types.js';
interface ResponseTimingPattern {
    contactName: string;
    immediateOutcomes: {
        positive: number;
        negative: number;
        neutral: number;
    };
    delayedOutcomes: {
        positive: number;
        negative: number;
        neutral: number;
    };
    optimalDelay: number;
    recommendation: 'respond_fast' | 'wait_24h' | 'wait_longer' | 'dont_respond';
}
/**
 * Record a response timing outcome.
 */
export declare function recordResponseTiming(userId: string, record: Omit<StrategicSilenceRecord, 'id' | 'recordedAt'>): Promise<StrategicSilenceRecord>;
/**
 * Get response timing history with a contact.
 */
export declare function getTimingHistory(userId: string, contactName: string): Promise<StrategicSilenceRecord[]>;
/**
 * Get all timing records.
 */
export declare function getAllTimingRecords(userId: string): Promise<StrategicSilenceRecord[]>;
/**
 * Analyze response timing patterns for a contact.
 */
export declare function analyzeTimingPatterns(userId: string, contactName: string): Promise<ResponseTimingPattern | null>;
/**
 * Get real-time recommendation for a situation.
 */
export declare function getTimingRecommendation(userId: string, situation: string, contactName?: string): Promise<{
    recommendation: 'respond_now' | 'wait' | 'dont_respond';
    reason: string;
    suggestedDelay?: number;
    confidence: number;
}>;
interface HeldMessage {
    id: string;
    userId: string;
    contactName: string;
    message: string;
    createdAt: number;
    releaseAt: number;
    status: 'held' | 'released' | 'discarded';
}
/**
 * Hold a message for later review.
 */
export declare function holdMessage(userId: string, contactName: string, message: string, holdHours?: number): HeldMessage;
/**
 * Check if any held messages are ready for review.
 */
export declare function getReadyMessages(userId: string): HeldMessage[];
/**
 * Release a held message (user reviewed and wants to send).
 */
export declare function releaseMessage(messageId: string): boolean;
/**
 * Discard a held message (user changed their mind).
 */
export declare function discardMessage(messageId: string): boolean;
/**
 * Build strategic silence context for LLM.
 */
export declare function buildSilenceContext(userId: string): Promise<string>;
/**
 * Generate cooling-off period prompts.
 */
export declare function generateCoolingPrompt(contactName: string, situation: string): string;
export declare const strategicSilence: {
    record: typeof recordResponseTiming;
    getHistory: typeof getTimingHistory;
    analyzePatterns: typeof analyzeTimingPatterns;
    getRecommendation: typeof getTimingRecommendation;
    holdMessage: typeof holdMessage;
    getReadyMessages: typeof getReadyMessages;
    releaseMessage: typeof releaseMessage;
    discardMessage: typeof discardMessage;
    buildContext: typeof buildSilenceContext;
    generatePrompt: typeof generateCoolingPrompt;
};
export default strategicSilence;
//# sourceMappingURL=strategic-silence.d.ts.map