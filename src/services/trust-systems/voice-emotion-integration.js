/**
 * Voice Emotion Integration
 *
 * Enhances trust system detection by incorporating voice emotion signals.
 * When someone says "I'm fine" but their voice is sad, that's a stronger signal.
 *
 * Philosophy: Words lie, voice doesn't. The tone, pace, and emotion in
 * someone's voice tells the truth their words might be hiding.
 *
 * @module VoiceEmotionIntegration
 */
import { createLogger } from '../../utils/safe-logger.js';
import { detectUnsaidSignals } from './reading-between-lines.js';
const log = createLogger({ module: 'VoiceEmotionIntegration' });
// ============================================================================
// EMOTION MAPPING
// ============================================================================
/** Map text emotions to "okay" vs "not okay" */
const POSITIVE_STATED_EMOTIONS = [
    'fine',
    'good',
    'great',
    'okay',
    'happy',
    'excited',
    'better',
    'alright',
];
/** Voice emotions that contradict "I'm fine" */
const CONTRADICTING_VOICE_EMOTIONS = [
    'sad',
    'anxious',
    'fearful',
    'angry',
    'frustrated',
    'hurt',
    'disappointed',
    'stressed',
    'overwhelmed',
    'exhausted',
];
/** Mismatch strength based on voice emotion */
const EMOTION_MISMATCH_WEIGHTS = {
    sad: 0.9,
    crying: 1.0,
    anxious: 0.8,
    fearful: 0.85,
    angry: 0.7,
    frustrated: 0.75,
    hurt: 0.9,
    disappointed: 0.7,
    stressed: 0.65,
    overwhelmed: 0.8,
    exhausted: 0.6,
    flat: 0.5, // Emotionally flat can indicate suppression
};
// ============================================================================
// MISMATCH DETECTION
// ============================================================================
/**
 * Detect mismatch between stated emotion and voice emotion
 */
export function detectEmotionMismatch(statedText, voiceSignal) {
    const lower = statedText.toLowerCase();
    // Check if they claimed to be okay
    const claimsOkay = POSITIVE_STATED_EMOTIONS.some((e) => lower.includes(`i'm ${e}`) || lower.includes(`i am ${e}`) || lower.includes(`it's ${e}`));
    if (!claimsOkay)
        return null;
    // Check if voice contradicts
    const voiceContradicts = CONTRADICTING_VOICE_EMOTIONS.includes(voiceSignal.emotion.toLowerCase());
    if (!voiceContradicts)
        return null;
    // Calculate mismatch strength
    const baseWeight = EMOTION_MISMATCH_WEIGHTS[voiceSignal.emotion.toLowerCase()] || 0.5;
    const mismatchStrength = baseWeight * voiceSignal.confidence;
    // Generate interpretation
    const interpretation = generateInterpretation(voiceSignal.emotion, voiceSignal.characteristics);
    log.debug({
        stated: 'fine/okay',
        voice: voiceSignal.emotion,
        strength: mismatchStrength.toFixed(2),
    }, '🎭 Emotion mismatch detected');
    return {
        statedEmotion: 'fine/okay',
        voiceEmotion: voiceSignal.emotion,
        mismatchStrength,
        interpretation,
    };
}
/**
 * Generate interpretation based on voice characteristics
 */
function generateInterpretation(emotion, characteristics) {
    const base = `Voice indicates ${emotion} despite saying they're fine.`;
    if (!characteristics)
        return base;
    const details = [];
    if (characteristics.pace === 'slow') {
        details.push('speaking slowly (possible exhaustion or sadness)');
    }
    else if (characteristics.pace === 'rushed') {
        details.push('speaking quickly (possible anxiety)');
    }
    if (characteristics.stability === 'wavering') {
        details.push('voice wavering (emotional distress)');
    }
    else if (characteristics.stability === 'breaking') {
        details.push('voice breaking (near tears)');
    }
    if (characteristics.volume === 'quiet') {
        details.push('speaking quietly (withdrawal or shame)');
    }
    if (characteristics.energy === 'low') {
        details.push('low energy (possible depression or exhaustion)');
    }
    if (details.length > 0) {
        return `${base} ${details.join(', ')}.`;
    }
    return base;
}
// ============================================================================
// ENHANCED DETECTION
// ============================================================================
/**
 * Enhance unsaid signal detection with voice emotion data
 */
