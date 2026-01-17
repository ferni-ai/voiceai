/**
 * 🎮 New Music Games
 *
 * Additional game types for Musical You:
 * - Finish the Lyric
 * - Decade Challenge
 * - Music Trivia
 *
 * @module MusicalYouGames
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { FinishTheLyricRound, DecadeChallengeRound, MusicTriviaQuestion } from './types.js';

const log = createLogger({ module: 'MusicalYouGames' });

// ============================================================================
// FINISH THE LYRIC DATA
// ============================================================================

const LYRIC_ROUNDS: FinishTheLyricRound[] = [
  // Classic Rock
  {
    trackId: 'bohemian-rhapsody',
    trackName: 'Bohemian Rhapsody',
    artistName: 'Queen',
    lyricSnippet: 'Is this the real life? Is this just fantasy?',
    correctContinuation: 'Caught in a landslide, no escape from reality',
    alternatives: ['caught in a landslide', 'no escape from reality', 'caught in landslide'],
    difficulty: 'easy',
    points: 50,
  },
  {
    trackId: 'hotel-california',
    trackName: 'Hotel California',
    artistName: 'Eagles',
    lyricSnippet: 'Welcome to the Hotel California',
    correctContinuation: 'Such a lovely place, such a lovely face',
    alternatives: ['such a lovely place', 'lovely place', 'lovely face'],
    difficulty: 'easy',
    points: 50,
  },
  {
    trackId: 'sweet-child',
    trackName: "Sweet Child O' Mine",
    artistName: "Guns N' Roses",
    lyricSnippet: "She's got a smile that it seems to me",
    correctContinuation: 'Reminds me of childhood memories',
    alternatives: ['reminds me of childhood', 'childhood memories'],
    difficulty: 'medium',
    points: 75,
  },

  // Pop
  {
    trackId: 'billie-jean',
    trackName: 'Billie Jean',
    artistName: 'Michael Jackson',
    lyricSnippet: 'Billie Jean is not my lover',
    correctContinuation: "She's just a girl who claims that I am the one",
    alternatives: ["she's just a girl", 'just a girl who claims', 'claims that I am the one'],
    difficulty: 'easy',
    points: 50,
  },
  {
    trackId: 'uptown-funk',
    trackName: 'Uptown Funk',
    artistName: 'Bruno Mars',
    lyricSnippet: "Don't believe me just watch",
    correctContinuation: "Don't believe me just watch",
    alternatives: ['just watch', 'watch'],
    difficulty: 'easy',
    points: 50,
  },
  {
    trackId: 'bad-guy',
    trackName: 'bad guy',
    artistName: 'Billie Eilish',
    lyricSnippet: "So you're a tough guy, like it really rough guy",
    correctContinuation: "Just can't get enough guy, chest always so puffed guy",
    alternatives: ["just can't get enough", 'chest always so puffed', "can't get enough guy"],
    difficulty: 'medium',
    points: 75,
  },

  // 80s
  {
    trackId: 'take-on-me',
    trackName: 'Take On Me',
    artistName: 'a-ha',
    lyricSnippet: 'Take on me',
    correctContinuation: 'Take me on',
    alternatives: ['take me on'],
    difficulty: 'easy',
    points: 50,
  },
  {
    trackId: 'africa',
    trackName: 'Africa',
    artistName: 'Toto',
    lyricSnippet: 'I bless the rains down in Africa',
    correctContinuation: 'Gonna take some time to do the things we never had',
    alternatives: ['gonna take some time', 'take some time to do', 'things we never had'],
    difficulty: 'medium',
    points: 75,
  },

  // 90s
  {
    trackId: 'smells-like',
    trackName: 'Smells Like Teen Spirit',
    artistName: 'Nirvana',
    lyricSnippet: "With the lights out, it's less dangerous",
    correctContinuation: 'Here we are now, entertain us',
    alternatives: ['here we are now', 'entertain us'],
    difficulty: 'medium',
    points: 75,
  },
  {
    trackId: 'wannabe',
    trackName: 'Wannabe',
    artistName: 'Spice Girls',
    lyricSnippet: 'If you wanna be my lover',
    correctContinuation: 'You gotta get with my friends',
    alternatives: ['get with my friends', 'gotta get with my friends'],
    difficulty: 'easy',
    points: 50,
  },

  // 2000s
  {
    trackId: 'crazy-in-love',
    trackName: 'Crazy in Love',
    artistName: 'Beyoncé',
    lyricSnippet: 'Got me looking so crazy right now',
    correctContinuation: "Your love's got me looking so crazy right now",
    alternatives: ["your love's got me", 'looking so crazy'],
    difficulty: 'medium',
    points: 75,
  },

  // Hard
  {
    trackId: 'lose-yourself',
    trackName: 'Lose Yourself',
    artistName: 'Eminem',
    lyricSnippet: 'His palms are sweaty, knees weak, arms are heavy',
    correctContinuation: "There's vomit on his sweater already, mom's spaghetti",
    alternatives: ["mom's spaghetti", 'vomit on his sweater', 'sweater already'],
    difficulty: 'hard',
    points: 100,
  },
  {
    trackId: 'mr-brightside',
    trackName: 'Mr. Brightside',
    artistName: 'The Killers',
    lyricSnippet: "Coming out of my cage and I've been doing just fine",
    correctContinuation: 'Gotta gotta be down because I want it all',
    alternatives: ['gotta be down', 'gotta gotta be down', 'because I want it all'],
    difficulty: 'hard',
    points: 100,
  },
];

// ============================================================================
// DECADE CHALLENGE DATA
// ============================================================================

const DECADE_ROUNDS: DecadeChallengeRound[] = [
  // 1960s
  {
    trackId: 'hey-jude',
    trackName: 'Hey Jude',
    artistName: 'The Beatles',
    correctDecade: '1960s',
    previewUrl: '',
    hints: ['British Invasion', 'Fab Four', 'Long outro'],
    points: 75,
  },
  {
    trackId: 'respect',
    trackName: 'Respect',
    artistName: 'Aretha Franklin',
    correctDecade: '1960s',
    previewUrl: '',
    hints: ['Soul music', 'Queen of Soul', 'Feminist anthem'],
    points: 75,
  },

  // 1970s
  {
    trackId: 'stayin-alive',
    trackName: "Stayin' Alive",
    artistName: 'Bee Gees',
    correctDecade: '1970s',
    previewUrl: '',
    hints: ['Disco era', 'Saturday Night Fever', 'Falsetto'],
    points: 75,
  },
  {
    trackId: 'stairway',
    trackName: 'Stairway to Heaven',
    artistName: 'Led Zeppelin',
    correctDecade: '1970s',
    previewUrl: '',
    hints: ['Classic rock', 'Epic guitar solo', 'Acoustic to electric'],
    points: 75,
  },

  // 1980s
  {
    trackId: 'thriller',
    trackName: 'Thriller',
    artistName: 'Michael Jackson',
    correctDecade: '1980s',
    previewUrl: '',
    hints: ['King of Pop', 'Halloween anthem', 'Iconic music video'],
    points: 50,
  },
  {
    trackId: 'livin-prayer',
    trackName: "Livin' on a Prayer",
    artistName: 'Bon Jovi',
    correctDecade: '1980s',
    previewUrl: '',
    hints: ['Hair metal', 'Tommy and Gina', 'Talk box guitar'],
    points: 50,
  },

  // 1990s
  {
    trackId: 'black-hole-sun',
    trackName: 'Black Hole Sun',
    artistName: 'Soundgarden',
    correctDecade: '1990s',
    previewUrl: '',
    hints: ['Grunge', 'Seattle sound', 'Surreal music video'],
    points: 75,
  },
  {
    trackId: 'i-will-always',
    trackName: 'I Will Always Love You',
    artistName: 'Whitney Houston',
    correctDecade: '1990s',
    previewUrl: '',
    hints: ['Power ballad', 'The Bodyguard', 'Dolly Parton original'],
    points: 50,
  },

  // 2000s
  {
    trackId: 'in-da-club',
    trackName: 'In Da Club',
    artistName: '50 Cent',
    correctDecade: '2000s',
    previewUrl: '',
    hints: ['Hip hop', 'Birthday anthem', 'Dr. Dre production'],
    points: 50,
  },
  {
    trackId: 'toxic',
    trackName: 'Toxic',
    artistName: 'Britney Spears',
    correctDecade: '2000s',
    previewUrl: '',
    hints: ['Pop princess', 'Bollywood sample', 'Flight attendant video'],
    points: 50,
  },

  // 2010s
  {
    trackId: 'rolling-deep',
    trackName: 'Rolling in the Deep',
    artistName: 'Adele',
    correctDecade: '2010s',
    previewUrl: '',
    hints: ['British singer', 'Heartbreak anthem', 'Powerful vocals'],
    points: 50,
  },
  {
    trackId: 'old-town-road',
    trackName: 'Old Town Road',
    artistName: 'Lil Nas X',
    correctDecade: '2010s',
    previewUrl: '',
    hints: ['Country rap', 'TikTok viral', 'Billy Ray Cyrus remix'],
    points: 50,
  },
];

// ============================================================================
// MUSIC TRIVIA DATA
// ============================================================================

const TRIVIA_QUESTIONS: MusicTriviaQuestion[] = [
  // Artist Trivia
  {
    id: 'trivia-1',
    category: 'artist',
    question: "What was Michael Jackson's middle name?",
    correctAnswer: 'Joseph',
    wrongAnswers: ['James', 'John', 'Jerome'],
    difficulty: 'medium',
    funFact: 'He was named after his father, Joseph Walter Jackson.',
    points: 75,
  },
  {
    id: 'trivia-2',
    category: 'artist',
    question: 'Which member of The Beatles was the first to release a solo album?',
    correctAnswer: 'Ringo Starr',
    wrongAnswers: ['John Lennon', 'Paul McCartney', 'George Harrison'],
    difficulty: 'hard',
    funFact:
      "Ringo's 'Sentimental Journey' came out in 1970, just before the band officially split.",
    points: 100,
  },
  {
    id: 'trivia-3',
    category: 'artist',
    question: "What is Taylor Swift's middle name?",
    correctAnswer: 'Alison',
    wrongAnswers: ['Marie', 'Rose', 'Elizabeth'],
    difficulty: 'medium',
    funFact: "She was named after James Taylor, her mother's favorite artist.",
    points: 75,
  },

  // Song Trivia
  {
    id: 'trivia-4',
    category: 'song',
    question: 'Which song spent the most weeks at #1 on the Billboard Hot 100?',
    correctAnswer: 'Old Town Road',
    wrongAnswers: ['Despacito', 'Shape of You', 'Blinding Lights'],
    difficulty: 'medium',
    funFact: 'It topped the chart for 19 consecutive weeks in 2019.',
    points: 75,
  },
  {
    id: 'trivia-5',
    category: 'song',
    question: 'What was the first music video ever played on MTV?',
    correctAnswer: 'Video Killed the Radio Star',
    wrongAnswers: ['Thriller', 'Like a Virgin', 'Take On Me'],
    difficulty: 'easy',
    funFact: 'The Buggles made history on August 1, 1981.',
    points: 50,
  },
  {
    id: 'trivia-6',
    category: 'song',
    question: 'Which 1970s song is the best-selling single of all time?',
    correctAnswer: 'White Christmas',
    wrongAnswers: ['Bohemian Rhapsody', 'Imagine', 'Hotel California'],
    difficulty: 'hard',
    funFact: "Bing Crosby's version has sold over 50 million copies worldwide.",
    points: 100,
  },

  // Album Trivia
  {
    id: 'trivia-7',
    category: 'album',
    question: 'What is the best-selling album of all time?',
    correctAnswer: 'Thriller',
    wrongAnswers: ['Back in Black', 'The Dark Side of the Moon', 'Abbey Road'],
    difficulty: 'easy',
    funFact: "Michael Jackson's 1982 album has sold over 70 million copies.",
    points: 50,
  },
  {
    id: 'trivia-8',
    category: 'album',
    question: 'Which Pink Floyd album features a prism on its cover?',
    correctAnswer: 'The Dark Side of the Moon',
    wrongAnswers: ['Wish You Were Here', 'The Wall', 'Animals'],
    difficulty: 'easy',
    funFact: 'The album was on the Billboard 200 for 937 weeks.',
    points: 50,
  },

  // History Trivia
  {
    id: 'trivia-9',
    category: 'history',
    question: 'In what year did Woodstock take place?',
    correctAnswer: '1969',
    wrongAnswers: ['1967', '1971', '1965'],
    difficulty: 'medium',
    funFact: 'Over 400,000 people attended the festival in upstate New York.',
    points: 75,
  },
  {
    id: 'trivia-10',
    category: 'history',
    question: 'Which streaming service launched first?',
    correctAnswer: 'Spotify',
    wrongAnswers: ['Apple Music', 'Amazon Music', 'Tidal'],
    difficulty: 'medium',
    funFact: 'Spotify launched in Sweden in 2008, Apple Music came in 2015.',
    points: 75,
  },

  // Awards Trivia
  {
    id: 'trivia-11',
    category: 'awards',
    question: 'Which artist has won the most Grammy Awards?',
    correctAnswer: 'Beyoncé',
    wrongAnswers: ['Taylor Swift', 'Adele', 'Stevie Wonder'],
    difficulty: 'medium',
    funFact: 'Beyoncé has won 32 Grammys, the most of any artist in history.',
    points: 75,
  },
  {
    id: 'trivia-12',
    category: 'awards',
    question: 'Which album won Album of the Year at the 2021 Grammys?',
    correctAnswer: 'folklore',
    wrongAnswers: ['Future Nostalgia', 'After Hours', 'Chromatica'],
    difficulty: 'medium',
    funFact: "Taylor Swift's 9th studio album made her the first woman to win AOTY three times.",
    points: 75,
  },
];

// ============================================================================
// GAME LOGIC
// ============================================================================

/**
 * Get a random Finish the Lyric round
 */
