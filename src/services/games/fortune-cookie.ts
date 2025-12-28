/**
 * 🥠 Fortune Cookie Implementation
 *
 * Receive a thought-provoking fortune and reflect on what it means for you.
 * Combines ancient wisdom traditions with modern coaching questions.
 *
 * Perfect for: daily inspiration, perspective shifts, meaning-making
 */

import type { TextGameResult } from './text-game-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Fortune {
  text: string;
  source?: string;
  category: 'wisdom' | 'growth' | 'relationships' | 'purpose' | 'courage' | 'presence';
}

export interface FortuneCookieState {
  /** Current phase */
  phase: 'opening' | 'revealing' | 'reflecting' | 'closing' | 'complete';
  /** The fortune given */
  fortune?: Fortune;
  /** User's reflection */
  reflection?: string;
  /** Whether they want another */
  wantsAnother?: boolean;
  /** Fortunes seen this session */
  fortunesSeen: Fortune[];
  /** Whether concluded */
  concluded: boolean;
}

export interface FortuneCookieResult extends TextGameResult {
  newState: FortuneCookieState;
}

// ============================================================================
// FORTUNE DATABASE
// ============================================================================

const FORTUNES: Fortune[] = [
  // Wisdom
  { text: "What you seek is seeking you.", source: "Rumi", category: 'wisdom' },
  { text: "The obstacle is the way.", source: "Marcus Aurelius", category: 'wisdom' },
  { text: "Before enlightenment, chop wood, carry water. After enlightenment, chop wood, carry water.", source: "Zen proverb", category: 'wisdom' },
  { text: "The cave you fear to enter holds the treasure you seek.", source: "Joseph Campbell", category: 'wisdom' },
  { text: "What is coming is better than what is gone.", category: 'wisdom' },
  { text: "The river doesn't push. It flows.", category: 'wisdom' },
  { text: "Your wound is where the light enters you.", source: "Rumi", category: 'wisdom' },

  // Growth
  { text: "Growth and comfort cannot coexist.", category: 'growth' },
  { text: "You are not behind. You are right on time.", category: 'growth' },
  { text: "The seed never sees the flower.", category: 'growth' },
  { text: "What feels like the end is often the beginning.", category: 'growth' },
  { text: "You've survived 100% of your worst days.", category: 'growth' },
  { text: "The person you will become is already within you.", category: 'growth' },
  { text: "Slow progress is still progress.", category: 'growth' },

  // Relationships
  { text: "We do not see things as they are, we see them as we are.", source: "Anaïs Nin", category: 'relationships' },
  { text: "The quality of your relationships determines the quality of your life.", category: 'relationships' },
  { text: "Everyone you meet is fighting a battle you know nothing about.", category: 'relationships' },
  { text: "Be the person you needed when you were younger.", category: 'relationships' },
  { text: "Connection is why we're here.", source: "Brené Brown", category: 'relationships' },

  // Purpose
  { text: "Your purpose is not something you find. It's something you become.", category: 'purpose' },
  { text: "The meaning of life is to give life meaning.", category: 'purpose' },
  { text: "What would you do if you knew you could not fail?", category: 'purpose' },
  { text: "The world needs what you have to offer.", category: 'purpose' },
  { text: "You are here for a reason. Keep looking.", category: 'purpose' },

  // Courage
  { text: "Feel the fear and do it anyway.", source: "Susan Jeffers", category: 'courage' },
  { text: "Courage is not the absence of fear, but action in spite of it.", category: 'courage' },
  { text: "Your comfort zone is a beautiful place, but nothing ever grows there.", category: 'courage' },
  { text: "What's on the other side of fear? Everything.", category: 'courage' },
  { text: "The brave may not live forever, but the cautious do not live at all.", category: 'courage' },

  // Presence
  { text: "This moment is all you have. Make it enough.", category: 'presence' },
  { text: "Breathe. You are exactly where you need to be.", category: 'presence' },
  { text: "The present moment is the only moment available to us.", source: "Thich Nhat Hanh", category: 'presence' },
  { text: "Today is a gift. That's why it's called the present.", category: 'presence' },
  { text: "Right now, in this moment, you have everything you need.", category: 'presence' },
  { text: "Stop looking for happiness in the same place you lost it.", category: 'presence' },
];

const REFLECTION_PROMPTS: Record<Fortune['category'], string[]> = {
  wisdom: [
    "What does this wisdom mean to you right now?",
    "How does this land for you today?",
    "What truth does this touch in your life?",
  ],
  growth: [
    "Where in your life does this apply?",
    "What would it look like to live this out?",
    "Does this give you permission to be patient with yourself?",
  ],
  relationships: [
    "Who comes to mind when you read this?",
    "How might this change how you see someone?",
    "What relationship could use this wisdom?",
  ],
  purpose: [
    "What does this stir in you?",
    "What would you do differently if you took this to heart?",
    "Does this point toward something you've been avoiding?",
  ],
  courage: [
    "What fear is this speaking to?",
    "What would courage look like for you this week?",
    "What's one small brave thing you could do?",
  ],
  presence: [
    "What would change if you really believed this?",
    "What are you grateful for right now?",
    "What can you let go of today?",
  ],
};

const CLOSING_RESPONSES = [
  "May this fortune stay with you today.",
  "Keep this one close. It found you for a reason.",
  "Something to sit with. Thank you for reflecting.",
  "Fortune shared. Wisdom earned.",
];

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(): FortuneCookieState {
  return {
    phase: 'opening',
    fortunesSeen: [],
    concluded: false,
  };
}

