/**
 * 📝 Three Word Day Implementation
 *
 * A simple but powerful reflection game where users describe
 * their day, mood, or experience in exactly three words.
 * Ferni then explores the meaning behind each word.
 *
 * Perfect for: daily check-ins, emotional awareness, pattern discovery
 */

import type { TextGameResult } from './text-game-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ThreeWordDayState {
  /** The prompt type for this session */
  promptType: 'day' | 'mood' | 'week' | 'moment' | 'year' | 'custom';
  /** Custom prompt if provided */
  customPrompt?: string;
  /** The three words provided by user */
  words: string[];
  /** Which word we're currently exploring (0, 1, 2, or 'complete') */
  explorationPhase: number | 'complete';
  /** Insights gathered during exploration */
  insights: string[];
  /** Whether the game has concluded */
  concluded: boolean;
}

export interface ThreeWordDayResult extends TextGameResult {
  newState: ThreeWordDayState;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PROMPTS: Record<ThreeWordDayState['promptType'], string> = {
  day: "Describe your day today in exactly three words. Don't overthink it—what comes to mind first?",
  mood: 'How are you feeling right now? Give me exactly three words.',
  week: 'If you had to capture this week in just three words, what would they be?',
  moment: 'Think of a meaningful moment recently. Describe it in three words.',
  year: 'This year so far in three words—what comes to mind?',
  custom: '', // Will be replaced with custom prompt
};

const EXPLORATION_PROMPTS = [
  (word: string) => `Let's start with "${word}". What made that word come to mind?`,
  (word: string) => `Interesting. And "${word}"—is there a story behind that one?`,
  (word: string) => `Finally, "${word}". How does this word connect to the others?`,
];

const REFLECTION_STARTERS = [
  'I notice something interesting...',
  'Looking at these three words together...',
  'What strikes me is...',
  'There seems to be a thread here...',
  "Here's what I'm picking up on...",
];

const WORD_CATEGORY_HINTS: Record<string, string[]> = {
  positive: [
    'happy',
    'grateful',
    'peaceful',
    'excited',
    'hopeful',
    'productive',
    'connected',
    'accomplished',
    'loved',
    'energized',
    'inspired',
    'content',
    'joyful',
    'calm',
    'optimistic',
  ],
  challenging: [
    'tired',
    'stressed',
    'anxious',
    'overwhelmed',
    'frustrated',
    'confused',
    'sad',
    'lonely',
    'stuck',
    'exhausted',
    'worried',
    'uncertain',
    'drained',
    'lost',
    'scattered',
  ],
  transitional: [
    'changing',
    'growing',
    'learning',
    'waiting',
    'processing',
    'rebuilding',
    'questioning',
    'exploring',
    'adjusting',
    'reflecting',
    'pivoting',
    'emerging',
  ],
  relational: [
    'together',
    'family',
    'friends',
    'connected',
    'supported',
    'loved',
    'distant',
    'lonely',
    'understood',
    'missed',
    'appreciated',
  ],
  action: [
    'busy',
    'moving',
    'working',
    'creating',
    'building',
    'planning',
    'deciding',
    'starting',
    'finishing',
    'hustling',
    'grinding',
  ],
};

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(
  promptType: ThreeWordDayState['promptType'] = 'day',
  customPrompt?: string
): ThreeWordDayState {
  return {
    promptType,
    customPrompt,
    words: [],
    explorationPhase: 0,
    insights: [],
    concluded: false,
  };
}

// ============================================================================
// ANALYSIS HELPERS
// ============================================================================

function categorizeWord(word: string): string | null {
  const lower = word.toLowerCase();
  for (const [category, words] of Object.entries(WORD_CATEGORY_HINTS)) {
    if (words.some((w) => lower.includes(w) || w.includes(lower))) {
      return category;
    }
  }
  return null;
}

function analyzeWordTriad(words: string[]): string {
  const categories = words.map((w) => categorizeWord(w)).filter(Boolean);

  // All same category
  if (categories.length >= 2 && new Set(categories).size === 1) {
    const cat = categories[0];
    if (cat === 'positive')
      return "There's a lot of light in these words. It sounds like something good is happening.";
    if (cat === 'challenging')
      return "These words carry some weight. It takes courage to name what's hard.";
    if (cat === 'transitional')
      return "I sense movement in these words—you're in a season of change.";
    if (cat === 'relational') return 'People seem important in your world right now.';
    if (cat === 'action') return "You're in motion. Lots of doing energy here.";
  }

  // Mixed categories
  if (categories.includes('positive') && categories.includes('challenging')) {
    return "I notice both light and shadow in these words—that's real life, holding both at once.";
  }

  if (categories.includes('transitional')) {
    return "There's a sense of being in-between here. Transitions can feel uncertain but they often lead somewhere meaningful.";
  }

  // Default
  return 'These three words paint an interesting picture together.';
}

function generateInsight(words: string[]): string {
  const analysis = analyzeWordTriad(words);
  const starter = REFLECTION_STARTERS[Math.floor(Math.random() * REFLECTION_STARTERS.length)];
  return `${starter} ${analysis}`;
}

// ============================================================================
// GAME MESSAGES
// ============================================================================

function getStartMessage(state: ThreeWordDayState): string {
  if (state.promptType === 'custom' && state.customPrompt) {
    return state.customPrompt;
  }
  return PROMPTS[state.promptType];
}

function parseThreeWords(input: string): string[] | null {
  // Clean up input
  const cleaned = input.toLowerCase().trim();

  // Split by common delimiters: comma, "and", spaces
  let words = cleaned
    .replace(/,/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\./g, '')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  // If they gave exactly 3 words, great!
  if (words.length === 3) {
    return words;
  }

  // If they gave 2-4 words, try to work with it
  if (words.length >= 2 && words.length <= 4) {
    // Take first 3 or pad with what we have
    return words.slice(0, 3);
  }

  return null;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export function processInput(state: ThreeWordDayState, input: string): ThreeWordDayResult {
  const lower = input.toLowerCase().trim();

  // Check for quit commands
  if (lower === 'stop' || lower === 'quit' || lower === 'done' || lower === 'end') {
    return {
      message:
        state.words.length > 0
          ? `Thanks for sharing "${state.words.join(', ')}". Take care!`
          : 'No worries! We can play another time.',
      gameOver: true,
      winner: null,
      newState: { ...state, concluded: true },
    };
  }

  // Phase: Collecting words
  if (state.words.length === 0) {
    const words = parseThreeWords(input);

    if (!words) {
      return {
        message: 'Give me exactly three words—no more, no less. What three words capture it?',
        gameOver: false,
        newState: state,
      };
    }

    const newState: ThreeWordDayState = {
      ...state,
      words,
      explorationPhase: 0,
    };

    // Start exploration
    const explorationPrompt = EXPLORATION_PROMPTS[0](words[0]);

    return {
      message: `"${words.join(', ')}"—got it. ${explorationPrompt}`,
      gameOver: false,
      newState,
    };
  }

  // Phase: Exploring each word
  if (typeof state.explorationPhase === 'number' && state.explorationPhase < 3) {
    // Store their response as an insight
    const newInsights = [...state.insights, input];
    const nextPhase = state.explorationPhase + 1;

    if (nextPhase < 3) {
      // More words to explore
      const nextWord = state.words[nextPhase];
      const newState: ThreeWordDayState = {
        ...state,
        explorationPhase: nextPhase,
        insights: newInsights,
      };

      return {
        message: EXPLORATION_PROMPTS[nextPhase](nextWord),
        gameOver: false,
        newState,
      };
    } else {
      // All words explored - give synthesis
      const newState: ThreeWordDayState = {
        ...state,
        explorationPhase: 'complete',
        insights: newInsights,
      };

      const insight = generateInsight(state.words);

      return {
        message: `${insight}\n\nThank you for sharing. These three words—"${state.words.join(', ')}"—say a lot. Is there anything else you want to add?`,
        gameOver: false,
        newState,
      };
    }
  }

  // Phase: Complete - handle follow-up
  if (state.explorationPhase === 'complete') {
    const finalState: ThreeWordDayState = {
      ...state,
      concluded: true,
    };

    // Acknowledge their addition
    const closings = [
      `I hear you. "${state.words.join(', ')}"—I'll remember that.`,
      `Thanks for going deeper. Take care of yourself.`,
      `These three words captured something real. Thanks for sharing.`,
    ];

    return {
      message: closings[Math.floor(Math.random() * closings.length)],
      gameOver: true,
      winner: null,
      newState: finalState,
    };
  }

  // Fallback
  return {
    message: 'Give me three words that capture how things are.',
    gameOver: false,
    newState: state,
  };
}

/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state: ThreeWordDayState): string {
  if (state.words.length === 0) {
    return `Three Word Day. ${getStartMessage(state)}`;
  }

  if (state.explorationPhase === 'complete') {
    return `Three Word Day. Your words were: ${state.words.join(', ')}. We've explored each one.`;
  }

  return `Three Word Day. Your words: ${state.words.join(', ')}. Currently exploring word ${(state.explorationPhase as number) + 1} of 3.`;
}

/**
 * Get the game start result
 */
export function getStartResult(state: ThreeWordDayState): ThreeWordDayResult {
  return {
    message: getStartMessage(state),
    gameOver: false,
    newState: state,
  };
}
