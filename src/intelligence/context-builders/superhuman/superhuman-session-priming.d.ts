/**
 * Superhuman Session Priming
 *
 * "Better Than Human" - Surface ALL superhuman capabilities at session start.
 *
 * This builder runs on the FIRST few turns to ensure Ferni's superhuman
 * memory and awareness is active from the start of every conversation.
 *
 * Capabilities surfaced:
 * 1. Active commitments (due/overdue)
 * 2. Dreams being tracked
 * 3. Important dates coming up
 * 4. Relationship milestones
 * 5. Capacity/burnout indicators
 * 6. Values alignment opportunities
 * 7. Seasonal awareness
 *
 * @module SuperhumanSessionPriming
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildSuperhumanSessionPriming(input: ContextBuilderInput): Promise<ContextInjection[]>;
export declare function clearSuperhumanPrimingSession(sessionId: string): void;
export declare function clearAllSuperhumanPrimingSessions(): void;
export { buildSuperhumanSessionPriming };
//# sourceMappingURL=superhuman-session-priming.d.ts.map