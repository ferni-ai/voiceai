/**
 * Thinking Phrase Coordinator
 *
 * Prevents multiple systems from independently adding "good question" type phrases.
 *
 * The Problem:
 * - thinking-time-injector.ts adds thinking sounds
 * - authentic-thinking.ts adds thinking pauses
 * - speech-naturalizer.ts adds thinking phrases
 * - All operate independently → user hears "good question" multiple times
 *
 * The Solution:
 * - Single coordinator that tracks per-turn phrase usage
 * - First system to request a phrase for a turn wins
 * - Others get null and skip adding their phrase
 *
 * @module conversation/thinking-phrase-coordinator
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'thinking-coordinator' });

// ============================================================================
// TYPES
// ============================================================================

export type ThinkingPhraseSource =
  | 'thinking-time-injector'
  | 'authentic-thinking'
  | 'speech-naturalizer'
  | 'humanizer';

export interface ThinkingPhraseRequest {
  /** Session identifier */
  sessionId: string;
  /** Turn number within session */
  turnNumber: number;
  /** Which system is requesting */
  source: ThinkingPhraseSource;
  /** Persona for phrase selection */
  personaId?: string;
  /** Context for selecting appropriate phrase */
  context?: {
    isQuestion?: boolean;
    complexity?: number;
    emotionalIntensity?: number;
    topic?: string;
  };
}

export interface ThinkingPhraseResult {
  /** Whether this request was granted (first for this turn) */
  granted: boolean;
  /** The phrase to use (if granted) */
  phrase: string | null;
  /** SSML-wrapped version */
  ssml: string | null;
  /** Why this result was returned */
  reason: string;
}

interface TurnState {
  /** Which source claimed this turn */
  claimedBy: ThinkingPhraseSource | null;
  /** The phrase that was used */
  phrase: string | null;
  /** Timestamp for cleanup */
  timestamp: number;
}

// ============================================================================
// CONSOLIDATED PHRASE LIBRARY
// ============================================================================

/**
 * Single source of truth for all thinking phrases.
 * Consolidated from thinking-time-injector, authentic-thinking, speech-naturalizer.
 */
// NOTE: Most "thinking phrases" are AI clichés. Ferni should use SILENCE or GENUINE REACTIONS instead.
// These are kept minimal - prefer actual silence followed by a real response.
const THINKING_PHRASES: Record<string, {
  general: string[];
  forQuestions: string[];
  forEmotional: string[];
  forProcessing: string[];
}> = {
  ferni: {
    general: [
      // Genuine reactions, not narrated thinking
      'Okay.',
      'Right.',
      'Yeah.',
      'Huh.',
    ],
    forQuestions: [
      // Brief acknowledgment, then respond
      'Right.',
      'Okay.',
      "That's a hard one.",
    ],
    forEmotional: [
      // Real empathy, not filler
      "That's heavy.",
      'I hear you.',
      "That's real.",
      'Yeah.',
    ],
    forProcessing: [
      'Okay.',
      'So.',
      'Right.',
      'Yeah.',
    ],
  },
  'nayan-patel': {
    general: [
      'Hmm, let me think about that...',
      "You know, that's worth considering...",
      'Now, that brings up an important point...',
    ],
    forQuestions: [
      'Hmm.',
      'Let me think about that.',
      'Fascinating.',
    ],
    forEmotional: [
      'I see.',
      'Yeah.',
      'I get that.',
      'Understandable.',
    ],
    forProcessing: [
      'So.',
      'Right.',
      "Let's see.",
      'Now.',
    ],
  },
  'peter-john': {
    general: [
      'Let me think about this...',
      "You know what's interesting?",
      "Here's what jumps out at me...",
      'Okay, so...',
    ],
    forQuestions: [
      'Hmm.',
      'Let me think about that.',
      'Fascinating.',
      "There's something here.",
    ],
    forEmotional: [
      'I see.',
      'Yeah.',
      'I get that.',
      'Understandable.',
    ],
    forProcessing: [
      'So.',
      'Right.',
      "Let's see.",
      'Now.',
    ],
  },
  'maya-santos': {
    general: [
      "Hmm, that's interesting...",
      'Let me think about how to say this...',
      'You know what I mean?',
      "Here's the thing...",
    ],
    forQuestions: [
      'Hmm.',
      "Let's think about this.",
      'Okay, so.',
    ],
    forEmotional: [
      'I hear you.',
      'Yeah.',
      "That's real.",
      'I get that.',
    ],
    forProcessing: [
      'So.',
      'Okay.',
      'Right.',
      'Alright then.',
    ],
  },
  'alex-chen': {
    general: [
      'Let me check on that...',
      'Hmm, one second...',
      "Okay, so here's the situation...",
    ],
    forQuestions: [
      'Hmm.',
      'Let me think.',
      'Okay.',
      'Interesting.',
    ],
    forEmotional: [
      'I hear you.',
      'Yeah.',
      'Got it.',
      'Understood.',
    ],
    forProcessing: [
      'Right.',
      'So.',
      'Okay.',
      'Alright.',
    ],
  },
  'jordan-taylor': {
    general: [
      'Ooh, let me think...',
      'You know what would be amazing?',
      'Oh! I just thought of something!',
    ],
    forQuestions: [
      'Ooh!',
      'Let me think...',
      'Hmm...',
    ],
    forEmotional: [
      'I hear you.',
      'Yeah.',
      "That's real.",
      'I get that.',
    ],
    forProcessing: [
      'So.',
      'Okay.',
      'Right.',
      'Alright.',
    ],
  },
  default: {
    general: [
      'Okay.',
      'Right.',
      'Yeah.',
    ],
    forQuestions: [
      'Right.',
      'Okay.',
    ],
    forEmotional: [
      'I hear you.',
      'Yeah.',
      'I get that.',
    ],
    forProcessing: [
      'Okay.',
      'So.',
      'Right.',
    ],
  },
};

