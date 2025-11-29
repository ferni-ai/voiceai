/**
 * Adaptive SSML Tagger
 *
 * Wraps the existing SSML tagger with adaptive parameters based on speech context.
 * Adjusts speed, pauses, laughter, and emotion based on user and conversation state.
 */

import { log } from '@livekit/agents';
import { tagTextWithSsml } from '../ssml-tagger.js';
import type { SpeechContext } from './speech-context.js';
import type { ConversationPhase } from '../intelligence/conversation-state.js';

const getLogger = () => log();

// ============================================================================
// ADAPTIVE TAGGING
// ============================================================================

/**
 * Tag text with SSML, adapting to speech context
 */
export function tagTextWithSsmlAdaptive(text: string, context: SpeechContext): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // If already has SSML tags, adjust existing tags
  if (text.includes('<')) {
    return adjustExistingSsml(text, context);
  }

  // First, use the base tagger
  let tagged = tagTextWithSsml(text);

  // Then apply adaptive adjustments
  tagged = applySpeedAdaptation(tagged, context);
  tagged = applyPauseAdaptation(tagged, context);
  tagged = applyWarmthAdjustment(tagged, context);
  tagged = applyEmotionAdaptation(tagged, context);

  getLogger().debug(
    `Adaptive SSML: speed=${context.baseSpeed.toFixed(2)}, energy=${context.energyMultiplier.toFixed(2)}`
  );

  return tagged;
}

/**
 * Adjust existing SSML tags to match context
 */
function adjustExistingSsml(text: string, context: SpeechContext): string {
  let result = text;

  // Adjust speed ratios
  result = result.replace(/<speed ratio="([\d.]+)"\/>/g, (match, ratio) => {
    const original = parseFloat(ratio);
    const adjusted = original * context.baseSpeed * context.energyMultiplier;
    return `<speed ratio="${Math.max(0.6, Math.min(1.2, adjusted)).toFixed(2)}"/>`;
  });

  // Adjust break times based on pause multiplier
  result = result.replace(/<break time="(\d+)ms"\/>/g, (match, ms) => {
    const original = parseInt(ms);
    const adjusted = Math.round(original * context.pauseMultiplier);
    return `<break time="${adjusted}ms"/>`;
  });

  return result;
}

/**
 * Apply speed adaptation
 */
function applySpeedAdaptation(text: string, context: SpeechContext): string {
  const targetSpeed = context.baseSpeed * context.energyMultiplier;

  // Adjust all speed tags proportionally
  return text.replace(/<speed ratio="([\d.]+)"\/>/g, (match, ratio) => {
    const original = parseFloat(ratio);
    // Scale relative to target (if original is 0.88, and target is 0.80, result is ~0.80)
    const adjusted = original * (targetSpeed / 0.88);
    return `<speed ratio="${Math.max(0.6, Math.min(1.2, adjusted)).toFixed(2)}"/>`;
  });
}

/**
 * Apply pause adaptation
 */
function applyPauseAdaptation(text: string, context: SpeechContext): string {
  // Multiply all pause durations
  return text.replace(/<break time="(\d+)ms"\/>/g, (match, ms) => {
    const original = parseInt(ms);
    const adjusted = Math.round(original * context.pauseMultiplier);
    // Cap pauses at reasonable values
    const capped = Math.min(adjusted, 1500);
    return `<break time="${capped}ms"/>`;
  });
}

/**
 * Adjust warmth/affectionate tone based on context
 * NOTE: Cartesia Sonic-3 valid emotions: angry, sad, surprised, curious, affectionate
 * We use pauses and speed adjustments to convey warmth variations.
 */
function applyWarmthAdjustment(text: string, context: SpeechContext): string {
  // In light topics with high energy, add brief pauses for warmth (simulates chuckle)
  if (context.topicWeight === 'light' && context.allowLaughter) {
    // Add slight pause after positive phrases to convey warmth
    return text.replace(/(that's wonderful|that's great|i love|how wonderful)/gi, (match) => {
      return `${match}<break time="150ms"/>`;
    });
  }
  return text;
}

/**
 * Apply emotion adaptation
 * Valid Cartesia Sonic-3 emotions: angry, sad, surprised, curious, affectionate
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags#emotion-beta
 */
function applyEmotionAdaptation(text: string, context: SpeechContext): string {
  // In heavy topics or supporting phase, use 'sad' for empathetic tone
  if (context.topicWeight === 'heavy' || context.conversationPhase === 'supporting') {
    return text.replace(/<emotion value="[^"]+"/g, '<emotion value="sad"');
  }

  // If user is low energy, use longer pauses and slower speed for calmer feel
  // NOTE: 'calm' is NOT a valid Cartesia emotion - we achieve calm via speed/pauses
  if (context.userEnergy === 'low') {
    // Keep affectionate but add calming pauses
    return text.replace(/<emotion value="affectionate"\/>/g, (match) => {
      return `${match}<speed ratio="${Math.max(0.7, context.baseSpeed * 0.9).toFixed(2)}"/>`;
    });
  }

  return text;
}

