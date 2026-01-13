/**
 * Unsaid Words Detector - Better Than Human Service
 *
 * What no human friend can do: Track what people DON'T say.
 *
 * "You've mentioned work stress 6 times this week but always change the subject
 * when I ask about your manager specifically. Is there something there we
 * should look at?"
 *
 * @module tools/domains/communication/superhuman-tools/unsaid-words-detector
 */
import type { UnsaidTopic } from './types.js';
/**
 * Detect if a topic was mentioned and whether it was deflected.
 */
export declare function detectTopicAndDeflection(transcript: string, previousTopic?: string): {
    topicMentioned?: string;
    category?: string;
    wasDeflected: boolean;
    deflectionType?: string;
};
/**
 * Track a topic mention in the current session.
 */
export declare function trackTopicMention(userId: string, topic: string, wasDeflected: boolean, context: string): void;
/**
 * Analyze session mentions to detect unsaid patterns.
 */
export declare function analyzeSessionForUnsaidTopics(userId: string): UnsaidTopic[];
/**
 * Save an unsaid topic to Firestore.
 */
export declare function saveUnsaidTopic(userId: string, topic: UnsaidTopic): Promise<void>;
/**
 * Get all active unsaid topics for a user.
 */
export declare function getUnsaidTopics(userId: string): Promise<UnsaidTopic[]>;
/**
 * Mark an unsaid topic as surfaced (we brought it up gently).
 */
export declare function markTopicSurfaced(userId: string, topicId: string): Promise<void>;
/**
 * Mark topic as resolved.
 */
export declare function markTopicResolved(userId: string, topicId: string): Promise<void>;
/**
 * Build unsaid words context for LLM injection.
 */
export declare function buildUnsaidWordsContext(userId: string): Promise<string>;
/**
 * Generate a gentle prompt to surface an unsaid topic.
 */
export declare function generateSurfacingPrompt(topic: UnsaidTopic): string;
/**
 * Clear session data for a user (call at end of session).
 */
export declare function clearSession(userId: string): void;
/**
 * End session and persist findings.
 */
export declare function endSessionAndPersist(userId: string): Promise<void>;
export declare const unsaidWordsDetector: {
    detect: typeof detectTopicAndDeflection;
    track: typeof trackTopicMention;
    analyze: typeof analyzeSessionForUnsaidTopics;
    save: typeof saveUnsaidTopic;
    get: typeof getUnsaidTopics;
    markSurfaced: typeof markTopicSurfaced;
    markResolved: typeof markTopicResolved;
    buildContext: typeof buildUnsaidWordsContext;
    generatePrompt: typeof generateSurfacingPrompt;
    clearSession: typeof clearSession;
    endSession: typeof endSessionAndPersist;
};
export default unsaidWordsDetector;
//# sourceMappingURL=unsaid-words-detector.d.ts.map