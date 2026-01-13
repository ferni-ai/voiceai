/**
 * Voice Emotion Orchestrator
 *
 * Consolidates all voice emotion analysis into a single, coherent system.
 * Previously, voice emotion was processed in multiple places:
 * - emotional.ts (voice+text merge)
 * - voice-emotion.ts (cognitive adjustment)
 * - advanced-voice-emotion.ts (Hume AI)
 * - voice-emotion-intelligence.ts (enhanced)
 *
 * This orchestrator provides:
 * - Single source of truth for voice emotion state
 * - Unified API for voice emotion analysis
 * - Integration with session state manager
 * - Consistent guidance generation
 *
 * @module intelligence/voice-emotion-orchestrator
 */
import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS, formatDistressForPrompt, getDistressCategory, } from '../detectors/distress.js';
import { SessionStateManager, updateEmotionalTrajectory, updateVoiceEmotion, } from '../state/session.js';
const log = createLogger({ module: 'voice-emotion-orchestrator' });
// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================
class VoiceEmotionOrchestratorImpl {
    /**
     * Analyze voice emotion and merge with text emotion
     *
     * This is the main entry point for voice emotion analysis.
     * It combines voice prosody signals with text-based emotion detection.
     */
    analyze(sessionId, voiceInput, textInput, userText) {
        // Get stress indicators from voice and text
        const stressIndicators = this.detectStressIndicators(voiceInput, userText);
        // Merge distress levels
        const mergedDistress = this.mergeDistress(voiceInput, textInput, stressIndicators);
        // Determine primary emotion
        const { primary, source, confidence } = this.determinePrimaryEmotion(voiceInput, textInput, stressIndicators);
        // Update session state
        updateVoiceEmotion(sessionId, primary, mergedDistress);
        updateEmotionalTrajectory(sessionId, primary, mergedDistress);
        // Get emotional trend
        const state = SessionStateManager.get(sessionId);
        const { trend } = state.emotionalTrajectory;
        // Generate guidance
        const guidance = this.generateGuidance(mergedDistress, stressIndicators, voiceInput, trend);
        const analysis = {
            primary,
            source,
            confidence,
            distressLevel: mergedDistress,
            distressCategory: getDistressCategory(mergedDistress),
            stressIndicators,
            trend,
            voiceQuality: {
                speechRate: voiceInput?.speechRate,
                pitch: voiceInput?.pitch,
                arousal: voiceInput?.arousal,
                valence: voiceInput?.valence,
            },
            guidance,
        };
        log.debug({
            sessionId,
            primary,
            distress: mergedDistress.toFixed(2),
            trend,
            source,
        }, 'Voice emotion analysis complete');
        return analysis;
    }
    /**
     * Detect stress indicators from voice and text
     */
    detectStressIndicators(voice, userText) {
        return {
            voiceStress: voice?.stressLevel ?? 0,
            textDistress: 0, // Will be set by caller
            hasTremor: this.detectTremor(voice),
            isRushed: this.detectRushed(voice, userText),
            hasHesitation: this.detectHesitation(userText),
            anxietyMarkers: this.detectAnxietyMarkers(voice, userText),
        };
    }
    /**
     * Detect tremor from pitch variance
     */
    detectTremor(voice) {
        if (!voice?.pitch)
            return false;
        // High pitch variance indicates tremor
        return voice.pitch > 1.5;
    }
    /**
     * Detect rushed speech
     */
    detectRushed(voice, text) {
        // Voice-based detection
        if (voice?.speechRate && voice.speechRate > 200)
            return true;
        // Text-based detection
        if (text) {
            const rushPatterns = /\b(gotta go|quick question|running late|no time|hurry|briefly|short on time)\b/i;
            if (rushPatterns.test(text))
                return true;
        }
        return false;
    }
    /**
     * Detect hesitation patterns
     */
    detectHesitation(text) {
        const patterns = [
            /\.\.\./, // Ellipses
            /\bum+\b/i, // "um"
            /\buh+\b/i, // "uh"
            /\bi\s+(?:don't\s+)?know\b/i, // "I don't know"
            /\blike,?\s+like\b/i, // Repeated "like"
            /\bwell,?\s+well\b/i, // Repeated "well"
        ];
        return patterns.some((p) => p.test(text));
    }
    /**
     * Detect anxiety markers
     */
    detectAnxietyMarkers(voice, text) {
        // Upstream detectors may provide an explicit anxiety marker boolean
        if (voice?.anxietyMarkers) {
            return true;
        }
        // Voice markers: high arousal + low valence
        if (voice) {
            if ((voice.arousal ?? 0) > 0.7 && (voice.valence ?? 0) < 0.3) {
                return true;
            }
        }
        // Text markers
        if (text) {
            const anxietyPatterns = /\b(worried|anxious|nervous|stressed|panic|freaking out|can't stop thinking)\b/i;
            if (anxietyPatterns.test(text))
                return true;
        }
        return false;
    }
    /**
     * Merge distress levels from voice and text
     */
    mergeDistress(voice, text, indicators) {
        let merged = text.distressLevel;
        if (voice && voice.confidence > 0.3) {
            // Weight: 60% text, 40% voice
            const voiceDistress = voice.stressLevel ?? 0;
            merged = text.distressLevel * 0.6 + voiceDistress * 0.4;
            // Boost for anxiety markers
            if (indicators.anxietyMarkers) {
                merged = Math.min(1, merged + 0.15);
            }
            // Boost for tremor
            if (indicators.hasTremor) {
                merged = Math.min(1, merged + 0.1);
            }
        }
        return merged;
    }
    /**
     * Determine primary emotion from voice and text
     */
    determinePrimaryEmotion(voice, text, _indicators) {
        // If no voice, use text
        if (!voice || voice.confidence < 0.3) {
            return {
                primary: text.primary,
                source: 'text',
                confidence: text.intensity,
            };
        }
        // If voice confidence is much higher, use voice
        if (voice.confidence > text.intensity + 0.3) {
            return {
                primary: this.mapVoiceEmotion(voice.emotion),
                source: 'voice',
                confidence: voice.confidence,
            };
        }
        // Otherwise, prefer text but consider voice
        // Voice can reveal what text hides
        const voicePrimary = this.mapVoiceEmotion(voice.emotion);
        // If voice and text agree, boost confidence
        if (voicePrimary === text.primary) {
            return {
                primary: text.primary,
                source: 'merged',
                confidence: Math.min(1, (text.intensity + voice.confidence) / 2 + 0.1),
            };
        }
        // If they disagree, slight preference for voice (more honest)
        return {
            primary: voice.confidence > 0.6 ? voicePrimary : text.primary,
            source: 'merged',
            confidence: (text.intensity + voice.confidence) / 2,
        };
    }
    /**
     * Map voice emotion labels to text emotion labels
     */
    mapVoiceEmotion(voiceEmotion) {
        const map = {
            happy: 'joy',
            sad: 'sadness',
            angry: 'anger',
            fearful: 'fear',
            anxious: 'anxiety',
            excited: 'anticipation',
            stressed: 'anxiety',
            neutral: 'neutral',
            tired: 'fatigue',
            bored: 'neutral',
        };
        return map[voiceEmotion.toLowerCase()] || voiceEmotion;
    }
    /**
     * Generate response guidance based on voice emotion
     */
    generateGuidance(distressLevel, indicators, voice, trend) {
        const messages = [];
        const guidance = {
            slowDown: false,
            addPauses: false,
            softenTone: false,
            checkComprehension: false,
            messages,
        };
        // High distress
        if (distressLevel >= DISTRESS.HIGH) {
            guidance.slowDown = true;
            guidance.addPauses = true;
            guidance.softenTone = true;
            guidance.suggestedStyle = 'gentle';
            messages.push("User's voice shows significant stress. Be extra gentle.");
        }
        // High voice stress even if overall distress isn't "high" yet
        if (indicators.voiceStress >= 0.65 && distressLevel < DISTRESS.HIGH) {
            guidance.slowDown = true;
            guidance.addPauses = true;
            guidance.softenTone = true;
            messages.push('High stress detected in voice. Slow down, add pauses, and lead with empathy.');
        }
        // Tremor detected
        if (indicators.hasTremor) {
            guidance.slowDown = true;
            guidance.softenTone = true;
            messages.push('Voice tremor detected - user may be emotionally affected. Slow down and be present.');
        }
        // Rushed speech
        if (indicators.isRushed) {
            guidance.checkComprehension = false; // Don't slow them down more
            messages.push("User seems rushed. Be brief and direct, but don't sacrifice empathy.");
        }
        // Hesitation
        if (indicators.hasHesitation) {
            guidance.addPauses = true;
            guidance.checkComprehension = true;
            messages.push('User shows hesitation. Give them space and check understanding.');
        }
        // Anxiety markers
        if (indicators.anxietyMarkers) {
            guidance.slowDown = true;
            guidance.softenTone = true;
            guidance.suggestedStyle = 'calm';
            messages.push('anxiety markers detected. Offer calm presence; focus on grounding and reassurance.');
        }
        // Emotion-specific voice cues (helps when text hides emotion)
        const mappedPrimary = voice ? this.mapVoiceEmotion(voice.emotion) : undefined;
        if (mappedPrimary === 'sadness' || voice?.emotion === 'sad') {
            guidance.softenTone = true;
            guidance.addPauses = true;
            messages.push('Voice sounds sad, with emotional undertones. Be gentle and validating.');
        }
        if (mappedPrimary === 'joy' || voice?.emotion === 'happy') {
            messages.push('Voice sounds happy — clear positive energy. Match it.');
        }
        if (voice &&
            (['frustrated', 'angry', 'agitated', 'upset'].includes(voice.emotion) ||
                (distressLevel >= DISTRESS.MODERATE &&
                    (voice.arousal ?? 0) > 0.7 &&
                    (voice.valence ?? 0) < 0.3))) {
            guidance.slowDown = true;
            guidance.softenTone = true;
            messages.push('Voice sounds agitated and upset. Keep your tone steady; validate first.');
        }
        // Positive voice signals
        if (voice && (voice.valence ?? 0) > 0.5 && (voice.arousal ?? 0) > 0.5) {
            guidance.suggestedStyle = 'energetic';
            messages.push('Voice sounds positive and engaged. Match their energy!');
        }
        return guidance;
    }
    /**
     * Detect if user is suppressing emotions
     */
    detectSuppression(voice, text) {
        if (!voice || voice.confidence < 0.5) {
            return { isSuppressing: false, confidence: 0 };
        }
        // Check for mismatch between voice and text
        const voiceValence = voice.valence ?? 0;
        const textValence = text.valence === 'positive' ? 0.5 : text.valence === 'negative' ? -0.5 : 0;
        // Significant mismatch
        const valenceDiff = Math.abs(voiceValence - textValence);
        if (valenceDiff > 0.5) {
            const isSuppressing = textValence > voiceValence; // Forcing positivity
            return {
                isSuppressing,
                displayed: text.primary,
                suppressed: this.mapVoiceEmotion(voice.emotion),
                confidence: Math.min(1, valenceDiff * voice.confidence),
            };
        }
        return { isSuppressing: false, confidence: 0 };
    }
    /**
     * Format voice emotion analysis for prompt injection
     */
    formatForPrompt(analysis) {
        const sections = [];
        // Distress guidance (uses standard format)
        const distressPrompt = formatDistressForPrompt(analysis.distressLevel);
        if (distressPrompt) {
            sections.push(distressPrompt);
        }
        // Voice-specific guidance
        if (analysis.guidance.messages.length > 0) {
            sections.push('[VOICE ANALYSIS]');
            sections.push(...analysis.guidance.messages.map((m) => `  • ${m}`));
        }
        // Trend info
        if (analysis.trend !== 'stable') {
            sections.push(`[EMOTIONAL TREND: ${analysis.trend.toUpperCase()}]`);
        }
        return sections.join('\n');
    }
    /**
     * Clear session data
     */
    clearSession(sessionId) {
        // Session state is managed by SessionStateManager
        // This method is for additional cleanup if needed
        log.debug({ sessionId }, 'Voice emotion session cleared');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
export const VoiceEmotionOrchestrator = new VoiceEmotionOrchestratorImpl();
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Analyze voice emotion (shorthand)
 */
export function analyzeVoiceEmotion(sessionId, voice, text, userText) {
    return VoiceEmotionOrchestrator.analyze(sessionId, voice, text, userText);
}
/**
 * Detect emotion suppression
 */
export function detectEmotionSuppression(voice, text) {
    return VoiceEmotionOrchestrator.detectSuppression(voice, text);
}
/**
 * Format voice emotion for prompt
 */
export function formatVoiceEmotionForPrompt(analysis) {
    return VoiceEmotionOrchestrator.formatForPrompt(analysis);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default VoiceEmotionOrchestrator;
//# sourceMappingURL=voice-emotion-orchestrator.js.map