/**
 * Family Awareness Context Builder
 *
 * Injects mutual awareness context between family members and sponsors.
 * Enables Ferni to naturally mention relevant information about family
 * members during conversations, with strict privacy boundaries.
 *
 * What CAN be shared:
 * - Emotional state hints: "Your mom seemed happy last time we talked"
 * - Explicit shares: "Your mom asked me to tell you..."
 * - Check-in requests: "Your mom asked me to check on you"
 * - Positive milestones: "Your mom's been walking more - she's doing great"
 *
 * What CANNOT be shared:
 * - Specific conversation content (unless explicitly shared)
 * - Health details beyond general wellness
 * - Financial information
 * - Personal topics marked sensitive
 *
 * @module intelligence/context-builders/external/family-awareness-context
 */
import { type ContextBuilder } from '../index.js';
/**
 * Family awareness context builder.
 * Injects mutual awareness context between family members.
 */
export declare const familyAwarenessContextBuilder: ContextBuilder;
export default familyAwarenessContextBuilder;
//# sourceMappingURL=family-awareness-context.d.ts.map