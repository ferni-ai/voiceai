/**
 * Speech Naturalizer Types
 *
 * Types for making AI speech sound human through strategic imperfections.
 *
 * @module @ferni/conversation/speech-naturalizer/types
 */

import type { RandomSource } from '../utils/random-generator.js';

export interface DisfluencyConfig {
  enabled: boolean;
  frequency: number; // 0-1, how often to add disfluencies
  personaStyle: 'minimal' | 'natural' | 'conversational' | 'folksy';
  contextSensitivity: boolean; // Reduce disfluencies for serious topics
}

export interface NaturalizationContext {
  emotion?: string;
  topic?: string;
  isSeriousContext?: boolean;
  isResponding?: boolean; // vs initiating
  turnNumber?: number;
  userEnergy?: 'high' | 'medium' | 'low';
  rng?: RandomSource;
  randomSeed?: string;
}

export interface ThinkingPattern {
  type: 'processing' | 'recalling' | 'considering' | 'uncertain';
  phrase: string;
  ssml: string;
}

export interface RandomOptions {
  rng?: RandomSource;
  randomSeed?: string;
  sessionId?: string;
  turnNumber?: number;
}

export interface DisfluencyPatterns {
  fillers: string[];
  hedges: string[];
  repairs: string[];
  thinkingPhrases: string[];
}
