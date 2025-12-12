/**
 * Natural Speech Patterns
 *
 * Fillers, self-corrections, and thinking out loud - the "humanness" layer.
 *
 * Real people don't speak in perfect paragraphs. They pause, correct themselves,
 * and think out loud. This module adds those natural speech patterns.
 *
 * @module conversation/superhuman/natural-speech
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'NaturalSpeech' });

// ============================================================================
// TYPES
// ============================================================================

export interface SpeechModification {
  type: ModificationType;
  insertion: string;
  position: 'start' | 'middle' | 'end';
  probability: number;
}

export type ModificationType =
  | 'filler'
  | 'hedge'
  | 'thinking_aloud'
  | 'self_correction'
  | 'emphasis'
  | 'personal_aside'
  | 'relatable_moment';

export interface NaturalSpeechConfig {
  // How often to add natural speech patterns (0-1)
  frequency: number;
  // Which patterns to use
  enabledPatterns: ModificationType[];
  // Persona-specific adjustments
  personaStyle?: 'warm' | 'thoughtful' | 'energetic' | 'calm';
}

// ============================================================================
// SPEECH PATTERNS BY PERSONA STYLE
// ============================================================================

const FILLERS: Record<string, string[]> = {
  warm: [
    'You know what,',
    'I was just thinking,',
    'Here\'s the thing—',
    'Honestly,',
    'I mean,',
  ],
  thoughtful: [
    'Hmm,',
    'Let me think about that...',
    'That\'s interesting because...',
    'The thing is,',
    'I wonder if...',
  ],
  energetic: [
    'Oh!',
    'Wait—',
    'Okay so,',
    'Here\'s what I think—',
    'You know what I love about that?',
  ],
  calm: [
    'Well,',
    'You see,',
    'The way I see it,',
    'In my experience,',
    'I think...',
  ],
};

const HEDGES: Record<string, string[]> = {
  warm: [
    'I might be wrong, but',
    'From what I can tell,',
    'It seems like',
    'If I\'m understanding right,',
  ],
  thoughtful: [
    'I could be off here, but',
    'My sense is',
    'It appears that',
    'Based on what you\'ve shared,',
  ],
  energetic: [
    'I\'m not 100% sure but',
    'This might just be me but',
    'I could be totally wrong—',
  ],
  calm: [
    'Perhaps',
    'It may be that',
    'One possibility is',
    'It could be',
  ],
};

const THINKING_ALOUD: Record<string, string[]> = {
  warm: [
    'Let me sit with that for a second...',
    'Okay, I\'m processing...',
    'Give me a moment to think about that properly...',
    'I want to give that the thought it deserves...',
  ],
  thoughtful: [
    'Let me consider that...',
    'I\'m turning that over in my mind...',
    'There\'s something there...',
    'I want to think about this carefully...',
  ],
  energetic: [
    'Okay okay okay, let me think—',
    'Wait, I\'m having a thought—',
    'Hold on, something\'s clicking—',
  ],
  calm: [
    'Let me reflect on that...',
    'I\'m taking that in...',
    'That\'s worth sitting with...',
  ],
};

const SELF_CORRECTIONS: Record<string, string[]> = {
  warm: [
    'Actually, wait—let me rephrase that.',
    'No, that came out wrong. What I mean is—',
    'Actually, that\'s not quite right. What I really think is—',
    'Hmm, let me try that again—',
  ],
  thoughtful: [
    'Actually, I want to revise that.',
    'No, let me be more precise—',
    'That\'s not exactly what I mean. Let me clarify—',
    'I should put that differently—',
  ],
  energetic: [
    'Wait no—scratch that—',
    'Actually! No. What I meant was—',
    'Okay that didn\'t come out right—',
  ],
  calm: [
    'Let me put that another way.',
    'Actually, a better way to say it is—',
    'No, what I really mean is—',
  ],
};

const EMPHASIS: Record<string, string[]> = {
  warm: [
    'And I really mean that.',
    'I want you to hear this—',
    'This is important—',
    'Don\'t skip over this part—',
  ],
  thoughtful: [
    'And I say that with intention.',
    'This matters—',
    'Pay attention to this part—',
  ],
  energetic: [
    'Seriously!',
    'I\'m not just saying that!',
    'This is actually huge—',
  ],
  calm: [
    'And I mean that genuinely.',
    'This is significant.',
    'Take this in—',
  ],
};

const PERSONAL_ASIDES: Record<string, string[]> = {
  warm: [
    '(And between you and me,',
    '(Can I be honest with you?',
    '(This is something I don\'t say to everyone, but',
  ],
  thoughtful: [
    '(And speaking personally,',
    '(I\'ll share something with you—',
  ],
  energetic: [
    '(Okay real talk—',
    '(Between us—',
  ],
  calm: [
    '(I\'ll tell you something—',
    '(Just between us—',
  ],
};

const RELATABLE_MOMENTS: Record<string, string[]> = {
  warm: [
    'I get it—I\'ve been there.',
    'I totally know that feeling.',
    'Oh, I so relate to that.',
  ],
  thoughtful: [
    'That resonates with me.',
    'I\'ve experienced something similar.',
    'I understand that deeply.',
  ],
  energetic: [
    'Oh my gosh, same!',
    'I know EXACTLY what you mean!',
    'Yes! I\'ve felt that too!',
  ],
  calm: [
    'I understand.',
    'That makes sense to me.',
    'I hear you.',
  ],
};

// ============================================================================
// PATTERN SELECTION
// ============================================================================

/**
 * Get a random speech modification based on context
 */
