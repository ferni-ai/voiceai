/**
 * 📍 One Word Check-in Implementation
 *
 * The simplest reflection: one word that captures where you are right now.
 * Ferni then gently explores what that word holds.
 *
 * Perfect for: quick emotional check-ins, daily practice, low-barrier reflection
 */

import type { TextGameResult } from './text-game-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface OneWordCheckinState {
  /** Current phase */
  phase: 'prompt' | 'explore' | 'complete';
  /** The prompt context */
  context: 'now' | 'today' | 'week' | 'feeling' | 'body' | 'custom';
  /** Custom context if provided */
  customContext?: string;
  /** The word they chose */
  word?: string;
  /** Their exploration response */
  exploration?: string;
  /** Whether concluded */
  concluded: boolean;
}

export interface OneWordCheckinResult extends TextGameResult {
  newState: OneWordCheckinState;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTEXT_PROMPTS: Record<OneWordCheckinState['context'], string> = {
  now: "One word. Right now. What is it?",
  today: "If today were one word, what would it be?",
  week: "Capture this week in a single word.",
  feeling: "One word for how you're feeling. Don't overthink it.",
  body: "One word to describe how your body feels right now.",
  custom: '',
};

const WORD_CATEGORIES: Record<string, string[]> = {
  positive: ['happy', 'grateful', 'peaceful', 'excited', 'hopeful', 'content', 'alive', 'free', 'strong', 'loved', 'centered', 'clear', 'light', 'calm', 'whole', 'present', 'open', 'growing', 'blessed', 'amazing'],
  challenging: ['tired', 'stressed', 'anxious', 'overwhelmed', 'frustrated', 'confused', 'sad', 'stuck', 'heavy', 'lost', 'scattered', 'drained', 'empty', 'numb', 'disconnected', 'uncertain', 'worried', 'afraid', 'angry', 'broken'],
  neutral: ['okay', 'fine', 'normal', 'busy', 'waiting', 'thinking', 'processing', 'quiet', 'steady', 'here', 'present', 'existing', 'breathing', 'managing', 'getting by', 'surviving'],
  growth: ['growing', 'learning', 'changing', 'becoming', 'healing', 'emerging', 'building', 'creating', 'exploring', 'stretching', 'evolving', 'transforming'],
};

const EXPLORATION_QUESTIONS: Record<string, string[]> = {
  positive: [
    "That's a good word to hold. What brought this on?",
    "I like that energy. Where is it coming from?",
    "Beautiful. Tell me more about what's feeding that feeling.",
    "That's worth savoring. What's creating that for you?",
  ],
  challenging: [
    "That's honest. What's behind that word?",
    "I hear you. What's weighing on you?",
    "Thank you for naming that. What's it connected to?",
    "That takes courage to say. What's going on?",
  ],
  neutral: [
    "Simple. Anything underneath that surface?",
    "Sometimes that's exactly where we are. What's keeping you there?",
    "A steady word. Is that good, or is there something more?",
    "That's real. Anything you want to add?",
  ],
  growth: [
    "That sounds like movement. What's shifting for you?",
    "I sense something unfolding. What's the story?",
    "Growth energy. What are you growing toward?",
    "Something's happening. Tell me about the journey.",
  ],
};

const CLOSING_RESPONSES = [
  "Thank you for checking in. That one word holds a lot.",
  "One word can say so much. Take care of yourself.",
  "I'll remember this word. It says something about where you are.",
  "Thank you for that honesty. Come back whenever you need to check in.",
];

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(
  context: OneWordCheckinState['context'] = 'now',
  customContext?: string
): OneWordCheckinState {
  return {
    phase: 'prompt',
    context,
    customContext,
    concluded: false,
  };
}

// ============================================================================
// WORD ANALYSIS
// ============================================================================

function categorizeWord(word: string): 'positive' | 'challenging' | 'neutral' | 'growth' {
  const lower = word.toLowerCase();

  for (const [category, words] of Object.entries(WORD_CATEGORIES)) {
    if (words.some(w => lower.includes(w) || w.includes(lower))) {
      return category as 'positive' | 'challenging' | 'neutral' | 'growth';
    }
  }

  // Default to neutral for unknown words
  return 'neutral';
}

function getExplorationQuestion(category: string): string {
  const questions = EXPLORATION_QUESTIONS[category] || EXPLORATION_QUESTIONS.neutral;
  return questions[Math.floor(Math.random() * questions.length)];
}

function extractSingleWord(input: string): string | null {
  const words = input.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);

