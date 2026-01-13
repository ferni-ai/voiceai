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
import { getLogger } from '../../utils/safe-logger.js';
import { isFeatureEnabled } from '../../config/feature-flags.js';
import { quickHealthCheck, evaluateVoiceConsistency, shouldSampleConversation, evaluateResponse, getPersonaFingerprint, DEFAULT_SAMPLING_CONFIG, } from './index.js';
import { getEvalOpsFlags } from './automation.js';
const log = getLogger();
const sessionStates = new Map();
function getSessionState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = {
            turnCount: 0,
            evaluationsThisSession: 0,
            lastUserMessage: '',
            lastEvaluation: null,
            conversationHistory: [],
        };
        sessionStates.set(sessionId, state);
    }
    return state;
}
function cleanupSession(sessionId) {
    sessionStates.delete(sessionId);
    log.debug({ sessionId }, 'EvalOps session state cleaned up');
}
// ============================================================================
// MAIN HOOK
// ============================================================================
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
export async function evaluateAgentResponse(sessionId, personaId, userMessage, agentResponse, context) {
    // Non-blocking - wrap everything in try/catch
    try {
        // Check if EvalOps is enabled
        const flags = getEvalOpsFlags();
        if (!flags.enabled) {
            return;
        }
        // Also check TypeScript feature flag
        if (!isFeatureEnabled('evalops.enabled')) {
            return;
        }
        // Get/update session state
        const state = getSessionState(sessionId);
        state.turnCount++;
        state.lastUserMessage = userMessage;
        // Add to conversation history
        state.conversationHistory.push({ role: 'user', content: userMessage });
        state.conversationHistory.push({ role: 'assistant', content: agentResponse });
        // Keep only last 10 turns (20 messages)
        if (state.conversationHistory.length > 20) {
            state.conversationHistory = state.conversationHistory.slice(-20);
        }
        const turnNumber = context?.turnNumber ?? state.turnCount;
        // Determine if we should evaluate this turn
        const samplingConfig = {
            ...DEFAULT_SAMPLING_CONFIG,
            sampleRate: flags.sampleRateOverride ?? DEFAULT_SAMPLING_CONFIG.sampleRate,
        };
        const shouldSample = shouldSampleConversation(turnNumber, samplingConfig, {
            userReportedIssue: context?.hasUserReportedIssue,
            isLongConversation: turnNumber > 15,
            emotionalIntensity: context?.emotionalIntensity,
            isNewUser: context?.isNewUser,
        });
        // Quick voice check (always, if voice checks enabled)
        if (flags.voiceChecks) {
            const voiceResult = quickHealthCheck(agentResponse, personaId);
            if (voiceResult.status !== 'healthy') {
                log.warn({
                    sessionId,
                    personaId,
                    score: voiceResult.score,
                    status: voiceResult.status,
                    issues: voiceResult.issues,
                }, 'EvalOps: Voice consistency issue detected');
            }
            else {
                log.debug({
                    sessionId,
                    personaId,
                    score: voiceResult.score,
                }, 'EvalOps: Voice check passed');
            }
        }
        // Skip full evaluation if not sampled
        if (!shouldSample) {
            log.debug({ sessionId, turnNumber }, 'EvalOps: Skipping full evaluation (not sampled)');
            return;
        }
        // Full LLM evaluation (if enabled)
        if (flags.llmEvaluation) {
            const fingerprint = getPersonaFingerprint(personaId);
            if (!fingerprint) {
                log.warn({ personaId }, 'EvalOps: No fingerprint for persona, skipping LLM eval');
                return;
            }
            const evalContext = {
                personaId,
                fingerprint,
                conversationHistory: state.conversationHistory.slice(-10),
                userProfile: context?.userId ? { name: undefined } : undefined,
                trustContext: context?.trustContext,
                emotionalContext: context?.emotionalIntensity
                    ? { emotionIntensity: context.emotionalIntensity }
                    : undefined,
                turnNumber,
            };
            log.info({ sessionId, personaId, turnNumber }, 'EvalOps: Running LLM evaluation');
            const evaluation = await evaluateResponse(userMessage, agentResponse, evalContext);
            state.lastEvaluation = evaluation;
            state.evaluationsThisSession++;
            // Log results
            log.info({
                sessionId,
                personaId,
                turnNumber,
                overallScore: evaluation.overallScore,
                flagged: evaluation.flagged,
                dimensions: {
                    personaVoice: evaluation.dimensions.personaVoice,
                    emotionalIntelligence: evaluation.dimensions.emotionalIntelligence,
                    trustBuilding: evaluation.dimensions.trustBuilding,
                },
            }, 'EvalOps: Evaluation complete');
            // Alert if flagged
            if (evaluation.flagged && flags.alerting) {
                log.warn({
                    sessionId,
                    personaId,
                    overallScore: evaluation.overallScore,
                    flagReasons: evaluation.flagReasons,
                    userMessage: userMessage.slice(0, 100),
                    agentResponse: agentResponse.slice(0, 200),
                }, 'EvalOps: FLAGGED RESPONSE - needs human review');
            }
        }
        else {
            // Just do heuristic evaluation
            const { score, issues } = evaluateVoiceConsistency(agentResponse, personaId);
            log.debug({
                sessionId,
                personaId,
                turnNumber,
                voiceScore: score,
                issues,
            }, 'EvalOps: Heuristic evaluation complete');
        }
    }
    catch (error) {
        // Never block the agent - just log the error
        log.error({ error, sessionId, personaId }, 'EvalOps: Evaluation failed (non-blocking)');
    }
}
/**
 * Record user message for context (call before agent responds)
 */
export function recordUserMessage(sessionId, userMessage) {
    try {
        const state = getSessionState(sessionId);
        state.lastUserMessage = userMessage;
    }
    catch (error) {
        // Non-blocking
        log.error({ error, sessionId }, 'EvalOps: Failed to record user message');
    }
}
/**
 * Get last evaluation for a session
 */
export function getLastEvaluation(sessionId) {
    return sessionStates.get(sessionId)?.lastEvaluation ?? null;
}
/**
 * Get session evaluation stats
 */
export function getSessionEvalStats(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state) {
        return { turnCount: 0, evaluationsThisSession: 0, lastScore: null };
    }
    return {
        turnCount: state.turnCount,
        evaluationsThisSession: state.evaluationsThisSession,
        lastScore: state.lastEvaluation?.overallScore ?? null,
    };
}
/**
 * Cleanup session state when session ends
 */
export function onSessionEnd(sessionId) {
    cleanupSession(sessionId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    evaluateAgentResponse,
    recordUserMessage,
    getLastEvaluation,
    getSessionEvalStats,
    onSessionEnd,
};
//# sourceMappingURL=voice-agent-integration.js.map