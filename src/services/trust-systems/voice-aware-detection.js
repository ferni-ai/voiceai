/**
 * Voice-Aware Unsaid Detection
 *
 * Enhances "reading between the lines" with voice prosody analysis.
 * This is the "Better Than Human" superpower - hearing what they're NOT saying
 * through their voice, not just their words.
 *
 * Key capabilities:
 * - Detect false "I'm fine" from voice tone contradiction
 * - Identify emotional suppression in prosody
 * - Combine text + voice signals for higher confidence
 *
 * @module VoiceAwareDetection
 */
import { createLogger } from '../../utils/safe-logger.js';
import { detectUnsaidSignals } from './reading-between-lines.js';
const log = createLogger({ module: 'VoiceAwareDetection' });
// ============================================================================
// VOICE-TEXT CONTRADICTION DETECTION
// ============================================================================
/** Words/phrases that indicate "fine" state */
const FINE_INDICATORS = [
    "i'm fine",
    'im fine',
    'i am fine',
    "i'm okay",
    'im okay',
    'i am okay',
    "i'm good",
    'im good',
    'i am good',
    "i'm alright",
    'im alright',
    "it's fine",
    'its fine',
    "it's okay",
    'its okay',
    'no problem',
    "don't worry",
    'not a big deal',
    "it's nothing",
];
/** Voice emotions that contradict "fine" */
const CONTRADICTING_VOICE_EMOTIONS = [
    'sad',
    'anxious',
    'distressed',
    'hurt',
    'scared',
    'worried',
    'frustrated',
    'overwhelmed',
    'depressed',
    'hopeless',
];
/** High-confidence voice emotions (from Gemini multimodal) */
const HIGH_CONFIDENCE_VOICE_EMOTIONS = ['distressed', 'crying', 'sobbing', 'panicked', 'terrified'];
// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================
/**
 * Detect unsaid signals using BOTH text and voice analysis.
 *
 * This is the "Better Than Human" superpower - we can hear:
 * - False "I'm fine" (words say fine, voice says sad)
 * - Emotional suppression (flat voice on emotional topic)
 * - Hidden distress (trembling voice, forced calm)
 *
 * @param userId - User ID for profile tracking
 * @param userMessage - What the user said
 * @param context - Context including voice emotion
 * @returns Array of unsaid signals with enhanced confidence
 */
export function detectUnsaidSignalsWithVoice(userId, userMessage, context) {
    const signals = [];
    const lowerMessage = userMessage.toLowerCase();
    const voiceEmotion = context.voiceEmotion;
    // 1. Start with text-based detection
    const textSignals = detectUnsaidSignals(userId, userMessage, {
        recentTopics: context.recentTopics,
        statedEmotion: context.statedEmotion,
        detectedEmotion: context.detectedEmotion,
        emotionIntensity: context.emotionIntensity,
        previousMessages: context.previousMessages,
        topicBeforeThis: context.topicBeforeThis,
    });
    signals.push(...textSignals);
    // 2. Voice-only detection (when text doesn't reveal much)
    if (voiceEmotion && voiceEmotion.confidence > 0.5) {
        const voiceOnlySignal = detectVoiceOnlySignals(lowerMessage, voiceEmotion);
        if (voiceOnlySignal) {
            signals.push(voiceOnlySignal);
        }
    }
    // 3. Voice + Text combined detection (highest confidence)
    if (voiceEmotion && voiceEmotion.confidence > 0.5) {
        const combinedSignal = detectVoiceTextContradiction(lowerMessage, voiceEmotion, context);
        if (combinedSignal) {
            // Combined signals get highest priority - add at front
            signals.unshift(combinedSignal);
        }
    }
    // 4. Deduplicate signals (keep highest confidence)
    const deduplicated = deduplicateSignals(signals);
    if (deduplicated.length > 0) {
        log.info({
            userId,
            signalCount: deduplicated.length,
            hasVoice: !!voiceEmotion,
            voiceEmotion: voiceEmotion?.primary,
            voiceConfidence: voiceEmotion?.confidence?.toFixed(2),
        }, '🔍 Voice-aware unsaid signals detected');
    }
    return deduplicated;
}
// ============================================================================
// VOICE-TEXT CONTRADICTION DETECTION
// ============================================================================
/**
 * Detect when voice contradicts text.
 * This is THE "Better Than Human" moment.
 */
