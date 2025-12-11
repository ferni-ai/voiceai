/**
 * 🤔 Would You Rather Implementation
 *
 * Classic dilemma game presenting two choices and
 * encouraging thoughtful discussion.
 *
 * Voice-friendly implementation with natural conversation flow.
 */

import type { TextGameResult, WouldYouRatherState } from './text-game-types.js';

// ============================================================================
// TYPES
// ============================================================================

interface Dilemma {
  optionA: string;
  optionB: string;
  category: 'fun' | 'thoughtful' | 'creative' | 'adventure';
  followUp?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DILEMMAS: Dilemma[] = [
  // Fun dilemmas
  {
    optionA: 'be able to fly',
    optionB: 'be able to read minds',
    category: 'fun',
    followUp: 'Both are amazing superpowers! What would you do first with that ability?',
  },
  {
    optionA: 'live in a treehouse',
    optionB: 'live in a houseboat',
    category: 'fun',
    followUp: 'Both sound like amazing adventures! What appeals to you about that choice?',
  },
  {
    optionA: 'have unlimited pizza for life',
    optionB: 'have unlimited ice cream for life',
    category: 'fun',
    followUp: 'A delicious choice! Do you have a favorite topping or flavor?',
  },
  {
    optionA: 'be a famous musician',
    optionB: 'be a famous actor',
    category: 'fun',
    followUp: 'The spotlight awaits! What would your first big project be?',
  },
  {
    optionA: 'have a personal chef',
    optionB: 'have a personal chauffeur',
    category: 'fun',
    followUp: "Living the good life! What's the first thing you'd ask them to do?",
  },

  // Thoughtful dilemmas
  {
    optionA: 'know how you will die',
    optionB: 'know when you will die',
    category: 'thoughtful',
    followUp: "That's a deep choice. How do you think that knowledge would change how you live?",
  },
  {
    optionA: 'relive your past',
    optionB: 'see your future',
    category: 'thoughtful',
    followUp: 'Time is fascinating. What draws you to that direction?',
  },
  {
    optionA: 'be the smartest person in the room',
    optionB: 'be the kindest person in the room',
    category: 'thoughtful',
    followUp: 'Both have their value. What made you lean that way?',
  },
  {
    optionA: 'have more time',
    optionB: 'have more money',
    category: 'thoughtful',
    followUp: 'The eternal trade-off! What would you do with more of that?',
  },
  {
    optionA: 'always know the truth',
    optionB: 'always be believed',
    category: 'thoughtful',
    followUp: 'Interesting choice. How do you think that would affect your relationships?',
  },

  // Creative dilemmas
  {
    optionA: 'only communicate through song',
    optionB: 'only communicate through dance',
    category: 'creative',
    followUp: 'That would be quite the life! How would you handle serious conversations?',
  },
  {
    optionA: 'write a best-selling book',
    optionB: 'direct an award-winning movie',
    category: 'creative',
    followUp: 'Creating art that touches people! What story would you tell?',
  },
  {
    optionA: 'master every musical instrument',
    optionB: 'master every language',
    category: 'creative',
    followUp: 'Amazing skills either way! Which instrument or language would you start with?',
  },
  {
    optionA: 'have your thoughts appear as art',
    optionB: 'have your dreams recorded as movies',
    category: 'creative',
    followUp: 'What a window into the mind! Would you share them with others?',
  },

  // Adventure dilemmas
  {
    optionA: 'explore space',
    optionB: 'explore the deep ocean',
    category: 'adventure',
    followUp: 'Both are vast mysteries! What do you hope to discover?',
  },
  {
    optionA: 'travel to every country',
    optionB: 'travel to every national park',
    category: 'adventure',
    followUp: 'Adventure awaits! Where would you start your journey?',
  },
  {
    optionA: 'climb the highest mountains',
    optionB: 'sail across the oceans',
    category: 'adventure',
    followUp: 'Epic journeys! What draws you to that kind of adventure?',
  },
  {
    optionA: 'go on a safari',
    optionB: 'go on an arctic expedition',
    category: 'adventure',
    followUp: 'Wildlife and wilderness! What animal would you most want to see?',
  },
  {
    optionA: 'live in a new city every year',
    optionB: 'travel constantly but never settle',
    category: 'adventure',
    followUp: 'The nomad life! How do you feel about constantly meeting new people?',
  },
];

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(
  category?: WouldYouRatherState['currentCategory']
): WouldYouRatherState {
  const availableDilemmas = category
    ? DILEMMAS.filter((d) => d.category === category)
    : [...DILEMMAS];

  // Shuffle for randomness
  const shuffled = availableDilemmas.sort(() => Math.random() - 0.5);

  return {
    currentDilemma: {
      optionA: shuffled[0].optionA,
      optionB: shuffled[0].optionB,
    },
    currentCategory: shuffled[0].category,
    questionsAnswered: 0,
    choiceHistory: [],
  };
}

// ============================================================================
// CHOICE DETECTION
// ============================================================================

/**
 * Determine which option the user chose
 */
function detectChoice(input: string, state: WouldYouRatherState): 'A' | 'B' | null {
  const lower = input.toLowerCase();

  // Check for explicit option mentions
  if (lower.includes('first') || lower.includes('option a') || lower.includes('a)')) {
    return 'A';
  }
  if (lower.includes('second') || lower.includes('option b') || lower.includes('b)')) {
    return 'B';
  }

  // Check if they mentioned key words from option A
  const optionAWords = state.currentDilemma.optionA.toLowerCase().split(' ');
  const optionBWords = state.currentDilemma.optionB.toLowerCase().split(' ');

  const matchesA = optionAWords.filter((w) => w.length > 3 && lower.includes(w)).length;
  const matchesB = optionBWords.filter((w) => w.length > 3 && lower.includes(w)).length;

  if (matchesA > matchesB) return 'A';
  if (matchesB > matchesA) return 'B';

  // Check for simple yes/left/first patterns
  if (lower === 'a' || lower === '1' || lower === 'left') return 'A';
  if (lower === 'b' || lower === '2' || lower === 'right') return 'B';

  return null;
}

/**
 * Get next dilemma that hasn't been used
 */
function getNextDilemma(state: WouldYouRatherState): Dilemma | null {
  const usedDilemmas = new Set(state.choiceHistory.map((c) => `${c.optionA}|${c.optionB}`));

  const available = DILEMMAS.filter((d) => !usedDilemmas.has(`${d.optionA}|${d.optionB}`));

  if (available.length === 0) return null;

  return available[Math.floor(Math.random() * available.length)];
}

// ============================================================================
// GAME MESSAGES
// ============================================================================

function getStartMessage(state: WouldYouRatherState): string {
  return `Let's play Would You Rather! I'll give you two options, and you pick the one you'd prefer. Here's your first one: Would you rather ${state.currentDilemma.optionA}, or ${state.currentDilemma.optionB}?`;
}

function getChoiceResponseMessage(
  choice: 'A' | 'B',
  state: WouldYouRatherState,
  followUp?: string
): string {
  const chosen = choice === 'A' ? state.currentDilemma.optionA : state.currentDilemma.optionB;
  const responses = [
    `${chosen}! Great choice.`,
    `Interesting! You'd rather ${chosen}.`,
    `${chosen} - I can see why!`,
    `Ooh, ${chosen}. That's a good one.`,
  ];

  const response = responses[Math.floor(Math.random() * responses.length)];
  return followUp ? `${response} ${followUp}` : response;
}

function getNextDilemmaMessage(dilemma: Dilemma): string {
  return `Here's the next one: Would you rather ${dilemma.optionA}, or ${dilemma.optionB}?`;
}

function getUnclearChoiceMessage(state: WouldYouRatherState): string {
  return `I didn't quite catch which one you chose. Would you rather ${state.currentDilemma.optionA}, or ${state.currentDilemma.optionB}?`;
}

function getEndGameMessage(state: WouldYouRatherState): string {
  return `We've gone through ${state.questionsAnswered} dilemmas! That was fun. Want to play again with fresh questions?`;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export interface WouldYouRatherResult extends TextGameResult {
  newState: WouldYouRatherState;
}

/**
 * Process user input (their choice)
 */
export function processInput(state: WouldYouRatherState, input: string): WouldYouRatherResult {
  const lower = input.toLowerCase().trim();

  // Check for quit/stop commands
  if (lower === 'stop' || lower === 'quit' || lower === 'end' || lower === 'done') {
    return {
      message: getEndGameMessage(state),
      gameOver: true,
      winner: 'draw',
      newState: state,
    };
  }

  // Detect choice
  const choice = detectChoice(input, state);

  if (!choice) {
    return {
      message: getUnclearChoiceMessage(state),
      gameOver: false,
      newState: state,
    };
  }

  // Find the current dilemma to get follow-up
  const currentDilemmaFull = DILEMMAS.find(
    (d) => d.optionA === state.currentDilemma.optionA && d.optionB === state.currentDilemma.optionB
  );

  // Record choice
  const newHistory = [
    ...state.choiceHistory,
    {
      ...state.currentDilemma,
      chosen: choice,
    },
  ];

  // Get next dilemma
  const nextDilemma = getNextDilemma({ ...state, choiceHistory: newHistory });

  if (!nextDilemma) {
    // No more dilemmas
    const finalState: WouldYouRatherState = {
      ...state,
      questionsAnswered: state.questionsAnswered + 1,
      choiceHistory: newHistory,
    };

    return {
      message: `${getChoiceResponseMessage(choice, state, currentDilemmaFull?.followUp)} ${getEndGameMessage(finalState)}`,
      gameOver: true,
      winner: 'draw',
      newState: finalState,
    };
  }

  // Continue with next dilemma
  const newState: WouldYouRatherState = {
    currentDilemma: {
      optionA: nextDilemma.optionA,
      optionB: nextDilemma.optionB,
    },
    currentCategory: nextDilemma.category,
    questionsAnswered: state.questionsAnswered + 1,
    choiceHistory: newHistory,
  };

  return {
    message: `${getChoiceResponseMessage(choice, state, currentDilemmaFull?.followUp)} ${getNextDilemmaMessage(nextDilemma)}`,
    gameOver: false,
    newState,
  };
}

/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state: WouldYouRatherState): string {
  if (state.questionsAnswered === 0) {
    return `Would You Rather. Current question: Would you rather ${state.currentDilemma.optionA}, or ${state.currentDilemma.optionB}?`;
  }
  return `Would You Rather. You've answered ${state.questionsAnswered} questions. Current: Would you rather ${state.currentDilemma.optionA}, or ${state.currentDilemma.optionB}?`;
}

/**
 * Get the game start result
 */
export function getStartResult(state: WouldYouRatherState): WouldYouRatherResult {
  return {
    message: getStartMessage(state),
    gameOver: false,
    newState: state,
  };
}
