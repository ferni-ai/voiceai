/**
 * Humanization Phase Helpers
 *
 * Extracted helper functions for the humanization phase of the conversation orchestrator.
 * These functions apply various humanization features to text/SSML.
 *
 * @module @ferni/conversation/orchestrator/humanization-helpers
 */
import { createLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
// Humanization systems
import { getActiveListeningEngine } from '../active-listening.js';
import { applyDeliveryPacing, shouldApplyDeliveryPacing } from '../content-delivery-pacing.js';
import { getConversationalMemory } from '../conversational-memory.js';
import { applyDeepHumanization as applyDeepHumanizationNew, } from '../deep-humanization/index.js';
import { buildEffectContext, getEffectCoordinator, registerDefaultEffects, } from '../effects/index.js';
import { getHumanizationOrchestrator, humanizationConfig, } from '../humanization/index.js';
import { getQuestionPatternEngine } from '../question-patterns.js';
import { getSilencePresenceEngine } from '../silence-presence.js';
import { getSpeechNaturalizer } from '../speech-naturalizer.js';
import { detectAdviceGiving } from '../utils/detection.js';
import { humanizeVocals } from '../vocal-humanization.js';
const log = createLogger({ module: 'HumanizationHelpers' });
// ============================================================================
// SPEECH NATURALIZATION
// ============================================================================
export function applySpeechNaturalization(text, input, analysis) {
    try {
        const naturalizer = getSpeechNaturalizer();
        const context = {
            emotion: input.userEmotion,
            topic: input.topic,
            isSeriousContext: analysis.context.needsSupport,
            turnNumber: input.turnNumber,
            randomSeed: `${input.sessionId}:${input.personaId}:${input.turnNumber}:naturalize`,
        };
        const result = naturalizer.naturalize(text, input.personaId, context);
        return { text: result, applied: result !== text };
    }
    catch {
        return { text, applied: false };
    }
}
// ============================================================================
// VOCABULARY MIRRORING
// ============================================================================
export function applyVocabularyMirroring(text, userMessage) {
    try {
        const listening = getActiveListeningEngine();
        const mirrored = listening.mirrorUserVocabulary(userMessage, text);
        if (mirrored) {
            return { text: mirrored.mirrored, applied: true };
        }
    }
    catch {
        // Non-fatal
    }
    return { text, applied: false };
}
// ============================================================================
// CONTENT DELIVERY PACING
// ============================================================================
export function applyContentDeliveryPacing(text, input) {
    if (!shouldApplyDeliveryPacing(text)) {
        return { ssml: text, applied: false };
    }
    const ssml = applyDeliveryPacing(text, {
        personaId: input.personaId,
        isDirectResponse: input.userMessage.includes('?'),
    });
    return { ssml, applied: true };
}
// ============================================================================
// VOCAL HUMANIZATION
// ============================================================================
export function applyVocalHumanization(text, input, analysis) {
    const context = {
        userEnergy: analysis.context.energy,
        emotion: input.userEmotion,
        isQuestion: text.trim().endsWith('?'),
        isHeavyContent: analysis.context.needsSupport,
        turnNumber: input.turnNumber,
        isMeaningfulMoment: input.wasPersonalSharing,
        userMessage: input.userMessage,
        randomSeed: `${input.sessionId}:${input.personaId}:${input.turnNumber}:vocal`,
    };
    const result = humanizeVocals(text, context);
    return { ssml: result.ssml, appliedFeatures: result.appliedFeatures };
}
// ============================================================================
// SILENCE PRESENCE
// ============================================================================
export function applySilencePresence(text, ssml, input, analysis) {
    try {
        const engine = getSilencePresenceEngine();
        const decision = engine.decideSilence({
            userMessage: input.userMessage,
            userEmotion: input.userEmotion,
            turnCount: input.turnNumber,
            wasPersonalSharing: input.wasPersonalSharing,
            conversationDepth: analysis.context.conversationDepth,
            topicWeight: analysis.context.topicWeight,
            randomSeed: `${input.sessionId}:${input.personaId}:${input.turnNumber}:silence`,
        });
        if (decision.useSilence) {
            const result = engine.applyToResponse(text, decision);
            return {
                text: result.text,
                ssml: decision.ssml + result.ssml,
                applied: true,
            };
        }
    }
    catch {
        // Non-fatal
    }
    return { text, ssml, applied: false };
}
// ============================================================================
// COMPOSABLE EFFECTS
// ============================================================================
export async function applyComposableEffects(text, ssml, input, analysis, intelligence) {
    const features = [];
    const skipped = [];
    try {
        // Get or create coordinator for this session
        const coordinator = getEffectCoordinator(input.sessionId, input.personaId);
        // Register effects if not already registered (first call for this session)
        if (coordinator.getEffects().length === 0) {
            registerDefaultEffects(coordinator, input.personaId);
        }
        // Build effect context
        const effectContext = buildEffectContext({
            personaId: input.personaId,
            sessionId: input.sessionId,
            userId: input.userId,
            turnNumber: input.turnNumber,
            sessionMinutes: input.sessionMinutes,
            userMessage: input.userMessage,
            rawResponse: input.rawResponse,
            userEmotion: input.userEmotion,
            topic: input.topic,
            wasPersonalSharing: input.wasPersonalSharing,
            isSeriousContext: analysis.context.needsSupport,
            relationshipStage: input.relationshipStage,
            sessionData: input.sessionData,
        }, intelligence.mood, {
            hasEvidence: analysis.signals.hasEvidence,
            isBreakthrough: analysis.signals.isBreakthrough,
            hasHesitation: analysis.signals.hasHesitation,
            isDisengaged: analysis.signals.isDisengaged,
            isHighlyEngaged: analysis.signals.isHighlyEngaged,
            isEmotional: analysis.signals.isEmotional,
            isHeavy: analysis.signals.isHeavy,
        });
        // Get applicable effects
        const applicable = coordinator.getApplicableEffects(effectContext);
        // Apply effects (coordinator enforces maxEffectsPerResponse)
        const result = await coordinator.applyEffects(text, ssml, applicable, effectContext);
        // Convert to AppliedFeature format
        features.push(...result.applied.map((a) => ({
            name: `effect_${a.effectId}`,
            source: 'effects',
            details: { capability: a.capability, placement: a.placement },
        })));
        // Convert skipped
        skipped.push(...result.skipped.map((s) => ({
            name: s.effectId,
            reason: s.reason,
        })));
        log.debug({
            turn: input.turnNumber,
            applied: result.applied.map((a) => a.effectId),
            skipped: result.skipped.length,
        }, '🎭 Composable effects applied');
        return { text: result.text, ssml: result.ssml, features, skipped };
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Composable effects failed (non-fatal)');
        return { text, ssml, features, skipped };
    }
}
// ============================================================================
// DEEP HUMANIZATION
// ============================================================================
export async function applyDeepHumanization(text, ssml, input, analysis) {
    const features = [];
    try {
        const context = {
            personaId: input.personaId,
            turnCount: input.turnNumber,
            sessionMinutes: input.sessionMinutes,
            currentHour: new Date().getHours(),
            userMessage: input.userMessage,
            recentTopics: input.topic ? [input.topic] : [],
            relationshipStage: input.relationshipStage || 'acquaintance',
            sessionData: input.sessionData,
        };
        // Apply humanization using new module
        const result = await applyDeepHumanizationNew(text, context);
        if (result.appliedEffects.length > 0) {
            text = result.text;
            // Apply same effects to SSML
            ssml = (await applyDeepHumanizationNew(ssml, context)).text;
            features.push(...result.appliedEffects.map((effectType) => ({
                name: `deep_${effectType}`,
                source: 'deep',
                details: { module: 'deep-humanization-v2' },
            })));
        }
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Deep humanization failed (non-fatal)');
    }
    return { text, ssml, features };
}
// ============================================================================
// ADVANCED HUMANIZATION
// ============================================================================
export function applyAdvancedHumanization(text, ssml, input, analysis, getComfortLevel) {
    const features = [];
    const skipped = [];
    try {
        const isEnabled = humanizationConfig.isEnabled('selfCorrection') ||
            humanizationConfig.isEnabled('disfluency') ||
            humanizationConfig.isEnabled('emotionalLeading');
        if (!isEnabled) {
            return { text, ssml, features, skipped };
        }
        const orchestrator = getHumanizationOrchestrator(input.sessionId);
        // Map energy level
        const rawEnergy = analysis.context.energy;
        const userEnergy = rawEnergy === 'subdued' ? 'low' : rawEnergy;
        // 🦀 Rust-accelerated word counting
        const userWordCount = RUST_COUNTING_AVAILABLE
            ? countWordsRust(input.userMessage)
            : input.userMessage.split(/\s+/).length;
        const textWordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(text) : text.split(/\s+/).length;
        const context = {
            userMessage: input.userMessage,
            userWordCount,
            userEnergy,
            userEmotion: input.userEmotion,
            turnCount: input.turnNumber,
            sessionMinutes: input.sessionMinutes,
            comfortLevel: getComfortLevel(input.relationshipStage),
            relationshipStage: input.relationshipStage || 'acquaintance',
            personaId: input.personaId,
            recentTopics: input.topic ? [input.topic] : [],
            recentHumanizations: [],
            isEmotionalContent: analysis.context.needsSupport,
            responseComplexity: textWordCount > 50 ? 0.7 : 0.3,
            isGivingAdvice: detectAdviceGiving(text),
        };
        const result = orchestrator.humanize(text, context);
        if (result.appliedHumanizations.length > 0) {
            text = result.text;
            ssml = result.ssml || ssml;
            features.push(...result.appliedHumanizations.map((h) => ({
                name: `adv_${h.type}`,
                source: 'advanced',
                details: { placement: h.placement },
            })));
        }
        skipped.push(...result.skippedFeatures.map((s) => ({
            name: s.feature,
            reason: s.reason,
        })));
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Advanced humanization failed (non-fatal)');
    }
    return { text, ssml, features, skipped };
}
// ============================================================================
// PRIORITY ACTIONS
// ============================================================================
export function applyPriorityActions(text, ssml, actions) {
    const features = [];
    for (const action of actions) {
        if (!action.content)
            continue;
        switch (action.placement) {
            case 'prefix':
                text = `${action.content} ${text}`;
                ssml = `${action.content} ${ssml}`;
                break;
            case 'suffix':
                text = `${text} ${action.content}`;
                ssml = `${ssml} ${action.content}`;
                break;
            case 'inline':
            case 'standalone':
                // For inline/standalone, prepend for simplicity
                text = `${action.content} ${text}`;
                ssml = `${action.content} ${ssml}`;
                break;
        }
        features.push({
            name: `priority_${action.type}`,
            source: action.reason === 'superhuman' ? 'superhuman' : 'session',
            details: { reason: action.reason, priority: action.priority },
        });
    }
    return { text, ssml, features };
}
// ============================================================================
// RESPONSE ADDITIONS
// ============================================================================
export function generateAdditions(input, analysis, shouldTrigger) {
    const additions = {};
    try {
        // Memory callback (after turn 4, with probability)
        if (input.turnNumber > 4 && shouldTrigger(input.sessionId, input.turnNumber, 'memory', 0.2)) {
            const memory = getConversationalMemory();
            const callback = memory.getMemoryCallback(input.topic || 'general', input.turnNumber);
            if (callback) {
                additions.memoryCallback = { text: callback.phrase, ssml: callback.ssml };
            }
        }
        // Follow-up question (if not already a question, with probability)
        if (!input.userMessage.includes('?') &&
            shouldTrigger(input.sessionId, input.turnNumber, 'follow_up_question', 0.55)) {
            const questions = getQuestionPatternEngine();
            const context = {
                topic: input.topic,
                userEmotion: input.userEmotion,
                previousUserStatement: input.userMessage,
                personaId: input.personaId,
                conversationDepth: analysis.context.conversationDepth,
                randomSeed: `${input.sessionId}:${input.personaId}:${input.turnNumber}:followup:${input.userMessage}`,
            };
            const question = questions.generateQuestion(context);
            additions.followUpQuestion = { text: question.text, ssml: question.ssml };
        }
    }
    catch {
        // Non-fatal
    }
    return additions;
}
//# sourceMappingURL=humanization-helpers.js.map