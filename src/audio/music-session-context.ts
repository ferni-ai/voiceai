/**
 * Music Session Context Tracker
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When music plays, it's not just background noise — it's a MOMENT in the conversation.
 * This module tracks WHY music started so we can return to the conversation intelligently.
 *
 * Example scenarios:
 * - User shared something heavy → Ferni played calming music → Music ends
 *   → DON'T say "Ready to continue?" → DO stay quiet or say "I'm here."
 *
 * - User celebrated a win → Ferni played upbeat music → Music ends
 *   → DON'T say generic "That was nice" → DO say "That felt good! What's next?"
 *
 * - User asked for music while thinking → Music ends
 *   → Reference what they were thinking about → "So... that decision you mentioned?"
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Why did music start playing?
 * This dramatically affects how we should transition back.
 */
export type MusicStartReason =
  | 'emotional_processing' // User was processing heavy emotions
  | 'celebration' // Celebrating a win or good news
  | 'comfort' // Providing comfort during difficult moment
  | 'thinking' // User asked for music while they think
  | 'background' // Just casual background vibes
  | 'user_request' // User specifically requested a song/artist
  | 'agent_offer' // Agent proactively offered music
  | 'game' // Music for a game (Name That Tune, etc.)
  | 'unknown'; // Fallback

/**
 * Full context about the music session
 */
export interface MusicSessionContext {
  /** Why music started playing */
  startReason: MusicStartReason;

  /** The track that was played */
  trackName?: string;
  trackArtist?: string;

  /** Conversation state BEFORE music started */
  topicBeforeMusic?: string;
  lastUserMessageBeforeMusic?: string;
  emotionalToneBeforeMusic?: 'heavy' | 'light' | 'neutral' | 'crisis';

  /** User state when music started */
  userEmotionBeforeMusic?: string;
  userEmotionIntensity?: number;

  /** Was the user in the middle of sharing something? */
  wasUserMidThought?: boolean;

  /** Key moments or context to potentially reference */
  memorableMomentsBeforeMusic?: string[];

  /** Relationship context */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';

  /** User's name if known */
  userName?: string;

  /** Timestamps */
  musicStartedAt: number;
  musicEndedAt?: number;

  /** How long did the music play? (affects transition) */
  durationMs?: number;

  /** Was this ambient music or user-requested? */
  wasAmbient: boolean;
}

/**
 * Input for starting music context tracking
 */
export interface MusicContextInput {
  startReason: MusicStartReason;
  trackName?: string;
  trackArtist?: string;
  topicBeforeMusic?: string;
  lastUserMessage?: string;
  emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis';
  userEmotion?: string;
  userEmotionIntensity?: number;
  wasUserMidThought?: boolean;
  memorableMoments?: string[];
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'close_friend';
  userName?: string;
  wasAmbient?: boolean;
}

// ============================================================================
// SESSION STORAGE
// ============================================================================

/**
 * Store music session contexts per session ID
 * This allows multiple concurrent sessions without interference
 */
const sessionContexts = new Map<string, MusicSessionContext>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start tracking a music session
 *
 * Call this when music starts playing to capture the conversation context.
 * This context will be used when music ends to generate intelligent transitions.
 *
 * @param sessionId - The voice session ID
 * @param input - Context about why music is starting
 */
export function startMusicContext(sessionId: string, input: MusicContextInput): void {
  const context: MusicSessionContext = {
    startReason: input.startReason,
    trackName: input.trackName,
    trackArtist: input.trackArtist,
    topicBeforeMusic: input.topicBeforeMusic,
    lastUserMessageBeforeMusic: input.lastUserMessage,
    emotionalToneBeforeMusic: input.emotionalTone,
    userEmotionBeforeMusic: input.userEmotion,
    userEmotionIntensity: input.userEmotionIntensity,
    wasUserMidThought: input.wasUserMidThought,
    memorableMomentsBeforeMusic: input.memorableMoments,
    relationshipStage: input.relationshipStage,
    userName: input.userName,
    musicStartedAt: Date.now(),
    wasAmbient: input.wasAmbient ?? false,
  };

  sessionContexts.set(sessionId, context);

  log.debug(
    {
      sessionId,
      startReason: context.startReason,
      topic: context.topicBeforeMusic,
      emotionalTone: context.emotionalToneBeforeMusic,
      wasAmbient: context.wasAmbient,
    },
    '🎵 Music session context captured'
  );
}

/**
 * Get the current music session context
 *
 * @param sessionId - The voice session ID
 * @returns The music session context, or null if no music is playing
 */