  // Accept 1-2 words (in case they add emphasis like "really tired")
  if (words.length === 1) {
    return words[0];
  }
  if (words.length === 2) {
    // Return the second word (the main one) if first is an intensifier
    const intensifiers = ['really', 'very', 'so', 'super', 'pretty', 'kind of', 'a bit', 'totally', 'completely'];
    if (intensifiers.includes(words[0])) {
      return words[1];
    }
    // Otherwise join them
    return words.join(' ');
  }

  return null;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export function processInput(state: OneWordCheckinState, input: string): OneWordCheckinResult {
  const lower = input.toLowerCase().trim();

  // Check for quit commands
  if (lower === 'stop' || lower === 'quit' || lower === 'done' || lower === 'exit') {
    return {
      message: state.word
        ? `Your word was "${state.word}". Thanks for checking in.`
        : "That's okay. One-word check-ins are here when you need them.",
      gameOver: true,
      winner: null,
      newState: { ...state, phase: 'complete', concluded: true },
    };
  }

  // PHASE: Prompt
  if (state.phase === 'prompt') {
    const word = extractSingleWord(input);

    if (word) {
      const category = categorizeWord(word);
      const question = getExplorationQuestion(category);

      return {
        message: `"${word}"\n\n${question}`,
        gameOver: false,
        newState: {
          ...state,
          phase: 'explore',
          word,
        },
      };
    }

    // Show prompt
    const prompt = state.context === 'custom' && state.customContext
      ? state.customContext
      : CONTEXT_PROMPTS[state.context];

    return {
      message: `📍 **One Word Check-in**\n\n${prompt}`,
      gameOver: false,
      newState: state,
    };
  }

  // PHASE: Explore
  if (state.phase === 'explore') {
    const closing = CLOSING_RESPONSES[Math.floor(Math.random() * CLOSING_RESPONSES.length)];

    return {
      message: `${closing}\n\nYour word: "${state.word}"`,
      gameOver: true,
      winner: null,
      newState: {
        ...state,
        phase: 'complete',
        exploration: input,
        concluded: true,
      },
    };
  }

  // Default
  const prompt = CONTEXT_PROMPTS[state.context];
  return {
    message: `Give me just one word. ${prompt}`,
    gameOver: false,
    newState: state,
  };
}

/**
 * Describe current state for voice
 */
export function describeStateForVoice(state: OneWordCheckinState): string {
  if (state.phase === 'complete' && state.word) {
    return `One Word Check-in. Your word was: ${state.word}.`;
  }

  if (state.word) {
    return `One Word Check-in. Word: ${state.word}. Exploring.`;
  }

  return 'One Word Check-in. Waiting for your word.';
}

/**
 * Get the game start result
 */
export function getStartResult(state: OneWordCheckinState): OneWordCheckinResult {
  const prompt = state.context === 'custom' && state.customContext
    ? state.customContext
    : CONTEXT_PROMPTS[state.context];

  return {
    message: `📍 **One Word Check-in**\n\n${prompt}`,
    gameOver: false,
    newState: state,
  };
}

/**
 * Get the check-in result (for saving)
 */
export function getCheckinResult(state: OneWordCheckinState): { word?: string; exploration?: string } {
  return {
    word: state.word,
    exploration: state.exploration,
  };
}
