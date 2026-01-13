/**
 * Session Gap Awareness Context Builder
 *
 * Surfaces how long it's been since the user's last session, with warm
 * guidance on how to acknowledge the reconnection naturally.
 *
 * "Better Than Human" means noticing: "It's been a while - good to hear from you"
 * without making it awkward ("Where have you been?").
 *
 * Gap Tiers:
 * - 1-2 days: Normal cadence, no special injection
 * - 3-5 days: Warm acknowledgment opportunity
 * - 6-14 days: Check-in with care, no pressure
 * - 14+ days: Celebrate the reconnection
 *
 * @module intelligence/context-builders/awareness/session-gap-awareness
 */
import type { ContextBuilder } from '../core/types.js';
export declare const sessionGapAwarenessBuilder: ContextBuilder;
export default sessionGapAwarenessBuilder;
//# sourceMappingURL=session-gap-awareness.d.ts.map