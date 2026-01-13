/**
 * Speech Naturalizer Types
 *
 * Types for making AI speech sound human through strategic imperfections.
 *
 * @module @ferni/conversation/speech-naturalizer/types
 */
import type { RandomSource } from '../utils/rng.js';
export interface DisfluencyConfig {
    enabled: boolean;
    frequency: number;
    personaStyle: 'minimal' | 'natural' | 'conversational' | 'folksy';
    contextSensitivity: boolean;
}
export interface NaturalizationContext {
    emotion?: string;
    topic?: string;
    isSeriousContext?: boolean;
    isResponding?: boolean;
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
//# sourceMappingURL=types.d.ts.map