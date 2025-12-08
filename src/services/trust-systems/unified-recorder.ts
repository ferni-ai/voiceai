/**
 * Unified Trust Systems Data Recorder
 *
 * Central orchestrator for recording trust-building data across all systems.
 * This ensures all trust systems stay in sync and get the data they need.
 *
 * @module UnifiedRecorder
 */

import { createLogger } from '../../utils/safe-logger.js';

// Import trust system modules
import { trackEvent } from './analytics.js';
import { detectNewBoundary } from './boundary-memory.js';
import type { WinType } from './celebration-momentum.js';
import { recordWin } from './celebration-momentum.js';
import { recordResponse } from './growth-reflection.js';
import { detectCallbackMoment } from './inside-jokes.js';
import { recordPersonaInteraction, type PersonaId } from './persona-specific-learning.js';
import { recordEmotionalSnapshot, type EmotionCategory } from './sentiment-timeline.js';
import { detectIntention, detectSmallWin, recordCelebrationResponse } from './small-wins.js';

const log = createLogger({ module: 'UnifiedRecorder' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurnData {
  userId: string;
  text: string;
  personaId?: string;
  timestamp?: Date;
  analysis?: {
    emotion?: {
      primary: string;
      intensity: number;
      secondaryEmotions?: string[];
    };
    topic?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    intent?: string;
  };
  voiceData?: {
    pace?: number;
    energy?: number;
    pausePattern?: number[];
    pitchVariance?: number;
  };
}

export interface SessionEndData {
  userId: string;
  sessionDurationMinutes: number;
  turnCount: number;
  topicsDiscussed?: string[];
  emotionalArc?: Array<{
    emotion: string;
    timestamp: Date;
  }>;
  personaId?: string;
}

export interface WinData {
  userId: string;
  type: 'effort' | 'progress' | 'breakthrough' | 'consistency' | 'courage' | 'self_awareness';
  description: string;
  context?: string;
  magnitude?: 'tiny' | 'small' | 'medium' | 'large';
}

export interface BoundaryData {
  userId: string;
  topic: string;
  severity?: 'soft' | 'firm' | 'absolute';
  reason?: string;
  source?: 'explicit' | 'inferred';
}

export interface JournalResponseData {
  userId: string;
  promptId: string;
  response: string;
  emotionBeforeWriting?: string;
  emotionAfterWriting?: string;
}

export interface MediaInteraction {
  userId: string;
  mediaType: string;
  mediaId?: string;
  action: 'played' | 'skipped' | 'liked' | 'disliked';
  context?: string;
}

// Map WinData.type to celebration-momentum WinType
const WIN_TYPE_MAP: Record<WinData['type'], WinType> = {
  effort: 'effort_made',
  progress: 'followed_through',
  breakthrough: 'breakthrough',
  consistency: 'consistency',
  courage: 'courage_moment',
  self_awareness: 'showed_up',
};

// ============================================================================
// CONVERSATION TURN RECORDING
// ============================================================================

/**
 * Record a conversation turn across all trust systems
 *
 * This is the main entry point for recording user messages.
 * It distributes data to all relevant trust systems.
 */
export async function recordConversationTurn(data: ConversationTurnData): Promise<void> {
  const { userId, text, personaId, analysis } = data;

  try {
    // 1. Record emotional snapshot if we have emotion data
    if (analysis?.emotion) {
      try {
        recordEmotionalSnapshot(userId, {
          primaryEmotion: analysis.emotion.primary as EmotionCategory,
          secondaryEmotions: (analysis.emotion.secondaryEmotions || []) as EmotionCategory[],
          intensity: analysis.emotion.intensity,
          source: 'detected',
        });
      } catch (e) {
        log.debug({ error: e }, 'Emotional snapshot recording failed (non-blocking)');
      }
    }

    // 2. Detect any boundaries being expressed
    if (analysis?.topic) {
      try {
        detectNewBoundary(userId, text, {
          currentTopic: analysis.topic,
          emotionDetected: analysis.emotion?.primary,
          emotionIntensity: analysis.emotion?.intensity,
        });
      } catch (e) {
        log.debug({ error: e }, 'Boundary detection failed (non-blocking)');
      }
    }

    // 3. Record growth response
    if (analysis?.topic && analysis?.emotion) {
      try {
        recordResponse(userId, analysis.topic, text, analysis.emotion.primary, analysis.topic);
      } catch (e) {
        log.debug({ error: e }, 'Growth response recording failed (non-blocking)');
      }
    }

    // 4. Detect small wins (returns SmallWin | null)
    try {
      const win = detectSmallWin(userId, text, {
        topic: analysis?.topic,
        emotion: analysis?.emotion?.primary,
      });
      if (win) {
        log.debug({ userId, winType: win.type }, '🎉 Small win detected');
      }
    } catch (e) {
      log.debug({ error: e }, 'Small win detection failed (non-blocking)');
    }

    // 5. Detect intentions (things user says they'll do)
    try {
      const intention = detectIntention(userId, text);
      if (intention) {
        log.debug({ userId, intention: intention.intention }, '📌 Intention detected');
      }
    } catch (e) {
      log.debug({ error: e }, 'Intention detection failed (non-blocking)');
    }

    // 6. Detect callback moments (inside jokes, shared memories)
    try {
      detectCallbackMoment(userId, text, {
        topic: analysis?.topic,
        emotion: analysis?.emotion?.primary,
      });
    } catch (e) {
      log.debug({ error: e }, 'Callback moment detection failed (non-blocking)');
    }

    // 7. Track analytics event
    try {
      trackEvent({
        userId,
        system: 'reading_between_lines',
        eventType: 'detected',
        details: {
          hasEmotion: !!analysis?.emotion,
          hasTopic: !!analysis?.topic,
          personaId,
        },
        personaId,
      });
    } catch (e) {
      log.debug({ error: e }, 'Analytics tracking failed (non-blocking)');
    }

    log.debug(
      { userId, hasTopic: !!analysis?.topic, hasEmotion: !!analysis?.emotion },
      '📝 Conversation turn recorded'
    );
  } catch (error) {
    log.warn({ error, userId }, 'recordConversationTurn failed');
    // Don't throw - recording should be non-blocking
  }
}

// ============================================================================
// SESSION END RECORDING
// ============================================================================

/**
 * Record end of session data
 *
 * Called when a conversation session ends to summarize and persist.
 */
export async function recordSessionEnd(data: SessionEndData): Promise<void> {
  const { userId, sessionDurationMinutes, turnCount, topicsDiscussed, personaId } = data;

  try {
    // 1. Record persona interaction for persona-specific learning
    if (personaId) {
      try {
        recordPersonaInteraction(
          userId,
          personaId as PersonaId,
          sessionDurationMinutes,
          topicsDiscussed || []
        );
      } catch (e) {
        log.debug({ error: e }, 'Persona interaction recording failed (non-blocking)');
      }
    }

    // 2. Track session end analytics
    try {
      trackEvent({
        userId,
        system: 'thinking_of_you',
        eventType: 'positive_outcome',
        details: {
          durationMinutes: sessionDurationMinutes,
          turnCount,
          topicCount: topicsDiscussed?.length || 0,
          personaId,
        },
        personaId,
      });
    } catch (e) {
      log.debug({ error: e }, 'Session end analytics failed (non-blocking)');
    }

    log.info(
      { userId, durationMinutes: sessionDurationMinutes, turnCount },
      '✅ Session end recorded'
    );
  } catch (error) {
    log.warn({ error, userId }, 'recordSessionEnd failed');
  }
}

// ============================================================================
// WIN RECORDING
// ============================================================================

/**
 * Record a win or positive moment
 */
export async function recordWinMoment(data: WinData): Promise<void> {
  const { userId, type, description, context, magnitude } = data;

  try {
    // Map to celebration-momentum WinType
    const winType = WIN_TYPE_MAP[type] || 'effort_made';

    // Record in celebration-momentum
    try {
      recordWin(userId, {
        type: winType,
        description,
        context,
        tags: magnitude ? [magnitude] : [],
        difficulty: magnitude === 'large' ? 'hard' : magnitude === 'medium' ? 'medium' : 'easy',
      });
    } catch (e) {
      log.debug({ error: e }, 'Win recording failed (non-blocking)');
    }

    // Track analytics
    try {
      trackEvent({
        userId,
        system: 'small_wins',
        eventType: 'detected',
        details: {
          type,
          winType,
          magnitude,
          hasContext: !!context,
        },
      });
    } catch (e) {
      log.debug({ error: e }, 'Win analytics failed (non-blocking)');
    }

    log.info({ userId, type, magnitude }, '🎉 Win moment recorded');
  } catch (error) {
    log.warn({ error, userId }, 'recordWinMoment failed');
  }
}

/**
 * Alias for recordWinMoment (unified API)
 */
export const recordUnifiedWin = recordWinMoment;

// ============================================================================
// BOUNDARY RECORDING
// ============================================================================

/**
 * Record a boundary explicitly stated or inferred
 */
export async function recordBoundary(data: BoundaryData): Promise<void> {
  const { userId, topic, severity, source } = data;

  try {
    // Record boundary detection via detectNewBoundary (the main boundary tracking function)
    try {
      detectNewBoundary(userId, `User established boundary about: ${topic}`, {
        currentTopic: topic,
      });
    } catch (e) {
      log.debug({ error: e }, 'Boundary detection failed (non-blocking)');
    }

    // Track analytics
    try {
      trackEvent({
        userId,
        system: 'boundary_memory',
        eventType: 'detected',
        details: {
          topic,
          severity: severity || 'soft',
          source: source || 'inferred',
        },
      });
    } catch (e) {
      log.debug({ error: e }, 'Boundary analytics failed (non-blocking)');
    }

    log.info({ userId, topic, severity }, '🛡️ Boundary recorded');
  } catch (error) {
    log.warn({ error, userId }, 'recordBoundary failed');
  }
}

// ============================================================================
// JOURNAL RECORDING
// ============================================================================

/**
 * Record journal response
 */
export async function recordJournalResponse(data: JournalResponseData): Promise<void> {
  const { userId, promptId, response, emotionBeforeWriting, emotionAfterWriting } = data;

  try {
    // Record emotional snapshots if provided
    if (emotionBeforeWriting) {
      try {
        recordEmotionalSnapshot(userId, {
          primaryEmotion: emotionBeforeWriting as EmotionCategory,
          secondaryEmotions: [],
          intensity: 0.6,
          source: 'self_reported',
        });
      } catch (e) {
        log.debug({ error: e }, 'Before-writing emotion recording failed');
      }
    }

    if (emotionAfterWriting) {
      try {
        recordEmotionalSnapshot(userId, {
          primaryEmotion: emotionAfterWriting as EmotionCategory,
          secondaryEmotions: [],
          intensity: 0.6,
          source: 'self_reported',
        });
      } catch (e) {
        log.debug({ error: e }, 'After-writing emotion recording failed');
      }
    }

    // Track analytics
    try {
      trackEvent({
        userId,
        system: 'growth_reflection',
        eventType: 'user_response',
        details: {
          promptId,
          responseLength: response.length,
          hadEmotionBefore: !!emotionBeforeWriting,
          hadEmotionAfter: !!emotionAfterWriting,
          emotionShift: emotionBeforeWriting !== emotionAfterWriting,
        },
      });
    } catch (e) {
      log.debug({ error: e }, 'Journal analytics failed');
    }

    log.info({ userId, promptId, responseLength: response.length }, '📔 Journal response recorded');
  } catch (error) {
    log.warn({ error, userId }, 'recordJournalResponse failed');
  }
}

/**
 * Alias for recordJournalResponse (unified API)
 */
export const recordJournalEntryUnified = recordJournalResponse;

// ============================================================================
// MEDIA INTERACTION RECORDING
// ============================================================================

/**
 * Record media interaction (music, podcasts, etc.)
 */
export async function recordMediaInteractionUnified(data: MediaInteraction): Promise<void> {
  const { userId, mediaType, mediaId, action, context } = data;

  try {
    // Track analytics
    try {
      trackEvent({
        userId,
        system: 'inside_jokes',
        eventType:
          action === 'liked'
            ? 'positive_outcome'
            : action === 'disliked'
              ? 'user_response'
              : 'detected',
        details: {
          mediaType,
          mediaId,
          action,
          hasContext: !!context,
        },
      });
    } catch (e) {
      log.debug({ error: e }, 'Media interaction analytics failed');
    }

    log.debug({ userId, mediaType, action }, '🎵 Media interaction recorded');
  } catch (error) {
    log.warn({ error, userId }, 'recordMediaInteractionUnified failed');
  }
}

// ============================================================================
// CELEBRATION RESPONSE RECORDING
// ============================================================================

/**
 * Record how user responded to a celebration
 */
export async function recordCelebrationReception(
  userId: string,
  winId: string,
  reception: 'appreciated' | 'dismissed' | 'emotional'
): Promise<void> {
  try {
    recordCelebrationResponse(userId, winId, reception);

    trackEvent({
      userId,
      system: 'small_wins',
      eventType: 'user_response',
      details: {
        winId,
        reception,
      },
    });

    log.debug({ userId, winId, reception }, '🎉 Celebration response recorded');
  } catch (error) {
    log.warn({ error, userId }, 'recordCelebrationReception failed');
  }
}
