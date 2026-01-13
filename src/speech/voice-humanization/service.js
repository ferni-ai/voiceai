/**
 * Voice Humanization Service
 *
 * Main service class for voice humanization capabilities.
 */
import { getLogger } from '../../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../../memory/rust-accelerator.js';
import { predictTurnWithVoice, voiceSuggestsTurnComplete, } from '../prosody-turn-bridge.js';
import { IMMEDIATE_STOP_WORDS, LAUGHTER_RESPONSES, LAUGHTER_THRESHOLDS, PRE_INTERRUPTION_PATTERNS, SOFT_INTERRUPTION_WORDS, } from './constants.js';
const log = getLogger().child({ service: 'VoiceHumanization' });
// Check Rust availability at module load
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
// ============================================================================
// VOICE HUMANIZATION SERVICE
// ============================================================================
export class VoiceHumanizationService {
    state;
    maxHistorySize = 10;
    constructor(sessionId) {
        this.state = {
            sessionId,
            recentVoiceEmotions: [],
            userRhythmProfile: null,
            laughterEvents: [],
            interruptionPatterns: [],
            currentEmotionalArc: null,
            turnCount: 0,
        };
        log.info({ sessionId }, '🎤 Voice humanization service initialized');
    }
    // ==========================================================================
    // 1. PROSODY-AWARE TURN PREDICTION
    // ==========================================================================
    /**
     * Get enhanced turn prediction using voice prosody signals
     */
    predictTurnWithVoice(transcript, voiceEmotion, options = {}) {
        // Store voice emotion for history
        if (voiceEmotion && voiceEmotion.confidence > 0.3) {
            this.state.recentVoiceEmotions.push(voiceEmotion);
            if (this.state.recentVoiceEmotions.length > this.maxHistorySize) {
                this.state.recentVoiceEmotions.shift();
            }
        }
        // Use the prosody-turn bridge
        const prediction = predictTurnWithVoice(this.state.sessionId, transcript, voiceEmotion, {
            ...options,
            turnCount: this.state.turnCount,
        });
        // Also check if voice strongly suggests completion
        const voiceSuggestion = voiceSuggestsTurnComplete(voiceEmotion);
        if (voiceSuggestion.suggests && voiceSuggestion.confidence > 0.7) {
            log.debug({
                transcript: transcript.slice(0, 40),
                voiceConfidence: voiceSuggestion.confidence,
                reason: voiceSuggestion.reason,
            }, '🎤 Voice strongly suggests turn complete');
        }
        return prediction;
    }
    /**
     * Extract intonation from prosody features
     */
    extractIntonation(prosody) {
        switch (prosody.pitchContour) {
            case 'rising':
                return 'rising';
            case 'falling':
                return 'falling';
            default:
                return 'neutral';
        }
    }
    // ==========================================================================
    // 2. MICRO-INTERRUPTION DETECTION
    // ==========================================================================
    /**
     * Check if transcribed text contains a micro-interruption signal
     */
    detectMicroInterruption(text, isAgentSpeaking) {
        if (!isAgentSpeaking) {
            return {
                detected: false,
                trigger: null,
                urgency: 'none',
                shouldStopAgent: false,
                reason: 'Agent not speaking',
            };
        }
        const normalized = text.toLowerCase().trim();
        // Check immediate stop words
        for (const word of IMMEDIATE_STOP_WORDS) {
            if (normalized === word || normalized.startsWith(`${word} `)) {
                log.info({ trigger: word, text: normalized.slice(0, 30) }, '🛑 Micro-interruption detected');
                this.state.interruptionPatterns.push({
                    timestamp: Date.now(),
                    trigger: word,
                });
                return {
                    detected: true,
                    trigger: word,
                    urgency: 'immediate',
                    shouldStopAgent: true,
                    reason: `Immediate stop word: "${word}"`,
                };
            }
        }
        // Check pre-interruption patterns
        for (const pattern of PRE_INTERRUPTION_PATTERNS) {
            if (pattern.test(normalized)) {
                log.info({ text: normalized.slice(0, 30) }, '🛑 Pre-interruption pattern detected');
                return {
                    detected: true,
                    trigger: normalized.split(/\s+/)[0],
                    urgency: 'immediate',
                    shouldStopAgent: true,
                    reason: 'Pre-interruption pattern detected',
                };
            }
        }
        // Check soft interruption words
        for (const word of SOFT_INTERRUPTION_WORDS) {
            if (normalized === word || normalized.startsWith(`${word} `)) {
                return {
                    detected: true,
                    trigger: word,
                    urgency: 'soon',
                    shouldStopAgent: false,
                    reason: `Soft interruption signal: "${word}"`,
                };
            }
        }
        return {
            detected: false,
            trigger: null,
            urgency: 'none',
            shouldStopAgent: false,
            reason: 'No interruption signal detected',
        };
    }
    /**
     * Get interruption patterns for learning
     */
    getInterruptionPatterns() {
        return [...this.state.interruptionPatterns];
    }
    // ==========================================================================
    // 3. EMOTIONAL ARC → TTS ADJUSTMENTS
    // ==========================================================================
    /**
     * Calculate TTS adjustments based on emotional arc
     */
    getEmotionalTtsAdjustments(emotionalArc) {
        this.state.currentEmotionalArc = emotionalArc;
        const defaults = {
            openingPauseMs: 100,
            speedAdjust: 0,
            volumeAdjust: 1.0,
            ssmlEmotion: 'neutral',
            addBreaths: false,
            warmth: 'medium',
            reason: 'Default neutral state',
        };
        if (!emotionalArc) {
            return defaults;
        }
        const adjustments = { ...defaults };
        const reasons = [];
        // High intensity emotions need more space
        if (emotionalArc.conversationTemperature > 0.7) {
            adjustments.openingPauseMs = 400;
            adjustments.speedAdjust = -0.15;
            adjustments.addBreaths = true;
            adjustments.warmth = 'high';
            reasons.push('high emotional temperature');
        }
        // User needs emotional support
        if (emotionalArc.needsEmotionalSupport) {
            adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 300);
            adjustments.speedAdjust = Math.min(adjustments.speedAdjust, -0.1);
            adjustments.volumeAdjust = 0.95;
            adjustments.warmth = 'high';
            adjustments.addBreaths = true;
            adjustments.ssmlEmotion = 'empathetic';
            reasons.push('user needs support');
        }
        // Declining emotional trajectory
        if (emotionalArc.trajectory === 'declining') {
            adjustments.speedAdjust = Math.min(adjustments.speedAdjust, -0.1);
            adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 250);
            adjustments.ssmlEmotion = 'calm';
            reasons.push('declining emotional trajectory');
        }
        // Improving trajectory
        if (emotionalArc.trajectory === 'improving' && emotionalArc.currentValence > 0.3) {
            adjustments.speedAdjust = Math.max(adjustments.speedAdjust, 0.05);
            adjustments.volumeAdjust = 1.05;
            adjustments.ssmlEmotion = 'warm';
            reasons.push('improving trajectory');
        }
        // Sudden shift detected
        if (emotionalArc.suddenShiftDetected) {
            adjustments.openingPauseMs = Math.max(adjustments.openingPauseMs, 350);
            adjustments.addBreaths = true;
            reasons.push('sudden emotional shift');
        }
        // Recent distress
        if (emotionalArc.turnsSinceDistress < 3) {
            adjustments.warmth = 'high';
            adjustments.addBreaths = true;
            reasons.push('recent distress');
        }
        // Volatile emotions
        if (emotionalArc.trajectory === 'volatile') {
            adjustments.speedAdjust = -0.1;
            adjustments.openingPauseMs = 300;
            adjustments.ssmlEmotion = 'grounded';
            reasons.push('volatile emotions - being steady');
        }
        adjustments.reason = reasons.length > 0 ? reasons.join(', ') : 'Normal conversational flow';
        // Clamp values
        adjustments.speedAdjust = Math.max(-0.3, Math.min(0.3, adjustments.speedAdjust));
        adjustments.volumeAdjust = Math.max(0.8, Math.min(1.2, adjustments.volumeAdjust));
        adjustments.openingPauseMs = Math.max(0, Math.min(600, adjustments.openingPauseMs));
        if (adjustments.openingPauseMs > 200 || adjustments.speedAdjust !== 0) {
            log.debug({
                openingPauseMs: adjustments.openingPauseMs,
                speedAdjust: adjustments.speedAdjust.toFixed(2),
                warmth: adjustments.warmth,
                reason: adjustments.reason,
            }, '🎭 Emotional TTS adjustments applied');
        }
        return adjustments;
    }
    /**
     * Apply emotional adjustments to SSML text
     */
    applyEmotionalSsml(text, adjustments) {
        let result = text;
        if (adjustments.openingPauseMs >= 150) {
            result = `<break time="${adjustments.openingPauseMs}ms"/>${result}`;
        }
        if (adjustments.addBreaths) {
            result = result.replace(/([.!?])\s+/g, `$1<break time="200ms"/> `);
            result = result.replace(/,\s+/g, `,<break time="100ms"/> `);
        }
        return result;
    }
    // ==========================================================================
    // 4. LAUGHTER DETECTION
    // ==========================================================================
    /**
     * Detect if audio features indicate laughter
     */
    detectLaughter(prosody, durationMs) {
        const result = {
            isLaughing: false,
            confidence: 0,
            laughType: 'unknown',
            suggestedResponse: 'none',
        };
        if (durationMs > LAUGHTER_THRESHOLDS.MAX_LAUGHTER_DURATION_MS) {
            return result;
        }
        const energyPeaksPerSec = prosody.energyPeaks / (durationMs / 1000);
        const hasHighEnergyBursts = energyPeaksPerSec >= LAUGHTER_THRESHOLDS.MIN_ENERGY_PEAKS_PER_SEC;
        const hasHighPitchVariance = prosody.pitchVariance >= LAUGHTER_THRESHOLDS.MIN_PITCH_VARIANCE;
        const hasHighEnergy = prosody.energyMean > -15;
        let confidence = 0;
        if (hasHighEnergyBursts)
            confidence += 0.35;
        if (hasHighPitchVariance)
            confidence += 0.3;
        if (hasHighEnergy)
            confidence += 0.2;
        if (durationMs < 1500)
            confidence += 0.15;
        if (confidence >= 0.6) {
            result.isLaughing = true;
            result.confidence = Math.min(confidence, 0.95);
            if (durationMs < 500 && prosody.energyMean < -20) {
                result.laughType = 'chuckle';
                result.suggestedResponse = 'smile';
            }
            else if (durationMs < 1000) {
                result.laughType = 'giggle';
                result.suggestedResponse = 'acknowledge';
            }
            else if (prosody.energyMean > -10) {
                result.laughType = 'hearty';
                result.suggestedResponse = 'join_in';
            }
            else {
                result.laughType = 'laugh';
                result.suggestedResponse = 'acknowledge';
            }
            this.state.laughterEvents.push({
                timestamp: Date.now(),
                type: result.laughType,
            });
            log.debug({
                laughType: result.laughType,
                confidence: result.confidence.toFixed(2),
                suggestedResponse: result.suggestedResponse,
            }, '😄 Laughter detected');
        }
        return result;
    }
    /**
     * Get response suggestion for detected laughter
     */
    getLaughterResponse(detection, personaId) {
        if (!detection.isLaughing)
            return null;
        const personaResponses = LAUGHTER_RESPONSES[personaId] || LAUGHTER_RESPONSES.default;
        const responseOptions = personaResponses[detection.suggestedResponse] || [''];
        return responseOptions[Math.floor(Math.random() * responseOptions.length)];
    }
    // ==========================================================================
    // 5. SPEECH RHYTHM ANALYSIS & MIRRORING
    // ==========================================================================
    /**
     * Update user's speech rhythm profile
     */
    updateRhythmProfile(text, durationMs, pausePatterns) {
        const avgPhraseLength = this.estimateAvgPhraseLength(text);
        const pauseBetweenPhrases = pausePatterns && pausePatterns.length > 0
            ? pausePatterns.reduce((a, b) => a + b, 0) / pausePatterns.length
            : durationMs / Math.max(1, avgPhraseLength);
        let pattern = 'varied';
        if (avgPhraseLength < 4 && pauseBetweenPhrases > 300) {
            pattern = 'staccato';
        }
        else if (avgPhraseLength > 10 && pauseBetweenPhrases < 200) {
            pattern = 'flowing';
        }
        else if (avgPhraseLength < 5 && pauseBetweenPhrases < 150) {
            pattern = 'burst';
        }
        else if (pauseBetweenPhrases > 400) {
            pattern = 'measured';
        }
        const profile = {
            avgPhraseLength,
            pauseBetweenPhrases,
            pattern,
            confidence: this.state.turnCount > 3 ? 0.8 : 0.5,
        };
        if (this.state.userRhythmProfile) {
            profile.avgPhraseLength =
                0.7 * profile.avgPhraseLength + 0.3 * this.state.userRhythmProfile.avgPhraseLength;
            profile.pauseBetweenPhrases =
                0.7 * profile.pauseBetweenPhrases + 0.3 * this.state.userRhythmProfile.pauseBetweenPhrases;
        }
        this.state.userRhythmProfile = profile;
        return profile;
    }
    estimateAvgPhraseLength(text) {
        const phrases = text.split(/[,;.!?\-—]/).filter((p) => p.trim().length > 0);
        // 🦀 Use Rust for O(1) word counting when available
        const countWords = (s) => RUST_COUNTING_AVAILABLE ? countWordsRust(s) : s.split(/\s+/).length;
        if (phrases.length === 0)
            return countWords(text);
        const totalWords = phrases.reduce((sum, p) => sum + countWords(p.trim()), 0);
        return totalWords / phrases.length;
    }
    /**
     * Get SSML pause adjustments to mirror user's rhythm
     */
    getRhythmMirroringAdjustments() {
        const profile = this.state.userRhythmProfile;
        if (!profile || profile.confidence < 0.5) {
            return { pauseMultiplier: 1.0, phraseBreakMs: 200 };
        }
        let pauseMultiplier = 1.0;
        let phraseBreakMs = 200;
        switch (profile.pattern) {
            case 'staccato':
                pauseMultiplier = 1.2;
                phraseBreakMs = 300;
                break;
            case 'flowing':
                pauseMultiplier = 0.8;
                phraseBreakMs = 150;
                break;
            case 'burst':
                pauseMultiplier = 0.9;
                phraseBreakMs = 120;
                break;
            case 'measured':
                pauseMultiplier = 1.3;
                phraseBreakMs = 400;
                break;
        }
        return { pauseMultiplier, phraseBreakMs };
    }
    // ==========================================================================
    // STATE MANAGEMENT
    // ==========================================================================
    recordTurn() {
        this.state.turnCount++;
    }
    getState() {
        return { ...this.state };
    }
    reset() {
        this.state = {
            sessionId: this.state.sessionId,
            recentVoiceEmotions: [],
            userRhythmProfile: null,
            laughterEvents: [],
            interruptionPatterns: [],
            currentEmotionalArc: null,
            turnCount: 0,
        };
        log.info({ sessionId: this.state.sessionId }, '🔄 Voice humanization service reset');
    }
}
export default VoiceHumanizationService;
//# sourceMappingURL=service.js.map