/**
 * Phase-Specific Personality Tagging
 *
 * Apply conversation phase personality to SSML output.
 */
import type { ConversationPhase } from '../../intelligence/conversation-state.js';
import type { SpeechContext } from '../speech-context.js';
import type { PersonalityTagOptions } from './types.js';
/**
 * Apply conversation phase personality to text with SSML
 * Maps conversation phases to Jack's authentic voice modes
 */
export declare function applyPhasePersonality(text: string, phase: ConversationPhase, _context: SpeechContext): string;
/**
 * Tag greeting with personality - warm but confident, not slow/timid
 * NOTE: Greetings should feel like Ferni - cool, warm, present
 */
export declare function tagGreetingWithPersonality(text: string, options: PersonalityTagOptions): string;
/**
 * Tag support response with personality - gentle, empathetic, slow
 */
export declare function tagSupportWithPersonality(text: string, options: PersonalityTagOptions): string;
/**
 * Tag advice with personality - measured, thoughtful pauses
 */
export declare function tagAdviceWithPersonality(text: string, options: PersonalityTagOptions): string;
/**
 * Tag wrap-up with personality - warm, affectionate farewell
 */
export declare function tagWrapUpWithPersonality(text: string, options: PersonalityTagOptions): string;
//# sourceMappingURL=phase-personality.d.ts.map