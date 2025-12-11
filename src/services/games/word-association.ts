/**
 * 🔗 Word Association Implementation
 *
 * A word chain game where players take turns saying words
 * that relate to the previous word.
 *
 * Voice-friendly implementation with natural conversation flow.
 */

import type { TextGameResult, WordAssociationState } from './text-game-types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Starting words organized by category */
const STARTING_WORDS: Record<string, string[]> = {
  nature: ['ocean', 'forest', 'mountain', 'river', 'sunset'],
  food: ['pizza', 'chocolate', 'coffee', 'breakfast', 'kitchen'],
  emotions: ['happy', 'peaceful', 'excited', 'curious', 'calm'],
  activities: ['travel', 'reading', 'music', 'dancing', 'cooking'],
  places: ['home', 'beach', 'city', 'garden', 'library'],
};

/** Common word associations for AI responses */
const WORD_ASSOCIATIONS: Record<string, string[]> = {
  // Nature
  ocean: ['wave', 'beach', 'blue', 'fish', 'deep', 'salt'],
  forest: ['trees', 'green', 'wildlife', 'trail', 'peaceful'],
  mountain: ['peak', 'climb', 'snow', 'hiking', 'view'],
  river: ['flow', 'water', 'bridge', 'fish', 'stream'],
  sunset: ['colors', 'evening', 'orange', 'beautiful', 'sky'],

  // Food
  pizza: ['cheese', 'italian', 'slice', 'pepperoni', 'delivery'],
  chocolate: ['sweet', 'dark', 'candy', 'dessert', 'cocoa'],
  coffee: ['morning', 'caffeine', 'cup', 'espresso', 'wake'],
  breakfast: ['eggs', 'morning', 'pancakes', 'cereal', 'toast'],
  kitchen: ['cooking', 'chef', 'food', 'recipe', 'dinner'],

  // Emotions
  happy: ['smile', 'joy', 'laugh', 'bright', 'cheerful'],
  peaceful: ['calm', 'quiet', 'serene', 'relaxed', 'tranquil'],
  excited: ['thrilled', 'eager', 'anticipation', 'energy', 'buzz'],
  curious: ['wonder', 'question', 'explore', 'discover', 'learn'],
  calm: ['peaceful', 'still', 'relaxed', 'quiet', 'zen'],

  // Activities
  travel: ['adventure', 'explore', 'journey', 'passport', 'vacation'],
  reading: ['book', 'story', 'pages', 'knowledge', 'library'],
  music: ['song', 'melody', 'rhythm', 'dance', 'concert'],
  dancing: ['movement', 'rhythm', 'party', 'music', 'fun'],
  cooking: ['recipe', 'kitchen', 'chef', 'food', 'dinner'],

  // Places
  home: ['family', 'comfort', 'cozy', 'safe', 'heart'],
  beach: ['sand', 'waves', 'sun', 'vacation', 'relaxing'],
  city: ['buildings', 'busy', 'lights', 'people', 'urban'],
  garden: ['flowers', 'green', 'grow', 'peaceful', 'nature'],
  library: ['books', 'quiet', 'knowledge', 'study', 'reading'],

  // Common words that might come up
  water: ['drink', 'ocean', 'rain', 'blue', 'swim'],
  sun: ['warm', 'bright', 'summer', 'shine', 'day'],
  night: ['stars', 'dark', 'moon', 'sleep', 'dreams'],
  love: ['heart', 'family', 'care', 'warmth', 'together'],
  friend: ['buddy', 'companion', 'trust', 'fun', 'support'],
  work: ['job', 'office', 'career', 'busy', 'effort'],
  play: ['fun', 'games', 'kids', 'enjoy', 'recreation'],
  time: ['clock', 'hours', 'moment', 'passing', 'memory'],
  dream: ['sleep', 'hope', 'wish', 'imagine', 'future'],
  life: ['living', 'experience', 'journey', 'precious', 'adventure'],
};

// ============================================================================
// GAME CREATION
// ============================================================================

export function createInitialState(): WordAssociationState {
  // Pick random category and starting word
  const categories = Object.keys(STARTING_WORDS);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const words = STARTING_WORDS[category];
  const startWord = words[Math.floor(Math.random() * words.length)];

  return {
    chain: [startWord],
    currentWord: startWord,
    turnCount: 0,
    isUserTurn: true,
    lastValidWord: startWord,
  };
}

// ============================================================================
// WORD VALIDATION & AI RESPONSE
// ============================================================================

