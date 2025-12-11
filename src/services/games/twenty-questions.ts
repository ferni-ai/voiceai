/**
 * 🎯 20 Questions Implementation
 *
 * Classic guessing game where the AI thinks of something
 * and the user has 20 yes/no questions to guess it.
 *
 * Voice-friendly implementation with natural conversation flow.
 */

import type { TextGameResult, TwentyQuestionsState } from './text-game-types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Things the AI can think of, organized by category */
const SECRET_THINGS: Record<TwentyQuestionsState['category'], string[]> = {
  person: [
    'Albert Einstein',
    'Taylor Swift',
    'Abraham Lincoln',
    'Oprah Winfrey',
    'Michael Jordan',
    'Marie Curie',
    'Shakespeare',
    'Beyoncé',
  ],
  place: [
    'the Eiffel Tower',
    'the Grand Canyon',
    'a library',
    'a beach',
    'New York City',
    'the moon',
    'a coffee shop',
    'the Amazon rainforest',
  ],
  thing: [
    'a bicycle',
    'a smartphone',
    'a book',
    'sunglasses',
    'a piano',
    'a backpack',
    'a candle',
    'a mirror',
  ],
  animal: [
    'an elephant',
    'a dolphin',
    'a penguin',
    'a cat',
    'an owl',
    'a butterfly',
    'a golden retriever',
    'a hummingbird',
  ],
  food: [
    'pizza',
    'ice cream',
    'sushi',
    'a taco',
    'chocolate cake',
    'an avocado',
    'popcorn',
    'a smoothie',
  ],
};

const CATEGORY_HINTS: Record<TwentyQuestionsState['category'], string> = {
  person: "I'm thinking of a person",
  place: "I'm thinking of a place",
  thing: "I'm thinking of a thing",
  animal: "I'm thinking of an animal",
  food: "I'm thinking of a food",
};

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(
  category?: TwentyQuestionsState['category']
): TwentyQuestionsState {
  // Pick random category if not specified
  const categories: TwentyQuestionsState['category'][] = [
    'person',
    'place',
    'thing',
    'animal',
    'food',
  ];
  const selectedCategory = category || categories[Math.floor(Math.random() * categories.length)];

  // Pick random thing from category
  const things = SECRET_THINGS[selectedCategory];
  const secretThing = things[Math.floor(Math.random() * things.length)];

  return {
    secretThing,
    category: selectedCategory,
    questionsAsked: [],
    answers: [],
    questionNumber: 0,
    guessedCorrectly: null,
  };
}

// ============================================================================
// ANSWER LOGIC
// ============================================================================

/**
 * Determine the answer to a question about the secret thing
 */
function getAnswer(state: TwentyQuestionsState, question: string): 'yes' | 'no' | 'maybe' {
  const q = question.toLowerCase();
  const secret = state.secretThing.toLowerCase();

  // Check if it's a guess
  if (isGuess(question)) {
    return 'yes'; // Let processGuess handle this
  }

  // Common question patterns
  // Is it alive/living?
  if (q.includes('alive') || q.includes('living') || q.includes('live')) {
    if (state.category === 'person' || state.category === 'animal') return 'yes';
    return 'no';
  }

  // Is it a person/human?
  if (q.includes('person') || q.includes('human') || q.includes('someone')) {
    return state.category === 'person' ? 'yes' : 'no';
  }

  // Is it an animal?
  if (q.includes('animal')) {
    return state.category === 'animal' ? 'yes' : 'no';
  }

  // Is it a place?
  if (q.includes('place') || q.includes('location') || q.includes('somewhere')) {
    return state.category === 'place' ? 'yes' : 'no';
  }

  // Is it food/edible?
  if (q.includes('food') || q.includes('eat') || q.includes('edible')) {
    return state.category === 'food' ? 'yes' : 'no';
  }

  // Is it famous?
  if (q.includes('famous') || q.includes('well-known') || q.includes('celebrity')) {
    if (state.category === 'person' || state.category === 'place') return 'yes';
    return 'maybe';
  }

  // Can you find it indoors/outdoors?
  if (q.includes('indoor') || q.includes('inside') || q.includes('house') || q.includes('home')) {
    if (secret.includes('library') || secret.includes('coffee')) return 'yes';
    if (state.category === 'thing') return 'maybe';
    return 'no';
  }

  // Is it big/large?
  if (q.includes('big') || q.includes('large') || q.includes('tall')) {
    if (secret.includes('elephant') || secret.includes('tower') || secret.includes('canyon'))
      return 'yes';
    if (secret.includes('butterfly') || secret.includes('hummingbird')) return 'no';
    return 'maybe';
  }

  // Is it small?
  if (q.includes('small') || q.includes('little') || q.includes('tiny')) {
    if (secret.includes('butterfly') || secret.includes('hummingbird') || secret.includes('candle'))
      return 'yes';
    if (secret.includes('elephant') || secret.includes('tower')) return 'no';
    return 'maybe';
  }

  // Default to maybe for unclear questions
  return 'maybe';
}

