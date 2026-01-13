/**
 * Captured Data Awareness Context Builder
 *
 * Surfaces what the "Better Than Human" passive capture has learned about this user.
 * This enables Ferni to reference saved information naturally.
 *
 * Data surfaced:
 * - Saved contacts (phone numbers, relationships)
 * - Pet information
 * - Favorite places
 * - Relationship network summary
 * - Recent capture activity
 *
 * Philosophy: Ferni should know WHAT has been captured so they can
 * reference it naturally ("I have your mom's number saved" vs guessing)
 *
 * @module intelligence/context-builders/awareness/captured-data-awareness
 */
import type { ContextBuilder } from '../core/types.js';
export declare const capturedDataAwarenessBuilder: ContextBuilder;
export default capturedDataAwarenessBuilder;
//# sourceMappingURL=captured-data-awareness.d.ts.map