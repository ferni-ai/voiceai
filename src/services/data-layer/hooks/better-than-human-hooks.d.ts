/**
 * Better Than Human Hooks
 *
 * Semantic indexing for what makes Ferni superhuman:
 * - Perfect memory (session summaries)
 * - Emotional detection (voice biomarkers)
 * - Pattern recognition (behavioral insights)
 * - Cross-conversation threading
 * - Hidden correlations
 * - Protective silence
 * - Voice recognition
 *
 * "We remember your whole story, hear what you're not saying,
 *  and show up at 2am with the same presence as noon."
 */
import type { VoiceBiomarkerEntity, SessionSummaryEntity, PatternInsightEntity, BehavioralPatternEntity, CrossSessionThreadEntity, CorrelationInsightEntity, ProtectiveMomentEntity, VoiceRecognitionEntity } from '../types.js';
export declare const onVoiceBiomarkerChange: import("../hook-generator.js").DomainHook<VoiceBiomarkerEntity>;
export declare function deindexVoiceBiomarker(userId: string, biomarkerId: string): void;
export declare const onSessionSummaryChange: import("../hook-generator.js").DomainHook<SessionSummaryEntity>;
export declare function deindexSessionSummary(userId: string, sessionId: string): void;
export declare const onPatternInsightChange: import("../hook-generator.js").DomainHook<PatternInsightEntity>;
export declare function deindexPatternInsight(userId: string, patternId: string): void;
export declare const onBehavioralPatternChange: import("../hook-generator.js").DomainHook<BehavioralPatternEntity>;
export declare function deindexBehavioralPattern(userId: string, patternId: string): void;
export declare const onCrossSessionThreadChange: import("../hook-generator.js").DomainHook<CrossSessionThreadEntity>;
export declare function deindexCrossSessionThread(userId: string, threadId: string): void;
export declare const onCorrelationInsightChange: import("../hook-generator.js").DomainHook<CorrelationInsightEntity>;
export declare function deindexCorrelationInsight(userId: string, correlationId: string): void;
export declare const onProtectiveMomentChange: import("../hook-generator.js").DomainHook<ProtectiveMomentEntity>;
export declare function deindexProtectiveMoment(userId: string, momentId: string): void;
export declare const onVoiceRecognitionChange: import("../hook-generator.js").DomainHook<VoiceRecognitionEntity>;
export declare function deindexVoiceRecognition(userId: string, profileId: string): void;
export declare const betterThanHumanHooks: {
    onVoiceBiomarkerChange: import("../hook-generator.js").DomainHook<VoiceBiomarkerEntity>;
    deindexVoiceBiomarker: typeof deindexVoiceBiomarker;
    onSessionSummaryChange: import("../hook-generator.js").DomainHook<SessionSummaryEntity>;
    deindexSessionSummary: typeof deindexSessionSummary;
    onPatternInsightChange: import("../hook-generator.js").DomainHook<PatternInsightEntity>;
    deindexPatternInsight: typeof deindexPatternInsight;
    onBehavioralPatternChange: import("../hook-generator.js").DomainHook<BehavioralPatternEntity>;
    deindexBehavioralPattern: typeof deindexBehavioralPattern;
    onCrossSessionThreadChange: import("../hook-generator.js").DomainHook<CrossSessionThreadEntity>;
    deindexCrossSessionThread: typeof deindexCrossSessionThread;
    onCorrelationInsightChange: import("../hook-generator.js").DomainHook<CorrelationInsightEntity>;
    deindexCorrelationInsight: typeof deindexCorrelationInsight;
    onProtectiveMomentChange: import("../hook-generator.js").DomainHook<ProtectiveMomentEntity>;
    deindexProtectiveMoment: typeof deindexProtectiveMoment;
    onVoiceRecognitionChange: import("../hook-generator.js").DomainHook<VoiceRecognitionEntity>;
    deindexVoiceRecognition: typeof deindexVoiceRecognition;
};
//# sourceMappingURL=better-than-human-hooks.d.ts.map