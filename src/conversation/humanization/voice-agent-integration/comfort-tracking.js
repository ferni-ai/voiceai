/**
 * Voice Agent Integration - Comfort & Phase Tracking
 *
 * @module @ferni/humanization/voice-agent-integration/comfort-tracking
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getHumanizationOrchestrator } from '../index.js';
import { getSession } from './session-store.js';
const logger = createLogger({ module: 'HumanizationIntegration' });
/**
 * Record a comfort-building event
 */
export function recordComfortEvent(sessionId, event) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        return;
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    orchestrator.recordComfortEvent(event, state.turnCount);
    const comfortIncrease = {
        user_shared_vulnerability: 0.1,
        deep_disclosure: 0.12,
        reciprocated_vulnerability: 0.1,
        shared_laughter: 0.08,
        accepted_feedback: 0.05,
        emotional_moment_navigated: 0.12,
        user_initiated_deeper_topic: 0.07,
        comfortable_silence: 0.06,
    };
    state.comfortLevel = Math.min(1, state.comfortLevel + comfortIncrease[event]);
    logger.debug({ sessionId, event, newComfort: state.comfortLevel }, '💗 Comfort event recorded');
}
/**
 * Get current conversation phase
 */
export function getConversationPhase(sessionId) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        return 'unknown';
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    return orchestrator.getConversationPhase();
}
/**
 * Get phase-specific behavior guidance
 */
export function getPhaseBehavior(sessionId) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        return null;
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    return orchestrator.getPhaseBehavior();
}
/**
 * Check if a behavior is unlocked at current comfort level
 */
export function isBehaviorUnlocked(sessionId, behaviorName) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        return false;
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    return orchestrator.isBehaviorUnlocked(behaviorName);
}
//# sourceMappingURL=comfort-tracking.js.map