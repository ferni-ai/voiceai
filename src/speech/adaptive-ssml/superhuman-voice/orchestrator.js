/**
 * Superhuman Voice Orchestrator
 *
 * Main entry point that orchestrates all Better Than Human voice features
 * to create impossibly present, attuned speech.
 *
 * @module speech/adaptive-ssml/superhuman-voice/orchestrator
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getPersonaAnticipatoryComfortSound, getPersonaEmotionalTransitionBridge, getPersonaSilencePresencePhrase, } from '../../persona-phrases.js';
import { detectHeavyContentType, getAnticipatoryComfortSound } from './anticipatory-comfort.js';
import { getEmotionalTransitionBridge } from './emotion-transitions.js';
import { getMemoryInformedBaseline } from './memory-baseline.js';
import { calculateProsodicMirroring } from './prosodic-mirroring.js';
import { getSilencePresencePhrase } from './silence-presence.js';
import { getVulnerabilityVoiceAdjustments } from './vulnerability-softening.js';
const log = createLogger({ module: 'SuperhumanVoice' });
// ============================================================================
// INTERNAL STATE HELPERS
// ============================================================================
function createInitialState(text) {
    return {
        result: text,
        appliedEnhancements: [],
        speedMultiplier: 1.0,
        volumeMultiplier: 1.0,
        pauseMultiplier: 1.0,
    };
}
// ============================================================================
// ENHANCEMENT STEP FUNCTIONS
// ============================================================================
function applyProsodicMirroringStep(state, context) {
    const prosodicMirroring = calculateProsodicMirroring(context.userWPM);
    if (Math.abs(prosodicMirroring.speedMultiplier - 1.0) > 0.02) {
        state.speedMultiplier *= prosodicMirroring.speedMultiplier;
        state.appliedEnhancements.push(`prosodic_mirroring: ${prosodicMirroring.reason}`);
    }
}
function applyVulnerabilitySofteningStep(state, context) {
    const vulnAdjustments = getVulnerabilityVoiceAdjustments(context.vulnerabilityDepth);
    if (context.vulnerabilityDepth && context.vulnerabilityDepth !== 'surface') {
        state.speedMultiplier *= vulnAdjustments.speedMultiplier;
        state.volumeMultiplier *= vulnAdjustments.volumeMultiplier;
        state.pauseMultiplier *= vulnAdjustments.pauseMultiplier;
        state.appliedEnhancements.push(`vulnerability_softening: ${context.vulnerabilityDepth}`);
        if (vulnAdjustments.openingPauseMs > 0) {
            state.result = `<break time="${vulnAdjustments.openingPauseMs}ms"/>${state.result}`;
        }
        if (!state.result.includes('<emotion')) {
            state.result = `<emotion value="${vulnAdjustments.emotion}"/>${state.result}`;
        }
    }
}
function applySilencePresenceStep(state, context) {
    if (!context.presenceLevel || context.presenceLevel === 'normal')
        return;
    if (context.presenceLevel !== 'holding' && context.presenceLevel !== 'silent')
        return;
    const presencePhrase = context.personaId
        ? getPersonaSilencePresencePhrase(context.personaId)
        : getSilencePresencePhrase(context.presenceLevel);
    if (presencePhrase && Math.random() < 0.4) {
        state.result = presencePhrase + state.result;
        state.appliedEnhancements.push(`silence_presence: ${context.presenceLevel}`);
    }
}
function applyAnticipatoryComfortStep(state, context, originalText) {
    if (!context.isHeavyContent)
        return;
    const contentType = detectHeavyContentType(originalText);
    if (!contentType)
        return;
    const comfortSound = context.personaId
        ? getPersonaAnticipatoryComfortSound(context.personaId, contentType === 'heavyContent' ? 'general' : contentType)
        : getAnticipatoryComfortSound(contentType);
    if (!state.result.startsWith('<break') && !state.result.startsWith('<emotion')) {
        state.result = comfortSound + state.result;
        state.appliedEnhancements.push(`anticipatory_comfort: ${contentType}`);
    }
}
function applyMemoryBaselineStep(state, context) {
    const memoryBaseline = getMemoryInformedBaseline(context.knownUserContext);
    if (!memoryBaseline)
        return;
    state.speedMultiplier += memoryBaseline.baseSpeedAdjust;
    state.volumeMultiplier += memoryBaseline.baseVolumeAdjust;
    state.pauseMultiplier *= memoryBaseline.basePauseMultiplier;
    state.appliedEnhancements.push(`memory_baseline: ${context.knownUserContext ?? 'unknown'}`);
    if (!state.result.includes('<emotion')) {
        state.result = `<emotion value="${memoryBaseline.defaultEmotion}"/>${state.result}`;
    }
}
function applyEmotionalBridgeStep(state, context) {
    const transitionBridge = context.personaId
        ? getPersonaEmotionalTransitionBridge(context.personaId, context.previousEmotion ?? '', context.currentEmotion ?? '')
        : getEmotionalTransitionBridge(context.previousEmotion, context.currentEmotion);
    if (transitionBridge) {
        state.result = transitionBridge + state.result;
        state.appliedEnhancements.push(`emotion_bridge: ${context.previousEmotion ?? 'none'}->${context.currentEmotion ?? 'none'}`);
    }
}
function applyGlobalAdjustments(state) {
    // Clamp multipliers to safe ranges
    state.speedMultiplier = Math.max(0.7, Math.min(1.2, state.speedMultiplier));
    state.volumeMultiplier = Math.max(0.6, Math.min(1.1, state.volumeMultiplier));
    state.pauseMultiplier = Math.max(0.8, Math.min(2.0, state.pauseMultiplier));
    // Apply speed wrapper if significantly different from 1.0
    if (Math.abs(state.speedMultiplier - 1.0) > 0.03 && !state.result.includes('<speed ratio=')) {
        state.result = `<speed ratio="${state.speedMultiplier.toFixed(2)}"/>${state.result}`;
    }
    // Apply volume wrapper if significantly different from 1.0
    if (Math.abs(state.volumeMultiplier - 1.0) > 0.05 && !state.result.includes('<volume ratio=')) {
        state.result = `<volume ratio="${state.volumeMultiplier.toFixed(2)}"/>${state.result}`;
    }
}
// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
/**
 * Apply all superhuman voice enhancements to text.
 *
 * This is the main entry point that orchestrates all Better Than Human
 * voice features to create impossibly present, attuned speech.
 */