// ============================================================================
// COORDINATOR CLASS
// ============================================================================

class ThinkingPhraseCoordinator {
  /** Turn state by session */
  private turnStates = new Map<string, TurnState>();

  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up stale entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Request permission to add a thinking phrase for this turn.
   *
   * @returns Result with granted=true and phrase if this is the first request
   *          for this turn, or granted=false if another system already claimed it.
   */
  requestPhrase(request: ThinkingPhraseRequest): ThinkingPhraseResult {
    const key = `${request.sessionId}:${request.turnNumber}`;
    const existing = this.turnStates.get(key);

    // Check if already claimed
    if (existing?.claimedBy) {
      log.debug(
        {
          sessionId: request.sessionId,
          turn: request.turnNumber,
          requestedBy: request.source,
          claimedBy: existing.claimedBy,
        },
        'Thinking phrase already claimed'
      );

      return {
        granted: false,
        phrase: null,
        ssml: null,
        reason: `Already claimed by ${existing.claimedBy}`,
      };
    }

    // Select appropriate phrase
    const phrase = this.selectPhrase(request);

    if (!phrase) {
      return {
        granted: false,
        phrase: null,
        ssml: null,
        reason: 'No appropriate phrase for context',
      };
    }

    // Claim this turn
    this.turnStates.set(key, {
      claimedBy: request.source,
      phrase,
      timestamp: Date.now(),
    });

    log.debug(
      {
        sessionId: request.sessionId,
        turn: request.turnNumber,
        source: request.source,
        phrase,
      },
      'Thinking phrase granted'
    );

    return {
      granted: true,
      phrase,
      ssml: `<break time="200ms"/>${phrase}<break time="300ms"/>`,
      reason: `Granted to ${request.source}`,
    };
  }

  /**
   * Check if a thinking phrase was already used for this turn.
   */
  wasPhrasedUsed(sessionId: string, turnNumber: number): boolean {
    const key = `${sessionId}:${turnNumber}`;
    const state = this.turnStates.get(key);
    return state?.claimedBy !== null && state?.claimedBy !== undefined;
  }

  /**
   * Get what phrase was used for this turn (for debugging/logging).
   */
  getTurnState(sessionId: string, turnNumber: number): TurnState | null {
    const key = `${sessionId}:${turnNumber}`;
    return this.turnStates.get(key) || null;
  }

  /**
   * Reset state for a session (e.g., when session ends).
   */
  resetSession(sessionId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.turnStates.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.turnStates.delete(key);
    }
    log.debug({ sessionId, deleted: keysToDelete.length }, 'Session thinking state reset');
  }

  /**
   * Clean up stale entries (older than 30 minutes).
   */
  private cleanup(): void {
    const cutoff = Date.now() - 30 * 60 * 1000;
    let deleted = 0;

    for (const [key, state] of this.turnStates.entries()) {
      if (state.timestamp < cutoff) {
        this.turnStates.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      log.debug({ deleted }, 'Cleaned up stale thinking states');
    }
  }

  /**
   * Select an appropriate phrase based on context.
   */
  private selectPhrase(request: ThinkingPhraseRequest): string | null {
    const personaId = request.personaId || 'default';
    const phrases = THINKING_PHRASES[personaId] || THINKING_PHRASES.default;
    const context = request.context || {};

    // Determine which phrase category to use
    let candidates: string[];

    if (context.emotionalIntensity && context.emotionalIntensity > 0.6) {
      candidates = phrases.forEmotional;
    } else if (context.isQuestion && context.complexity && context.complexity > 0.5) {
      candidates = phrases.forQuestions;
    } else if (context.complexity && context.complexity > 0.6) {
      candidates = phrases.forProcessing;
    } else {
      candidates = phrases.general;
    }

    // Apply probability - don't always use a phrase
    const probability = this.calculateProbability(request);
    if (Math.random() > probability) {
      return null;
    }

    // Random selection
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Calculate probability of using a thinking phrase based on context.
   */
  private calculateProbability(request: ThinkingPhraseRequest): number {
    const context = request.context || {};
    let probability = 0.3; // Base probability

    // Questions with high complexity get higher probability
    if (context.isQuestion && context.complexity) {
      probability += context.complexity * 0.3;
    }

    // Emotional content gets higher probability
    if (context.emotionalIntensity && context.emotionalIntensity > 0.5) {
      probability += 0.15;
    }

    // Cap at 60% - we don't want phrases on every turn
    return Math.min(0.6, probability);
  }

  /**
   * Shutdown cleanup.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.turnStates.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ThinkingPhraseCoordinator | null = null;

export function getThinkingPhraseCoordinator(): ThinkingPhraseCoordinator {
  if (!instance) {
    instance = new ThinkingPhraseCoordinator();
  }
  return instance;
}

export function resetThinkingPhraseCoordinator(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Convenience function to request a thinking phrase.
 */
export function requestThinkingPhrase(
  sessionId: string,
  turnNumber: number,
  source: ThinkingPhraseSource,
  personaId?: string,
  context?: ThinkingPhraseRequest['context']
): ThinkingPhraseResult {
  return getThinkingPhraseCoordinator().requestPhrase({
    sessionId,
    turnNumber,
    source,
    personaId,
    context,
  });
}

/**
 * Convenience function to check if phrase was used.
 */
export function wasPhraseUsedThisTurn(sessionId: string, turnNumber: number): boolean {
  return getThinkingPhraseCoordinator().wasPhrasedUsed(sessionId, turnNumber);
}

export default ThinkingPhraseCoordinator;

