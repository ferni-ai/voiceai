/**
 * Automatic Moment Detection
 *
 * > "We hear what you're not saying."
 *
 * Automatically detects significant moments in conversations:
 * - Breakthroughs (insights, realizations)
 * - Vulnerability (opening up, sharing feelings)
 * - Laughter (genuine connection)
 * - Celebrations (wins, achievements)
 * - Crisis support (being there during hard times)
 * - Trust demonstrations (sharing something sensitive)
 *
 * This powers the Relationship Memory Engine's automatic tracking.
 *
 * NOTE: This file now delegates to unified-moment-detection.ts as the
 * single source of truth. We keep this file for backward compatibility
 * with existing imports.
 */
import type { SharedMomentType } from './relationship-memory/types.js';
import { extractMemorableMoments as extractMemorableMomentsUnified } from './unified-moment-detection.js';
/**
 * Detected moment with confidence and metadata
 */
export interface DetectedMoment {
    type: SharedMomentType;
    confidence: number;
    summary: string;
    userPhrase?: string;
    topic?: string;
    significance: number;
    tags: string[];
}
/**
 * Context for moment detection
 */
export interface MomentDetectionContext {
    /** User's message */
    userMessage: string;
    /** AI's response (if available) */
    aiResponse?: string;
    /** Current topic being discussed */
    topic?: string;
    /** User's emotional state (if detected) */
    emotionalState?: string;
    /** Session number */
    sessionNumber: number;
    /** Is this the first vulnerability share? */
    hasSharedVulnerabilityBefore: boolean;
    /** Previous mood in session */
    previousMood?: string;
}
/**
 * Detect all significant moments in a message
 */
export declare function detectMoments(context: MomentDetectionContext): DetectedMoment[];
/**
 * Detect the most significant moment in a message
 */
export declare function detectPrimaryMoment(context: MomentDetectionContext): DetectedMoment | null;
/**
 * Check if message contains any significant moment
 */
export declare function hasMoment(context: MomentDetectionContext): boolean;
/**
 * Get moment type priority (for filtering)
 */
export declare function getMomentPriority(type: SharedMomentType): number;
/**
 * NEW: Detect moments using unified system (preferred method)
 *
 * Returns the full unified result including memorable details for callbacks
 */
export declare function detectMomentsUnifiedWrapper(context: MomentDetectionContext): import("./unified-moment-detection.js").MomentDetectionResult;
/**
 * NEW: Re-export unified extractMemorableMoments
 */
export { extractMemorableMomentsUnified as extractMemorableMoments };
declare const _default: {
    detectMoments: typeof detectMoments;
    detectPrimaryMoment: typeof detectPrimaryMoment;
    hasMoment: typeof hasMoment;
    getMomentPriority: typeof getMomentPriority;
    detectMomentsUnifiedWrapper: typeof detectMomentsUnifiedWrapper;
    extractMemorableMoments: typeof extractMemorableMomentsUnified;
};
export default _default;
//# sourceMappingURL=moment-detection.d.ts.map