export function getRandomLyricRound(
  difficulty?: 'easy' | 'medium' | 'hard',
  excludeIds?: string[]
): FinishTheLyricRound {
  let rounds = LYRIC_ROUNDS;

  if (difficulty) {
    rounds = rounds.filter((r) => r.difficulty === difficulty);
  }

  if (excludeIds && excludeIds.length > 0) {
    rounds = rounds.filter((r) => !excludeIds.includes(r.trackId));
  }

  if (rounds.length === 0) {
    // Fallback to any round
    rounds = LYRIC_ROUNDS;
  }

  return rounds[Math.floor(Math.random() * rounds.length)];
}

/**
 * Check if lyric answer is correct
 */
export function checkLyricAnswer(
  round: FinishTheLyricRound,
  answer: string
): {
  correct: boolean;
  score: number;
  exactMatch: boolean;
} {
  const normalized = answer.toLowerCase().trim();
  const correctNormalized = round.correctContinuation.toLowerCase().trim();

  // Check exact match
  if (normalized === correctNormalized) {
    return { correct: true, score: round.points, exactMatch: true };
  }

  // Check alternatives
  for (const alt of round.alternatives) {
    if (normalized.includes(alt.toLowerCase())) {
      return { correct: true, score: Math.round(round.points * 0.8), exactMatch: false };
    }
  }

  return { correct: false, score: 0, exactMatch: false };
}

