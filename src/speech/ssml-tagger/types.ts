/**
 * SSML Tagger Type Definitions
 */

export interface PronunciationEntry {
  pattern: RegExp;
  replacement: string;
  description?: string;
}

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
