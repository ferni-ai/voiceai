/**
 * What the turn handler hands semantic intelligence for one caller turn
 * (integration.ts processSemanticIntelligence).
 *
 * @module services/superhuman/semantic-intelligence/turn-semantic-data
 */

/**
 * Data extracted from a user turn for semantic intelligence
 */
export interface TurnSemanticData {
  userId: string;
  sessionId: string;
  personaId: string;
  turnNumber: number;

  /**
   * The turn's crisis read replaced, guided or soft-checked the reply (crisisReadTurn,
   * agents/voice-agent/crisis-turn-memory.ts). Only `false` feeds the systems below; true or a
   * missing value skips the whole turn.
   */
  crisisTurn: boolean;

  // Text data
  userText: string;
  topic?: string;
  topics?: string[];

  // Emotional data
  textEmotion?: string;
  textEmotionIntensity?: number;
  voiceEmotion?: string;
  voiceEmotionConfidence?: number;
  voiceEmotionIntensity?: number;

  // Voice prosody
  speechRate?: number;
  pitch?: number;
  energy?: number;
  breathiness?: number;

  // Temporal context
  timestamp: Date;
  dayOfWeek: number;
  hourOfDay: number;

  // Relationship/conversation context
  turnsSinceStart: number;
  sessionCount?: number;
  relationshipStage?: string;

  // Person mentions (enhanced V3.1)
  mentionedPerson?: string;
}
