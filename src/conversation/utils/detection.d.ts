/**
 * Shared Detection Utilities
 *
 * Centralized detection functions for conversation analysis.
 * These utilities are used across multiple conversation modules:
 * - deep-humanization.ts
 * - vocal-humanization.ts
 * - humanization/index.ts
 * - humanizer.ts
 *
 * @module @ferni/conversation/utils/detection
 */
export type EnergyLevel = 'high' | 'medium' | 'low' | 'subdued';
export type TopicWeight = 'light' | 'medium' | 'heavy';
export type EngagementLevel = 'disengaged' | 'low' | 'medium' | 'high' | 'very_high';
export interface DetectionResult<T> {
    detected: boolean;
    value?: T;
    confidence: number;
    signals: string[];
}
/**
 * Patterns indicating high energy in user message
 */
export declare const HIGH_ENERGY_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating low/subdued energy
 */
export declare const LOW_ENERGY_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating emotional content in responses
 */
export declare const EMOTIONAL_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating heavy/serious content
 */
export declare const HEAVY_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Keywords that suggest heavy content
 * Used for detailed detection (returns which keywords were found)
 */
export declare const HEAVY_CONTENT_KEYWORDS: readonly ["suicide", "kill", "die", "death", "dying", "dead", "abuse", "abused", "trauma", "traumatic", "depressed", "depression", "hopeless", "worthless", "panic", "terrified", "devastated", "divorce", "cancer", "diagnosed", "terminal", "fired", "bankrupt", "homeless", "miscarriage", "stillborn", "cheated", "affair", "betrayed", "estranged", "disowned", "never told anyone", "first time saying", "secret", "ashamed", "embarrassed to admit"];
/**
 * Patterns indicating light/positive content
 */
export declare const LIGHT_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating user presented evidence/counter-argument
 */
export declare const EVIDENCE_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating breakthrough/insight moment
 */
export declare const BREAKTHROUGH_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating agent is giving advice
 */
export declare const ADVICE_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating user disengagement
 */
export declare const DISENGAGEMENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Single-word disengagement responses
 */
export declare const DISENGAGEMENT_WORDS: Set<string>;
/**
 * Patterns indicating high engagement/enthusiasm
 */
export declare const HIGH_ENGAGEMENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Patterns indicating deep sharing
 */
export declare const DEEP_SHARING_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Hesitation signals for first-turn detection
 */
export declare const HESITATION_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
/**
 * Detect user's energy level from their message
 *
 * @param userMessage - The user's message to analyze
 * @returns The detected energy level
 *
 * @example
 * detectUserEnergy("This is AMAZING!!!") // 'high'
 * detectUserEnergy("I'm so tired...") // 'low'
 * detectUserEnergy("That sounds good") // 'medium'
 */
export declare function detectUserEnergy(userMessage: string): EnergyLevel;
/**
 * Detect user energy with detailed result
 */
export declare function detectUserEnergyDetailed(userMessage: string): DetectionResult<EnergyLevel>;
/**
 * Classify the emotional weight of a topic
 *
 * @param userMessage - The user's message to analyze
 * @param detectedEmotion - Optional detected emotion from voice/sentiment analysis
 * @returns The topic weight classification
 *
 * @example
 * classifyTopicWeight("My father passed away") // 'heavy'
 * classifyTopicWeight("Going on vacation!") // 'light'
 * classifyTopicWeight("Working on a project") // 'medium'
 */
export declare function classifyTopicWeight(userMessage: string, detectedEmotion?: string): TopicWeight;
/**
 * Detect if content is emotionally charged
 */
export declare function detectEmotionalContent(text: string): boolean;
/**
 * Detect if content is heavy/serious
 */
export declare function detectHeavyContent(text: string): boolean;
/**
 * Detect heavy content and return which keywords were found
 * Useful when you need to know *what* was detected, not just *if*
 *
 * @param text - The text to analyze
 * @returns Array of keywords found in the text
 *
 * @example
 * detectHeavyContentKeywords("dealing with depression") // ['depression']
 * detectHeavyContentKeywords("had a great day!") // []
 */
