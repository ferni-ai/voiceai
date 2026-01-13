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
import type { TrustContext } from './index.js';
import type { GrowthReflection } from './growth-reflection.js';
import type { CelebrationOpportunity } from './small-wins.js';
import type { CallbackOpportunity } from './inside-jokes.js';
import type { UnsaidSignal } from './reading-between-lines.js';
import type { ThinkingOfYouMoment } from './thinking-of-you.js';
import type { BoundaryCheckResult } from './boundary-memory.js';
/**
 * Signal types that match the frontend UI
 */
export type TrustSignalType = 'growth' | 'boundary' | 'callback' | 'small_win' | 'thinking_of_you' | 'reading_lines';
/**
 * A trust signal ready to be sent to the frontend
 */
export interface TrustSignalPayload {
    type: TrustSignalType;
    title: string;
    message: string;
    personaId?: string;
    /** Whether this should interrupt or wait */
    timing: 'immediate' | 'after_response' | 'end_of_turn';
    /** Original system data for debugging/analytics */
    metadata?: Record<string, unknown>;
}
/**
 * Callback to emit signals (injected by the voice agent)
 */
export type SignalEmitCallback = (signal: TrustSignalPayload) => void;
/**
 * Set the callback used to emit signals to the frontend.
 * This is typically wired up in the voice agent's data message handler.
 */
export declare function setSignalEmitter(callback: SignalEmitCallback): void;
/**
 * Clear the signal emitter.
 */
export declare function clearSignalEmitter(): void;
/**
 * Emit a trust signal to the frontend.
 * Handles deduplication and rate limiting.
 */
export declare function emitTrustSignal(signal: TrustSignalPayload): void;
/**
 * Generate a growth signal from a growth reflection.
 */
export declare function emitGrowthSignal(reflection: GrowthReflection, personaId?: string): void;
/**
 * Generate a small win signal from a celebration opportunity.
 */
export declare function emitSmallWinSignal(celebration: CelebrationOpportunity, personaId?: string): void;
/**
 * Generate a callback signal from a callback opportunity.
 */
export declare function emitCallbackSignal(callback: CallbackOpportunity, personaId?: string): void;
/**
 * Generate a signal for respecting a boundary.
 * Only emit when we actively chose NOT to mention something.
 */
export declare function emitBoundaryRespectedSignal(boundaryCheck: BoundaryCheckResult, personaId?: string): void;
/**
 * Generate a signal for reading between the lines.
 */
export declare function emitReadingLinesSignal(unsaidSignal: UnsaidSignal, personaId?: string): void;
/**
 * Generate a thinking-of-you signal for proactive outreach.
 */
export declare function emitThinkingOfYouSignal(moment: ThinkingOfYouMoment, personaId?: string): void;
/**
 * Process a TrustContext and emit any relevant signals.
 * Call this after building trust context for a conversation turn.
 */
export declare function processContextForSignals(trustContext: TrustContext, personaId?: string): void;
export declare const trustSignalEmitter: {
    setEmitter: typeof setSignalEmitter;
    clearEmitter: typeof clearSignalEmitter;
    emit: typeof emitTrustSignal;
    emitGrowth: typeof emitGrowthSignal;
    emitSmallWin: typeof emitSmallWinSignal;
    emitCallback: typeof emitCallbackSignal;
    emitBoundaryRespected: typeof emitBoundaryRespectedSignal;
    emitReadingLines: typeof emitReadingLinesSignal;
    emitThinkingOfYou: typeof emitThinkingOfYouSignal;
    processContext: typeof processContextForSignals;
};
export default trustSignalEmitter;
//# sourceMappingURL=trust-signal-emitter.d.ts.map