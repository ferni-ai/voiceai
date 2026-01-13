/**
 * Voice Agent Integration - Session Lifecycle
 *
 * @module @ferni/humanization/voice-agent-integration/session-lifecycle
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { initAdvancedHumanization, cleanupAdvancedHumanization, } from '../../advanced-humanization-integration.js';
import { getCrossSessionVoiceEngine } from '../cross-session-voice.js';
import { getHumanizationOrchestrator, resetHumanization, } from '../index.js';
import { getVoicePrintEngine } from '../voice-print.js';
import { getSession, setSession, deleteSession } from './session-store.js';
const logger = createLogger({ module: 'HumanizationIntegration' });
/**
 * Initialize humanization for a new voice session
 */
export function onSessionStart(sessionId, userId, personaId, options) {
    const state = {
        sessionId,
        userId,
        personaId,
        startTime: new Date(),
        turnCount: 0,
        comfortLevel: 0.25,
        relationshipStage: options?.relationshipStage || 'acquaintance',
        recentTopics: [],
        isActive: true,
        advancedHumanization: {
            enabled: options?.enableAdvancedHumanization ?? true,
            lastGuidance: null,
            lastModifications: null,
        },
    };
    setSession(sessionId, state);
    getHumanizationOrchestrator(sessionId, options?.config, userId);
    if (options?.crossSessionMemory) {
        const crossSession = getCrossSessionVoiceEngine(userId, options.crossSessionMemory);
        if (options.initialVoice) {
            crossSession.startSession(sessionId, options.initialVoice);
        }
    }
    let advancedStart;
    if (state.advancedHumanization.enabled) {
        const relationshipDepthMap = {
            stranger: 'new',
            acquaintance: 'developing',
            friend: 'established',
            trusted_advisor: 'deep',
        };
        const result = initAdvancedHumanization({
            sessionId,
            userId,
            relationshipDepth: relationshipDepthMap[state.relationshipStage],
        });
        advancedStart = {
            greeting: result.greeting,
            eventFollowUp: result.eventFollowUp,
            milestoneAcknowledgment: result.milestoneAcknowledgment,
        };
        logger.info({
            sessionId,
            hasGreeting: !!result.greeting,
            hasMilestone: !!result.milestoneAcknowledgment,
        }, '🌟 Advanced humanization initialized');
    }
    logger.info({ sessionId, userId, personaId }, '🎭 Humanization session started');
    return { advancedStart };
}
/**
 * Clean up humanization for an ended session
 */
export function onSessionEnd(sessionId, options) {
    const state = getSession(sessionId);
    if (!state) {
        logger.warn({ sessionId }, 'Session not found for cleanup');
        return null;
    }
    const crossSession = getCrossSessionVoiceEngine(state.userId);
    if (options?.endingVoice) {
        crossSession.endSession(options.endingVoice);
    }
    const voicePrint = getVoicePrintEngine(state.userId);
    const result = {
        voicePrint: voicePrint.getVoicePrint(),
        crossSessionMemory: crossSession.getMemory(),
    };
    if (state.advancedHumanization.enabled) {
        cleanupAdvancedHumanization(sessionId);
    }
    state.isActive = false;
    resetHumanization(sessionId, state.userId);
    deleteSession(sessionId);
    logger.info({ sessionId, duration: Date.now() - state.startTime.getTime() }, '🎭 Humanization session ended');
    return result;
}
//# sourceMappingURL=session-lifecycle.js.map