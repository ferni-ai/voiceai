/**
 * Conflict Replay Analysis - Better Than Human Service
 *
 * What no human friend can do: Objectively analyze your conflicts.
 *
 * "Let's replay that argument with your brother. When you said 'You always
 * do this,' that's when his tone shifted. That's a common escalation trigger.
 * If you'd said 'I noticed this happened again,' you might have kept him
 * engaged."
 *
 * @module tools/domains/communication/superhuman-tools/conflict-replay
 */
import type { ConflictRecord } from './types.js';
/**
 * Record a conflict for analysis.
 */
export declare function recordConflict(userId: string, conflict: Omit<ConflictRecord, 'id' | 'recordedAt'>): Promise<ConflictRecord>;
/**
 * Get conflict history with a specific person.
 */
export declare function getConflictHistory(userId: string, contactName: string): Promise<ConflictRecord[]>;
/**
 * Get all conflict records.
 */
export declare function getAllConflicts(userId: string): Promise<ConflictRecord[]>;
interface EscalationPoint {
    phrase: string;
    trigger: string;
    escalationLevel: number;
    suggestion: string;
    timestamp?: number;
}
/**
 * Analyze a transcript for escalation points.
 */
export declare function analyzeForEscalation(transcript: string): {
    escalationPoints: EscalationPoint[];
    deEscalationMoments: Array<{
        phrase: string;
        effect: string;
    }>;
    overallRisk: 'low' | 'medium' | 'high';
    suggestions: string[];
};
/**
 * Reconstruct a conflict from a description with analysis.
 */
export declare function reconstructConflict(description: string, userPhrases: string[], otherPhrases: string[]): {
    timeline: Array<{
        speaker: 'user' | 'other';
        phrase: string;
        analysis?: string;
        escalationRisk?: number;
    }>;
    pivotPoints: string[];
    alternativeApproaches: string[];
    keyInsight: string;
};
/**
 * Analyze patterns across conflicts with a person.
 */
export declare function analyzeConflictPatterns(userId: string, contactName: string): Promise<{
    totalConflicts: number;
    recurringTriggers: Array<{
        trigger: string;
        count: number;
    }>;
    resolutionRate: number;
    commonTopics: string[];
    recommendations: string[];
} | null>;
/**
 * Build conflict analysis context for LLM.
 */
export declare function buildConflictContext(userId: string, contactName?: string): Promise<string>;
/**
 * Generate a replay analysis prompt.
 */
export declare function generateReplayPrompt(conflictSummary: string): string;
export declare const conflictReplay: {
    record: typeof recordConflict;
    getHistory: typeof getConflictHistory;
    getAll: typeof getAllConflicts;
    analyzeEscalation: typeof analyzeForEscalation;
    reconstruct: typeof reconstructConflict;
    analyzePatterns: typeof analyzeConflictPatterns;
    buildContext: typeof buildConflictContext;
    generatePrompt: typeof generateReplayPrompt;
};
export default conflictReplay;
//# sourceMappingURL=conflict-replay.d.ts.map