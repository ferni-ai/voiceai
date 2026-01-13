/**
 * News → Mood Cross-Domain Connection
 *
 * "Better Than Human" feature: Detects heavy/stressful news content
 * and offers to skip, summarize, or provide emotional support.
 *
 * Examples:
 * - "The news is pretty heavy today. Want me to just give you the highlights?"
 * - "I notice you seem stressed. Maybe skip the news for now?"
 * - "There's been some difficult news. Want to hear it, or take a break?"
 */
import { llm } from '@livekit/agents';
import type { NewsMoodAnalysis, MoodContext, CrossDomainInsight } from './types.js';
/**
 * Analyze news and user mood to determine best delivery approach
 */
export declare function analyzeNewsMoodImpact(newsHeadlines: string[], userMood?: MoodContext): Promise<NewsMoodAnalysis>;
/**
 * Generate a mood-sensitive news introduction
 */
export declare function generateNewsMoodIntro(analysis: NewsMoodAnalysis, userMood?: MoodContext): string;
/**
 * Generate insights connecting news to mood
 */
export declare function getNewsMoodInsights(newsHeadlines: string[], userMood?: MoodContext): Promise<CrossDomainInsight[]>;
/**
 * Find positive/uplifting news when user needs a mood boost
 */
export declare function filterPositiveNews(headlines: string[]): string[];
/**
 * Generate a mood-boosting news summary
 */
export declare function generateUpliftingNewsSummary(positiveHeadlines: string[]): string;
export declare function createNewsMoodTools(): {
    analyzeNewsMoodImpact: llm.FunctionTool<{
        newsHeadlines: string[];
        userMoodState?: "calm" | "neutral" | "excited" | "anxious" | "happy" | "sad" | "frustrated" | "stressed" | "tired" | undefined;
    }, unknown, string>;
    getPositiveNewsOnly: llm.FunctionTool<{
        newsHeadlines: string[];
    }, unknown, string>;
    shouldSkipNews: llm.FunctionTool<{
        newsHeadlines: string[];
        userMoodState: "calm" | "neutral" | "excited" | "anxious" | "happy" | "sad" | "frustrated" | "stressed" | "tired";
    }, unknown, string>;
};
//# sourceMappingURL=news-mood.d.ts.map