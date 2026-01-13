/**
 * Trust Signal Emitter
 *
 * Bridges backend trust systems to frontend UI via LiveKit data messages.
 *
 * When trust systems detect meaningful moments (growth, boundaries respected,
 * small wins, callbacks, etc.), this emitter packages them as signals that
 * can be sent to the frontend for display.
 *
 * SIGNAL TYPES (matching frontend trust-signals.ui.ts):
 * - growth: User showed growth ("I noticed you handled that differently...")
 * - boundary: Ferni respected a boundary ("I remember you said...")
 * - callback: Shared history moment ("Remember when...")
 * - small_win: Celebrating effort ("You actually did it!")
 * - thinking_of_you: Proactive care (proactive outreach moments)
 * - reading_lines: Noticed unspoken emotion ("I sense...")
 *
 * @module TrustSignalEmitter
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'TrustSignalEmitter' });
// ============================================================================
// STATE
// ============================================================================
let emitCallback = null;
const recentSignals = new Map(); // Deduplication
const SIGNAL_COOLDOWN_MS = 60000; // Don't repeat same signal type for 60s
// ============================================================================
// INITIALIZATION
// ============================================================================
/**
 * Set the callback used to emit signals to the frontend.
 * This is typically wired up in the voice agent's data message handler.
 */
export function setSignalEmitter(callback) {
    emitCallback = callback;
    log.info('Trust signal emitter initialized');
}
/**
 * Clear the signal emitter.
 */
export function clearSignalEmitter() {
    emitCallback = null;
}
// ============================================================================
// SIGNAL EMISSION
// ============================================================================
/**
 * Emit a trust signal to the frontend.
 * Handles deduplication and rate limiting.
 */
export function emitTrustSignal(signal) {
    if (!emitCallback) {
        log.debug('No emitter set, signal not sent:', signal.type);
        return;
    }
    // Deduplicate - don't send same signal type too frequently
    const dedupeKey = `${signal.type}:${signal.title.slice(0, 20)}`;
    const lastSent = recentSignals.get(dedupeKey);
    if (lastSent && Date.now() - lastSent < SIGNAL_COOLDOWN_MS) {
        log.debug('Signal deduped (sent recently):', signal.type);
        return;
    }
    recentSignals.set(dedupeKey, Date.now());
    // Clean up old entries periodically
    if (recentSignals.size > 50) {
        const cutoff = Date.now() - SIGNAL_COOLDOWN_MS;
        for (const [key, time] of recentSignals.entries()) {
            if (time < cutoff) {
                recentSignals.delete(key);
            }
        }
    }
    emitCallback(signal);
    log.info({ type: signal.type, title: signal.title }, '💚 Trust signal emitted');
}
// ============================================================================
// SIGNAL GENERATORS
// ============================================================================
/**
 * Generate a growth signal from a growth reflection.
 */
export function emitGrowthSignal(reflection, personaId) {
    const signal = {
        type: 'growth',
        title: 'Something different',
        message: truncateMessage(reflection.reflection),
        personaId,
        timing: 'after_response',
        metadata: {
            patternType: reflection.pattern.type,
            confidence: reflection.pattern.confidence,
        },
    };
    emitTrustSignal(signal);
}
/**
 * Generate a small win signal from a celebration opportunity.
 */
export function emitSmallWinSignal(celebration, personaId) {
    // Map win type to friendly title
    const titles = {
        followed_through: 'You did it',
        courage_moment: 'That took courage',
        self_care: 'Taking care of you',
        boundary_held: 'Standing your ground',
        hard_conversation: 'The hard talk',
        showed_up: 'You showed up',
        tried_new_thing: 'Something new',
        asked_for_help: 'Reaching out',
        let_it_go: 'Letting go',
        effort_made: 'The effort counts',
    };
    const signal = {
        type: 'small_win',
        title: titles[celebration.win.type] || 'Look at you',
        message: truncateMessage(celebration.celebration),
        personaId,
        timing: 'immediate',
        metadata: {
            winType: celebration.win.type,
            intensity: celebration.intensity,
        },
    };
    emitTrustSignal(signal);
}
/**
 * Generate a callback signal from a callback opportunity.
 */
export function emitCallbackSignal(callback, personaId) {
    const signal = {
        type: 'callback',
        title: 'Remember when',
        message: truncateMessage(callback.suggestedCallback),
        personaId,
        timing: 'after_response',
        metadata: {
            momentType: callback.moment.type,
            relevance: callback.relevance,
        },
    };
    emitTrustSignal(signal);
}
/**
 * Generate a signal for respecting a boundary.
 * Only emit when we actively chose NOT to mention something.
 */