/**
 * Check if the user's word is a valid association
 * (We're lenient - most words are accepted)
 */
function isValidAssociation(previousWord: string, newWord: string): boolean {
  // Clean up words
  const prev = previousWord.toLowerCase().trim();
  const next = newWord.toLowerCase().trim();

  // Don't allow same word
  if (prev === next) return false;

  // Don't allow very short words (likely errors)
  if (next.length < 2) return false;

  // Accept most words - the game is meant to be fun
  return true;
}

/**
 * Get AI's associated word based on user's word
 */
function getAIAssociation(word: string): string {
  const lower = word.toLowerCase().trim();

  // Check if we have pre-defined associations
  if (WORD_ASSOCIATIONS[lower]) {
    const associations = WORD_ASSOCIATIONS[lower];
    return associations[Math.floor(Math.random() * associations.length)];
  }

  // Generic fallback associations based on word characteristics
  const genericAssociations = [
    'interesting',
    'thought',
    'memory',
    'feeling',
    'idea',
    'moment',
    'experience',
    'story',
    'connection',
    'meaning',
  ];

  return genericAssociations[Math.floor(Math.random() * genericAssociations.length)];
}

// ============================================================================
// GAME MESSAGES
// ============================================================================

function getStartMessage(state: WordAssociationState): string {
  return `Let's play Word Association! I'll say a word, you say the first word that comes to mind, then I'll respond, and we'll keep the chain going. Here's my word: "${state.currentWord}". What do you think of?`;
}

function getAITurnMessage(aiWord: string, chainLength: number): string {
  const intros = [
    `${aiWord}!`,
    `Ooh, that makes me think of... ${aiWord}`,
    `${aiWord} - your turn!`,
    `I'm thinking... ${aiWord}`,
    `${aiWord}. What's next?`,
  ];

  const intro = intros[Math.floor(Math.random() * intros.length)];

  if (chainLength > 10 && chainLength % 5 === 0) {
    return `${intro} Wow, ${chainLength} words in our chain!`;
  }

  return intro;
}

function getInvalidWordMessage(): string {
  const messages = [
    "Hmm, let's try a different word!",
    'Give me another word to work with!',
    'How about something else?',
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getEndGameMessage(state: WordAssociationState): string {
  return `Great game! We built a chain of ${state.chain.length} words. Want to play again?`;
}

// ============================================================================
// MAIN GAME LOGIC
// ============================================================================

export interface WordAssociationResult extends TextGameResult {
  newState: WordAssociationState;
}

/**
 * Process user input (their associated word)
 */
export function processInput(state: WordAssociationState, input: string): WordAssociationResult {
  const userWord = input.toLowerCase().trim();

  // Check for quit/stop commands
  if (userWord === 'stop' || userWord === 'quit' || userWord === 'end') {
    return {
      message: getEndGameMessage(state),
      gameOver: true,
      winner: 'draw',
      newState: state,
    };
  }

  // Validate user's word
  if (!isValidAssociation(state.currentWord, userWord)) {
    return {
      message: getInvalidWordMessage(),
      gameOver: false,
      newState: state,
    };
  }

  // User's word is valid - add to chain
  const chainWithUserWord = [...state.chain, userWord];

  // AI responds with associated word
  const aiWord = getAIAssociation(userWord);
  const newChain = [...chainWithUserWord, aiWord];

  const newState: WordAssociationState = {
    chain: newChain,
    currentWord: aiWord,
    turnCount: state.turnCount + 1,
    isUserTurn: true,
    lastValidWord: aiWord,
  };

  // Check if chain is getting long (optional end condition)
  if (newChain.length >= 50) {
    return {
      message: `${getAITurnMessage(aiWord, newChain.length)} That's 50 words! Impressive chain! Want to keep going or call it a win?`,
      gameOver: false,
      newState,
    };
  }

  return {
    message: getAITurnMessage(aiWord, newChain.length),
    gameOver: false,
    newState,
  };
}

/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state: WordAssociationState): string {
  if (state.chain.length <= 1) {
    return `Word Association. The starting word is "${state.currentWord}". Your turn!`;
  }

  const lastFew = state.chain.slice(-3).join(' → ');
  return `Word Association. Chain length: ${state.chain.length}. Recent words: ${lastFew}. Current word: "${state.currentWord}".`;
}

/**
 * Get the game start result
 */
export function getStartResult(state: WordAssociationState): WordAssociationResult {
  return {
    message: getStartMessage(state),
    gameOver: false,
    newState: state,
  };
}
