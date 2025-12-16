/**
 * Natural Filler Injection
 *
 * Adds spontaneous speech disfluencies for human-like delivery.
 * Humans naturally use fillers like "um", "well", "you know" -
 * strategically adding these makes TTS output feel more authentic.
 *
 * @module advanced-humanization/fillers
 */

import { createLogger } from '../../utils/safe-logger.js';
import { DEFAULT_FILLER_CONFIG, type FillerConfig } from './types.js';

const log = createLogger({ module: 'AdvancedHumanization' });

// ============================================================================
// FILLER DEFINITIONS
// ============================================================================

/**
 * Fillers categorized by their conversational function
 */
export const FILLERS = {
  /** Thinking/hesitation fillers */
  thinking: ['Hmm', 'Um', 'Let me see', 'Let me think'],

  /** Transition fillers */
  transition: ['So', 'Well', 'Okay so', 'Alright'],

  /** Connection/engagement fillers */
  connection: ['You know', 'I mean', 'Actually'],

  /** Consideration fillers */
  consideration: ['Well', 'I think', 'It seems like'],
} as const;

/**
 * Filler category type
 */
export type FillerCategory = keyof typeof FILLERS;

/**
 * Persona-specific filler preferences
 */
export const PERSONA_FILLER_PREFERENCES: Record<string, FillerCategory[]> = {
  ferni: ['thinking', 'connection', 'consideration'],
  'jack-bogle': ['consideration', 'transition'],
  'peter-john': ['thinking', 'transition'],
  'maya-santos': ['connection', 'thinking'],
  'alex-chen': ['transition', 'consideration'],
  'jordan-taylor': ['connection', 'transition'],
};

// ============================================================================
// FILLER INJECTION LOGIC
// ============================================================================

/**
 * Determine if we should inject a filler at this point
 */
function shouldInjectFiller(
  text: string,
  position: number,
  config: FillerConfig,
  currentFillerCount: number
): boolean {
  // Don't exceed max
  if (currentFillerCount >= config.maxPerResponse) return false;

  // Check probability
  if (Math.random() > config.probability) return false;

  // Good injection points: after sentence start, before important content
  const before = text.slice(Math.max(0, position - 30), position);
  const after = text.slice(position, position + 30);

  // After sentence start
  if (/^[.!?]\s*$/.test(before)) return true;

  // Before explanations
  if (/^(I think|The thing is|What I|Here's)/i.test(after)) return true;

  // After transitions
  if (/\b(But|And|So|However)\s*$/i.test(before)) return true;

  return Math.random() < 0.5; // 50% chance at other points
}

/**
 * Get appropriate filler for context
 */
function getFillerForContext(
  personaId: string | undefined,
  position: 'start' | 'middle' | 'before_important'
): string {
  const preferences = personaId
    ? PERSONA_FILLER_PREFERENCES[personaId] || ['thinking', 'transition']
    : ['thinking', 'transition'];

  // Choose filler type based on position
  let fillerType: FillerCategory;
  switch (position) {
    case 'start':
      fillerType = preferences.includes('transition') ? 'transition' : 'thinking';
      break;
    case 'before_important':
      fillerType = preferences.includes('consideration') ? 'consideration' : 'thinking';
      break;
    case 'middle':
    default: {
      const randomIndex = Math.floor(Math.random() * preferences.length);
      const randomPreference = preferences[randomIndex];
      fillerType = (randomPreference as FillerCategory) ?? 'thinking';
    }
  }

  const options = FILLERS[fillerType];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Inject natural fillers into text
 *
 * Adds conversational fillers like "um", "well", "you know" to make
 * TTS output sound more spontaneous and human-like.
 *
 * @param text - The text to inject fillers into
 * @param config - Filler configuration
 * @param personaId - Optional persona for filler style
 * @returns Text with fillers injected
 */
export function injectNaturalFillers(
  text: string,
  config: FillerConfig = DEFAULT_FILLER_CONFIG,
  personaId?: string
): string {
  // Don't add fillers to very short responses
  if (text.length < 50) return text;

  // Don't add fillers if already has SSML emotion tags (complex response)
  if (text.includes('<emotion')) return text;

  let result = text;
  let fillerCount = 0;
  const sentences = text.split(/(?<=[.!?])\s+/);

  // Process each sentence
  const processedSentences = sentences.map((sentence, index) => {
    // Skip first sentence if it's a greeting
    if (index === 0 && /^(Hi|Hey|Hello|Good|Welcome)/i.test(sentence)) {
      return sentence;
    }

    // Check for injection at sentence start
    if (shouldInjectFiller(text, 0, config, fillerCount) && index > 0) {
      const filler = getFillerForContext(personaId, 'start');
      fillerCount++;
      return `${filler}... <break time="150ms"/> ${sentence}`;
    }

    // Check for injection before important content
    const importantMatch = sentence.match(/^(.{10,}?)(I think|The thing is|What I|Here's)/i);
    if (importantMatch && shouldInjectFiller(text, importantMatch[1].length, config, fillerCount)) {
      const filler = getFillerForContext(personaId, 'before_important');
      fillerCount++;
      return sentence.replace(
        importantMatch[2],
        `${filler}, <break time="100ms"/> ${importantMatch[2]}`
      );
    }

    return sentence;
  });

  result = processedSentences.join(' ');

  if (fillerCount > 0) {
    log.debug({ fillerCount, personaId }, 'Injected natural fillers');
  }

  return result;
}
