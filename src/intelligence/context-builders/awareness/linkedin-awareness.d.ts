/**
 * LinkedIn Awareness Context Builder
 *
 * Injects career milestones and professional context from LinkedIn.
 * "Better than Human" - remember work anniversaries and career transitions.
 *
 * Superhuman Capabilities:
 * - "Your 5-year work anniversary at Acme is coming up next Tuesday!"
 * - "I see you've been in your role for 3 years - how are you feeling about it?"
 * - "Your connection Sarah just started a new position - might be worth reaching out"
 *
 * @module intelligence/context-builders/awareness/linkedin-awareness
 */
import { type ContextBuilder } from '../index.js';
/**
 * LinkedIn Awareness Context Builder
 *
 * Priority: 50 (middle - after core context, before humanizing)
 */
export declare const linkedInAwarenessBuilder: ContextBuilder;
export { hasLinkedInConnected, initializeLinkedIn, getUpcomingMilestones, getCurrentPosition, getLinkedInProfile, } from '../../../services/linkedin/index.js';
//# sourceMappingURL=linkedin-awareness.d.ts.map