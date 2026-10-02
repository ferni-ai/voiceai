/**
 * STM Buffer - types
 *
 * @module memory/dynamic/stm-buffer.types
 */

import type { EntityMention, EmotionSignal } from './fast-capture.js';

/** Voice-derived emotion snapshot (from prosody analysis) */
export interface VoiceEmotionSnapshot {
  primary: string;
  confidence: number;
  stressLevel: number;
  valence: number;
  arousal: number;
}

export interface TurnMemory {
  turnNumber: number;
  transcript: string;
  timestamp: Date;
  entities: EntityMention[];
  emotions: EmotionSignal[];
  topics: string[];
  personaId?: string;
  /** Voice-derived emotion (from prosody), distinct from keyword-based emotions */
  voiceEmotion?: VoiceEmotionSnapshot;
}

export interface EntityFrequency {
  name: string;
  type: EntityMention['type'];
  mentionCount: number;
  lastMentioned: Date;
  contexts: string[];
}

export interface SessionSTM {
  sessionId: string;
  userId: string;
  turns: TurnMemory[];
  entityFrequency: Map<string, EntityFrequency>;
  topicHistory: string[];
  createdAt: Date;
  lastAccessedAt: Date;
}
