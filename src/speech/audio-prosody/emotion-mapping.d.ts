/**
 * Emotion Mapping
 *
 * Maps prosodic features to emotional dimensions and classifications.
 * Uses Russell's circumplex model for emotional dimensions (VAD).
 */
import type { EmotionalDimensions, EmotionClassification, ProsodyFeatures } from './types.js';
/**
 * Map prosodic features to emotional dimensions (VAD model)
 */
export declare function mapToEmotionalDimensions(prosody: ProsodyFeatures, baseline: {
    pitch: number;
    energy: number;
    rate: number;
}, calibrated: boolean): EmotionalDimensions;
/**
 * Classify emotion based on VAD dimensions and prosody features
 */
export declare function classifyEmotion(dimensions: EmotionalDimensions, prosody: ProsodyFeatures): EmotionClassification;
/**
 * Calculate stress level from prosody and dimensions
 */
export declare function calculateStressLevel(prosody: ProsodyFeatures, dimensions: EmotionalDimensions): number;
/**
 * Detect anxiety markers from prosody features
 */
export declare function detectAnxietyMarkers(prosody: ProsodyFeatures): boolean;
/**
 * Smooth features over history for more stable readings
 */
export declare function smoothFeatures(history: ProsodyFeatures[]): ProsodyFeatures;
//# sourceMappingURL=emotion-mapping.d.ts.map