export function applySuperhmanVoice(text, context) {
    if (!text || text.trim().length === 0) {
        return {
            text,
            appliedEnhancements: [],
            speedMultiplier: 1.0,
            volumeMultiplier: 1.0,
            pauseMultiplier: 1.0,
        };
    }
    const state = createInitialState(text);
    // Apply all enhancement steps
    applyProsodicMirroringStep(state, context);
    applyVulnerabilitySofteningStep(state, context);
    applySilencePresenceStep(state, context);
    applyAnticipatoryComfortStep(state, context, text);
    applyMemoryBaselineStep(state, context);
    applyEmotionalBridgeStep(state, context);
    applyGlobalAdjustments(state);
    // Log enhancements
    if (state.appliedEnhancements.length > 0) {
        log.debug({
            sessionId: context.sessionId,
            enhancements: state.appliedEnhancements,
            speed: state.speedMultiplier.toFixed(2),
            volume: state.volumeMultiplier.toFixed(2),
            pause: state.pauseMultiplier.toFixed(2),
        }, '✨ Superhuman voice enhancements applied');
    }
    return {
        text: state.result,
        appliedEnhancements: state.appliedEnhancements,
        speedMultiplier: state.speedMultiplier,
        volumeMultiplier: state.volumeMultiplier,
        pauseMultiplier: state.pauseMultiplier,
        debug: {
            originalLength: text.length,
            enhancedLength: state.result.length,
            context: {
                vulnerabilityDepth: context.vulnerabilityDepth,
                presenceLevel: context.presenceLevel,
                userWPM: context.userWPM,
                knownUserContext: context.knownUserContext,
            },
        },
    };
}
//# sourceMappingURL=orchestrator.js.map