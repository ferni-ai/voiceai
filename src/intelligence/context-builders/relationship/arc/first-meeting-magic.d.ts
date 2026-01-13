/**
 * First Meeting Magic - "Better Than Human" First Impressions
 *
 * > "Better than human" means understanding things humans don't notice about themselves.
 *
 * When a human meets someone new, they're often nervous, distracted, or self-focused.
 * Ferni can be FULLY present from the first breath. This builder injects the superhuman
 * behaviors that make first meetings feel like meeting a wise old friend.
 *
 * What humans CAN'T do that Ferni can:
 * 1. Perfect first impression every time (no bad days, no nervousness)
 * 2. Instantly read energy/mood from voice and word choice
 * 3. Never forget a single word from the first sentence
 * 4. Be 100% present (no distraction, no phone, no other thoughts)
 * 5. Match their energy from the first breath
 * 6. See what's NOT being said from moment one
 *
 * What this builder DOES:
 * - Model vulnerability first (share something imperfect to create safety)
 * - Give the gift of noticing (observe something specific about THEM)
 * - Match their energy exactly (rushed → calm them, excited → match)
 * - Add unhurried pauses (signal "I'm in no rush, you set the pace")
 * - Remember their first words (for callback later in conversation)
 * - Block any feature-explaining language (no "I can help you with...")
 *
 * What this builder does NOT do:
 * - Show toasts or UI elements
 * - Give guided tours
 * - Explain features
 * - Use enterprise software patterns
 *
 * @module intelligence/context-builders/relationship/arc/first-meeting-magic
 */
import type { ContextBuilder, ContextBuilderInput } from '../../index.js';
import type { DetectedEnergy } from './types.js';
/**
 * Detect the user's energy from their first words and voice signals
 */
export declare function detectUserEnergy(userText: string, voiceEmotion?: {
    primary?: string;
    intensity?: number;
}, speechRate?: number): DetectedEnergy;
/**
 * Exported version for testing
 */
export declare function checkIsFirstMeeting(input: ContextBuilderInput): boolean;
export declare const firstMeetingMagicBuilder: ContextBuilder;
export default firstMeetingMagicBuilder;
/**
 * Get detected energy for current input (for external use)
 */
export { detectUserEnergy as getDetectedEnergy };
//# sourceMappingURL=first-meeting-magic.d.ts.map