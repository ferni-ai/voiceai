/**
 * Superhuman Memory Intelligence
 *
 * "Better than human" means remembering what matters at the right moment.
 * This module transforms stored memories into proactive intelligence:
 *
 * - Proactive Date Awareness: "Happy birthday!" / "I know this week is hard..."
 * - Comfort Pattern Injection: Apply what helps when stress is detected
 * - Growth Arc Celebration: "Look how far you've come!"
 * - Topic Absence Detection: Notice what's NOT being said
 * - Inside Joke Surfacing: Relationship texture callbacks
 * - Voice Tone Memory: Energy/pace patterns over time
 *
 * Philosophy: A great friend doesn't just remember - they remember at the
 * right moment, in the right way, without being asked.
 *
 * @module intelligence/superhuman-memory
 */
import type { UserProfile } from '../../types/user-profile.js';
import type { SuperhumanContext } from './types.js';
import { checkUpcomingDates } from './date-awareness.js';
import { getComfortGuidance } from './comfort-patterns.js';
import { findCelebratableGrowth } from './growth-celebration.js';
import { detectTopicAbsences } from './topic-absence.js';
import { findSurfaceableJokes } from './inside-jokes.js';
import { getTemporalContext } from './temporal-context.js';
import { recordVoicePattern, analyzeVoicePatterns } from './voice-patterns.js';
import { markInsightDelivered, wasRecentlyDelivered, cleanupDeliveryRecords } from './delivery-tracking.js';
export type { ProactiveInsight, ComfortGuidance, TopicAbsenceInsight, VoicePatternObservation, SuperhumanContext, TemporalContextResult, } from './types.js';
export { checkUpcomingDates } from './date-awareness.js';
export { getComfortGuidance } from './comfort-patterns.js';
export { findCelebratableGrowth } from './growth-celebration.js';
export { detectTopicAbsences } from './topic-absence.js';
export { findSurfaceableJokes } from './inside-jokes.js';
export { getTemporalContext } from './temporal-context.js';
export { recordVoicePattern, analyzeVoicePatterns, clearVoicePatternHistory, } from './voice-patterns.js';
export { markInsightDelivered, wasRecentlyDelivered, cleanupDeliveryRecords, getDeliveryCount, clearAllDeliveryRecords, } from './delivery-tracking.js';
/**
 * Build complete superhuman memory context for a session
 */
export declare function buildSuperhumanContext(profile: UserProfile | null, options?: {
    detectedEmotion?: string;
    detectedStressLevel?: number;
    currentTopic?: string;
    recentTopics?: string[];
    sessionCount?: number;
    conversationContext?: string;
}): SuperhumanContext;
declare const _default: {
    checkUpcomingDates: typeof checkUpcomingDates;
    getComfortGuidance: typeof getComfortGuidance;
    findCelebratableGrowth: typeof findCelebratableGrowth;
    detectTopicAbsences: typeof detectTopicAbsences;
    findSurfaceableJokes: typeof findSurfaceableJokes;
    getTemporalContext: typeof getTemporalContext;
    recordVoicePattern: typeof recordVoicePattern;
    analyzeVoicePatterns: typeof analyzeVoicePatterns;
    buildSuperhumanContext: typeof buildSuperhumanContext;
    markInsightDelivered: typeof markInsightDelivered;
    wasRecentlyDelivered: typeof wasRecentlyDelivered;
    cleanupDeliveryRecords: typeof cleanupDeliveryRecords;
};
export default _default;
//# sourceMappingURL=index.d.ts.map