/**
 * Superhuman Insights Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 * > "Better than human" - We remember what humans forget.
 *
 * This builder provides the "magical" moments that make Ferni feel genuinely caring:
 *
 * 1. TIME-BASED TRIGGERS
 *    - "Three months ago you mentioned wanting to learn guitar..."
 *    - "It's been a week since you committed to that new routine..."
 *    - "Around this time last year, you were going through something similar..."
 *
 * 2. CROSS-SESSION REFLECTIONS
 *    - "I've been thinking about what you said last time..."
 *    - "Something you mentioned stuck with me..."
 *
 * 3. PATTERN RECOGNITION
 *    - "You've mentioned feeling stuck at work in 3 of our last 5 conversations..."
 *    - "I notice you tend to be harder on yourself on Mondays..."
 *
 * 4. GOAL PROGRESS CHECK-INS
 *    - "How's that morning routine going? It's been two weeks."
 *    - "Remember when you said you'd talk to your manager? Any updates?"
 *
 * @module intelligence/context-builders/superhuman-insights
 */
import type { UserProfile } from '../../../types/user-profile.js';
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface SuperhumanSession {
    /** Insights already surfaced this session (prevent repetition) */
    surfacedInsights: Set<string>;
    /** Turn when each type was last surfaced */
    lastSurfacedTurn: Record<string, number>;
    /** Session start time */
    startTime: Date;
}
/**
 * Clear session data for a specific session (prevents memory leaks).
 */
export declare function clearSuperhumanInsightsSession(sessionId: string): void;
/**
 * Clear all session data (for shutdown).
 */
export declare function clearAllSuperhumanInsightsSessions(): void;
interface TimeBasedInsight {
    type: 'anniversary' | 'milestone' | 'follow_up' | 'pattern';
    content: string;
    suggestedPhrase: string;
    priority: 'high' | 'standard' | 'hint';
    relevance: number;
}
/**
 * Generate time-based insights from user profile
 */
declare function generateTimeBasedInsights(profile: UserProfile | null, currentTopics: string[]): TimeBasedInsight[];
/**
 * Build superhuman insights context
 */
declare function buildSuperhumanInsights(input: ContextBuilderInput): Promise<ContextInjection[]>;
interface LinguisticPatternResult {
    type: 'linguistic';
    pattern: 'obligation_language' | 'limiting_belief' | 'dismissal' | 'absolute_thinking' | 'permission_seeking';
    confidence: number;
    phrases: string[];
}
/**
 * Detect linguistic patterns that reveal underlying beliefs or emotions.
 */
export declare function detectLinguisticPatterns(currentMessage: string, recentHistory?: string[]): LinguisticPatternResult | null;
interface RepeatedTopicResult {
    type: 'emotional';
    topic: string;
    occurrences: number;
    confidence: number;
}
/**
 * Detect topics that keep coming up across conversations - "The Mirror".
 * This surfaces patterns the user may not be consciously aware of.
 */
export declare function detectRepeatedTopics(topics: string[], topicHistory?: Record<string, number>): RepeatedTopicResult | null;
interface EmotionalWeatherResult {
    type: 'emotional_weather';
    trend: 'improving' | 'declining' | 'stable' | 'volatile';
    volatilityScore: number;
    averageSentiment: number;
    confidence: number;
}
/**
 * Analyze emotional patterns over time - the "emotional weather" of a user.
 *
 * @param sessionCount - Number of sessions worth of data
 * @param emotions - Array of emotion strings in chronological order
 */
export declare function analyzeEmotionalWeather(sessionCount: number, emotions: string[]): EmotionalWeatherResult | null;
interface AnticipatoryCueResult {
    type: 'hesitant_start' | 'trailing_off' | 'important_incoming' | 'high_stress' | 'topic_avoidance';
    cue: string;
    confidence: number;
}
/**
 * Detect anticipatory cues in speech that suggest what's coming.
 */
export declare function detectAnticipatoryCues(text: string, voiceStressLevel?: number): AnticipatoryCueResult | null;
export { buildSuperhumanInsights, generateTimeBasedInsights, type SuperhumanSession, type TimeBasedInsight, type LinguisticPatternResult, type RepeatedTopicResult, type EmotionalWeatherResult, type AnticipatoryCueResult, };
declare const _default: {
    buildSuperhumanInsights: typeof buildSuperhumanInsights;
    generateTimeBasedInsights: typeof generateTimeBasedInsights;
    detectLinguisticPatterns: typeof detectLinguisticPatterns;
    detectRepeatedTopics: typeof detectRepeatedTopics;
    analyzeEmotionalWeather: typeof analyzeEmotionalWeather;
    detectAnticipatoryCues: typeof detectAnticipatoryCues;
};
export default _default;
//# sourceMappingURL=superhuman-insights.d.ts.map