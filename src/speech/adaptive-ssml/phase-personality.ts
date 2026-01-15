/**
 * Phase-Specific Personality Tagging
 *
 * Apply conversation phase personality to SSML output.
 */

import type { ConversationPhase } from '../../intelligence/state/conversation.js';
import type { SpeechContext } from '../speech-context.js';
import type { PersonalityTagOptions } from './types.js';

// ============================================================================
// PHASE-SPECIFIC PERSONALITY TAGGING
// ============================================================================

/**
 * Apply conversation phase personality to text with SSML
 * Maps conversation phases to Jack's authentic voice modes
 */
export function applyPhasePersonality(
  text: string,
  phase: ConversationPhase,
  _context: SpeechContext
): string {
  switch (phase) {
    case 'greeting':
      // Warm welcome - confident and present, not slow/timid
      // NOTE: Previous 0.85 speed made Ferni sound weird and cautious
      return tagGreetingWithPersonality(text, {
        speedRatio: 0.95, // Natural pace, confident
        pauseMultiplier: 1.1, // Just enough pause to feel warm
        emotion: 'affectionate',
        volumeRatio: 1.0,
      });

    case 'warming_up':
      // Curious friend - natural pace, curious emotion
      return `<emotion value="curious"><speed ratio="0.88">${text}</speed></emotion>`;

    case 'exploring':
      // Engaged listener - measured pace, curious/interested
      return `<emotion value="curious"><speed ratio="0.88"><volume ratio="0.95">${text}</volume></speed></emotion>`;

    case 'advising':
      // Wise counselor - slower, measured, NO emotion tag (let content speak)
      return tagAdviceWithPersonality(text, {
        speedRatio: 0.82,
        pauseMultiplier: 1.2,
        volumeRatio: 0.95,
      });

    case 'supporting':
      // Tender elder - very slow, soft volume, sad emotion for empathy
      return tagSupportWithPersonality(text, {
        speedRatio: 0.75,
        volumeRatio: 0.85,
        pauseMultiplier: 1.5,
        emotion: 'sad', // Cartesia uses 'sad' for empathy
      });

    case 'wrapping_up':
      // Warm farewell - slow, warm, affectionate
      return tagWrapUpWithPersonality(text, {
        speedRatio: 0.85,
        emotion: 'affectionate',
        pauseMultiplier: 1.2,
      });

    case 'follow_up':
      // Reconnecting friend - warm, pleased to see them
      return `<emotion value="affectionate"><speed ratio="0.88">${text}</speed></emotion>`;

    default:
      return text;
  }
}

// ============================================================================
// PERSONALITY TAG HELPERS
// ============================================================================

/**
 * Tag greeting with personality - warm but confident, not slow/timid
 * NOTE: Greetings should feel like Ferni - cool, warm, present
 */
export function tagGreetingWithPersonality(text: string, options: PersonalityTagOptions): string {
  const speed = options.speedRatio || 0.95; // Natural pace
  const emotion = options.emotion || 'affectionate';
  const volume = options.volumeRatio || 1.0;

  // Add natural greeting pauses (shorter for confident delivery)
  const tagged = text.replace(
    /\b(Hi|Hello|Good morning|Good afternoon|Good evening)\b/i,
    `$1<break time="150ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed></emotion>`;
}

/**
 * Tag support response with personality - gentle, empathetic, slow
 */
export function tagSupportWithPersonality(text: string, options: PersonalityTagOptions): string {
  const speed = options.speedRatio || 0.75;
  const volume = options.volumeRatio || 0.85;
  const emotion = options.emotion || 'sad';

  // Add extra pauses for breathing room
  let tagged = text.replace(/\.\s+/g, '.<break time="400ms"/> ');
  tagged = tagged.replace(/,\s+/g, ',<break time="250ms"/> ');

  return `<emotion value="${emotion}"><speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed></emotion>`;
}

/**
 * Tag advice with personality - measured, thoughtful pauses
 */
export function tagAdviceWithPersonality(text: string, options: PersonalityTagOptions): string {
  const speed = options.speedRatio || 0.82;
  const volume = options.volumeRatio || 0.95;

  // Add thoughtful pauses before key points
  const tagged = text.replace(
    /\b(Here's what I think|Let me tell you|The truth is|You know what)\b/i,
    `<break time="300ms"/>$1`
  );

  return `<speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed>`;
}

/**
 * Tag wrap-up with personality - warm, affectionate farewell
 */
export function tagWrapUpWithPersonality(text: string, options: PersonalityTagOptions): string {
  const speed = options.speedRatio || 0.85;
  const emotion = options.emotion || 'affectionate';

  // Add warm pauses
  const tagged = text.replace(
    /\b(Take care|Good luck|Until next time|God bless)\b/i,
    `$1<break time="300ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}">${tagged}</speed></emotion>`;
}
