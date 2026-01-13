/**
 * Specialized SSML Taggers
 *
 * Purpose-specific SSML tagging for different response types.
 */
import { tagTextWithSsmlAdaptive } from './adaptation.js';
// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================
/**
 * Tag greeting specifically - warm but confident, not slow/timid
 * NOTE: Previous settings (0.8 speed, 1.2x pauses) made Ferni sound weird and cautious
 * Greetings should feel natural and present, like meeting a friend
 */
export function tagGreeting(text, context, personaId) {
    // Greetings should be warm but confident - don't over-slow
    const greetingContext = {
        ...context,
        baseSpeed: Math.min(context.baseSpeed, 0.95), // Natural pace, not dragging
        pauseMultiplier: context.pauseMultiplier * 1.05, // Minimal extra pauses
        emotionIntensity: 0.85,
    };
    return tagTextWithSsmlAdaptive(text, greetingContext, personaId);
}
/**
 * Tag emotional support response - very gentle
 */
export function tagSupportResponse(text, context, personaId) {
    const supportContext = {
        ...context,
        baseSpeed: 0.75,
        pauseMultiplier: 1.5,
        allowLaughter: false,
        emotionIntensity: 0.5,
    };
    return tagTextWithSsmlAdaptive(text, supportContext, personaId);
}
/**
 * Tag advice/wisdom - measured, thoughtful
 */
export function tagAdvice(text, context, personaId) {
    const adviceContext = {
        ...context,
        baseSpeed: Math.min(context.baseSpeed, 0.85),
        pauseMultiplier: 1.3,
    };
    return tagTextWithSsmlAdaptive(text, adviceContext, personaId);
}
/**
 * Tag story/anecdote - more dynamic
 */
export function tagStory(text, context, personaId) {
    const storyContext = {
        ...context,
        baseSpeed: context.baseSpeed * 1.05, // Slightly faster for stories
        allowLaughter: true,
        emotionIntensity: 0.85,
    };
    return tagTextWithSsmlAdaptive(text, storyContext, personaId);
}
/**
 * Tag wrap-up/goodbye - warm, unhurried
 */
export function tagWrapUp(text, context, personaId) {
    const wrapUpContext = {
        ...context,
        baseSpeed: 0.78,
        pauseMultiplier: 1.4,
        emotionIntensity: 0.9,
    };
    return tagTextWithSsmlAdaptive(text, wrapUpContext, personaId);
}
//# sourceMappingURL=specialized-taggers.js.map