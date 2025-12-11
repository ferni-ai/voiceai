/**
 * Specialized SSML Taggers
 *
 * Purpose-specific SSML tagging for different response types.
 */

import type { SpeechContext } from '../speech-context.js';
import { tagTextWithSsmlAdaptive } from './adaptation.js';

// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================

/**
 * Tag greeting specifically - warmer, slower
 */
export function tagGreeting(text: string, context: SpeechContext, personaId?: string): string {
  // Greetings should be extra warm and slow
  const greetingContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.8),
    pauseMultiplier: context.pauseMultiplier * 1.2,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, greetingContext, personaId);
}

/**
 * Tag emotional support response - very gentle
 */
export function tagSupportResponse(
  text: string,
  context: SpeechContext,
  personaId?: string
): string {
  const supportContext: SpeechContext = {
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
export function tagAdvice(text: string, context: SpeechContext, personaId?: string): string {
  const adviceContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.85),
    pauseMultiplier: 1.3,
  };

  return tagTextWithSsmlAdaptive(text, adviceContext, personaId);
}

/**
 * Tag story/anecdote - more dynamic
 */
export function tagStory(text: string, context: SpeechContext, personaId?: string): string {
  const storyContext: SpeechContext = {
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
export function tagWrapUp(text: string, context: SpeechContext, personaId?: string): string {
  const wrapUpContext: SpeechContext = {
    ...context,
    baseSpeed: 0.78,
    pauseMultiplier: 1.4,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, wrapUpContext, personaId);
}