// ============================================================================
// SPECIALIZED TAGGERS
// ============================================================================

/**
 * Tag greeting specifically - warmer, slower
 */
export function tagGreeting(text: string, context: SpeechContext): string {
  // Greetings should be extra warm and slow
  const greetingContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.8),
    pauseMultiplier: context.pauseMultiplier * 1.2,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, greetingContext);
}

/**
 * Tag emotional support response - very gentle
 */
export function tagSupportResponse(text: string, context: SpeechContext): string {
  const supportContext: SpeechContext = {
    ...context,
    baseSpeed: 0.75,
    pauseMultiplier: 1.5,
    allowLaughter: false,
    emotionIntensity: 0.5,
  };

  return tagTextWithSsmlAdaptive(text, supportContext);
}

/**
 * Tag advice/wisdom - measured, thoughtful
 */
export function tagAdvice(text: string, context: SpeechContext): string {
  const adviceContext: SpeechContext = {
    ...context,
    baseSpeed: Math.min(context.baseSpeed, 0.85),
    pauseMultiplier: 1.3,
  };

  return tagTextWithSsmlAdaptive(text, adviceContext);
}

/**
 * Tag story/anecdote - more dynamic
 */
export function tagStory(text: string, context: SpeechContext): string {
  const storyContext: SpeechContext = {
    ...context,
    baseSpeed: context.baseSpeed * 1.05, // Slightly faster for stories
    allowLaughter: true,
    emotionIntensity: 0.85,
  };

  return tagTextWithSsmlAdaptive(text, storyContext);
}

/**
 * Tag wrap-up/goodbye - warm, unhurried
 */
export function tagWrapUp(text: string, context: SpeechContext): string {
  const wrapUpContext: SpeechContext = {
    ...context,
    baseSpeed: 0.78,
    pauseMultiplier: 1.4,
    emotionIntensity: 0.9,
  };

  return tagTextWithSsmlAdaptive(text, wrapUpContext);
}

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
  context: SpeechContext
): string {
  switch (phase) {
    case 'greeting':
      // Warm welcome - slower, warmer, more pauses, affectionate
      return tagGreetingWithPersonality(text, {
        speedRatio: 0.85,
        pauseMultiplier: 1.3,
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

/**
 * Tag greeting with personality - warm pauses and affection
 */
export function tagGreetingWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    pauseMultiplier?: number;
    emotion?: string;
    volumeRatio?: number;
  }
): string {
  const speed = options.speedRatio || 0.85;
  const emotion = options.emotion || 'affectionate';
  const volume = options.volumeRatio || 1.0;

  // Add natural greeting pauses
  let tagged = text.replace(
    /\b(Hi|Hello|Good morning|Good afternoon|Good evening)\b/i,
    `$1<break time="200ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed></emotion>`;
}

/**
 * Tag support response with personality - gentle, empathetic, slow
 */
export function tagSupportWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    volumeRatio?: number;
    pauseMultiplier?: number;
    emotion?: string;
  }
): string {
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
export function tagAdviceWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    pauseMultiplier?: number;
    volumeRatio?: number;
  }
): string {
  const speed = options.speedRatio || 0.82;
  const volume = options.volumeRatio || 0.95;

  // Add thoughtful pauses before key points
  let tagged = text.replace(
    /\b(Here's what I think|Let me tell you|The truth is|You know what)\b/i,
    `<break time="300ms"/>$1`
  );

  return `<speed ratio="${speed}"><volume ratio="${volume}">${tagged}</volume></speed>`;
}

/**
 * Tag wrap-up with personality - warm, affectionate farewell
 */
export function tagWrapUpWithPersonality(
  text: string,
  options: {
    speedRatio?: number;
    emotion?: string;
    pauseMultiplier?: number;
  }
): string {
  const speed = options.speedRatio || 0.85;
  const emotion = options.emotion || 'affectionate';

  // Add warm pauses
  let tagged = text.replace(
    /\b(Take care|Good luck|Until next time|God bless)\b/i,
    `$1<break time="300ms"/>`
  );

  return `<emotion value="${emotion}"><speed ratio="${speed}">${tagged}</speed></emotion>`;
}

export default {
  tagTextWithSsmlAdaptive,
  tagGreeting,
  tagSupportResponse,
  tagAdvice,
  tagStory,
  tagWrapUp,
  applyPhasePersonality,
  tagGreetingWithPersonality,
  tagSupportWithPersonality,
  tagAdviceWithPersonality,
  tagWrapUpWithPersonality,
};