export function enhanceWithVoiceEmotion(userId, userMessage, textContext, voiceSignal) {
    // Get base signals from text analysis
    const baseSignals = detectUnsaidSignals(userId, userMessage, textContext);
    if (!voiceSignal || voiceSignal.confidence < 0.5) {
        // No reliable voice data - return base signals with text-only confidence
        return baseSignals.map((signal) => ({
            ...signal,
            combinedConfidence: signal.confidence,
        }));
    }
    // Check for voice-text mismatch
    const mismatch = detectEmotionMismatch(userMessage, voiceSignal);
    // Enhance signals with voice data
    const enhanced = baseSignals.map((signal) => {
        let combinedConfidence = signal.confidence;
        // Boost confidence for emotional_mismatch if voice confirms
        if (signal.type === 'emotional_mismatch' && mismatch) {
            combinedConfidence = Math.min(signal.confidence + mismatch.mismatchStrength * 0.3, 0.98);
            return {
                ...signal,
                voiceEvidence: {
                    emotion: mismatch.voiceEmotion,
                    confidence: voiceSignal.confidence,
                    mismatchStrength: mismatch.mismatchStrength,
                },
                combinedConfidence,
                // Update phrase to acknowledge voice
                phrase: getVoiceAwarePhrase(signal, mismatch),
            };
        }
        // Boost confidence for permission_seeking if voice shows hesitation
        if (signal.type === 'permission_seeking' &&
            voiceSignal.characteristics?.stability === 'wavering') {
            combinedConfidence = Math.min(signal.confidence + 0.15, 0.95);
        }
        // Boost confidence for minimizing_pain if voice shows distress
        if (signal.type === 'minimizing_pain' &&
            CONTRADICTING_VOICE_EMOTIONS.includes(voiceSignal.emotion.toLowerCase())) {
            combinedConfidence = Math.min(signal.confidence + 0.2, 0.95);
        }
        return {
            ...signal,
            combinedConfidence,
        };
    });
    // If we detected a mismatch but no base signal caught it, add one
    if (mismatch && !baseSignals.some((s) => s.type === 'emotional_mismatch')) {
        enhanced.push({
            type: 'emotional_mismatch',
            observation: 'Voice emotion contradicts stated emotion',
            underlying: mismatch.voiceEmotion,
            confidence: mismatch.mismatchStrength,
            combinedConfidence: mismatch.mismatchStrength,
            approach: 'create_space',
            phrase: `I hear you saying you're fine, but... your voice tells me there might be more. You don't have to talk about it, but I'm here.`,
            voiceEvidence: {
                emotion: mismatch.voiceEmotion,
                confidence: voiceSignal.confidence,
                mismatchStrength: mismatch.mismatchStrength,
            },
            context: {
                userMessage,
                statedEmotion: 'fine',
                detectedEmotion: mismatch.voiceEmotion,
            },
        });
    }
    return enhanced;
}
/**
 * Get a phrase that acknowledges voice evidence
 */
function getVoiceAwarePhrase(signal, mismatch) {
    const phrases = [
        `I hear you saying you're fine, but... I can hear something else in your voice. You don't have to talk about it, but I'm here.`,
        `You said okay, but your voice is telling me a different story. I'm listening, if you want to share more.`,
        `There's something in how you're saying this that makes me think there's more. No pressure, but I'm here.`,
        `I'm picking up on something beneath the words. Take your time - I'm not going anywhere.`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
const voicePatterns = new Map();
/**
 * Update baseline voice patterns for a user
 */
export function updateVoiceBaseline(userId, signal) {
    const existing = voicePatterns.get(userId);
    if (!existing) {
        voicePatterns.set(userId, {
            userId,
            baselineEnergy: signal.characteristics?.energy || 'normal',
            baselinePace: signal.characteristics?.pace || 'normal',
            observationCount: 1,
        });
        return;
    }
    // Update with smoothing
    existing.observationCount++;
    // Only update baseline if we have enough observations and this seems normal
    if (existing.observationCount > 5 && signal.emotion === 'neutral' && signal.confidence > 0.7) {
        if (signal.characteristics?.energy) {
            existing.baselineEnergy = signal.characteristics.energy;
        }
        if (signal.characteristics?.pace) {
            existing.baselinePace = signal.characteristics.pace;
        }
    }
}
/**
 * Check if current voice deviates from baseline
 */
export function detectVoiceDeviation(userId, signal) {
    const baseline = voicePatterns.get(userId);
    if (!baseline || baseline.observationCount < 5) {
        return { deviates: false, significance: 0 };
    }
    const deviations = [];
    let significance = 0;
    // Check energy deviation
    if (signal.characteristics?.energy) {
        if (baseline.baselineEnergy === 'normal' && signal.characteristics.energy === 'low') {
            deviations.push('lower energy than usual');
            significance += 0.3;
        }
        else if (baseline.baselineEnergy === 'normal' && signal.characteristics.energy === 'high') {
            deviations.push('higher energy than usual');
            significance += 0.2;
        }
    }
    // Check pace deviation
    if (signal.characteristics?.pace) {
        if (baseline.baselinePace === 'normal' && signal.characteristics.pace === 'slow') {
            deviations.push('speaking slower than usual');
            significance += 0.25;
        }
        else if (baseline.baselinePace === 'normal' && signal.characteristics.pace === 'rushed') {
            deviations.push('speaking faster than usual');
            significance += 0.2;
        }
    }
    if (deviations.length > 0) {
        return {
            deviates: true,
            deviation: deviations.join(', '),
            significance: Math.min(significance, 0.8),
        };
    }
    return { deviates: false, significance: 0 };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectEmotionMismatch,
    enhanceWithVoiceEmotion,
    updateVoiceBaseline,
    detectVoiceDeviation,
};
//# sourceMappingURL=voice-emotion-integration.js.map