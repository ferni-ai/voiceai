/**
 * Pre-Response Micro-Sounds
 *
 * Opening micro-sounds that create immediate emotional connection:
 * - "Oh!" for good news
 * - "Oh..." for bad news
 * - "Hmm..." for questions
 * - "Hey!" for greetings
 *
 * @module speech/adaptive-ssml/alive-voice/opening-sounds
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { AliveVoiceContext, OpeningSoundOption } from './types.js';

const log = getLogger().child({ module: 'AliveVoice.OpeningSounds' });

// =============================================================================
// OPENING SOUND CONFIGURATION
// =============================================================================

/**
 * Opening micro-sounds based on context.
 * These create immediate emotional connection.
 */
export const OPENING_SOUNDS: Record<string, OpeningSoundOption[]> = {
  // Good news reactions
  goodNews: [
    { sound: 'Oh!', emotion: 'surprised', probability: 0.6 },
    { sound: 'Wow!', emotion: 'excited', probability: 0.3 },
    { sound: "That's—", emotion: 'happy', probability: 0.4 },
  ],
  // Bad news reactions
  badNews: [
    { sound: 'Oh...', emotion: 'sympathetic', probability: 0.7 },
    { sound: 'Mm.', emotion: 'sympathetic', probability: 0.5 },
    { sound: '', emotion: 'sympathetic', probability: 0.3 }, // Sometimes silence is powerful
  ],
  // Questions - thinking sounds
  question: [
    { sound: 'Hmm...', emotion: 'contemplative', probability: 0.4 },
    { sound: 'Well...', emotion: 'contemplative', probability: 0.3 },
    { sound: 'Ah,', emotion: 'curious', probability: 0.2 },
  ],
  // Greetings - warm sounds
  greeting: [
    { sound: 'Hey!', emotion: 'happy', probability: 0.5 },
    { sound: '', emotion: 'affectionate', probability: 0.5 }, // Natural start
  ],
  // Default - engaged sounds
  default: [
    { sound: '', emotion: 'affectionate', probability: 0.7 }, // Usually no sound
    { sound: 'Hmm,', emotion: 'curious', probability: 0.15 },
    { sound: 'Well,', emotion: 'affectionate', probability: 0.15 },
  ],
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Add pre-response micro-sound based on context.
 * These small sounds create immediate emotional connection.
 */
export function addOpeningSound(text: string, context: AliveVoiceContext): string {
  // Determine which sound set to use
  let sounds: OpeningSoundOption[];

  if (context.isGoodNews) {
    sounds = OPENING_SOUNDS.goodNews;
  } else if (context.isBadNews) {
    sounds = OPENING_SOUNDS.badNews;
  } else if (context.isQuestion) {
    sounds = OPENING_SOUNDS.question;
  } else if (context.isGreeting) {
    sounds = OPENING_SOUNDS.greeting;
  } else {
    sounds = OPENING_SOUNDS.default;
  }

  // Select sound based on probability
  const roll = Math.random();
  let cumulativeProbability = 0;

  for (const option of sounds) {
    cumulativeProbability += option.probability;
    if (roll <= cumulativeProbability) {
      if (option.sound === '') {
        // No sound, but add emotion tag
        if (!text.includes('<emotion')) {
          return `<emotion value="${option.emotion}"/>${text}`;
        }
        return text;
      }

      // Add sound with emotion and brief pause
      const opening = `<emotion value="${option.emotion}"/>${option.sound}<break time="80ms"/> `;

      log.debug({ sound: option.sound, emotion: option.emotion }, 'Added opening sound');
      return opening + text;
    }
  }

  return text;
}