/**
 * Get a random Decade Challenge round
 */
export function getRandomDecadeRound(excludeIds?: string[]): DecadeChallengeRound {
  let rounds = DECADE_ROUNDS;

  if (excludeIds && excludeIds.length > 0) {
    rounds = rounds.filter((r) => !excludeIds.includes(r.trackId));
  }

  if (rounds.length === 0) {
    rounds = DECADE_ROUNDS;
  }

  return rounds[Math.floor(Math.random() * rounds.length)];
}

/**
 * Check if decade guess is correct
 */
export function checkDecadeGuess(
  round: DecadeChallengeRound,
  guessedDecade: string
): {
  correct: boolean;
  score: number;
  offBy: number;
} {
  const normalizedGuess = guessedDecade.replace(/s$/, '').trim();
  const normalizedCorrect = round.correctDecade.replace(/s$/, '').trim();

  // Parse decades to numbers
  const guessNum = parseInt(normalizedGuess, 10);
  const correctNum = parseInt(normalizedCorrect, 10);

  if (guessNum === correctNum) {
    return { correct: true, score: round.points, offBy: 0 };
  }

  const offBy = Math.abs(correctNum - guessNum) / 10;

  // Partial credit: off by one decade
  if (offBy === 1) {
    return { correct: false, score: Math.round(round.points * 0.5), offBy };
  }

  return { correct: false, score: 0, offBy };
}

