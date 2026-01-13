/**
 * Voice-Text Mismatch Critical Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is THE most important context builder for making Ferni "better than human."
 * When we detect a mismatch between what someone says and how they sound,
 * we PRIORITIZE that signal above almost everything else.
 *
 * "I'm fine" + stressed voice = we notice. We care. We respond with presence.
 *
 * @module intelligence/context-builders/voice-mismatch-critical
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { VoiceTextMismatchDetector } from '../../unified/mismatch-detector.js';
import { createCriticalInjection, createHighInjection, registerContextBuilder, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
const log = createLogger({ module: 'context:voice-mismatch-critical' });
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
export const voiceMismatchCriticalBuilder = {
    name: 'voice-mismatch-critical',
    description: 'THE superhuman signal - detects when voice contradicts words',
    priority: 5, // Very high priority - runs early, shapes everything
    category: BuilderCategory.VOICE,
    build: async (input) => {
        const { userText, voiceEmotion, analysis } = input;
        const injections = [];
        // No voice emotion = can't detect mismatch
        if (!voiceEmotion || voiceEmotion.confidence < 0.4) {
            return injections;
        }
        // Detect mismatch using the unified detector
        // Cast through unknown for type compatibility (VoiceEmotionResult types differ between modules)
        const detector = VoiceTextMismatchDetector.getInstance();
        const mismatch = detector.detect(userText, voiceEmotion, {
            primary: analysis.emotion.primary,
            confidence: analysis.emotion.confidence ?? 0.5,
            valence: analysis.emotion.valence,
        });
        if (!mismatch.detected) {
            return injections;
        }
        // Build the guidance
        const guidance = detector.buildGuidance(mismatch);
        if (!guidance) {
            return injections;
        }
        // Create the injection based on priority
        if (guidance.priority === 'critical') {
            injections.push(createCriticalInjection('voice_mismatch', guidance.promptInjection, {
                category: 'superhuman',
                confidence: mismatch.confidence,
            }));
        }
        else {
            injections.push(createHighInjection('voice_mismatch', guidance.promptInjection, {
                category: 'superhuman',
                confidence: mismatch.confidence,
            }));
        }
        log.info({
            type: mismatch.type,
            confidence: mismatch.confidence.toFixed(2),
            shouldSurface: mismatch.shouldSurface,
        }, '🎯 Voice-text mismatch detected - injecting critical guidance');
        return injections;
    },
};
// Register the builder
registerContextBuilder(voiceMismatchCriticalBuilder);
export default voiceMismatchCriticalBuilder;
//# sourceMappingURL=voice-mismatch-critical.js.map