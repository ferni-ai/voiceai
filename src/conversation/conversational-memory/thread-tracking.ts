/**
 * Thread Tracking
 *
 * Tracks conversation threads (topics) and manages thread state.
 * Allows returning to unresolved topics.
 *
 * @module conversation/conversational-memory/thread-tracking
 */

import type { ConversationThread } from './types.js';

// ============================================================================
// THREAD TRACKER
// ============================================================================

const MAX_THREADS = 10;

export class ThreadTracker {
  private threads: ConversationThread[] = [];

  /**
   * Update or create a thread for a topic
   */
  update(topic: string, currentTurn: number, userInitiated: boolean): void {
    const existing = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());

    if (existing) {
      existing.lastMentionedTurn = currentTurn;
    } else {
      this.threads.push({
        id: `thread_${Date.now()}`,
        topic,
        startedAtTurn: currentTurn,
        lastMentionedTurn: currentTurn,
        importance: 'medium',
        resolved: false,
        userInitiated,
        relatedQuotes: [],
      });
    }

    // Trim old threads
    this.trimOldThreads(currentTurn);
  }

  /**
   * Get unresolved threads
   */
  getUnresolved(): ConversationThread[] {
    return this.threads.filter((t) => !t.resolved);
  }

  /**
   * Get all threads
   */
  getAll(): ConversationThread[] {
    return [...this.threads];
  }

  /**
   * Find an unresolved thread for callback
   */
  findForCallback(currentTopic: string, currentTurn: number): ConversationThread | undefined {
    return this.threads.find(
      (t) =>
        !t.resolved &&
        t.userInitiated &&
        t.topic !== currentTopic &&
        currentTurn - t.lastMentionedTurn > 3
    );
  }

  /**
   * Mark thread as mentioned (update lastMentionedTurn)
   */
  markMentioned(topic: string, turn: number): void {
    const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (thread) {
      thread.lastMentionedTurn = turn;
    }
  }

  /**
   * Mark a thread as resolved
   */
  resolve(topic: string): void {
    const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (thread) {
      thread.resolved = true;
    }
  }

  /**
   * Add a related quote to a thread
   */
  addQuote(topic: string, quote: string): void {
    const thread = this.threads.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (thread) {
      thread.relatedQuotes.push(quote);
    }
  }

  /**
   * Get topics from all threads
   */
  getTopics(): string[] {
    return [...new Set(this.threads.map((t) => t.topic))];
  }

  /**
   * Reset all threads
   */
  reset(): void {
    this.threads = [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private trimOldThreads(currentTurn: number): void {
    if (this.threads.length > MAX_THREADS) {
      this.threads = this.threads
        .filter((t) => !t.resolved || currentTurn - t.lastMentionedTurn < 10)
        .slice(-MAX_THREADS);
    }
  }
}

