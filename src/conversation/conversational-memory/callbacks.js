/**
 * Memory Callback Generation
 *
 * Generates callbacks to earlier statements, threads, and commitments.
 * Tracks callback frequency and tunes based on user engagement.
 *
 * @module conversation/conversational-memory/callbacks
 */
import { getLogger } from '../../utils/safe-logger.js';
import { seededPick } from '../utils/rng.js';
const log = getLogger();
// ============================================================================
// CALLBACK GENERATOR
// ============================================================================
export class CallbackGenerator {
    // Callback frequency tuning
    callbacksGiven = 0;
    positiveCallbackReactions = 0;
    lastCallbackTurn = 0;
    callbackMultiplier = 1.0;
    /**
     * Record user reaction to a memory callback
     * Used to tune callback frequency for this user
     */
    recordReaction(wasPositive) {
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
            }
            else if (positiveRate < 0.3) {
                // User doesn't engage with callbacks - reduce frequency
                this.callbackMultiplier = 0.5;
            }
            else {
                this.callbackMultiplier = 1.0;
            }
            log.debug({
                callbackMultiplier: this.callbackMultiplier,
                positiveRate,
                totalCallbacks: this.callbacksGiven,
            }, 'Updated memory callback frequency');
        }
    }
    /**
     * Get current callback multiplier
     */
    getMultiplier() {
        return this.callbackMultiplier;
    }
    /**
     * Check if we just gave a callback
     */
    wasLastTurnCallback(currentTurn) {
        return currentTurn - this.lastCallbackTurn <= 1;
    }
    /**
     * Record that a callback was given
     */
    recordCallback(turn) {
        this.lastCallbackTurn = turn;
    }
    /**
     * Get last callback turn
     */
    getLastCallbackTurn() {
        return this.lastCallbackTurn;
    }
    /**
     * Export tuning preferences for persistence
     */
    exportPreferences() {
        return {
            callbackMultiplier: this.callbackMultiplier,
            callbacksGiven: this.callbacksGiven,
            positiveCallbackReactions: this.positiveCallbackReactions,
        };
    }
    /**
     * Import tuning preferences from a previous session
     */
    importPreferences(prefs) {
        if (prefs.callbackMultiplier !== undefined) {
            this.callbackMultiplier = prefs.callbackMultiplier;
        }
        if (prefs.callbacksGiven !== undefined) {
            this.callbacksGiven = prefs.callbacksGiven;
        }
        if (prefs.positiveCallbackReactions !== undefined) {
            this.positiveCallbackReactions = prefs.positiveCallbackReactions;
        }
        log.debug({
            imported: prefs,
            current: this.exportPreferences(),
        }, 'Imported tuning preferences');
    }
    /**
     * Check if it's appropriate to give a callback
     */
    shouldCallback(currentTurn) {
        // Don't callback too early
        if (currentTurn < 4)
            return false;
        // Minimum turns between callbacks (adjusted by multiplier)
        const minTurnsBetweenCallbacks = Math.max(2, Math.floor(4 / this.callbackMultiplier));
        return currentTurn - this.lastCallbackTurn >= minTurnsBetweenCallbacks;
    }
    /**
     * Create a thread callback
     */
    createThreadCallback(thread, seed) {
        const phrases = [
            `You mentioned ${thread.topic} earlier—I'd like to come back to that.`,
            `Can we circle back to ${thread.topic}?`,
            `I've been thinking about what you said about ${thread.topic}...`,
            `Before we go further, let's revisit ${thread.topic}.`,
        ];
        const phrase = seededPick(seed ?? `thread:${thread.topic}`, phrases) ?? phrases[0];
        return {
            phrase,
            ssml: `<break time="200ms"/>${phrase}`,
            referenceType: 'returning_topic',
        };
    }
    /**
     * Create a statement callback
     */
    createStatementCallback(statement, seed) {
        const phrases = [
            `Earlier you said "${statement.text}"—that's relevant here.`,
            `This connects to what you mentioned: "${statement.text}"`,
            `Remember when you said "${statement.text}"? That applies here.`,
            `Going back to something you shared—"${statement.text}"`,
        ];
        const phrase = seededPick(seed ?? `statement:${statement.turn}`, phrases) ?? phrases[0];
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
    createCommitmentCallback(commitment, seed) {
        const phrases = commitment.who === 'user'
            ? [
                `By the way, you mentioned "${commitment.what}"—did you get a chance to do that?`,
                `How did it go with "${commitment.what}"?`,
                `I remember you said "${commitment.what}"—any update?`,
            ]
            : [
                `I said "${commitment.what}"—let me follow through on that.`,
                `I promised "${commitment.what}"—here's what I found.`,
            ];
        const phrase = seededPick(seed ?? `commitment:${commitment.turn}`, phrases) ?? phrases[0];
        return {
            phrase,
            ssml: `<break time="200ms"/>${phrase}`,
            referenceType: 'commitment',
        };
    }
    /**
     * Create a notable quote callback
     */
    createQuoteCallback(quote) {
        return {
            phrase: `You said something earlier that stuck with me—"${quote}"`,
            ssml: `<break time="200ms"/>You said something earlier that stuck with me—<break time="100ms"/>"${quote}"`,
            referenceType: 'earlier_this_convo',
        };
    }
    /**
     * Reset callback state
     */
    reset() {
        this.lastCallbackTurn = 0;
        // Note: We preserve callbacksGiven and multiplier for cross-session learning
    }
    /**
     * Full reset including tuning
     */
    fullReset() {
        this.callbacksGiven = 0;
        this.positiveCallbackReactions = 0;
        this.lastCallbackTurn = 0;
        this.callbackMultiplier = 1.0;
    }
}
//# sourceMappingURL=callbacks.js.map