export function getMusicContext(sessionId: string): MusicSessionContext | null {
  return sessionContexts.get(sessionId) ?? null;
}

/**
 * End the music session and calculate duration
 *
 * Call this when music stops to finalize the context.
 *
 * @param sessionId - The voice session ID
 * @returns The finalized music session context with duration
 */
export function endMusicContext(sessionId: string): MusicSessionContext | null {
  const context = sessionContexts.get(sessionId);
  if (!context) {
    return null;
  }

  context.musicEndedAt = Date.now();
  context.durationMs = context.musicEndedAt - context.musicStartedAt;

  log.debug(
    {
      sessionId,
      durationMs: context.durationMs,
      startReason: context.startReason,
    },
    '🎵 Music session context finalized'
  );

  return context;
}

/**
 * Clear the music session context
 *
 * Call this after the transition has been handled.
 *
 * @param sessionId - The voice session ID
 */
export function clearMusicContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
}

/**
 * Infer the music start reason from conversation context
 *
 * Use this when we don't have explicit reason but can infer from context.
 * Enhanced to detect user music requests from their actual words.
 *
 * @param emotionalTone - Recent emotional tone
 * @param lastMessage - Last user message
 * @param wasUserRequested - Did user request music?
 * @param isAmbient - Was this ambient/silence-filling music?
 * @returns Inferred start reason
 */
export function inferMusicStartReason(
  emotionalTone?: 'heavy' | 'light' | 'neutral' | 'crisis',
  lastMessage?: string,
  wasUserRequested?: boolean,
  isAmbient?: boolean
): MusicStartReason {
  // Ambient/silence-filling music
  if (isAmbient) {
    return 'background';
  }

  // User explicitly requested via tool
  if (wasUserRequested) {
    return 'user_request';
  }

  // Check if user's message contains music request keywords
  // This catches "play some jazz", "put on music", etc.
  if (lastMessage) {
    const musicRequestKeywords =
      /\b(play|put on|queue|listen to|hear|music|song|track|tune|album|artist|spotify|jazz|rock|pop|classical|lo-?fi|ambient|chill)\b/i;
    if (musicRequestKeywords.test(lastMessage)) {
      // It's a user request for music
      return 'user_request';
    }

    // Check for celebration keywords
    const celebrationKeywords =
      /\b(got the job|promotion|engaged|pregnant|passed|graduated|won|amazing news|great news|exciting|celebrate|yes!|finally|did it)\b/i;
    if (celebrationKeywords.test(lastMessage)) {
      return 'celebration';
    }

    // Check for thinking/processing keywords
    const thinkingKeywords =
      /\b(let me think|need to think|thinking about|while i think|give me a moment|moment to|second to think)\b/i;
    if (thinkingKeywords.test(lastMessage)) {
      return 'thinking';
    }

    // Check for comfort-seeking keywords
    const comfortKeywords =
      /\b(need (some |a )?(comfort|calm|peace)|feeling (down|sad|overwhelmed|anxious)|hard day|rough day|stressed)\b/i;
    if (comfortKeywords.test(lastMessage)) {
      return 'comfort';
    }
  }

  // Crisis = comfort music
  if (emotionalTone === 'crisis') {
    return 'comfort';
  }

  // Heavy emotional conversation
  if (emotionalTone === 'heavy') {
    return 'emotional_processing';
  }

  // Light mood = background vibes
  if (emotionalTone === 'light') {
    return 'background';
  }

  // Default
  return 'agent_offer';
}

/**
 * Detect if user was mid-thought when music started
 *
 * @param lastMessage - Last user message
 * @returns Whether user seemed to be mid-thought
 */
export function detectMidThought(lastMessage?: string): boolean {
  if (!lastMessage) return false;

  // Trailing off indicators
  const trailingOff = /\.{2,}$|—$|–$|-$|\s+and\s*$|\s+but\s*$/i;
  if (trailingOff.test(lastMessage)) {
    return true;
  }

  // Incomplete sentence patterns
  const incomplete = /\b(because|since|when|if|although|so)\s*$/i;
  if (incomplete.test(lastMessage)) {
    return true;
  }

  // "I was thinking..." type patterns
  const thinking = /^(i was|i've been|i'm)\s+(thinking|wondering|considering)/i;
  if (thinking.test(lastMessage)) {
    return true;
  }

  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startMusicContext,
  getMusicContext,
  endMusicContext,
  clearMusicContext,
  inferMusicStartReason,
  detectMidThought,
};
