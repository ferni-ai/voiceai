/**
 * EvalOps Automation
 *
 * > "E2E automation - evaluate quality without human intervention."
 *
 * This module provides:
 * - Automatic sampling of conversations for evaluation
 * - Real-time voice consistency monitoring
 * - Scheduled test suite runs
 * - Integration hooks for the conversation pipeline
 * - Feature flag support for gradual rollout
 *
 * Usage:
 * ```typescript
 * import { evalopsHook, scheduleEvaluation, runScheduledSuite } from './evalops/automation';
 *
 * // Hook into conversation turns
 * evalopsHook.afterTurn(sessionId, personaId, userMessage, aiResponse, context);
 *
 * // Run scheduled evaluation suite
 * await runScheduledSuite('ferni');
 * ```
 */
import { type ResponseEvaluation } from './index.js';
export interface EvalOpsFeatureFlags {
    /** Master switch for all EvalOps features */
    enabled: boolean;
    /** Enable automatic sampling of conversations */
    autoSampling: boolean;
    /** Enable real-time voice consistency checks */
    voiceChecks: boolean;
    /** Enable full LLM evaluation (vs just heuristic) */
    llmEvaluation: boolean;
    /** Enable scheduled test suite runs */
    scheduledSuites: boolean;
    /** Enable alerting for flagged responses */
    alerting: boolean;
    /** Sample rate override (0-100) */
    sampleRateOverride: number | null;
    /** Personas to evaluate (empty = all) */
    enabledPersonas: string[];
}
/**
 * Get current feature flags
 */
export declare function getEvalOpsFlags(): EvalOpsFeatureFlags;
/**
 * Update feature flags
 */
export declare function setEvalOpsFlags(updates: Partial<EvalOpsFeatureFlags>): void;
/**
 * Check if EvalOps is enabled for a persona
 */
export declare function isEvalOpsEnabledForPersona(personaId: string): boolean;
interface EvalMetrics {
    totalEvaluations: number;
    totalSampled: number;
    totalSkipped: number;
    flaggedResponses: number;
    averageScore: number;
    scoresByPersona: Record<string, {
        count: number;
        total: number;
    }>;
    lastEvaluationTime: Date | null;
    errors: number;
}
/**
 * Get current evaluation metrics
 */
export declare function getEvalMetrics(): EvalMetrics;
/**
 * Reset evaluation metrics
 */
export declare function resetEvalMetrics(): void;
interface StoredEvaluation extends ResponseEvaluation {
    sessionId: string;
}
/**
 * Get recent evaluations
 */
export declare function getRecentEvaluations(limit?: number, filters?: {
    personaId?: string;
    flagged?: boolean;
}): Promise<StoredEvaluation[]>;
/**
 * Get flagged evaluations
 */
export declare function getFlaggedEvaluations(limit?: number): Promise<StoredEvaluation[]>;
/**
 * Get aggregate dimension averages across all evaluations
 * Returns scores for each dimension (0-100 scale)
 */
export declare function getDimensionAverages(): {
    personaVoice: number;
    emotionalIntelligence: number;
    helpfulness: number;
    authenticity: number;
    safety: number;
    contextUse: number;
    trustBuilding: number;
    sampleSize: number;
};
type AlertHandler = (evaluation: ResponseEvaluation) => void | Promise<void>;
/**
 * Register an alert handler for flagged responses
 */
export declare function onFlaggedResponse(handler: AlertHandler): () => void;
interface TurnContext {
    conversationHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
    }>;
    userProfile?: {
        name?: string;
        relationshipStage?: string;
        totalConversations?: number;
    };
    trustContext?: {
        activeBoundaries?: string[];
        recentWins?: string[];
    };
    emotionalContext?: {
        userEmotion?: string;
        emotionIntensity?: number;
        distressLevel?: number;
    };
    turnNumber: number;
    isNewUser?: boolean;
    hasUserReportedIssue?: boolean;
}
/**
 * Hook to evaluate a conversation turn
 * Call this after each AI response is generated
 */
export declare function afterTurn(sessionId: string, personaId: string, userMessage: string, aiResponse: string, context: TurnContext): Promise<ResponseEvaluation | null>;
/**
 * Quick voice check without full evaluation
 */
export declare function quickVoiceCheck(personaId: string, response: string): {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
};
interface ScheduledSuiteResult {
    personaId: string;
    timestamp: Date;
    passed: number;
    failed: number;
    criticalFailures: number;
    passRate: number;
}
/**
 * Run test suite for a persona
 * Requires a response generator function
 */
export declare function runScheduledSuite(personaId: string, generateResponse: (probe: string, context?: unknown) => Promise<string>, criticalOnly?: boolean): Promise<ScheduledSuiteResult>;
/**
 * Get recent suite results
 */
export declare function getSuiteResults(personaId?: string): ScheduledSuiteResult[];
interface ScheduleConfig {
    /** Cron expression or interval in ms */
    schedule: string | number;
    /** Personas to test */
    personas: string[];
    /** Run critical scenarios only */
    criticalOnly: boolean;
    /** Response generator */
    generateResponse: (probe: string, context?: unknown) => Promise<string>;
}
/**
 * Start scheduled evaluation runs
 */
export declare function startScheduledEvaluation(config: ScheduleConfig): void;
/**
 * Stop scheduled evaluation runs
 */
export declare function stopScheduledEvaluation(): void;
/**
 * EvalOps hooks for conversation pipeline integration
 */
export declare const evalopsHook: {
    /**
     * Call after each AI response is generated
     */
    afterTurn: typeof afterTurn;
    /**
     * Quick voice check (synchronous, cheap)
     */
    quickVoiceCheck: typeof quickVoiceCheck;
    /**
     * Check if evaluation is enabled for a persona
     */
    isEnabled: typeof isEvalOpsEnabledForPersona;
    /**
     * Get current metrics
     */
    getMetrics: typeof getEvalMetrics;
    /**
     * Get recent evaluations
     */
    getRecent: typeof getRecentEvaluations;
    /**
     * Get flagged responses
     */
    getFlagged: typeof getFlaggedEvaluations;
    /**
     * Register alert handler
     */
    onFlagged: typeof onFlaggedResponse;
};
export default evalopsHook;
//# sourceMappingURL=automation.d.ts.map