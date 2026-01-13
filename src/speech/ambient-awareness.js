/**
 * Ambient Sound Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detects ambient environment characteristics from user audio:
 * - Background noise level (quiet room vs coffee shop vs outdoors)
 * - Environmental context clues (typing, TV, traffic)
 * - Acoustic conditions that affect speech clarity
 *
 * This enables Ferni to:
 * 1. Adjust response clarity for noisy environments
 * 2. Acknowledge environmental context ("sounds like you're somewhere busy")
 * 3. Offer appropriate responses ("should we continue this later?")
 *
 * @module AmbientAwareness
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger().child({ module: 'AmbientAwareness' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const AMBIENT_CONFIG = {
    /** Minimum frames needed for reliable analysis */
    MIN_FRAMES_FOR_ANALYSIS: 50,
    /** Rolling window size for noise estimation */
    NOISE_WINDOW_SIZE: 100,
    /** Threshold for "quiet" environment (RMS energy) */
    QUIET_THRESHOLD: 0.015,
    /** Threshold for "noisy" environment */
    NOISY_THRESHOLD: 0.08,
    /** Minimum SNR for clear speech */
    GOOD_SNR_THRESHOLD: 15, // dB
    /** Analysis update interval (ms) */
    UPDATE_INTERVAL_MS: 2000,
};
// ============================================================================
// AMBIENT AWARENESS SERVICE
// ============================================================================
export class AmbientAwarenessService {
    energyHistory = [];
    speechEnergyHistory = [];
    silenceEnergyHistory = [];
    lastAnalysis = null;
    lastAnalysisTime = 0;
    frameCount = 0;
    // Spectral analysis buffers
    spectralHistory = [];
    /**
     * Process an audio frame for ambient analysis
     * Call this with each audio frame (can be same stream as STT)
     */
    processFrame(data, sampleRate, isSpeech) {
        this.frameCount++;
        // Calculate energy
        const energy = this.calculateEnergy(data);
        this.energyHistory.push(energy);
        // Track speech vs non-speech energy separately
        if (isSpeech) {
            this.speechEnergyHistory.push(energy);
        }
        else {
            this.silenceEnergyHistory.push(energy);
        }
        // Keep windows bounded
        if (this.energyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
            this.energyHistory.shift();
        }
        if (this.speechEnergyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
            this.speechEnergyHistory.shift();
        }
        if (this.silenceEnergyHistory.length > AMBIENT_CONFIG.NOISE_WINDOW_SIZE) {
            this.silenceEnergyHistory.shift();
        }
        // Simple spectral analysis (approximation without FFT)
        const spectral = this.estimateSpectralBands(data, sampleRate);
        this.spectralHistory.push(spectral);
        if (this.spectralHistory.length > 50) {
            this.spectralHistory.shift();
        }
    }
    /**
     * Get ambient analysis (cached, updates periodically)
     */
    getAnalysis() {
        const now = Date.now();
        // Return cached if recent
        if (this.lastAnalysis && now - this.lastAnalysisTime < AMBIENT_CONFIG.UPDATE_INTERVAL_MS) {
            return this.lastAnalysis;
        }
        // Perform new analysis
        this.lastAnalysis = this.analyze();
        this.lastAnalysisTime = now;
        return this.lastAnalysis;
    }
    /**
     * Perform ambient environment analysis
     */
    analyze() {
        // Default result for insufficient data
        if (this.energyHistory.length < AMBIENT_CONFIG.MIN_FRAMES_FOR_ANALYSIS) {
            return {
                environment: 'unknown',
                confidence: 0,
                noiseLevel: 0,
                snrEstimate: 20, // Assume good until proven otherwise
                backgroundElements: [],
                recommendations: {
                    speakClearer: false,
                    offerToPause: false,
                    increaseVolume: false,
                    addPauses: false,
                    acknowledgment: null,
                },
            };
        }
        // Calculate noise floor (from non-speech frames)
        const noiseFloor = this.silenceEnergyHistory.length > 10
            ? this.percentile(this.silenceEnergyHistory, 0.3)
            : this.percentile(this.energyHistory, 0.1);
        // Calculate speech level (from speech frames)
        const speechLevel = this.speechEnergyHistory.length > 10
            ? this.percentile(this.speechEnergyHistory, 0.7)
            : this.percentile(this.energyHistory, 0.9);
        // Calculate SNR
        const snrLinear = speechLevel / Math.max(noiseFloor, 0.001);
        const snrEstimate = 20 * Math.log10(snrLinear);
        // Normalize noise level
        const noiseLevel = Math.min(1, noiseFloor / AMBIENT_CONFIG.NOISY_THRESHOLD);
        // Detect environment type
        const { environment, confidence } = this.classifyEnvironment(noiseFloor, snrEstimate);
        // Detect background elements
        const backgroundElements = this.detectBackgroundElements();
        // Build recommendations
        const recommendations = this.buildRecommendations(environment, noiseLevel, snrEstimate, backgroundElements);
        const result = {
            environment,
            confidence,
            noiseLevel,
            snrEstimate,
            backgroundElements,
            recommendations,
        };
        // Log significant changes
        if (!this.lastAnalysis ||
            this.lastAnalysis.environment !== environment ||
            Math.abs(this.lastAnalysis.noiseLevel - noiseLevel) > 0.2) {
            log.debug({
                environment,
                confidence: confidence.toFixed(2),
                noiseLevel: noiseLevel.toFixed(2),
                snrEstimate: snrEstimate.toFixed(1),
            }, '🔊 Ambient environment analyzed');
        }
        return result;
    }
    /**
     * Classify environment type based on audio characteristics
     */
    classifyEnvironment(noiseFloor, snr) {
        // Quiet room: very low noise, high SNR
        if (noiseFloor < AMBIENT_CONFIG.QUIET_THRESHOLD && snr > 20) {
            return { environment: 'quiet_room', confidence: 0.85 };
        }
        // Office: moderate noise, good SNR
        if (noiseFloor < 0.04 && snr > 12) {
            return { environment: 'office', confidence: 0.7 };
        }
        // Noisy: high noise floor
        if (noiseFloor > AMBIENT_CONFIG.NOISY_THRESHOLD) {
            // Check spectral characteristics for more specific classification
            const avgSpectral = this.averageSpectral();
            // Traffic: high low-band (bass)
            if (avgSpectral.lowBand > avgSpectral.midBand * 1.5) {
                return { environment: 'car', confidence: 0.6 };
            }
            // Coffee shop: high mid-band (voices)
            if (avgSpectral.midBand > avgSpectral.lowBand * 1.3) {
                return { environment: 'coffee_shop', confidence: 0.6 };
            }
            return { environment: 'noisy', confidence: 0.5 };
        }
        // Default to unknown
        return { environment: 'unknown', confidence: 0.3 };
    }
    /**
     * Detect specific background elements
     */
    detectBackgroundElements() {
        const elements = [];
        const avgSpectral = this.averageSpectral();
        // High low-frequency = rumble/traffic
        if (avgSpectral.lowBand > 0.03) {
            elements.push({
                type: 'traffic',
                confidence: Math.min(0.7, avgSpectral.lowBand / 0.05),
                persistent: true,
            });
        }
        // High mid-frequency during silence = background music or TV
        if (avgSpectral.midBand > 0.02 && this.silenceEnergyHistory.length > 20) {
            const silenceEnergy = this.average(this.silenceEnergyHistory);
            if (silenceEnergy > 0.015) {
                elements.push({
                    type: 'music',
                    confidence: 0.5,
                    persistent: true,
                });
            }
        }
        return elements;
    }
    /**
     * Build recommendations based on analysis
     */
    buildRecommendations(environment, noiseLevel, snr, elements) {
        const recommendations = {
            speakClearer: false,
            offerToPause: false,
            increaseVolume: false,
            addPauses: false,
            acknowledgment: null,
        };
        // Noisy environments need clearer speech
        if (noiseLevel > 0.5 || snr < 10) {
            recommendations.speakClearer = true;
            recommendations.addPauses = true;
        }
        // Very noisy - offer to pause
        if (noiseLevel > 0.7 || snr < 6) {
            recommendations.offerToPause = true;
            recommendations.acknowledgment =
                "It sounds pretty busy there. Want to continue this later when it's quieter?";
        }
        // Moderate noise - just increase volume
        if (noiseLevel > 0.3 && noiseLevel <= 0.5) {
            recommendations.increaseVolume = true;
        }
        // Environment-specific acknowledgments (used sparingly)
        if (environment === 'car' && !recommendations.acknowledgment) {
            recommendations.acknowledgment = "Sounds like you're on the road. I'll keep it brief.";
        }
        // Background music detected
        const musicElement = elements.find((e) => e.type === 'music');
        if (musicElement && musicElement.confidence > 0.6 && !recommendations.acknowledgment) {
            recommendations.acknowledgment = null; // Don't comment on background music
        }
        return recommendations;
    }
    /**
     * Calculate RMS energy
     */
    calculateEnergy(data) {
        let sumSquares = 0;
        const samples = data.length;
        if (data instanceof Int16Array) {
            for (let i = 0; i < samples; i++) {
                const normalized = data[i] / 32768;
                sumSquares += normalized * normalized;
            }
        }
        else {
            for (let i = 0; i < samples; i++) {
                sumSquares += data[i] * data[i];
            }
        }
        return Math.sqrt(sumSquares / samples);
    }
    /**
     * Estimate spectral bands (simple approximation without FFT)
     * Uses zero-crossing rate and energy distribution
     */
    estimateSpectralBands(data, sampleRate) {
        // This is a simplified spectral estimation
        // A full implementation would use FFT
        // Zero-crossing rate correlates with high-frequency content
        let zeroCrossings = 0;
        const samples = data.length;
        const normalize = data instanceof Int16Array ? 32768 : 1;
        for (let i = 1; i < samples; i++) {
            const prev = data[i - 1] / normalize;
            const curr = data[i] / normalize;
            if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
                zeroCrossings++;
            }
        }
        const zcrPerSec = (zeroCrossings / samples) * sampleRate;
        // Approximate band energies based on ZCR
        // Low ZCR = low frequency dominant
        // High ZCR = high frequency dominant
        const totalEnergy = this.calculateEnergy(data);
        const highRatio = Math.min(1, zcrPerSec / 3000);
        const lowRatio = 1 - highRatio;
        return {
            lowBand: totalEnergy * lowRatio * 0.7,
            midBand: totalEnergy * 0.5,
            highBand: totalEnergy * highRatio * 0.3,
        };
    }
    /**
     * Get average spectral characteristics
     */
    averageSpectral() {
        if (this.spectralHistory.length === 0) {
            return { lowBand: 0, midBand: 0, highBand: 0 };
        }
        const sum = this.spectralHistory.reduce((acc, s) => ({
            lowBand: acc.lowBand + s.lowBand,
            midBand: acc.midBand + s.midBand,
            highBand: acc.highBand + s.highBand,
        }), { lowBand: 0, midBand: 0, highBand: 0 });
        const n = this.spectralHistory.length;
        return {
            lowBand: sum.lowBand / n,
            midBand: sum.midBand / n,
            highBand: sum.highBand / n,
        };
    }
    /**
     * Calculate percentile
     */
    percentile(arr, p) {
        const sorted = [...arr].sort((a, b) => a - b);
        const index = Math.floor(sorted.length * p);
        return sorted[index] || 0;
    }
    /**
     * Calculate average
     */
    average(arr) {
        if (arr.length === 0)
            return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    /**
     * Reset service state
     */
    reset() {
        this.energyHistory = [];
        this.speechEnergyHistory = [];
        this.silenceEnergyHistory = [];
        this.spectralHistory = [];
        this.lastAnalysis = null;
        this.lastAnalysisTime = 0;
        this.frameCount = 0;
        log.debug('🔊 Ambient awareness reset');
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const ambientAwarenessRegistry = createSessionRegistry((sessionId) => new AmbientAwarenessService(), { name: 'AmbientAwareness', cleanup: (service) => service.reset(), verbose: false });
registerGlobalRegistry(ambientAwarenessRegistry);
/**
 * Get or create ambient awareness service for a session
 */
export function getAmbientAwarenessService(sessionId) {
    return ambientAwarenessRegistry.get(sessionId);
}
/**
 * Reset ambient awareness for a session
 */
export function resetAmbientAwareness(sessionId) {
    ambientAwarenessRegistry.reset(sessionId);
}
export function getActiveAmbientAwarenessCount() {
    return ambientAwarenessRegistry.getActiveCount();
}
/**
 * Reset all instances
 */
export function resetAllAmbientAwareness() {
    ambientAwarenessRegistry.resetAll();
}
//# sourceMappingURL=ambient-awareness.js.map