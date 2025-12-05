/**
 * Conversation History Manager
 *
 * Tracks conversation turns within a session and manages
 * history persistence across sessions.
 */

import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import type { ConversationTurn } from './summarizer.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended turn with additional metadata
 */
export interface TrackedTurn extends ConversationTurn {
  id: string;
  turnIndex: number;
  wordCount: number;
  emotionDetected?: string;
  topicsDetected?: string[];
  durationMs?: number;
}

/**
 * Session history with metadata
 */
export interface SessionHistory {
  sessionId: string;
  userId?: string;
  startedAt: Date;
  lastActivityAt: Date;
  turns: TrackedTurn[];
  metadata: {
    totalWordCount: number;
    averageWordsPerTurn: number;
    topicsDiscussed: string[];
    emotionalJourney: string[];
  };
}

// ============================================================================
// HISTORY TRACKER
// ============================================================================

/**
 * Tracks conversation history within a session
 */
export class ConversationHistoryTracker {
  private sessionId: string;
  private userId?: string;
  private turns: TrackedTurn[] = [];
  private startedAt: Date;
  private lastActivityAt: Date;
  private topicsSet: Set<string> = new Set();
  private emotionHistory: string[] = [];

  constructor(sessionId: string, userId?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.startedAt = new Date();
    this.lastActivityAt = new Date();

    getLogger().info(`Created history tracker for session: ${sessionId}`);
  }

  /**
   * Add a turn to the history
   */
  addTurn(turn: Omit<TrackedTurn, 'id' | 'turnIndex' | 'wordCount'>): TrackedTurn {
    const trackedTurn: TrackedTurn = {
      ...turn,
      id: `turn_${this.sessionId}_${this.turns.length}`,
      turnIndex: this.turns.length,
      wordCount: turn.content.split(/\s+/).length,
      timestamp: turn.timestamp || new Date(),
    };

    this.turns.push(trackedTurn);
    this.lastActivityAt = new Date();

    // Track topics
    if (turn.topicsDetected) {
      for (const topic of turn.topicsDetected) {
        this.topicsSet.add(topic);
      }
    }

    // Track emotions
    if (turn.emotionDetected) {
      this.emotionHistory.push(turn.emotionDetected);
    }

    getLogger().debug(
      `Added turn ${trackedTurn.turnIndex}: ${turn.role} (${trackedTurn.wordCount} words)`
    );
    return trackedTurn;
  }

  /**
   * Add a user turn
   */
  addUserTurn(
    content: string,
    metadata?: {
      emotionDetected?: string;
      topicsDetected?: string[];
      durationMs?: number;
    }
  ): TrackedTurn {
    return this.addTurn({
      role: 'user',
      content,
      timestamp: new Date(),
      ...metadata,
    });
  }

  /**
   * Add an assistant turn
   */
  addAssistantTurn(
    content: string,
    metadata?: {
      topicsDetected?: string[];
    }
  ): TrackedTurn {
    return this.addTurn({
      role: 'assistant',
      content,
      timestamp: new Date(),
      ...metadata,
    });
  }

  /**
   * Get all turns
   */
  getTurns(): TrackedTurn[] {
    return [...this.turns];
  }

  /**
   * Get recent turns
   */
  getRecentTurns(count: number): TrackedTurn[] {
    return this.turns.slice(-count);
  }

  /**
   * Get turns as simple ConversationTurn array (for summarizer)
   */
  getSimpleTurns(): ConversationTurn[] {
    return this.turns.map((t) => ({
      role: t.role,
      content: t.content,
      timestamp: t.timestamp,
    }));
  }

  /**
   * Get user turns only
   */
  getUserTurns(): TrackedTurn[] {
    return this.turns.filter((t) => t.role === 'user');
  }

  /**
   * Get assistant turns only
   */
  getAssistantTurns(): TrackedTurn[] {
    return this.turns.filter((t) => t.role === 'assistant');
  }

  /**
   * Get turn count
   */
  getTurnCount(): number {
    return this.turns.length;
  }

