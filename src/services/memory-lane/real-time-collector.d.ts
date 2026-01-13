/**
 * Memory Lane Real-Time Collector
 *
 * Integration hooks for capturing memories in real-time as they occur
 * during conversations. These hooks are called by other services when
 * memory-worthy moments happen.
 *
 * @module services/memory-lane/real-time-collector
 */
import type { EmotionalTone } from './types.js';
/**
 * Capture a commitment as a potential memory
 */
export declare function captureCommitment(event: {
    userId: string;
    commitmentId: string;
    text: string;
    context?: string;
    personaId?: string;
}): Promise<void>;
/**
 * Capture a dream as a potential memory
 */
export declare function captureDream(event: {
    userId: string;
    dreamId: string;
    statement: string;
    type: string;
    personaId?: string;
}): Promise<void>;
/**
 * Capture an inside joke as a potential memory
 */
export declare function captureInsideJoke(event: {
    userId: string;
    jokeId: string;
    joke: string;
    context?: string;
    personaId?: string;
}): Promise<void>;
/**
 * Capture a milestone as a potential memory
 */
export declare function captureMilestone(event: {
    userId: string;
    milestoneId: string;
    title: string;
    description?: string;
    type: string;
    personaId?: string;
}): Promise<void>;
/**
 * Capture a celebration as a potential memory
 */
export declare function captureCelebration(event: {
    userId: string;
    celebrationId: string;
    description: string;
    type: string;
    personaId?: string;
}): Promise<void>;
/**
 * Generic memory capture for conversation moments
 */
export declare function captureConversationMoment(event: {
    userId: string;
    momentId: string;
    content: string;
    emotionalTone?: EmotionalTone;
    personaId?: string;
    topicTags?: string[];
}): Promise<void>;
export declare const memoryLaneRealTime: {
    captureCommitment: typeof captureCommitment;
    captureDream: typeof captureDream;
    captureInsideJoke: typeof captureInsideJoke;
    captureMilestone: typeof captureMilestone;
    captureCelebration: typeof captureCelebration;
    captureConversationMoment: typeof captureConversationMoment;
};
//# sourceMappingURL=real-time-collector.d.ts.map