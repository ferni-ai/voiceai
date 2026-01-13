/**
 * Cognitive Intelligence Module
 *
 * Evidence-based cognitive tools for Ferni's coaching capabilities.
 * Includes distortion detection, ANT tracking, Socratic questioning,
 * and thought record support.
 *
 * @module CognitiveIntelligence
 */
export { detectDistortions, distortionDetector, getDistortionContextInjection, getGentleResponse, getUserDistortionStats, isCommonDistortion, } from './distortion-detector.js';
export type { CognitiveDistortion, ConversationContext, DistortionDetection, } from './distortion-detector.js';
export { antTracker, generateWeeklyReport, getANTContextInjection, getANTPatterns, getInsights, recordANT, } from './ant-tracker.js';
export type { ANTEntry, ANTInsight, ANTPattern, DayOfWeek, TimeOfDay, WeeklyReport, } from './ant-tracker.js';
import { distortionDetector, getDistortionContextInjection } from './distortion-detector.js';
export declare const cognitiveIntelligence: {
    distortions: {
        detect: typeof import("./distortion-detector.js").detectDistortions;
        getResponse: typeof import("./distortion-detector.js").getGentleResponse;
        getStats: typeof import("./distortion-detector.js").getUserDistortionStats;
        isCommon: typeof import("./distortion-detector.js").isCommonDistortion;
        getContextInjection: typeof getDistortionContextInjection;
    };
    ants: {
        record: typeof import("./ant-tracker.js").recordANT;
        recordReframe: typeof import("./ant-tracker.js").recordReframeResponse;
        getPatterns: typeof import("./ant-tracker.js").getANTPatterns;
        getInsights: typeof import("./ant-tracker.js").getInsights;
        getWeeklyReport: typeof import("./ant-tracker.js").generateWeeklyReport;
        getContextInjection: typeof import("./ant-tracker.js").getANTContextInjection;
        loadUserData: typeof import("./ant-tracker.js").loadUserANTData;
        clearOldData: typeof import("./ant-tracker.js").clearOldANTData;
        getAllUsers: typeof import("./ant-tracker.js").getAllUsersWithANTData;
        deleteUserData: typeof import("./ant-tracker.js").deleteUserANTData;
        clearCache: typeof import("./ant-tracker.js").clearCache;
    };
};
export default cognitiveIntelligence;
/**
 * Build complete cognitive intelligence context for a user's message.
 * This is the main entry point for cognitive analysis.
 */
export declare function buildCognitiveIntelligenceContext(userId: string, text: string, context?: {
    emotion?: string;
    emotionIntensity?: number;
    relationshipStage?: string;
}): {
    hasDistortion: boolean;
    primary: ReturnType<typeof distortionDetector.detect>[0] | null;
    contextInjection: {
        llmContext: string;
    } | null;
};
export { clearOldANTData, deleteUserANTData, getAllUsersWithANTData, loadUserANTData, } from './ant-tracker.js';
/**
 * Generate weekly insights from ANT patterns
 */
export declare function generateWeeklyInsights(pattern: {
    totalDetected: number;
    peakTime?: string;
    peakDay?: string;
    topicTriggers?: Map<string, unknown[]>;
}): string[];
//# sourceMappingURL=index.d.ts.map