// ============================================================================
// FORTUNE SELECTION
// ============================================================================

function selectFortune(seen: Fortune[]): Fortune {
  const seenTexts = new Set(seen.map(f => f.text));
  const available = FORTUNES.filter(f => !seenTexts.has(f.text));

  if (available.length === 0) {
    // All seen, start over
    return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  }

  return available[Math.floor(Math.random() * available.length)];
}

function getReflectionPrompt(fortune: Fortune): string {
  const prompts = REFLECTION_PROMPTS[fortune.category];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

function parseYesNo(input: string): boolean | null {
  const lower = input.toLowerCase().trim();
  if (['yes', 'y', 'yeah', 'another', 'more', 'one more', 'sure'].includes(lower)) {
    return true;
  }
  if (['no', 'n', 'nope', 'done', "i'm good", "that's enough"].includes(lower)) {
    return false;
  }
  return null;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export function processInput(state: FortuneCookieState, input: string): FortuneCookieResult {
  const lower = input.toLowerCase().trim();

  // Check for quit commands
  if (lower === 'stop' || lower === 'quit' || lower === 'exit') {
    return {
      message: state.fortune
        ? `Your fortune: "${state.fortune.text}"\n\nTake it with you.`
        : "The fortune will wait for you.",
      gameOver: true,
      winner: null,
      newState: { ...state, phase: 'complete', concluded: true },
    };
  }

  // PHASE: Opening
  if (state.phase === 'opening') {
    // They want to start - give them a fortune
    const fortune = selectFortune(state.fortunesSeen);
    const attribution = fortune.source ? `\n— ${fortune.source}` : '';

    return {
      message: `🥠 *crack*\n\n"${fortune.text}"${attribution}\n\n${getReflectionPrompt(fortune)}`,
      gameOver: false,
      newState: {
        ...state,
        phase: 'reflecting',
        fortune,
        fortunesSeen: [...state.fortunesSeen, fortune],
      },
    };
  }

  // PHASE: Revealing (waiting to crack)
  if (state.phase === 'revealing') {
    const fortune = selectFortune(state.fortunesSeen);
    const attribution = fortune.source ? `\n— ${fortune.source}` : '';

    return {
      message: `🥠 *crack*\n\n"${fortune.text}"${attribution}\n\n${getReflectionPrompt(fortune)}`,
      gameOver: false,
      newState: {
        ...state,
        phase: 'reflecting',
        fortune,
        fortunesSeen: [...state.fortunesSeen, fortune],
      },
    };
  }

  // PHASE: Reflecting
  if (state.phase === 'reflecting') {
    return {
      message: `"${input}"\n\nThank you for that reflection.\n\nWould you like another fortune?`,
      gameOver: false,
      newState: {
        ...state,
        phase: 'closing',
        reflection: input,
      },
    };
  }

  // PHASE: Closing (another?)
  if (state.phase === 'closing') {
    const wantsAnother = parseYesNo(input);

    if (wantsAnother === true) {
      const fortune = selectFortune(state.fortunesSeen);
      const attribution = fortune.source ? `\n— ${fortune.source}` : '';

      return {
        message: `🥠 *crack*\n\n"${fortune.text}"${attribution}\n\n${getReflectionPrompt(fortune)}`,
        gameOver: false,
        newState: {
          ...state,
          phase: 'reflecting',
          fortune,
          fortunesSeen: [...state.fortunesSeen, fortune],
          reflection: undefined,
        },
      };
    }

    if (wantsAnother === false) {
      const closing = CLOSING_RESPONSES[Math.floor(Math.random() * CLOSING_RESPONSES.length)];
      const fortuneText = state.fortune?.text || '';

      return {
        message: `${closing}\n\nYour fortune: "${fortuneText}"`,
        gameOver: true,
        winner: null,
        newState: { ...state, phase: 'complete', concluded: true },
      };
    }

    return {
      message: "Would you like another fortune? (yes/no)",
      gameOver: false,
      newState: state,
    };
  }

  // Default
  return {
    message: "Ready for your fortune? Just say the word.",
    gameOver: false,
    newState: { ...state, phase: 'opening' },
  };
}

/**
 * Describe current state for voice
 */
export function describeStateForVoice(state: FortuneCookieState): string {
  if (state.phase === 'complete' && state.fortune) {
    return `Fortune Cookie. Your fortune: "${state.fortune.text}"`;
  }

  if (state.fortune) {
    return `Fortune Cookie. Current fortune: "${state.fortune.text.slice(0, 50)}..."`;
  }

  return 'Fortune Cookie. Ready to crack open your fortune.';
}

/**
 * Get the game start result
 */
export function getStartResult(state: FortuneCookieState): FortuneCookieResult {
  const fortune = selectFortune(state.fortunesSeen);
  const attribution = fortune.source ? `\n— ${fortune.source}` : '';

  return {
    message: `🥠 **Fortune Cookie**\n\n*crack*\n\n"${fortune.text}"${attribution}\n\n${getReflectionPrompt(fortune)}`,
    gameOver: false,
    newState: {
      ...state,
      phase: 'reflecting',
      fortune,
      fortunesSeen: [...state.fortunesSeen, fortune],
    },
  };
}

/**
 * Get fortunes from session (for saving)
 */
export function getSessionFortunes(state: FortuneCookieState): Fortune[] {
  return state.fortunesSeen;
}
