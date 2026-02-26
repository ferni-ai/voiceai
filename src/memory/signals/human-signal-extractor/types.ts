/**
 * Human Signal Extractor — internal types.
 * @module memory/signals/human-signal-extractor/types
 */

import type {
  HumanMemory,
  ImportantDate,
  InsideJoke,
  RunningTheme,
  CoreValue,
  Dream,
  Fear,
  GrowthMarker,
  ChallengeProgress,
  RecurringAvoidance,
  ComfortPattern,
  StressTrigger,
  EmotionalTell,
} from '../../../types/human-memory.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ExtractionContext {
  userId: string;
  personaId: string;
  userName?: string;
  existingMemory?: Partial<HumanMemory>;
  sessionEmotion?: string;
}

export interface ExtractionResult {
  importantDates: ImportantDate[];
  insideJokes: InsideJoke[];
  runningThemes: RunningTheme[];
  values: CoreValue[];
  dreams: Dream[];
  fears: Fear[];
  growthMarkers: GrowthMarker[];
  challenges: ChallengeProgress[];
  avoidances: RecurringAvoidance[];
  comfortPatterns: ComfortPattern[];
  stressTriggers: StressTrigger[];
  emotionalTells: EmotionalTell[];
}
