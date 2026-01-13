/**
 * Career Awareness Context Builder
 *
 * Tracks career-related sentiment over time from conversations.
 * "Better than Human" - notice career frustration patterns before they become crises.
 *
 * Superhuman Capabilities:
 * - "Last month you mentioned job frustration 5 times. Should we talk about what's really going on?"
 * - "Your energy around work has shifted lately - I've noticed more stress signals."
 * - "You haven't mentioned that promotion in a while - still on your mind?"
 *
 * @module intelligence/context-builders/awareness/career-awareness
 */
import { type ContextBuilder } from '../index.js';
interface CareerMention {
    timestamp: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    topic: string;
    intensity: number;
}
interface CareerSentimentProfile {
    mentions: CareerMention[];
    lastUpdated: number;
    averageSentiment: number;
    trendDirection: 'improving' | 'declining' | 'stable';
    topConcerns: string[];
    recentWins: string[];
}
/**
 * Detect if conversation is about career/work
 */
declare function detectCareerTopic(text: string): {
    isCareerRelated: boolean;
    topics: string[];
};
/**
 * Analyze career sentiment from text
 */
declare function analyzeCareerSentiment(text: string): {
    sentiment: 'positive' | 'negative' | 'neutral';
    intensity: number;
};
/**
 * Get career profile for user
 */
declare function getCareerProfile(userId: string): CareerSentimentProfile | null;
/**
 * Career Awareness Context Builder
 *
 * Priority: 55 (after emotional context, in cognitive range)
 */
export declare const careerAwarenessBuilder: ContextBuilder;
export { detectCareerTopic, analyzeCareerSentiment, getCareerProfile };
//# sourceMappingURL=career-awareness.d.ts.map