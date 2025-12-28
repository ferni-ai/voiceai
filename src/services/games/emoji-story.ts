/**
 * 😊 Emoji Story Implementation
 *
 * A creative expression game where users tell a story using only emojis,
 * then Ferni helps decode and explore the emotions behind them.
 *
 * Perfect for: emotional expression, creative play, bypassing verbal filters
 */

import type { TextGameResult } from './text-game-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EmojiStoryState {
  /** Current phase */
  phase: 'prompt' | 'collecting' | 'decoding' | 'reflecting' | 'complete';
  /** The topic/prompt for the story */
  topic: 'day' | 'mood' | 'dream' | 'challenge' | 'relationship' | 'custom';
  /** Custom topic if provided */
  customTopic?: string;
  /** Emojis collected */
  emojis: string[];
  /** Ferni's interpretation */
  interpretation?: string;
  /** User's correction/confirmation */
  userMeaning?: string;
  /** Whether game has concluded */
  concluded: boolean;
}

export interface EmojiStoryResult extends TextGameResult {
  newState: EmojiStoryState;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TOPIC_PROMPTS: Record<EmojiStoryState['topic'], string> = {
  day: "Tell me about your day using only emojis. 3-5 emojis that capture how it went.",
  mood: "How are you feeling right now? Express it in 3-5 emojis.",
  dream: "If your biggest dream were an emoji story, what would it look like?",
  challenge: "What's challenging you right now? Show me in emojis.",
  relationship: "Pick an important relationship. Describe it in emojis.",
  custom: '',
};

const EMOJI_MEANINGS: Record<string, string[]> = {
  '😊': ['happiness', 'contentment', 'friendliness'],
  '😢': ['sadness', 'grief', 'disappointment'],
  '😤': ['frustration', 'anger', 'determination'],
  '🥺': ['vulnerability', 'pleading', 'hope'],
  '😴': ['tiredness', 'rest', 'exhaustion'],
  '🌟': ['success', 'achievement', 'brilliance'],
  '💪': ['strength', 'determination', 'power'],
  '❤️': ['love', 'passion', 'care'],
  '💔': ['heartbreak', 'pain', 'loss'],
  '🎉': ['celebration', 'joy', 'accomplishment'],
  '😰': ['anxiety', 'worry', 'stress'],
  '🤔': ['thinking', 'contemplation', 'uncertainty'],
  '🙏': ['gratitude', 'hope', 'prayer'],
  '🔥': ['passion', 'intensity', 'energy'],
  '☀️': ['brightness', 'optimism', 'warmth'],
  '🌧️': ['sadness', 'gloom', 'cleansing'],
  '⭐': ['hope', 'aspiration', 'excellence'],
  '💤': ['rest', 'exhaustion', 'peace'],
  '🏃': ['rushing', 'progress', 'escape'],
  '🧘': ['calm', 'mindfulness', 'balance'],
  '🎯': ['focus', 'goals', 'precision'],
  '🌈': ['hope', 'beauty', 'diversity'],
  '🦋': ['transformation', 'freedom', 'beauty'],
  '🌱': ['growth', 'beginnings', 'potential'],
  '⚡': ['energy', 'speed', 'shock'],
  '😎': ['confidence', 'coolness', 'relaxation'],
  '🤗': ['warmth', 'embrace', 'welcome'],
  '😬': ['awkwardness', 'tension', 'discomfort'],
  '🥳': ['celebration', 'party', 'excitement'],
  '😌': ['relief', 'peace', 'contentment'],
};

const DECODING_STARTERS = [
  "Let me see if I can read this story...",
  "Interesting combination! Here's what I'm picking up...",
  "I see a story forming here...",
  "Let me decode these emotions...",
];

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(
  topic: EmojiStoryState['topic'] = 'day',
  customTopic?: string
): EmojiStoryState {
  return {
    phase: 'prompt',
    topic,
    customTopic,
    emojis: [],
    concluded: false,
  };
}

// ============================================================================
// EMOJI PARSING
// ============================================================================

function extractEmojis(input: string): string[] {
  // Match emoji patterns (including multi-byte and combined emojis)
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  const matches = input.match(emojiRegex) || [];
  return matches.slice(0, 10); // Limit to 10 emojis
}

function interpretEmojis(emojis: string[]): string {
  const interpretations: string[] = [];

  for (const emoji of emojis) {
    const meanings = EMOJI_MEANINGS[emoji];
    if (meanings) {
      interpretations.push(`${emoji} (${meanings[0]})`);
    } else {
      interpretations.push(emoji);
    }
  }

  // Create a narrative
  if (emojis.length === 0) {
    return "I didn't catch any emojis there.";
  }

  if (emojis.length === 1) {
    const meaning = EMOJI_MEANINGS[emojis[0]];
    return meaning
      ? `Just ${emojis[0]}—that speaks to ${meaning[0]}.`
      : `Just ${emojis[0]}—simple but says something.`;
  }

  // Look for patterns
  const hasPositive = emojis.some(e => ['😊', '🎉', '💪', '🌟', '❤️', '☀️', '🌈'].includes(e));
  const hasNegative = emojis.some(e => ['😢', '😤', '😰', '💔', '🌧️'].includes(e));
  const hasGrowth = emojis.some(e => ['🌱', '🦋', '⭐', '🎯'].includes(e));

  let narrative = `I see: ${interpretations.join(', ')}. `;

  if (hasPositive && hasNegative) {
    narrative += "There's both light and shadow here—you're holding complexity.";
  } else if (hasGrowth) {
    narrative += "This feels like a story of growth and change.";
  } else if (hasPositive) {
    narrative += "There's a lot of positive energy in this story.";
  } else if (hasNegative) {
    narrative += "This carries some weight. Thank you for expressing it.";
  } else {
    narrative += "This tells an interesting story.";
  }

  return narrative;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export function processInput(state: EmojiStoryState, input: string): EmojiStoryResult {
  const lower = input.toLowerCase().trim();

  // Check for quit commands
  if (lower === 'stop' || lower === 'quit' || lower === 'done' || lower === 'exit') {
    return {
      message: state.emojis.length > 0
        ? `Thanks for sharing your emoji story: ${state.emojis.join('')}`
        : "No worries! Emoji stories are here when you need them.",
      gameOver: true,
      winner: null,
      newState: { ...state, phase: 'complete', concluded: true },
    };
  }

  // PHASE: Initial prompt
  if (state.phase === 'prompt') {
    const emojis = extractEmojis(input);

    if (emojis.length >= 1) {
      const interpretation = interpretEmojis(emojis);
      const starter = DECODING_STARTERS[Math.floor(Math.random() * DECODING_STARTERS.length)];

      return {
        message: `${state.emojis.length === 0 ? '' : 'Adding to your story: '}${emojis.join('')}\n\n${starter}\n\n${interpretation}\n\nDid I read that right? What does this emoji story mean to you?`,
        gameOver: false,
        newState: {
          ...state,
          phase: 'decoding',
          emojis,
          interpretation,
        },
      };
    }

    // No emojis, show the prompt
    const prompt = state.topic === 'custom' && state.customTopic
      ? state.customTopic
      : TOPIC_PROMPTS[state.topic];

    return {
      message: `🎨 **Emoji Story**\n\n${prompt}`,
      gameOver: false,
      newState: { ...state, phase: 'collecting' },
    };
  }

  // PHASE: Collecting emojis
  if (state.phase === 'collecting') {
    const emojis = extractEmojis(input);

    if (emojis.length === 0) {
      return {
        message: "Send me some emojis! Even just 1-3 will tell a story. 😊😢🌟—what comes to mind?",
        gameOver: false,
        newState: state,
      };
    }

    const interpretation = interpretEmojis(emojis);
    const starter = DECODING_STARTERS[Math.floor(Math.random() * DECODING_STARTERS.length)];

    return {
      message: `${emojis.join('')}\n\n${starter}\n\n${interpretation}\n\nDid I read that right? What does this emoji story mean to you?`,
      gameOver: false,
      newState: {
        ...state,
        phase: 'decoding',
        emojis,
        interpretation,
      },
    };
  }

  // PHASE: Decoding (user explains/corrects)
  if (state.phase === 'decoding') {
    return {
      message: `"${input}"\n\nThat's beautiful. Your emoji story ${state.emojis.join('')} carries real meaning.\n\nIs there anything else you want to express? You can send more emojis or say "done".`,
      gameOver: false,
      newState: {
        ...state,
        phase: 'reflecting',
        userMeaning: input,
      },
    };
  }

  // PHASE: Reflecting (more emojis or done)
  if (state.phase === 'reflecting') {
    const emojis = extractEmojis(input);

    if (emojis.length > 0) {
      const allEmojis = [...state.emojis, ...emojis];
      const interpretation = interpretEmojis(allEmojis);

      return {
        message: `Adding to your story: ${emojis.join('')}\n\nNow: ${allEmojis.join('')}\n\n${interpretation}\n\nAnything more to add?`,
        gameOver: false,
        newState: {
          ...state,
          emojis: allEmojis,
          interpretation,
        },
      };
    }

    // They're done
    return {
      message: `Your complete emoji story: ${state.emojis.join('')}\n\nEmojis bypass our usual filters. Sometimes they express what words can't. Thanks for sharing this with me.`,
      gameOver: true,
      winner: null,
      newState: { ...state, phase: 'complete', concluded: true },
    };
  }

  // Default
  return {
    message: "Share some emojis with me—I'll help decode the story they tell.",
    gameOver: false,
    newState: state,
  };
}

/**
 * Describe current game state for voice
 */
export function describeStateForVoice(state: EmojiStoryState): string {
  if (state.emojis.length === 0) {
    return 'Emoji Story. Waiting for emojis.';
  }

  if (state.phase === 'complete') {
    return `Emoji Story complete. Story: ${state.emojis.join(' ')}.`;
  }

  return `Emoji Story. Current story: ${state.emojis.join(' ')}.`;
}

/**
 * Get the game start result
 */
export function getStartResult(state: EmojiStoryState): EmojiStoryResult {
  const prompt = state.topic === 'custom' && state.customTopic
    ? state.customTopic
    : TOPIC_PROMPTS[state.topic];

  return {
    message: `🎨 **Emoji Story**\n\n${prompt}`,
    gameOver: false,
    newState: { ...state, phase: 'collecting' },
  };
}

/**
 * Get the emoji story (for saving)
 */
export function getEmojiStory(state: EmojiStoryState): { emojis: string[]; meaning?: string } {
  return {
    emojis: state.emojis,
    meaning: state.userMeaning,
  };
}
