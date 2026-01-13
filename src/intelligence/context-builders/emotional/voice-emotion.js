/**
 * Voice Emotion Context Builder
 *
 * Integrates voice emotion signals into cognitive adjustments.
 * When we detect stress, tremor, or other voice qualities,
 * this builder suggests cognitive adaptations.
 *
 * This creates emotionally intelligent AI that responds to
 * HOW something is said, not just WHAT is said.
 *
 * Uses centralized:
 * - SessionStateManager for session tracking
 * - VoiceEmotionOrchestrator for unified analysis
 */
import { broadcastVoiceEmotion } from '../../../services/cognitive-broadcast.js';
import { getSessionState, updateVoiceEmotion } from '../../session-state.js';
import { generateVoiceAwareGuidance, processVoiceEmotion, trackSessionVoiceEmotion, } from '../../voice-emotion-cognitive.js';
import { BuilderCategory } from '../core/categories.js';
import { createCriticalInjection, createHintInjection, createStandardInjection, registerContextBuilder, } from '../index.js';
/**
 * Build voice emotion context
 *
 * Uses centralized SessionStateManager for session tracking.
 */
async function buildVoiceEmotionContext(input) {
    const injections = [];
    const sessionId = input.services.sessionId || 'default';
    // Get voice emotion if available
    const { voiceEmotion } = input;
    if (!voiceEmotion) {
        return injections;
    }
    // Get centralized session state
    const sessionState = getSessionState(sessionId);
    // Update centralized voice emotion state
    // Extended voice emotion may have additional properties
    const extendedVoice = voiceEmotion;
    updateVoiceEmotion(sessionId, voiceEmotion.emotion, extendedVoice.stressLevel ?? 0);
    // Build voice emotion signals for cognitive processing
    const signals = {
        emotion: voiceEmotion.emotion,
        confidence: voiceEmotion.confidence,
        speechRate: voiceEmotion.speechRate,
        pitchVariance: voiceEmotion.pitch,
        // Additional signals from voice analysis if available
        hasTremor: detectTremorFromPitch(voiceEmotion.pitch),
        isRushed: detectRushFromRate(voiceEmotion.speechRate),
        hasHesitation: detectHesitation(input.userText),
    };
    // Track session voice emotion in cognitive system
    const cognitiveState = trackSessionVoiceEmotion(sessionId, signals);
    // 📡 Broadcast voice emotion for dashboard
    // Use arc trend from centralized state, or fallback to cognitive state
    const arcTrend = sessionState.voiceEmotion.arc?.trend;
    const emotionalTrend = cognitiveState.emotionalTrend;
    const trend = arcTrend === 'declining'
        ? 'worsening'
        : arcTrend === 'improving'
            ? 'improving'
            : emotionalTrend === 'worsening'
                ? 'worsening'
                : emotionalTrend === 'improving'
                    ? 'improving'
                    : 'stable';
    broadcastVoiceEmotion(input.services.userId || 'anonymous', signals.emotion, signals.confidence || 0.5, trend);
    // Process voice emotion for cognitive adjustments
    const adjustment = processVoiceEmotion(signals);
    // ============================================================================
    // 1. VOICE EMOTIONAL SIGNALS - Critical guidance
    // ============================================================================
    const voiceGuidance = generateVoiceAwareGuidance(signals);
    if (voiceGuidance.length > 0) {
        // High-priority voice signals
        const priorityGuidance = voiceGuidance.filter((g) => g.includes('tremor') || g.includes('emotionally affected'));
        if (priorityGuidance.length > 0) {
            injections.push(createCriticalInjection('voice-emotion-critical', priorityGuidance.join('\n'), {
                category: 'voice-emotion',
                confidence: 0.9,
            }));
        }
        // Standard voice signals
        const standardGuidance = voiceGuidance.filter((g) => !g.includes('tremor') && !g.includes('emotionally affected'));
        if (standardGuidance.length > 0) {
            injections.push(createStandardInjection('voice-emotion-guidance', standardGuidance.join('\n'), {
                category: 'voice-emotion',
                confidence: 0.8,
            }));
        }
    }
    // ============================================================================
    // 2. COGNITIVE STYLE OVERRIDE - When voice suggests different approach
    // ============================================================================
    if (adjustment.suggestionStrength > 0.6 && adjustment.suggestedStyle) {
        injections.push(createStandardInjection('voice-cognitive-shift', `[VOICE-TRIGGERED SHIFT] Based on voice signals, shift to ${adjustment.suggestedStyle} approach. Reason: ${adjustment.reason}`, { category: 'voice-emotion', confidence: adjustment.suggestionStrength }));
    }
    // ============================================================================
    // 3. EMOTIONAL TREND - Track improving/worsening
    // Use centralized session state for voice samples, cognitive state for trend
    // ============================================================================
    if (sessionState.voiceEmotion.totalSamples >= 3) {
        const emotionalTrendValue = cognitiveState.emotionalTrend;
        if (emotionalTrendValue === 'improving') {
            injections.push(createHintInjection('voice-trend', `[EMOTIONAL TREND: IMPROVING] User's voice is becoming calmer. What you're doing is working.`, { category: 'voice-emotion', confidence: 0.7 }));
        }
        else if (emotionalTrendValue === 'worsening') {
            injections.push(createStandardInjection('voice-trend', `[EMOTIONAL TREND: INCREASING STRESS] User's voice shows more stress. Consider: slow down, validate more, add pauses.`, { category: 'voice-emotion', confidence: 0.8 }));
        }
    }
    // ============================================================================
    // 4. SPEECH ADAPTATION CUES - For TTS adjustment
    // ============================================================================
    if (adjustment.slowDown || adjustment.addPauses || adjustment.softenTone) {
        const adaptations = [];
        if (adjustment.slowDown)
            adaptations.push('slow your pace');
        if (adjustment.addPauses)
            adaptations.push('add thoughtful pauses');
        if (adjustment.softenTone)
            adaptations.push('soften your tone');
        injections.push(createHintInjection('voice-speech-adapt', `[VOICE ADAPTATION] ${adaptations.join(', ')}`, {
            category: 'voice-emotion',
            confidence: 0.75,
        }));
    }
    // ============================================================================
    // 5. COMPREHENSION CHECK - When voice suggests confusion
    // ============================================================================
    if (adjustment.increaseComprehensionChecks) {
        injections.push(createHintInjection('voice-comprehension', `[VOICE SIGNAL: CHECK UNDERSTANDING] Voice suggests confusion or uncertainty. Check in: "Does that make sense?" or "Am I explaining this clearly?"`, { category: 'voice-emotion', confidence: 0.7 }));
    }
    return injections;
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Detect tremor from pitch variance
 */
function detectTremorFromPitch(pitch) {
    if (pitch === undefined)
        return false;
    // High pitch variance can indicate tremor
    return pitch > 1.5; // Normalized variance
}
/**
 * Detect rushed speech from rate
 */
function detectRushFromRate(speechRate) {
    if (speechRate === undefined)
        return false;
    return speechRate > 200; // Words per minute
}
/**
 * Detect hesitation from text patterns
 */
function detectHesitation(userText) {
    const hesitationPatterns = [
        /\.\.\./, // Ellipses
        /\bum+\b/i, // "um"
        /\buh+\b/i, // "uh"
        /\bi\s+(?:don't\s+)?know\b/i, // "I don't know"
        /\blike,?\s+like\b/i, // Repeated "like"
        /\bwell,?\s+well\b/i, // Repeated "well"
    ];
    return hesitationPatterns.some((pattern) => pattern.test(userText));
}
/**
 * Clear voice emotion session state
 *
 * NOTE: Session state is now managed centrally by SessionStateManager.
 * This function is kept for backward compatibility but delegates to the manager.
 */
export function clearVoiceEmotionSession(sessionId) {
    // Session state is managed by SessionStateManager.clear(sessionId)
    // This is a no-op for backward compatibility
}
// ============================================================================
// REGISTRATION
// ============================================================================
registerContextBuilder({
    name: 'voice-emotion',
    description: 'Voice emotion analysis and cognitive adaptation',
    priority: 30, // High priority - affects how we respond (VOICE category: 20-40)
    category: BuilderCategory.VOICE,
    build: buildVoiceEmotionContext,
});
export { buildVoiceEmotionContext };
export default buildVoiceEmotionContext;
//# sourceMappingURL=voice-emotion.js.map