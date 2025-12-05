/**
 * SSML Type Definitions
 * Shared types for the SSML tagging system
 */

/**
 * Pronunciation entry for the financial dictionary
 */
export interface PronunciationEntry {
  pattern: RegExp;
  replacement: string;
  description?: string;
}

/**
 * Supported emotion types from text analysis
 */
export type EmotionType = 'angry' | 'sad' | 'surprised' | 'curious' | 'affectionate' | null;

/**
 * Vocal cues detected in text
 */
export interface VocalCues {
  hasLaughter: boolean;
  hasSigh: boolean;
  laughterCount: number;
}

/**
 * Volume analysis result
 */
export interface VolumeAnalysis {
  volume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
}

/**
 * Pacing analysis result
 */
export interface PacingAnalysis {
  speed: number;
  reason: string;
}

/**
 * Context for SSML tagging
 */
export interface TaggingContext {
  emotion?: string;
  baseSpeed: number;
  baseVolume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
  hasLaughter: boolean;
  hasSigh: boolean;
  sentenceCount: number;
  avgSentenceLength: number;
}
