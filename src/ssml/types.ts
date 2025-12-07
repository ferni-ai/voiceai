/**
 * SSML Types
 *
 * Type definitions for the SSML tagger module.
 */

export interface PronunciationEntry {
  pattern: RegExp;
  replacement: string;
  description?: string;
}

export interface TaggingContext {
  emotion: string;
  baseSpeed: number;
  baseVolume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
  hasLaughter: boolean;
  hasSigh: boolean;
  hasDisfluency: boolean;
  hasRepetition: boolean;
  hasSarcasm: boolean;
}

export interface DetectedPacing {
  speed: number;
  reason: string;
}

export interface DetectedVolume {
  volume: number;
  hasEmphasis: boolean;
  hasWhisper: boolean;
}

export interface DetectedVocalCues {
  hasLaughter: boolean;
  hasSigh: boolean;
  hasDisfluency: boolean;
  hasRepetition: boolean;
  hasSarcasm: boolean;
  laughterCount?: number;
}

// Cartesia emotion types
export const CARTESIA_EMOTIONS = {
  ANGRY: 'angry',
  SAD: 'sad',
  SURPRISED: 'surprised',
  CURIOUS: 'curious',
  AFFECTIONATE: 'affectionate',
  // Extended neutral states (no SSML tag)
  NEUTRAL: 'neutral',
  CALM: 'calm',
  THOUGHTFUL: 'thoughtful',
  CONFIDENT: 'confident',
  WARM: 'warm',
} as const;

export type CartesiaEmotion = (typeof CARTESIA_EMOTIONS)[keyof typeof CARTESIA_EMOTIONS];
