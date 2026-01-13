/**
 * Humanization Phase Helpers
 *
 * Extracted helper functions for the humanization phase of the conversation orchestrator.
 * These functions apply various humanization features to text/SSML.
 *
 * @module @ferni/conversation/orchestrator/humanization-helpers
 */
import type { AnalysisPhaseResult, AppliedFeature, IntelligenceGuidance, IntelligencePhaseResult, OrchestratorInput, ResponseAdditions, SkippedFeature } from './types.js';
export declare function applySpeechNaturalization(text: string, input: OrchestratorInput, analysis: AnalysisPhaseResult): {
    text: string;
    applied: boolean;
};
export declare function applyVocabularyMirroring(text: string, userMessage: string): {
    text: string;
    applied: boolean;
};
export declare function applyContentDeliveryPacing(text: string, input: OrchestratorInput): {
    ssml: string;
    applied: boolean;
};
export declare function applyVocalHumanization(text: string, input: OrchestratorInput, analysis: AnalysisPhaseResult): {
    ssml: string;
    appliedFeatures: string[];
};
export declare function applySilencePresence(text: string, ssml: string, input: OrchestratorInput, analysis: AnalysisPhaseResult): {
    text: string;
    ssml: string;
    applied: boolean;
};
export declare function applyComposableEffects(text: string, ssml: string, input: OrchestratorInput, analysis: AnalysisPhaseResult, intelligence: IntelligencePhaseResult): Promise<{
    text: string;
    ssml: string;
    features: AppliedFeature[];
    skipped: SkippedFeature[];
}>;
export declare function applyDeepHumanization(text: string, ssml: string, input: OrchestratorInput, analysis: AnalysisPhaseResult): Promise<{
    text: string;
    ssml: string;
    features: AppliedFeature[];
}>;
export declare function applyAdvancedHumanization(text: string, ssml: string, input: OrchestratorInput, analysis: AnalysisPhaseResult, getComfortLevel: (stage?: string) => number): {
    text: string;
    ssml: string;
    features: AppliedFeature[];
    skipped: SkippedFeature[];
};
export declare function applyPriorityActions(text: string, ssml: string, actions: IntelligenceGuidance['priorityActions']): {
    text: string;
    ssml: string;
    features: AppliedFeature[];
};
export declare function generateAdditions(input: OrchestratorInput, analysis: AnalysisPhaseResult, shouldTrigger: (sessionId: string, turnNumber: number, feature: string, probability: number) => boolean): ResponseAdditions;
//# sourceMappingURL=humanization-helpers.d.ts.map