  /**
   * Get session duration in seconds
   */
  getDurationSeconds(): number {
    return Math.floor((this.lastActivityAt.getTime() - this.startedAt.getTime()) / 1000);
  }

  /**
   * Calculate average user words per minute (speaking pace)
   */
  calculateUserWPM(): number | undefined {
    const userTurns = this.getUserTurns().filter((t) => t.durationMs && t.durationMs > 0);

    if (userTurns.length === 0) {
      return undefined;
    }

    const totalWords = userTurns.reduce((sum, t) => sum + t.wordCount, 0);
    const totalMinutes = userTurns.reduce((sum, t) => sum + (t.durationMs || 0), 0) / 60000;

    if (totalMinutes === 0) {
      return undefined;
    }

    return Math.round(totalWords / totalMinutes);
  }

  /**
   * Get all topics discussed
   */
  getTopicsDiscussed(): string[] {
    return Array.from(this.topicsSet);
  }

  /**
   * Get emotional journey
   */
  getEmotionalJourney(): string[] {
    return [...this.emotionHistory];
  }

  /**
   * Get full session history with metadata
   */
  getSessionHistory(): SessionHistory {
    const totalWordCount = this.turns.reduce((sum, t) => sum + t.wordCount, 0);

    return {
      sessionId: this.sessionId,
      userId: this.userId,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      turns: [...this.turns],
      metadata: {
        totalWordCount,
        averageWordsPerTurn:
          this.turns.length > 0 ? Math.round(totalWordCount / this.turns.length) : 0,
        topicsDiscussed: this.getTopicsDiscussed(),
        emotionalJourney: this.getEmotionalJourney(),
      },
    };
  }

  /**
   * Search turns for content
   */
  searchTurns(query: string): TrackedTurn[] {
    const queryLower = query.toLowerCase();
    return this.turns.filter((t) => t.content.toLowerCase().includes(queryLower));
  }

  /**
   * Get context window (last N turns formatted for prompt)
   */
  getContextWindow(maxTurns: number = 10, maxChars: number = 4000): string {
    const recent = this.getRecentTurns(maxTurns);
    let context = '';

    for (const turn of recent) {
      const line = `${turn.role === 'user' ? 'User' : 'Jack'}: ${turn.content}\n`;
      if (context.length + line.length > maxChars) {
        break;
      }
      context += line;
    }

    return context.trim();
  }

  /**
   * Clear history (for testing)
   */
  clear(): void {
    this.turns = [];
    this.topicsSet.clear();
    this.emotionHistory = [];
    getLogger().info(`Cleared history for session: ${this.sessionId}`);
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// Active session trackers
const activeTrackers: Map<string, ConversationHistoryTracker> = new Map();

/**
 * Get or create a history tracker for a session
 */
export function getHistoryTracker(sessionId: string, userId?: string): ConversationHistoryTracker {
  let tracker = activeTrackers.get(sessionId);

  if (!tracker) {
    tracker = new ConversationHistoryTracker(sessionId, userId);
    activeTrackers.set(sessionId, tracker);
  }

  return tracker;
}

/**
 * Remove a history tracker (on session end)
 */
export function removeHistoryTracker(sessionId: string): SessionHistory | undefined {
  const tracker = activeTrackers.get(sessionId);

  if (tracker) {
    const history = tracker.getSessionHistory();
    activeTrackers.delete(sessionId);
    getLogger().info(`Removed history tracker for session: ${sessionId}`);
    return history;
  }

  return undefined;
}

/**
 * Get all active session IDs
 */
export function getActiveSessionIds(): string[] {
  return Array.from(activeTrackers.keys());
}

/**
 * Clear all history trackers (for shutdown)
 */
export function clearAllHistoryTrackers(): void {
  activeTrackers.clear();
}

export default {
  ConversationHistoryTracker,
  getHistoryTracker,
  removeHistoryTracker,
  getActiveSessionIds,
  clearAllHistoryTrackers,
};