export function getSpeechModification(
  config: NaturalSpeechConfig,
  context: {
    isStartOfResponse?: boolean;
    isEmotionalTopic?: boolean;
    isComplexTopic?: boolean;
    needsEmphasis?: boolean;
  }
): SpeechModification | null {
  // Check if we should add a modification at all
  if (Math.random() > config.frequency) {
    return null;
  }

  const style = config.personaStyle || 'warm';
  const enabledTypes = config.enabledPatterns;

  // Weighted selection based on context
  const weights: Record<ModificationType, number> = {
    filler: context.isStartOfResponse ? 0.4 : 0.1,
    hedge: context.isEmotionalTopic ? 0.3 : 0.15,
    thinking_aloud: context.isComplexTopic ? 0.4 : 0.1,
    self_correction: 0.1, // Always low, use sparingly
    emphasis: context.needsEmphasis ? 0.3 : 0.05,
    personal_aside: context.isEmotionalTopic ? 0.2 : 0.05,
    relatable_moment: context.isEmotionalTopic ? 0.25 : 0.1,
  };

  // Filter to enabled patterns and calculate total weight
  const filtered = enabledTypes.filter((t) => weights[t] > 0);
  if (filtered.length === 0) return null;

  // Weighted random selection
  const totalWeight = filtered.reduce((sum, t) => sum + weights[t], 0);
  let random = Math.random() * totalWeight;

  for (const type of filtered) {
    random -= weights[type];
    if (random <= 0) {
      const patterns = getPatternPool(type, style);
      const insertion = patterns[Math.floor(Math.random() * patterns.length)];
      
      return {
        type,
        insertion,
        position: type === 'emphasis' ? 'end' : 'start',
        probability: weights[type],
      };
    }
  }

  return null;
}

/**
 * Get the pattern pool for a given type and style
 */
function getPatternPool(type: ModificationType, style: string): string[] {
  const pools: Record<ModificationType, Record<string, string[]>> = {
    filler: FILLERS,
    hedge: HEDGES,
    thinking_aloud: THINKING_ALOUD,
    self_correction: SELF_CORRECTIONS,
    emphasis: EMPHASIS,
    personal_aside: PERSONAL_ASIDES,
    relatable_moment: RELATABLE_MOMENTS,
  };

  return pools[type][style] || pools[type]['warm'];
}

/**
 * Add natural speech patterns to a response
 */
export function addNaturalSpeech(
  response: string,
  config: NaturalSpeechConfig,
  context: {
    isEmotionalTopic?: boolean;
    isComplexTopic?: boolean;
    needsEmphasis?: boolean;
  } = {}
): string {
  // Get a modification for the start
  const startMod = getSpeechModification(config, {
    isStartOfResponse: true,
    ...context,
  });

  // Get a modification for emphasis (end)
  const endMod = context.needsEmphasis
    ? getSpeechModification(
        { ...config, enabledPatterns: ['emphasis'] },
        { needsEmphasis: true }
      )
    : null;

  let modified = response;

  if (startMod && startMod.position === 'start') {
    modified = `${startMod.insertion} ${modified}`;
  }

  if (endMod && endMod.position === 'end') {
    modified = `${modified} ${endMod.insertion}`;
  }

  return modified;
}

/**
 * Generate a "thinking out loud" moment
 */
export function generateThinkingMoment(style: string = 'warm'): string {
  const patterns = THINKING_ALOUD[style] || THINKING_ALOUD['warm'];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

/**
 * Generate a self-correction
 */
export function generateSelfCorrection(style: string = 'warm'): string {
  const patterns = SELF_CORRECTIONS[style] || SELF_CORRECTIONS['warm'];
  return patterns[Math.floor(Math.random() * patterns.length)];
}

/**
 * Format natural speech guidance for prompt
 */
export function formatNaturalSpeechGuidance(style: string = 'warm'): string {
  return [
    '[🗣️ NATURAL SPEECH REMINDER]',
    '',
    `Your style: ${style}`,
    '',
    'Guidelines:',
    '- Start responses naturally (not always the same way)',
    '- Use fillers occasionally: ' + FILLERS[style]?.slice(0, 3).join(', '),
    '- Think out loud when processing complex things',
    '- Correct yourself if something comes out wrong',
    '- Add emphasis when something is important',
    '',
    'Sound like a real person, not a perfect AI.',
  ].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getSpeechModification,
  addNaturalSpeech,
  generateThinkingMoment,
  generateSelfCorrection,
  formatNaturalSpeechGuidance,
};