/**
 * Check if the input is a guess rather than a question
 */
function isGuess(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes('is it ') ||
    lower.includes('my guess is') ||
    lower.includes('i think it') ||
    lower.includes('i guess') ||
    lower.startsWith('a ') ||
    lower.startsWith('an ') ||
    lower.startsWith('the ')
  );
}

/**
 * Check if a guess is correct
 */
function checkGuess(state: TwentyQuestionsState, guess: string): boolean {
  const normalizedGuess = guess
    .toLowerCase()
    .replace(/^(is it |my guess is |i think it's |i guess |it's |a |an |the )/i, '')
    .trim();
  const normalizedSecret = state.secretThing
    .toLowerCase()
    .replace(/^(a |an |the )/i, '')
    .trim();

  // Check for exact match or close match
  return (
    normalizedGuess === normalizedSecret ||
    normalizedSecret.includes(normalizedGuess) ||
    normalizedGuess.includes(normalizedSecret)
  );
}

// ============================================================================
// GAME MESSAGES
// ============================================================================

function getStartMessage(state: TwentyQuestionsState): string {
  return `Let's play 20 Questions! ${CATEGORY_HINTS[state.category]}. You have 20 yes-or-no questions to figure out what it is. Go ahead, ask your first question!`;
}

function getAnswerMessage(answer: 'yes' | 'no' | 'maybe', questionsLeft: number): string {
  const answerPhrases = {
    yes: ['Yes!', "That's right!", 'Yep!', 'Yes, it is!'],
    no: ['No.', 'Nope!', "No, it isn't.", "That's a no."],
    maybe: ['Hmm, kind of.', 'Sort of.', 'Maybe... it depends.', "That's a tricky one - maybe."],
  };

  const phrase = answerPhrases[answer][Math.floor(Math.random() * answerPhrases[answer].length)];
  return `${phrase} You have ${questionsLeft} questions left.`;
}

function getWinMessage(state: TwentyQuestionsState): string {
  const messages = [
    `Yes! You got it! It was ${state.secretThing}! Great guessing!`,
    `That's right! ${state.secretThing}! Well done!`,
    `Exactly! It was ${state.secretThing}! You're good at this!`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getLoseMessage(state: TwentyQuestionsState): string {
  return `Out of questions! I was thinking of ${state.secretThing}. Want to play again?`;
}

function getWrongGuessMessage(state: TwentyQuestionsState, questionsLeft: number): string {
  if (questionsLeft <= 0) {
    return getLoseMessage(state);
  }
  return `Not quite! Keep trying. You have ${questionsLeft} questions left.`;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export interface TwentyQuestionsResult extends TextGameResult {
  newState: TwentyQuestionsState;
}

/**
 * Process user input (question or guess)
 */
export function processInput(state: TwentyQuestionsState, input: string): TwentyQuestionsResult {
  // Check if it's a guess
  if (isGuess(input)) {
    const correct = checkGuess(state, input);
    const newState: TwentyQuestionsState = {
      ...state,
      questionNumber: state.questionNumber + 1,
      guessedCorrectly: correct,
    };

    if (correct) {
      return {
        message: getWinMessage(newState),
        gameOver: true,
        winner: 'user',
        newState,
      };
    }

    const questionsLeft = 20 - newState.questionNumber;
    if (questionsLeft <= 0) {
      return {
        message: getLoseMessage(newState),
        gameOver: true,
        winner: 'ai',
        newState,
      };
    }

    return {
      message: getWrongGuessMessage(newState, questionsLeft),
      gameOver: false,
      newState,
    };
  }

  // It's a question
  const answer = getAnswer(state, input);
  const newState: TwentyQuestionsState = {
    ...state,
    questionsAsked: [...state.questionsAsked, input],
    answers: [...state.answers, answer],
    questionNumber: state.questionNumber + 1,
  };

  const questionsLeft = 20 - newState.questionNumber;

  if (questionsLeft <= 0) {
    return {
      message: `${getAnswerMessage(answer, 0)} ${getLoseMessage(newState)}`,
      gameOver: true,
      winner: 'ai',
      newState,
    };
  }

  return {
    message: getAnswerMessage(answer, questionsLeft),
    gameOver: false,
    newState,
  };
}

/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state: TwentyQuestionsState): string {
  const questionsLeft = 20 - state.questionNumber;
  if (state.questionNumber === 0) {
    return `${CATEGORY_HINTS[state.category]}. You haven't asked any questions yet.`;
  }
  return `${CATEGORY_HINTS[state.category]}. You've asked ${state.questionNumber} questions. ${questionsLeft} questions remaining.`;
}

/**
 * Get the game start result
 */
export function getStartResult(state: TwentyQuestionsState): TwentyQuestionsResult {
  return {
    message: getStartMessage(state),
    gameOver: false,
    newState: state,
  };
}
