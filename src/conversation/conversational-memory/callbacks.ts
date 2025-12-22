/**
 * Memory Callback Generation
 *
 * Generates callbacks to earlier statements, threads, and commitments.
 * Tracks callback frequency and tunes based on user engagement.
 *
 * @module conversation/conversational-memory/callbacks
 */

import { getLogger } from '../../utils/safe-logger.js';

import type {
  ConversationCommitment,
  ConversationThread,
  ConversationTuningPreferences,
  MemoryCallback,
  UserStatement,
} from './types.js';

const log = getLogger();

// ============================================================================
// CALLBACK GENERATOR
// ============================================================================

export class CallbackGenerator {
  // Callback frequency tuning
  private callbacksGiven = 0;
  private positiveCallbackReactions = 0;
  private lastCallbackTurn = 0;
  private callbackMultiplier = 1.0;

  /**
   * Record user reaction to a memory callback
   * Used to tune callback frequency for this user
   */
  recordReaction(wasPositive: boolean): void {
    this.callbacksGiven++;
    if (wasPositive) {
      this.positiveCallbackReactions++;
    }

    // After 3+ callbacks, tune frequency based on reaction rate
    if (this.callbacksGiven >= 3) {
      const positiveRate = this.positiveCallbackReactions / this.callbacksGiven;

      if (positiveRate > 0.7) {
        // User loves callbacks - increase frequency
        this.callbackMultiplier = 1.5;
      } else if (positiveRate < 0.3) {
        // User doesn't engage with callbacks - reduce frequency
        this.callbackMultiplier = 0.5;
      } else {
        this.callbackMultiplier = 1.0;
      }

      log.debug(
        {
          callbackMultiplier: this.callbackMultiplier,
          positiveRate,
          totalCallbacks: this.callbacksGiven,
        },
        'Updated memory callback frequency'
      );
    }
  }

  /**
   * Get current callback multiplier
   */
  getMultiplier(): number {
    return this.callbackMultiplier;
  }

  /**
   * Check if we just gave a callback
   */
  wasLastTurnCallback(currentTurn: number): boolean {
    return currentTurn - this.lastCallbackTurn <= 1;
  }

  /**
   * Record that a callback was given
   */
  recordCallback(turn: number): void {
    this.lastCallbackTurn = turn;
  }

  /**
   * Get last callback turn
   */
  getLastCallbackTurn(): number {
    return this.lastCallbackTurn;
  }

  /**
   * Export tuning preferences for persistence
   */
  exportPreferences(): ConversationTuningPreferences {
    return {
      callbackMultiplier: this.callbackMultiplier,
      callbacksGiven: this.callbacksGiven,
      positiveCallbackReactions: this.positiveCallbackReactions,
    };
  }

  /**
   * Import tuning preferences from a previous session
   */
  importPreferences(prefs: Partial<ConversationTuningPreferences>): void {
    if (prefs.callbackMultiplier !== undefined) {
      this.callbackMultiplier = prefs.callbackMultiplier;
    }
    if (prefs.callbacksGiven !== undefined) {
      this.callbacksGiven = prefs.callbacksGiven;
    }
    if (prefs.positiveCallbackReactions !== undefined) {
      this.positiveCallbackReactions = prefs.positiveCallbackReactions;
    }

    log.debug(
      {
        imported: prefs,
        current: this.exportPreferences(),
      },
      'Imported tuning preferences'
    );
  }

  /**
   * Check if it's appropriate to give a callback
   */
  shouldCallback(currentTurn: number): boolean {
    // Don't callback too early
    if (currentTurn < 4) return false;

    // Minimum turns between callbacks (adjusted by multiplier)
    const minTurnsBetweenCallbacks = Math.max(2, Math.floor(4 / this.callbackMultiplier));
    return currentTurn - this.lastCallbackTurn >= minTurnsBetweenCallbacks;
  }

  /**
   * Create a thread callback
   */
  createThreadCallback(thread: ConversationThread): MemoryCallback {
    const phrases = [
      `You mentioned ${thread.topic} earlier—I'd like to come back to that.`,
      `Can we circle back to ${thread.topic}?`,
      `I've been thinking about what you said about ${thread.topic}...`,
      `Before we go further, let's revisit ${thread.topic}.`,
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="200ms"/>${phrase}`,
      referenceType: 'returning_topic',
    };
  }

  /**
   * Create a statement callback
   */
  createStatementCallback(statement: UserStatement): MemoryCallback {
    const phrases = [
      `Earlier you said "${statement.text}"—that's relevant here.`,
      `This connects to what you mentioned: "${statement.text}"`,
      `Remember when you said "${statement.text}"? That applies here.`,
      `Going back to something you shared—"${statement.text}"`,
    ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="150ms"/>${phrase}`,
      referenceType: 'earlier_this_convo',
      originalStatement: statement,
    };
  }

  /**
   * Create a commitment callback
   */
  createCommitmentCallback(commitment: ConversationCommitment): MemoryCallback {
    const phrases =
      commitment.who === 'user'
        ? [
            `By the way, you mentioned "${commitment.what}"—did you get a chance to do that?`,
            `How did it go with "${commitment.what}"?`,
            `I remember you said "${commitment.what}"—any update?`,
          ]
        : [
            `I said "${commitment.what}"—let me follow through on that.`,
            `I promised "${commitment.what}"—here's what I found.`,
          ];

    const phrase = phrases[Math.floor(Math.random() * phrases.length)];

    return {
      phrase,
      ssml: `<break time="200ms"/>${phrase}`,
      referenceType: 'commitment',
    };
  }

  /**
   * Create a notable quote callback
   */
  createQuoteCallback(quote: string): MemoryCallback {
    return {
      phrase: `You said something earlier that stuck with me—"${quote}"`,
      ssml: `<break time="200ms"/>You said something earlier that stuck with me—<break time="100ms"/>"${quote}"`,
      referenceType: 'earlier_this_convo',
    };
  }

  /**
   * Reset callback state
   */
  reset(): void {
    this.lastCallbackTurn = 0;
    // Note: We preserve callbacksGiven and multiplier for cross-session learning
  }

  /**
   * Full reset including tuning
   */
  fullReset(): void {
    this.callbacksGiven = 0;
    this.positiveCallbackReactions = 0;
    this.lastCallbackTurn = 0;
    this.callbackMultiplier = 1.0;
  }
}

