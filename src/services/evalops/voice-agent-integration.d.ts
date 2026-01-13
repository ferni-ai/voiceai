/**
 * EvalOps Voice Agent Integration
 *
 * > "Measure what matters - every response, sampled intelligently."
 *
 * This module provides a hook for the voice agent to evaluate responses
 * without blocking the conversation flow.
 *
 * Integration point: Call after agent response is generated but before/during speech.
 */
import type { ResponseEvaluation } from './types.js';
/**
 * Hook to evaluate an agent response in the background
 *
 * This is designed to be non-blocking - it runs evaluation asynchronously
 * and logs results. Any errors are caught and logged, never blocking the agent.
 *
 * @param sessionId - Session identifier
 * @param personaId - Current persona ID
 * @param userMessage - The user's message that prompted this response
 * @param agentResponse - The agent's generated response
 * @param context - Additional context about the conversation
 */
export declare function evaluateAgentResponse(sessionId: string, personaId: string, userMessage: string, agentResponse: string, context?: {
    userId?: string;
    turnNumber?: number;
    emotionalIntensity?: number;
    isNewUser?: boolean;
    hasUserReportedIssue?: boolean;
    trustContext?: {
        activeBoundaries?: string[];
        recentWins?: string[];
    };
}): Promise<void>;
/**
 * Record user message for context (call before agent responds)
 */
export declare function recordUserMessage(sessionId: string, userMessage: string): void;
/**
 * Get last evaluation for a session
 */
export declare function getLastEvaluation(sessionId: string): ResponseEvaluation | null;
/**
 * Get session evaluation stats
 */
export declare function getSessionEvalStats(sessionId: string): {
    turnCount: number;
    evaluationsThisSession: number;
    lastScore: number | null;
};
/**
 * Cleanup session state when session ends
 */
export declare function onSessionEnd(sessionId: string): void;
declare const _default: {
    evaluateAgentResponse: typeof evaluateAgentResponse;
    recordUserMessage: typeof recordUserMessage;
    getLastEvaluation: typeof getLastEvaluation;
    getSessionEvalStats: typeof getSessionEvalStats;
    onSessionEnd: typeof onSessionEnd;
};
export default _default;
//# sourceMappingURL=voice-agent-integration.d.ts.map