function detectVoiceTextContradiction(lowerMessage, voiceEmotion, context) {
    // Check if text says "fine"
    const textSaysFine = FINE_INDICATORS.some((indicator) => lowerMessage.includes(indicator));
    // Check if voice says otherwise
    const voiceSaysNotFine = CONTRADICTING_VOICE_EMOTIONS.includes(voiceEmotion.primary) && voiceEmotion.intensity > 0.5;
    if (textSaysFine && voiceSaysNotFine) {
        // THIS IS THE MOMENT - voice reveals what words hide
        const isHighConfidence = HIGH_CONFIDENCE_VOICE_EMOTIONS.includes(voiceEmotion.primary) ||
            (voiceEmotion.confidence > 0.7 && voiceEmotion.intensity > 0.7);
        const phrase = generateVoiceAwarePhrase(voiceEmotion, 'contradiction');
        log.warn({
            textSays: 'fine',
            voiceSays: voiceEmotion.primary,
            intensity: voiceEmotion.intensity,
            confidence: voiceEmotion.confidence,
        }, '🎯 VOICE-TEXT CONTRADICTION: The "Better Than Human" moment');
        return {
            type: 'emotional_mismatch',
            observation: `Voice reveals ${voiceEmotion.primary} while words say "fine"`,
            underlying: voiceEmotion.primary,
            confidence: isHighConfidence ? 0.95 : 0.85,
            approach: 'create_space',
            phrase,
            context: {
                userMessage: lowerMessage,
                statedEmotion: 'fine',
                detectedEmotion: voiceEmotion.primary,
                recentTopics: context.recentTopics,
            },
        };
    }
    return null;
}
// ============================================================================
// VOICE-ONLY DETECTION
// ============================================================================
/**
 * Detect signals from voice alone when text is neutral.
 */
function detectVoiceOnlySignals(lowerMessage, voiceEmotion) {
    // High-confidence distress signals from voice
    if (HIGH_CONFIDENCE_VOICE_EMOTIONS.includes(voiceEmotion.primary) &&
        voiceEmotion.confidence > 0.7) {
        const phrase = generateVoiceAwarePhrase(voiceEmotion, 'voice_only');
        return {
            type: 'emotional_mismatch',
            observation: `Voice indicates significant ${voiceEmotion.primary}`,
            underlying: voiceEmotion.primary,
            confidence: voiceEmotion.confidence,
            approach: 'create_space',
            phrase,
            context: {
                userMessage: lowerMessage,
                detectedEmotion: voiceEmotion.primary,
            },
        };
    }
    // Suppression detection - flat voice on emotional topic
    if (voiceEmotion.characteristics?.pitchVariance !== undefined &&
        voiceEmotion.characteristics.pitchVariance < 0.2) {
        // Very flat voice - possible suppression
        const emotionalTopicWords = [
            'loss',
            'death',
            'divorce',
            'breakup',
            'fired',
            'sick',
            'cancer',
            'accident',
        ];
        const hasEmotionalTopic = emotionalTopicWords.some((word) => lowerMessage.includes(word));
        if (hasEmotionalTopic) {
            return {
                type: 'minimizing_pain',
                observation: 'Voice is unusually flat when discussing emotional topic',
                underlying: 'suppressed emotion',
                confidence: 0.7,
                approach: 'gentle_probe',
                phrase: "You're talking about something really significant, but your voice is very calm. That's okay - but I'm here if there's more underneath.",
                context: {
                    userMessage: lowerMessage,
                },
            };
        }
    }
    return null;
}
// ============================================================================
// PHRASE GENERATION
// ============================================================================
/**
 * Generate a Ferni-voiced phrase for voice-aware detection.
 */
function generateVoiceAwarePhrase(voiceEmotion, detectionType) {
    if (detectionType === 'contradiction') {
        const phrases = [
            "I hear you saying you're fine, but... something in your voice tells me different. You don't have to talk about it, but I'm here if you want to.",
            "Your words say okay, but there's something in how you said it. What's really going on?",
            "I notice a disconnect between what you're saying and how you're saying it. No pressure, but I'm curious what's underneath.",
            "You said fine, but your voice didn't sound fine. I'm not pushing - just... I heard it.",
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }
    // Voice-only detection
    if (voiceEmotion.primary === 'distressed' || voiceEmotion.primary === 'crying') {
        return "I can hear this is really hard. I'm here. Take your time.";
    }
    if (voiceEmotion.primary === 'anxious' || voiceEmotion.primary === 'worried') {
        return "I can hear the worry in your voice. What's weighing on you?";
    }
    if (voiceEmotion.primary === 'sad') {
        return "There's sadness in your voice. You don't have to explain it, but I notice it.";
    }
    return "Something in your voice caught my attention. I'm here if you want to share more.";
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Deduplicate signals, keeping highest confidence for each type.
 */
function deduplicateSignals(signals) {
    const byType = new Map();
    for (const signal of signals) {
        const existing = byType.get(signal.type);
        if (!existing || signal.confidence > existing.confidence) {
            byType.set(signal.type, signal);
        }
    }
    return Array.from(byType.values());
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectUnsaidSignalsWithVoice,
};
//# sourceMappingURL=voice-aware-detection.js.map