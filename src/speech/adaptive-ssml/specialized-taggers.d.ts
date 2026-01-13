/**
 * Specialized SSML Taggers
 *
 * Purpose-specific SSML tagging for different response types.
 */
import type { SpeechContext } from '../speech-context.js';
/**
 * Tag greeting specifically - warm but confident, not slow/timid
 * NOTE: Previous settings (0.8 speed, 1.2x pauses) made Ferni sound weird and cautious
 * Greetings should feel natural and present, like meeting a friend
 */
export declare function tagGreeting(text: string, context: SpeechContext, personaId?: string): string;
/**
 * Tag emotional support response - very gentle
 */
export declare function tagSupportResponse(text: string, context: SpeechContext, personaId?: string): string;
/**
 * Tag advice/wisdom - measured, thoughtful
 */
export declare function tagAdvice(text: string, context: SpeechContext, personaId?: string): string;
/**
 * Tag story/anecdote - more dynamic
 */
export declare function tagStory(text: string, context: SpeechContext, personaId?: string): string;
/**
 * Tag wrap-up/goodbye - warm, unhurried
 */
export declare function tagWrapUp(text: string, context: SpeechContext, personaId?: string): string;
//# sourceMappingURL=specialized-taggers.d.ts.map