/**
 * Get random trivia questions
 */
export function getRandomTriviaQuestions(
  count = 5,
  category?: 'artist' | 'song' | 'album' | 'history' | 'awards',
  difficulty?: 'easy' | 'medium' | 'hard',
  excludeIds?: string[]
): MusicTriviaQuestion[] {
  let questions = TRIVIA_QUESTIONS;

  if (category) {
    questions = questions.filter((q) => q.category === category);
  }

  if (difficulty) {
    questions = questions.filter((q) => q.difficulty === difficulty);
  }

  if (excludeIds && excludeIds.length > 0) {
    questions = questions.filter((q) => !excludeIds.includes(q.id));
  }

  // Shuffle
  const shuffled = questions.sort(() => Math.random() - 0.5);

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Shuffle answer options for a trivia question
 */
export function getShuffledTriviaOptions(question: MusicTriviaQuestion): string[] {
  const options = [question.correctAnswer, ...question.wrongAnswers];
  return options.sort(() => Math.random() - 0.5);
}

/**
 * Check trivia answer
 */
export function checkTriviaAnswer(
  question: MusicTriviaQuestion,
  answer: string
): {
  correct: boolean;
  score: number;
  correctAnswer: string;
  funFact: string | undefined;
} {
  const correct = answer.toLowerCase().trim() === question.correctAnswer.toLowerCase().trim();

  return {
    correct,
    score: correct ? question.points : 0,
    correctAnswer: question.correctAnswer,
    funFact: question.funFact,
  };
}

// ============================================================================
// GAME SESSION HELPERS
// ============================================================================

export interface LyricGameSession {
  rounds: FinishTheLyricRound[];
  currentRound: number;
  score: number;
  correctCount: number;
  usedTrackIds: string[];
}

export interface DecadeGameSession {
  rounds: DecadeChallengeRound[];
  currentRound: number;
  score: number;
  correctCount: number;
  hintsUsed: number;
}

export interface TriviaGameSession {
  questions: MusicTriviaQuestion[];
  currentQuestion: number;
  score: number;
  correctCount: number;
  answeredIds: string[];
}

/**
 * Create a new Finish the Lyric game session
 */
export function createLyricGameSession(roundCount = 5): LyricGameSession {
  const rounds: FinishTheLyricRound[] = [];
  const usedIds: string[] = [];

  for (let i = 0; i < roundCount; i++) {
    const round = getRandomLyricRound(undefined, usedIds);
    rounds.push(round);
    usedIds.push(round.trackId);
  }

  log.info({ roundCount }, '🎤 Created Finish the Lyric session');

  return {
    rounds,
    currentRound: 0,
    score: 0,
    correctCount: 0,
    usedTrackIds: usedIds,
  };
}

/**
 * Create a new Decade Challenge session
 */
export function createDecadeGameSession(roundCount = 5): DecadeGameSession {
  const rounds: DecadeChallengeRound[] = [];
  const usedIds: string[] = [];

  for (let i = 0; i < roundCount; i++) {
    const round = getRandomDecadeRound(usedIds);
    rounds.push(round);
    usedIds.push(round.trackId);
  }

  log.info({ roundCount }, '📅 Created Decade Challenge session');

  return {
    rounds,
    currentRound: 0,
    score: 0,
    correctCount: 0,
    hintsUsed: 0,
  };
}

/**
 * Create a new Music Trivia session
 */
export function createTriviaGameSession(
  questionCount = 10,
  category?: 'artist' | 'song' | 'album' | 'history' | 'awards'
): TriviaGameSession {
  const questions = getRandomTriviaQuestions(questionCount, category);

  log.info({ questionCount, category }, '❓ Created Music Trivia session');

  return {
    questions,
    currentQuestion: 0,
    score: 0,
    correctCount: 0,
    answeredIds: [],
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Lyric game
  getRandomLyricRound,
  checkLyricAnswer,
  createLyricGameSession,

  // Decade game
  getRandomDecadeRound,
  checkDecadeGuess,
  createDecadeGameSession,

  // Trivia game
  getRandomTriviaQuestions,
  getShuffledTriviaOptions,
  checkTriviaAnswer,
  createTriviaGameSession,
};
