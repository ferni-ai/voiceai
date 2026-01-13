/**
 * Interruption Handler
 *
 * Detects when users interrupt Jack and provides recovery phrases
 * to make Jack feel responsive and natural.
 */
import { seededPick } from './utils/rng.js';
import { getLogger } from '../utils/safe-logger.js';
// Import from persona-ids directly to avoid circular dependency through voice-registry
import { toCanonical as getCanonicalPersonaId } from '../personas/persona-ids.js';
export class InterruptionHandler {
    agentCurrentlySpeaking = false;
    currentAgentUtterance = '';
    interruptionCount = 0;
    lastInterruptionTime = 0;
    interruptionHistory = [];
    /**
     * Detect if user is interrupting the agent
     */
    detectInterruption(audioEvent, agentSpeaking) {
        const userStartedSpeaking = audioEvent.sampleRate > 0 && audioEvent.samplesPerChannel > 0;
        if (userStartedSpeaking && agentSpeaking) {
            this.interruptionCount++;
            this.lastInterruptionTime = Date.now();
            const event = {
                type: 'user_started_speaking',
                timestamp: Date.now(),
                userEnergy: this.estimateEnergy(audioEvent),
                agentWasSpeaking: true,
                interruptedUtterance: this.currentAgentUtterance,
            };
            this.interruptionHistory.push(event);
            getLogger().info('User interrupted agent', {
                count: this.interruptionCount,
                utterance: `${this.currentAgentUtterance.substring(0, 50)}...`,
            });
            return event;
        }
        return null;
    }
    /**
     * Get a natural recovery phrase after being interrupted
     * Now with SSML tags for natural delivery
     *
     * Design: Soft, unhurried transitions - never jarring
     * - Longer initial pauses (300-500ms) for breathing room
     * - Lower volume (0.6-0.7) feels gentler
     * - Slower speech rate (0.85-0.9) is more calming
     * - Avoid exclamations - use gentle openers
     */
    getRecoveryPhrase() {
        const isFrequentInterrupter = this.interruptionCount > 3;
        // If user interrupts frequently, agent should be very yielding
        // SSML: Much softer volume, longer pause, warm and unhurried
        if (isFrequentInterrupter) {
            const yieldingPhrases = [
                '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Please, go ahead.',
                '<break time="350ms"/><volume ratio="0.6"/><speed ratio="0.9"/>I\'m listening.',
                '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Tell me.',
                '<break time="350ms"/><volume ratio="0.6"/><speed ratio="0.9"/>Yes, what\'s on your mind?',
                '<break time="400ms"/><volume ratio="0.65"/>Mm-hmm, go on.',
            ];
            return seededPick(`${Date.now()}:83`, yieldingPhrases) ?? yieldingPhrases[0];
        }
        // Standard recovery phrases with SSML for soft, natural delivery
        // Design: Gentle breathing room, never reactive
        const recoveries = [
            '<break time="350ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Go ahead.',
            '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Mm, what were you saying?',
            '<break time="350ms"/><volume ratio="0.7"/>Please, go on.',
            '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.9"/>Yes?',
            '<break time="350ms"/><volume ratio="0.7"/><speed ratio="0.85"/>I\'m listening.',
            '<break time="400ms"/><volume ratio="0.65"/>What\'s on your mind?',
            '<break time="350ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Go ahead, tell me.',
            '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Mm-hmm.',
        ];
        return seededPick(`${Date.now()}:99`, recoveries) ?? recoveries[0];
    }
    /**
     * Get persona-specific recovery phrase with SSML
     * Uses canonical ID resolution for consistent persona matching
     *
     * Design: Each persona's voice, but all soft and unhurried
     * - 350-450ms initial pause for breathing room
     * - Volume 0.6-0.7 for gentle presence
     * - Slower speech rate for calm energy
     * - Avoid exclamations - gentle acknowledgments
     */
    getPersonaRecoveryPhrase(personaId) {
        // Map using canonical IDs - all softened for gentle transitions
        const personaRecoveries = {
            'nayan-patel': [
                '<break time="400ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Please, go ahead. I\'m listening.',
                '<break time="350ms"/><volume ratio="0.6"/><speed ratio="0.9"/>Mm, forgive me. Continue.',
                '<break time="400ms"/><volume ratio="0.65"/>What were you saying?',
            ],
            'peter-john': [
                '<break time="300ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Go ahead, go ahead.',
                '<break time="350ms"/><volume ratio="0.65"/>Tell me what you\'re thinking.',
                '<break time="300ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Sorry, go on.',
            ],
            ferni: [
                '<break time="350ms"/><volume ratio="0.65"/><speed ratio="0.9"/>What\'s on your mind?',
                '<break time="400ms"/><volume ratio="0.6"/>Go ahead, I want to hear this.',
                '<break time="350ms"/><volume ratio="0.65"/><speed ratio="0.85"/>Tell me.',
            ],
            'maya-santos': [
                '<break time="400ms"/><volume ratio="0.6"/><speed ratio="0.85"/>Please, go ahead.',
                '<break time="350ms"/><volume ratio="0.65"/><speed ratio="0.9"/>Mm, I want to hear this.',
                '<break time="400ms"/><volume ratio="0.6"/>Take your time. I\'m listening.',
            ],
            'alex-chen': [
                '<break time="350ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Go ahead.',
                '<break time="300ms"/><volume ratio="0.65"/>Yes? What were you saying?',
                '<break time="350ms"/><volume ratio="0.7"/>I\'m listening.',
            ],
            'jordan-taylor': [
                '<break time="300ms"/><volume ratio="0.7"/><speed ratio="0.9"/>Tell me.',
                '<break time="350ms"/><volume ratio="0.65"/>What is it?',
                '<break time="300ms"/><volume ratio="0.7"/>Go ahead, I want to hear.',
            ],
        };
        // Resolve to canonical ID for consistent lookup
        const canonicalId = getCanonicalPersonaId(personaId);
        const phrases = personaRecoveries[canonicalId] || personaRecoveries['ferni'];
        if (!phrases || phrases.length === 0) {
            return this.getRecoveryPhrase();
        }
        return seededPick(`${Date.now()}:155`, phrases) ?? phrases[0];
    }
    /**
     * Determine if Jack should give shorter responses
     * (user wants to talk more)
     */
    shouldShortenNextResponse() {
        // Recent interruptions suggest user wants to talk
        const recentInterruptions = this.interruptionHistory.filter((e) => Date.now() - e.timestamp < 60000 // Last minute
        ).length;
        return recentInterruptions > 2;
    }
    /**
     * Get guidance for response length
     */
    getResponseLengthGuidance() {
        if (this.shouldShortenNextResponse()) {
            return 'Keep responses brief (1-2 sentences). User wants to talk more.';
        }
        if (this.interruptionCount === 0) {
            return "User hasn't interrupted. Can elaborate more naturally.";
        }
        return "Normal response length. Listen for user's pace.";
    }
    /**
     * Set agent speaking state
     */
    setAgentSpeaking(speaking, utterance) {
        this.agentCurrentlySpeaking = speaking;
        if (utterance) {
            this.currentAgentUtterance = utterance;
        }
    }
    /**
     * Get interruption statistics
     */
    getStats() {
        const recentInterruptions = this.interruptionHistory.filter((e) => Date.now() - e.timestamp < 60000).length;
        return {
            totalInterruptions: this.interruptionCount,
            recentInterruptions,
            shouldYield: this.shouldShortenNextResponse(),
            guidance: this.getResponseLengthGuidance(),
        };
    }
    /**
     * Reset interruption tracking (new session)
     */
    reset() {
        this.interruptionCount = 0;
        this.lastInterruptionTime = 0;
        this.interruptionHistory = [];
        this.currentAgentUtterance = '';
        this.agentCurrentlySpeaking = false;
    }
    /**
     * Estimate audio energy from frame using RMS (Root Mean Square)
     * Returns normalized energy level from 0.0 (silence) to 1.0 (max)
     */
    estimateEnergy(frame) {
        try {
            // Get audio data buffer
            const { data } = frame;
            if (!data || data.length === 0) {
                return 0;
            }
            const { samplesPerChannel } = frame;
            const channels = frame.channels || 1;
            const totalSamples = samplesPerChannel * channels;
            // For 16-bit PCM audio (most common), samples are Int16
            // Each sample is 2 bytes, values range from -32768 to 32767
            const bytesPerSample = 2;
            const numSamples = Math.min(totalSamples, Math.floor(data.length / bytesPerSample));
            if (numSamples === 0) {
                return 0;
            }
            // Calculate RMS energy
            let sumSquares = 0;
            for (let i = 0; i < numSamples; i++) {
                const offset = i * bytesPerSample;
                // Read signed 16-bit little-endian sample
                const sample = (data[offset + 1] << 8) | data[offset];
                // Convert to signed value
                const signedSample = sample > 32767 ? sample - 65536 : sample;
                // Normalize to -1.0 to 1.0 range
                const normalized = signedSample / 32768;
                sumSquares += normalized * normalized;
            }
            // RMS = sqrt(sum of squares / n)
            const rms = Math.sqrt(sumSquares / numSamples);
            // RMS typically ranges 0-1, but speech usually peaks around 0.1-0.4
            // Normalize to make speech register around 0.5-0.8
            const normalized = Math.min(1.0, rms * 3);
            return normalized;
        }
        catch (error) {
            getLogger().warn({ error }, 'Error estimating audio energy');
            // Fallback to moderate energy on error
            return 0.5;
        }
    }
    /**
     * Check if audio level indicates speech (above silence threshold)
     */
    isSpeechDetected(frame, silenceThreshold = 0.15) {
        const energy = this.estimateEnergy(frame);
        return energy > silenceThreshold;
    }
    /**
     * Get detailed energy analysis for debugging/logging
     */
    analyzeAudio(frame) {
        const energy = this.estimateEnergy(frame);
        return {
            energy,
            isSpeech: energy > 0.15,
            isLoud: energy > 0.6,
            isSilence: energy < 0.05,
        };
    }
}
// Singleton instance
let defaultHandler = null;
/**
 * Get global interruption handler
 */
export function getInterruptionHandler() {
    if (!defaultHandler) {
        defaultHandler = new InterruptionHandler();
    }
    return defaultHandler;
}
/**
 * Reset global interruption handler
 */
export function resetInterruptionHandler() {
    if (defaultHandler) {
        defaultHandler.reset();
    }
}
//# sourceMappingURL=interruption-handler.js.map