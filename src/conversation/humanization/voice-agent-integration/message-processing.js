/**
 * Voice Agent Integration - Message Processing
 *
 * @module @ferni/humanization/voice-agent-integration/message-processing
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { countWordsRust, isTokenCountingAvailable } from '../../../memory/rust-accelerator.js';
import { getAmbientAwarenessEngine } from '../ambient-awareness.js';
import { getBreathingSyncEngine } from '../breathing-sync.js';
import { getVoicePrintEngine } from '../voice-print.js';
import { getHumanizationOrchestrator, } from '../index.js';
import { processAdvancedTurn, getResponseModifications, } from '../../advanced-humanization-integration.js';
import { getSession } from './session-store.js';
import { detectVulnerabilitySharing } from './vulnerability-detection.js';
const logger = createLogger({ module: 'HumanizationIntegration' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
/**
 * Process a user message through humanization
 */
export function processUserMessage(sessionId, message, context) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        logger.warn({ sessionId }, 'Cannot process message - session not active');
        return;
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    orchestrator.recordUserMessage(message);
    const vulnerability = detectVulnerabilitySharing(message, context?.voiceEmotion);
    if (vulnerability.isVulnerable) {
        orchestrator.recordComfortEvent('user_shared_vulnerability', state.turnCount);
        logger.info({ sessionId, type: vulnerability.type, confidence: vulnerability.confidence }, '💜 Vulnerability detected - relationship accelerated');
        if (vulnerability.type === 'deep_disclosure' || vulnerability.type === 'first_time_share') {
            orchestrator.recordComfortEvent('deep_disclosure', state.turnCount);
        }
    }
    state.turnCount++;
    if (context?.topic) {
        state.recentTopics.unshift(context.topic);
        if (state.recentTopics.length > 5) {
            state.recentTopics.pop();
        }
    }
    if (context?.voiceSnapshot) {
        const voicePrint = getVoicePrintEngine(state.userId);
        voicePrint.recordSnapshot(context.voiceSnapshot);
    }
    if (context?.ambientDetection) {
        const ambient = getAmbientAwarenessEngine(sessionId);
        ambient.processDetection(context.ambientDetection, state.turnCount);
    }
    if (context?.breathPattern) {
        const breathing = getBreathingSyncEngine(sessionId);
        breathing.updateUserPattern(context.breathPattern);
    }
    if (state.advancedHumanization.enabled) {
        const advancedGuidance = processAdvancedTurn(sessionId, message, {
            detectedEmotion: context?.voiceEmotion?.primary,
            topic: context?.topic,
            prosodyHints: context?.voiceSnapshot
                ? {
                    speechRate: context.voiceSnapshot.speechRate,
                    volume: context.voiceSnapshot.energyMean,
                    pitchVariance: context.voiceSnapshot.pitchVariance,
                }
                : undefined,
        });
        if (advancedGuidance) {
            state.advancedHumanization.lastGuidance = advancedGuidance;
            state.advancedHumanization.lastModifications = getResponseModifications(sessionId);
        }
    }
    logger.debug({
        sessionId,
        turn: state.turnCount,
        messageLength: message.length,
        hasVoice: !!context?.voiceSnapshot,
        hasAmbient: !!context?.ambientDetection,
        hasAdvancedGuidance: !!state.advancedHumanization.lastGuidance,
    }, '👤 User message processed');
}
/**
 * Humanize an agent response
 */
export function humanizeResponse(sessionId, response, context) {
    const state = getSession(sessionId);
    if (!state || !state.isActive) {
        logger.warn({ sessionId }, 'Cannot humanize - session not active');
        return {
            original: response,
            text: response,
            ssml: response,
            appliedHumanizations: [],
            skippedFeatures: [{ feature: 'all', reason: 'Session not active' }],
        };
    }
    const orchestrator = getHumanizationOrchestrator(sessionId);
    const wordCount = RUST_COUNTING_AVAILABLE
        ? countWordsRust(response)
        : response.split(/\s+/).length;
    const responseComplexity = Math.min(1, wordCount > 50 ? 0.5 + (wordCount - 50) / 100 : 0.3);
    const isGivingAdvice = /\b(I think you should|you might want to|consider|my suggestion|I'd recommend)\b/i.test(response);
    const result = orchestrator.humanize(response, {
        userMessage: context.userMessage,
        userWordCount: RUST_COUNTING_AVAILABLE
            ? countWordsRust(context.userMessage)
            : context.userMessage.split(/\s+/).length,
        userEnergy: context.userEnergy || 'medium',
        userEmotion: context.userEmotion,
        turnCount: state.turnCount,
        sessionMinutes: Math.floor((Date.now() - state.startTime.getTime()) / 60000),
        comfortLevel: state.comfortLevel,
        relationshipStage: state.relationshipStage,
        personaId: state.personaId,
        recentTopics: state.recentTopics,
        recentHumanizations: [],
        isEmotionalContent: context.isEmotionalContent ?? false,
        responseComplexity,
        isGivingAdvice,
    });
    logger.debug({
        sessionId,
        turn: state.turnCount,
        appliedCount: result.appliedHumanizations.length,
        applied: result.appliedHumanizations.map((h) => h.type),
    }, '🎭 Response humanized');
    return result;
}
//# sourceMappingURL=message-processing.js.map