export function emitBoundaryRespectedSignal(boundaryCheck, personaId) {
    if (!boundaryCheck.crossesBoundary || !boundaryCheck.boundary) {
        return;
    }
    // Only emit for meaningful boundary respect (not routine avoidance)
    if (boundaryCheck.boundary.strength === 'absolute') {
        const signal = {
            type: 'boundary',
            title: "I won't forget",
            message: `I remember you asked me not to bring up ${boundaryCheck.boundary.topic}. I'm respecting that.`,
            personaId,
            timing: 'end_of_turn',
            metadata: {
                topic: boundaryCheck.boundary.topic,
                strength: boundaryCheck.boundary.strength,
            },
        };
        emitTrustSignal(signal);
    }
}
/**
 * Generate a signal for reading between the lines.
 */
export function emitReadingLinesSignal(unsaidSignal, personaId) {
    // Only emit for high-confidence, meaningful detections
    if (unsaidSignal.confidence < 0.7) {
        return;
    }
    // Don't overwhelm - only certain types
    const emittableTypes = [
        'emotional_mismatch',
        'permission_seeking',
        'minimizing_pain',
    ];
    if (!emittableTypes.includes(unsaidSignal.type)) {
        return;
    }
    const titles = {
        emotional_mismatch: "What I'm hearing",
        topic_avoidance: 'I noticed',
        deflection: 'Just checking',
        permission_seeking: 'Go ahead',
        unfinished_thought: "There's more",
        minimizing_pain: 'That matters',
        false_closure: 'Are you sure?',
    };
    const signal = {
        type: 'reading_lines',
        title: titles[unsaidSignal.type] || 'I sense',
        message: truncateMessage(unsaidSignal.phrase || unsaidSignal.observation),
        personaId,
        timing: 'after_response',
        metadata: {
            signalType: unsaidSignal.type,
            confidence: unsaidSignal.confidence,
            approach: unsaidSignal.approach,
        },
    };
    emitTrustSignal(signal);
}
/**
 * Generate a thinking-of-you signal for proactive outreach.
 */
export function emitThinkingOfYouSignal(moment, personaId) {
    const signal = {
        type: 'thinking_of_you',
        title: 'Just thinking',
        message: truncateMessage(moment.message || "I've been thinking about you..."),
        personaId,
        timing: 'immediate',
        metadata: {
            momentType: moment.type,
            triggerId: moment.trigger?.type,
        },
    };
    emitTrustSignal(signal);
}
// ============================================================================
// CONTEXT-BASED EMISSION
// ============================================================================
/**
 * Process a TrustContext and emit any relevant signals.
 * Call this after building trust context for a conversation turn.
 */
export function processContextForSignals(trustContext, personaId) {
    // 1. Growth reflection - highest priority
    if (trustContext.growthReflection) {
        emitGrowthSignal(trustContext.growthReflection, personaId);
    }
    // 2. Celebration opportunity
    if (trustContext.celebrationOpportunity) {
        emitSmallWinSignal(trustContext.celebrationOpportunity, personaId);
    }
    // 3. Callback opportunity (only if no growth/celebration to avoid overwhelming)
    if (!trustContext.growthReflection && !trustContext.celebrationOpportunity) {
        if (trustContext.callbackOpportunity && trustContext.callbackOpportunity.relevance > 0.7) {
            emitCallbackSignal(trustContext.callbackOpportunity, personaId);
        }
    }
    // 4. Boundary respect (subtle, end of turn)
    if (trustContext.boundaryCheck?.crossesBoundary) {
        emitBoundaryRespectedSignal(trustContext.boundaryCheck, personaId);
    }
    // 5. Reading between lines (only highest confidence)
    const highConfidenceUnsaid = trustContext.unsaidSignals.filter((s) => s.confidence >= 0.8);
    if (highConfidenceUnsaid.length > 0) {
        // Only emit one - pick the highest confidence
        const best = highConfidenceUnsaid.sort((a, b) => b.confidence - a.confidence)[0];
        if (best) {
            emitReadingLinesSignal(best, personaId);
        }
    }
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Truncate message to reasonable length for UI display.
 */
function truncateMessage(message, maxLength = 150) {
    if (message.length <= maxLength) {
        return message;
    }
    // Try to truncate at a sentence boundary
    const truncated = message.slice(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const cutPoint = Math.max(lastSentence, lastQuestion);
    if (cutPoint > maxLength * 0.5) {
        return truncated.slice(0, cutPoint + 1);
    }
    return truncated.trim() + '...';
}
// ============================================================================
// EXPORTS
// ============================================================================
export const trustSignalEmitter = {
    setEmitter: setSignalEmitter,
    clearEmitter: clearSignalEmitter,
    emit: emitTrustSignal,
    emitGrowth: emitGrowthSignal,
    emitSmallWin: emitSmallWinSignal,
    emitCallback: emitCallbackSignal,
    emitBoundaryRespected: emitBoundaryRespectedSignal,
    emitReadingLines: emitReadingLinesSignal,
    emitThinkingOfYou: emitThinkingOfYouSignal,
    processContext: processContextForSignals,
};
export default trustSignalEmitter;
//# sourceMappingURL=trust-signal-emitter.js.map