export declare function detectHeavyContentKeywords(text: string): string[];
/**
 * Detect if user presented evidence or counter-argument
 */
export declare function detectEvidence(userMessage: string): boolean;
/**
 * Detect breakthrough/insight moment
 */
export declare function detectBreakthrough(userMessage: string): boolean;
/**
 * Detect if agent response is giving advice
 */
export declare function detectAdviceGiving(agentMessage: string): boolean;
/**
 * Detect if user seems disengaged based on message content
 *
 * @param userMessage - The user's message to analyze
 * @returns true if user appears disengaged
 *
 * @example
 * detectDisengagement("yeah") // true
 * detectDisengagement("That's really interesting, tell me more!") // false
 */
export declare function detectDisengagement(userMessage: string): boolean;
/**
 * Detect if user seems highly engaged
 *
 * @param userMessage - The user's message to analyze
 * @returns true if user appears highly engaged
 */
export declare function detectHighEngagement(userMessage: string): boolean;
/**
 * Detect hesitation in user message (for first-turn "I notice" moments)
 */
export declare function detectHesitation(userMessage: string): boolean;
/**
 * Get overall engagement level with confidence
 */
export declare function detectEngagementLevel(userMessage: string): DetectionResult<EngagementLevel>;
/**
 * Combined analysis result for a user message
 */
export interface MessageAnalysis {
    energy: EnergyLevel;
    topicWeight: TopicWeight;
    engagement: EngagementLevel;
    hasEvidence: boolean;
    isBreakthrough: boolean;
    hasHesitation: boolean;
    isEmotional: boolean;
    isHeavy: boolean;
    confidence: number;
}
/**
 * Perform comprehensive analysis of a user message
 *
 * @param userMessage - The user's message to analyze
 * @param detectedEmotion - Optional detected emotion
 * @returns Complete message analysis
 */
export declare function analyzeMessage(userMessage: string, detectedEmotion?: string): MessageAnalysis;
declare const _default: {
    detectUserEnergy: typeof detectUserEnergy;
    detectUserEnergyDetailed: typeof detectUserEnergyDetailed;
    classifyTopicWeight: typeof classifyTopicWeight;
    detectEmotionalContent: typeof detectEmotionalContent;
    detectHeavyContent: typeof detectHeavyContent;
    detectHeavyContentKeywords: typeof detectHeavyContentKeywords;
    detectEvidence: typeof detectEvidence;
    detectBreakthrough: typeof detectBreakthrough;
    detectAdviceGiving: typeof detectAdviceGiving;
    detectDisengagement: typeof detectDisengagement;
    detectHighEngagement: typeof detectHighEngagement;
    detectHesitation: typeof detectHesitation;
    detectEngagementLevel: typeof detectEngagementLevel;
    analyzeMessage: typeof analyzeMessage;
    HIGH_ENERGY_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp];
    LOW_ENERGY_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp];
    EMOTIONAL_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp];
    HEAVY_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    HEAVY_CONTENT_KEYWORDS: readonly ["suicide", "kill", "die", "death", "dying", "dead", "abuse", "abused", "trauma", "traumatic", "depressed", "depression", "hopeless", "worthless", "panic", "terrified", "devastated", "divorce", "cancer", "diagnosed", "terminal", "fired", "bankrupt", "homeless", "miscarriage", "stillborn", "cheated", "affair", "betrayed", "estranged", "disowned", "never told anyone", "first time saying", "secret", "ashamed", "embarrassed to admit"];
    LIGHT_CONTENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp];
    EVIDENCE_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    BREAKTHROUGH_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    ADVICE_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    DISENGAGEMENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    HIGH_ENGAGEMENT_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    DEEP_SHARING_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    HESITATION_PATTERNS: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
};
export default _default;
//# sourceMappingURL=detection.d.ts.map