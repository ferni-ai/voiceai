/**
 * SSML Detection Functions
 *
 * Functions for detecting emotion, pacing, volume, and vocal cues in text.
 * These functions analyze text to determine appropriate SSML parameters.
 *
 * @module ssml/detection
 */
import type { DetectedPacing, DetectedVocalCues, DetectedVolume } from './types.js';
/**
 * Detect the primary emotion in text using keyword analysis
 * @param text - Text to analyze
 * @returns Detected emotion string
 */
export declare function detectEmotion(text: string): string;
/**
 * Detect appropriate speech pacing for text
 * Analyzes keywords, punctuation, and sentence structure
 * @param text - Text to analyze
 * @returns Speed ratio and reason
 */
export declare function detectPacing(text: string): DetectedPacing;
/**
 * Detect appropriate volume for text
 * Analyzes emphasis keywords, whisper indicators, and caps
 * @param text - Text to analyze
 * @returns Volume ratio and flags
 */
export declare function detectVolume(text: string): DetectedVolume;
/**
 * Detect vocal cues in text (laughter, sighs, disfluencies, etc.)
 * @param text - Text to analyze
 * @returns Detection results for various vocal cues
 */
export declare function detectVocalCues(text: string): DetectedVocalCues;
//# sourceMappingURL=detection.d.ts.map