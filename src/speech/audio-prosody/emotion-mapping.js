/**
 * Emotion Mapping
 *
 * Maps prosodic features to emotional dimensions and classifications.
 * Uses Russell's circumplex model for emotional dimensions (VAD).
 */
// ============================================================================
// EMOTION PROTOTYPES
// ============================================================================
/**
 * Define emotion prototypes in VAD (Valence-Arousal-Dominance) space
 */
const EMOTION_PROTOTYPES = {
    neutral: { v: 0, a: 0, d: 0 },
    happy: { v: 0.8, a: 0.5, d: 0.3 },
    sad: { v: -0.7, a: -0.5, d: -0.3 },
    angry: { v: -0.5, a: 0.7, d: 0.7 },
    fearful: { v: -0.6, a: 0.7, d: -0.5 },
    anxious: { v: -0.4, a: 0.5, d: -0.3 },
    excited: { v: 0.6, a: 0.8, d: 0.4 },
    bored: { v: -0.2, a: -0.6, d: -0.2 },
    confused: { v: -0.2, a: 0.2, d: -0.4 },
    contempt: { v: -0.4, a: 0.2, d: 0.5 },
    disgusted: { v: -0.6, a: 0.3, d: 0.2 },
    surprised: { v: 0.2, a: 0.7, d: 0 },
};
/**
 * Pitch contour scores for valence calculation
 */
const CONTOUR_SCORES = {
    rising: 0.3,
    dynamic: 0.1,
    flat: -0.1,
    falling: -0.3,
};
// ============================================================================
// DIMENSION MAPPING
// ============================================================================
/**
 * Map prosodic features to emotional dimensions (VAD model)
 */
export function mapToEmotionalDimensions(prosody, baseline, calibrated) {
    // Helper to ensure finite values (guard against NaN from edge cases)
    const safeNumber = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback);
    // Arousal: high pitch variance, high energy, fast rate = high arousal
    const pitchDeviation = calibrated && baseline.pitch > 0
        ? safeNumber((prosody.pitchMean - baseline.pitch) / baseline.pitch)
        : 0;
    const energyDeviation = calibrated ? safeNumber((prosody.energyMean - baseline.energy) / 20) : 0;
    const rateDeviation = calibrated && baseline.rate > 0
        ? safeNumber((prosody.speechRate - baseline.rate) / baseline.rate)
        : 0;
    const arousal = clamp(safeNumber(pitchDeviation * 0.3) +
        safeNumber(energyDeviation * 0.3) +
        safeNumber(rateDeviation * 0.2) +
        safeNumber((prosody.pitchVariance / 200) * 0.2), -1, 1);
    // Valence: rising pitch, varied energy = positive; flat/falling = negative
    const contourScore = CONTOUR_SCORES[prosody.pitchContour] ?? 0;
    const valence = clamp(safeNumber(contourScore) +
        safeNumber((prosody.speakingRatio - 0.5) * 0.3) +
        safeNumber((prosody.pitchRange / 100) * 0.2) -
        safeNumber(prosody.breathiness * 0.3), -1, 1);
    // Dominance: loud, fast, low pitch = dominant
    const dominance = clamp(safeNumber(energyDeviation * 0.4) +
        safeNumber(rateDeviation * 0.2) -
        safeNumber(pitchDeviation * 0.2) +
        safeNumber(prosody.energyPeaks * 0.05), -1, 1);
    return { valence, arousal, dominance };
}
// ============================================================================
// EMOTION CLASSIFICATION
// ============================================================================
/**
 * Classify emotion based on VAD dimensions and prosody features
 */
export function classifyEmotion(dimensions, prosody) {
    const { valence, arousal, dominance } = dimensions;
    // Find closest emotion prototype
    let bestEmotion = 'neutral';
    let minDistance = Infinity;
    for (const [emotion, proto] of Object.entries(EMOTION_PROTOTYPES)) {
        const distance = Math.sqrt(Math.pow(valence - proto.v, 2) +
            Math.pow(arousal - proto.a, 2) +
            Math.pow(dominance - proto.d, 2));
        if (distance < minDistance) {
            minDistance = distance;
            bestEmotion = emotion;
        }
    }
    // Calculate confidence based on distance (closer = more confident)
    const maxDistance = Math.sqrt(12); // Max possible distance in VAD space
    // Guard against NaN/Infinity from bad input data
    const normalizedDistance = Number.isFinite(minDistance) ? minDistance : maxDistance;
    const confidence = Math.max(0, Math.min(1, 1 - normalizedDistance / maxDistance));
    // Boost confidence if prosodic features strongly support the emotion
    let boostedConfidence = confidence;
    // High jitter/shimmer + negative valence = fearful/anxious
    if ((bestEmotion === 'fearful' || bestEmotion === 'anxious') && prosody.jitter > 0.05) {
        boostedConfidence = Math.min(1, boostedConfidence + 0.1);
    }
    // Fast rate + high energy = angry/excited
    if ((bestEmotion === 'angry' || bestEmotion === 'excited') && prosody.speechRate > 5) {
        boostedConfidence = Math.min(1, boostedConfidence + 0.1);
    }
    return { emotion: bestEmotion, confidence: boostedConfidence };
}
// ============================================================================
// STRESS INDICATORS
// ============================================================================
/**
 * Calculate stress level from prosody and dimensions
 */
export function calculateStressLevel(prosody, dimensions) {
    // Stress indicators: high pitch variance, fast rate, high jitter
    return clamp(Math.abs(dimensions.arousal) * 0.3 +
        prosody.jitter * 5 +
        prosody.shimmer * 3 +
        (prosody.speechRate > 5 ? (prosody.speechRate - 5) * 0.1 : 0) +
        (prosody.pitchVariance / 300) * 0.2, 0, 1);
}
/**
 * Detect anxiety markers from prosody features
 */
export function detectAnxietyMarkers(prosody) {
    // Anxiety markers: trembling voice, rapid speech, frequent pauses
    return (prosody.jitter > 0.05 ||
        prosody.shimmer > 0.1 ||
        prosody.speechRate > 6 ||
        prosody.pauseFrequency > 15 ||
        prosody.breathiness > 0.3);
}
// ============================================================================
// UTILITIES
// ============================================================================
/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Smooth features over history for more stable readings
 */
export function smoothFeatures(history) {
    if (history.length === 1)
        return history[0];
    // Weighted average favoring recent samples
    const weights = history.map((_, i) => Math.pow(2, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const smoothed = { ...history[history.length - 1] };
    // Type-safe smoothing for numeric properties
    const smoothNumeric = (key) => {
        if (typeof smoothed[key] === 'number') {
            let weightedSum = 0;
            for (let i = 0; i < history.length; i++) {
                const value = history[i][key];
                if (typeof value === 'number') {
                    weightedSum += value * weights[i];
                }
            }
            // Use Object.assign to maintain type safety
            Object.assign(smoothed, { [key]: weightedSum / totalWeight });
        }
    };
    // Apply smoothing to all numeric properties
    smoothNumeric('pitchMean');
    smoothNumeric('pitchVariance');
    smoothNumeric('pitchRange');
    smoothNumeric('energyMean');
    smoothNumeric('energyVariance');
    smoothNumeric('energyPeaks');
    smoothNumeric('speechRate');
    smoothNumeric('pauseDuration');
    smoothNumeric('pauseFrequency');
    smoothNumeric('jitter');
    smoothNumeric('shimmer');
    smoothNumeric('breathiness');
    smoothNumeric('utteranceDuration');
    smoothNumeric('speakingRatio');
    return smoothed;
}
//# sourceMappingURL=emotion-mapping.js.map