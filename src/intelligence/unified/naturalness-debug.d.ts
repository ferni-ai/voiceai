/**
 * Naturalness Debug Module
 *
 * Tools for debugging and monitoring how natural our responses are.
 * Use this to identify issues in the intelligence pipeline.
 *
 * @module intelligence/unified/naturalness-debug
 */
import type { UnifiedAnalysisResult } from './unified-analyzer.js';
import type { HumanizationResult } from './humanization-orchestrator.js';
export interface NaturalnessReport {
    /** Overall naturalness score (0-1) */
    score: number;
    /** Key signals detected */
    signals: {
        voiceTextMismatch: boolean;
        highEmotion: boolean;
        focusedSupportMode: boolean;
        activeListeningTriggered: boolean;
    };
    /** Pipeline statistics */
    pipeline: {
        analysisTimeMs: number;
        emotionSource: 'text' | 'voice' | 'combined';
        emotionConfidence: number;
    };
    /** Potential issues detected */
    issues: NaturalnessIssue[];
    /** Suggestions for improvement */
    suggestions: string[];
}
export interface NaturalnessIssue {
    type: 'conflict' | 'missing' | 'performance' | 'quality';
    description: string;
    severity: 'low' | 'medium' | 'high';
}
/**
 * Generate a naturalness report for a conversation turn
 */
export declare function generateNaturalnessReport(analysis: UnifiedAnalysisResult, humanization: HumanizationResult): NaturalnessReport;
/**
 * Log a summary of the analysis for debugging
 */
export declare function logAnalysisSummary(analysis: UnifiedAnalysisResult): void;
/**
 * Check for potential naturalness issues in real-time
 */
export declare function checkNaturalnessIssues(analysis: UnifiedAnalysisResult): string[];
declare const _default: {
    generateNaturalnessReport: typeof generateNaturalnessReport;
    logAnalysisSummary: typeof logAnalysisSummary;
    checkNaturalnessIssues: typeof checkNaturalnessIssues;
};
export default _default;
//# sourceMappingURL=naturalness-debug.d.ts.map