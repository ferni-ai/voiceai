/**
 * 🧠 Game Intelligence Service
 *
 * "More than human" features for games:
 * - Musical DNA analysis (genre/decade affinities)
 * - Real-time difficulty sensing
 * - Milestone detection and celebration
 * - Musical personality insights
 * - Memory-powered song selection
 * - Conversation-to-game callbacks
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  GameMemory,
  AffinityScore,
  GameMilestone,
  MusicalPersonalityTrait,
  GuessTimingRecord,
} from '../../types/user-profile.js';
import type { GameType, GameResult } from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface DifficultyRecommendation {
  /** Recommended difficulty level */
  difficulty: 'easier' | 'same' | 'harder';
  /** Reason for the recommendation */
  reason: string;
  /** New multiplier (0.5-2.0) */
  multiplier: number;
  /** Should we say something to the user? */
  speakToUser: boolean;
  /** What to say */
  message?: string;
}

export interface PersonalityInsight {
  /** The insight */
  insight: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Traits that support this */
  supportingTraits: string[];
}

export interface MilestoneEvent {
  /** The milestone achieved */
  milestone: GameMilestone;
  /** Celebration message */
  celebrationMessage: string;
  /** Sound effect type */
  soundEffect: 'fanfare' | 'sparkle' | 'applause' | 'record_scratch';
}

export interface SongSelectionContext {
  /** User's strong genres */
  strongGenres: string[];
  /** User's weak genres (for challenge) */
  weakGenres: string[];
  /** User's strong decades */
  strongDecades: string[];
  /** User's weak decades (for challenge) */
  weakDecades: string[];
  /** Recent conversation topics that relate to music */
  conversationHints: string[];
  /** Preferred difficulty */
  difficulty: 'easy' | 'medium' | 'hard';
}

// ============================================================================
// MUSICAL DNA ANALYSIS
// ============================================================================

/**
 * Record a guess timing and update affinities
 */
export function recordGuess(
  gameMemory: GameMemory,
  item: string,
  guessTimeMs: number,
  correct: boolean,
  genre?: string,
  decade?: string
): GameMemory {
  const timing: GuessTimingRecord = {
    item,
    guessTimeMs,
    correct,
    genre,
    decade,
    timestamp: new Date(),
  };

  // Initialize arrays if needed
  if (!gameMemory.recentGuessTimings) {
    gameMemory.recentGuessTimings = [];
  }

  // Add to recent timings (keep last 100)
  gameMemory.recentGuessTimings.unshift(timing);
  if (gameMemory.recentGuessTimings.length > 100) {
    gameMemory.recentGuessTimings = gameMemory.recentGuessTimings.slice(0, 100);
  }

  // Update streak
  if (correct) {
    gameMemory.currentStreak = (gameMemory.currentStreak || 0) + 1;
    if (gameMemory.currentStreak > (gameMemory.bestStreak || 0)) {
      gameMemory.bestStreak = gameMemory.currentStreak;
    }
  } else {
    gameMemory.currentStreak = 0;
  }

  // Update fastest guess
  if (correct && guessTimeMs < (gameMemory.fastestGuessMs || Infinity)) {
    gameMemory.fastestGuessMs = guessTimeMs;
    gameMemory.fastestGuessSong = item;
  }

  // Update genre affinity
  if (genre) {
    updateAffinity(gameMemory, 'genre', genre, guessTimeMs, correct);
  }

  // Update decade affinity
  if (decade) {
    updateAffinity(gameMemory, 'decade', decade, guessTimeMs, correct);
  }

  gameMemory.updatedAt = new Date();

  log.debug(
    {
      item,
      guessTimeMs,
      correct,
      genre,
      decade,
      streak: gameMemory.currentStreak,
    },
    '🧠 Recorded guess timing'
  );

  return gameMemory;
}

/**
 * Update affinity score for a category
 */
function updateAffinity(
  gameMemory: GameMemory,
  type: 'genre' | 'decade',
  category: string,
  guessTimeMs: number,
  correct: boolean
): void {
  const affinities =
    type === 'genre' ? (gameMemory.genreAffinities ||= {}) : (gameMemory.decadeAffinities ||= {});

  const existing = affinities[category];

  if (existing) {
    // Update existing affinity
    existing.totalAttempts++;
    if (correct) {
      existing.correctGuesses++;
      // Rolling average for guess time (only count correct guesses)
      existing.avgGuessTimeMs = Math.round(
        (existing.avgGuessTimeMs * (existing.correctGuesses - 1) + guessTimeMs) /
          existing.correctGuesses
      );
    }
    existing.successRate = existing.correctGuesses / existing.totalAttempts;
    existing.affinityScore = calculateAffinityScore(existing);
  } else {
    // Create new affinity
    affinities[category] = {
      category,
      correctGuesses: correct ? 1 : 0,
      totalAttempts: 1,
      avgGuessTimeMs: correct ? guessTimeMs : 10000, // Default to slow if wrong
      successRate: correct ? 1 : 0,
      affinityScore: correct ? 50 : 10, // Starting score
    };
  }
}

/**
 * Calculate overall affinity score (0-100)
 * Combines accuracy and speed
 */
function calculateAffinityScore(affinity: AffinityScore): number {
  // Weight: 60% accuracy, 40% speed
  const accuracyScore = affinity.successRate * 60;

  // Speed score: 5000ms or faster = 40 points, 15000ms+ = 0 points
  const speedScore = Math.max(0, 40 - (affinity.avgGuessTimeMs - 5000) / 250);

  return Math.round(Math.min(100, Math.max(0, accuracyScore + speedScore)));
}

/**
 * Get top affinities (strongest areas)
 */
export function getTopAffinities(
  gameMemory: GameMemory,
  type: 'genre' | 'decade',
  limit = 3
): AffinityScore[] {
  const affinities = type === 'genre' ? gameMemory.genreAffinities : gameMemory.decadeAffinities;

  if (!affinities) return [];

  return Object.values(affinities)
    .filter((a) => a.totalAttempts >= 3) // Need enough data
    .sort((a, b) => b.affinityScore - a.affinityScore)
    .slice(0, limit);
}

/**
 * Get weak areas (for challenge mode or learning)
 */
export function getWeakAreas(
  gameMemory: GameMemory,
  type: 'genre' | 'decade',
  limit = 3
): AffinityScore[] {
  const affinities = type === 'genre' ? gameMemory.genreAffinities : gameMemory.decadeAffinities;

  if (!affinities) return [];

  return Object.values(affinities)
    .filter((a) => a.totalAttempts >= 3)
    .sort((a, b) => a.affinityScore - b.affinityScore)
    .slice(0, limit);
}

// ============================================================================
// REAL-TIME DIFFICULTY SENSING
// ============================================================================

/**
 * Analyze recent performance and recommend difficulty adjustment
 */
export function analyzeDifficulty(
  gameMemory: GameMemory,
  recentResults: GameResult[],
  currentRound: number
): DifficultyRecommendation {
  const currentMultiplier = gameMemory.adaptiveDifficultyMultiplier || 1.0;

  // Count recent performance (last 5 results)
  const recent = recentResults.slice(-5);
  const correctCount = recent.filter((r) => r.correct).length;
  const avgPoints = recent.reduce((sum, r) => sum + r.pointsEarned, 0) / recent.length;

  // Check timing trends
  const recentTimings = gameMemory.recentGuessTimings?.slice(0, 5) || [];
  const avgGuessTime =
    recentTimings.length > 0
      ? recentTimings.reduce((sum, t) => sum + t.guessTimeMs, 0) / recentTimings.length
      : 8000;

  // CRUSHING IT: Make it harder
  if (correctCount >= 4 && avgGuessTime < 5000) {
    const newMultiplier = Math.min(2.0, currentMultiplier + 0.2);
    return {
      difficulty: 'harder',
      reason: 'Crushing it! Making it harder.',
      multiplier: newMultiplier,
      speakToUser: true,
      message: getHarderMessage(currentRound),
    };
  }

  // STRUGGLING: Make it easier
  if (correctCount <= 1 || (gameMemory.currentStreak === 0 && recent.length >= 3)) {
    const newMultiplier = Math.max(0.5, currentMultiplier - 0.2);
    return {
      difficulty: 'easier',
      reason: 'Struggling a bit, adjusting.',
      multiplier: newMultiplier,
      speakToUser: correctCount === 0, // Only speak if they got none right
      message: getEasierMessage(),
    };
  }

  // JUST RIGHT: Stay the same
  return {
    difficulty: 'same',
    reason: 'Good pace',
    multiplier: currentMultiplier,
    speakToUser: false,
  };
}

function getHarderMessage(round: number): string {
  const messages = [
    "Okay, you're too good at this. Let me find something trickier...",
    "Alright hotshot, let's see how you handle this next one!",
    "You're making this look easy! Time to step it up.",
    "Wow, you've got an ear for this! Let me challenge you a bit more.",
    "I'm impressed! But can you keep it up with a harder one?",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function getEasierMessage(): string {
  const messages = [
    'Let me try something you might know better...',
    "Here's one you'll probably recognize...",
    "Don't worry, this next one's a classic...",
    "Let's build that confidence back up...",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================================================
// MILESTONE DETECTION
// ============================================================================

/**
 * Check for new milestones after a game action
 */
export function checkMilestones(
  gameMemory: GameMemory,
  gameType: GameType,
  result?: GameResult,
  guessTimeMs?: number
): MilestoneEvent | null {
  const existingMilestones = gameMemory.milestones || [];
  const achieved = new Set(existingMilestones.map((m) => m.type));

  let newMilestone: GameMilestone | null = null;

  // First game ever
  if (gameMemory.totalGamesPlayed === 1 && !achieved.has('first_game')) {
    newMilestone = {
      type: 'first_game',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  // First perfect round
  if (result?.correct && result.pointsEarned >= 100 && !achieved.has('first_perfect_round')) {
    newMilestone = {
      type: 'first_perfect_round',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  // 10 games milestone
  if (gameMemory.totalGamesPlayed === 10 && !achieved.has('ten_games')) {
    newMilestone = {
      type: 'ten_games',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  // 50 games milestone
  if (gameMemory.totalGamesPlayed === 50 && !achieved.has('fifty_games')) {
    newMilestone = {
      type: 'fifty_games',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  // Fastest guess ever
  if (guessTimeMs && guessTimeMs < 2000 && result?.correct && !achieved.has('fastest_guess')) {
    newMilestone = {
      type: 'fastest_guess',
      achievedAt: new Date(),
      gameType,
      context: `${(guessTimeMs / 1000).toFixed(1)} seconds!`,
      celebrated: false,
    };
  }

  // 5 streak
  if (gameMemory.currentStreak === 5 && !achieved.has('streak_five')) {
    newMilestone = {
      type: 'streak_five',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  // 10 streak
  if (gameMemory.currentStreak === 10 && !achieved.has('streak_ten')) {
    newMilestone = {
      type: 'streak_ten',
      achievedAt: new Date(),
      gameType,
      celebrated: false,
    };
  }

  if (!newMilestone) {
    return null;
  }

  // Save milestone
  if (!gameMemory.milestones) {
    gameMemory.milestones = [];
  }
  gameMemory.milestones.push(newMilestone);
  gameMemory.updatedAt = new Date();

  return {
    milestone: newMilestone,
    celebrationMessage: getMilestoneCelebration(newMilestone),
    soundEffect: getMilestoneSoundEffect(newMilestone.type),
  };
}

function getMilestoneCelebration(milestone: GameMilestone): string {
  const celebrations: Record<string, string[]> = {
    first_game: [
      '🎉 Your first music game! Welcome to the party!',
      "🎵 First game down! You're officially one of us now!",
    ],
    first_perfect_round: [
      '✨ PERFECT ROUND! You nailed every single one!',
      '🌟 Flawless! That was a perfect round!',
    ],
    ten_games: [
      "🎮 10 games! You're becoming a regular! I'm learning your taste...",
      '🎯 Double digits! 10 games played. Your musical DNA is taking shape!',
    ],
    fifty_games: [
      "🏆 50 GAMES! You're a music game veteran! I know your taste better than Spotify now.",
      '👑 Fifty games! At this point, YOU should be quizzing ME!',
    ],
    fastest_guess: [
      `⚡ LIGHTNING FAST! ${milestone.context} That's your fastest guess EVER!`,
      `🚀 SPEED DEMON! ${milestone.context} New personal record!`,
    ],
    streak_five: ["🔥 FIVE IN A ROW! You're on fire!", '💫 5 streak! The hot hand is REAL!'],
    streak_ten: [
      '🔥🔥🔥 TEN IN A ROW!!! Are you some kind of music oracle?!',
      '💥 10 STREAK! UNSTOPPABLE! How do you DO that?!',
    ],
    high_score_beaten: ['🏅 NEW HIGH SCORE! You beat your personal best!'],
    genre_master: ["🎸 You've mastered this genre! I'm officially impressed."],
    decade_specialist: ['📅 You really know your decades! Expert status unlocked.'],
    music_savant: ['🎹 MUSIC SAVANT! Your musical knowledge is genuinely impressive.'],
  };

  const options = celebrations[milestone.type] || ['🎉 Achievement unlocked!'];
  return options[Math.floor(Math.random() * options.length)];
}

function getMilestoneSoundEffect(
  type: string
): 'fanfare' | 'sparkle' | 'applause' | 'record_scratch' {
  switch (type) {
    case 'fastest_guess':
    case 'streak_ten':
      return 'fanfare';
    case 'first_perfect_round':
    case 'high_score_beaten':
      return 'applause';
    case 'first_game':
      return 'sparkle';
    default:
      return 'sparkle';
  }
}

// ============================================================================
// MUSICAL PERSONALITY INSIGHTS
// ============================================================================

/**
 * Analyze game history to detect musical personality traits
 */
export function analyzeMusicalPersonality(gameMemory: GameMemory): PersonalityInsight[] {
  const insights: PersonalityInsight[] = [];
  const traits: MusicalPersonalityTrait[] = [];

  // Check for nostalgic trait (picks emotional songs in Desert Island)
  if (gameMemory.desertIslandPicks && gameMemory.desertIslandPicks.length > 0) {
    const emotionalKeywords = ['love', 'heart', 'dream', 'forever', 'miss', 'remember'];
    const emotionalCount = gameMemory.desertIslandPicks.filter((song) =>
      emotionalKeywords.some((kw) => song.toLowerCase().includes(kw))
    ).length;

    if (emotionalCount >= 2) {
      traits.push({
        trait: 'nostalgic',
        confidence: emotionalCount / gameMemory.desertIslandPicks.length,
        evidence: ['Desert Island picks tend toward emotional songs'],
        updatedAt: new Date(),
      });
    }
  }

  // Check for quick_ear vs thoughtful based on timing
  const timings = gameMemory.recentGuessTimings || [];
  if (timings.length >= 10) {
    const avgTime = timings.reduce((sum, t) => sum + t.guessTimeMs, 0) / timings.length;
    const accuracy = timings.filter((t) => t.correct).length / timings.length;

    if (avgTime < 5000 && accuracy > 0.6) {
      traits.push({
        trait: 'quick_ear',
        confidence: Math.min(1, (1 - avgTime / 10000) * accuracy),
        evidence: [
          `Average guess time: ${(avgTime / 1000).toFixed(1)}s with ${Math.round(accuracy * 100)}% accuracy`,
        ],
        updatedAt: new Date(),
      });
    } else if (avgTime > 8000 && accuracy > 0.8) {
      traits.push({
        trait: 'thoughtful',
        confidence: accuracy,
        evidence: [`Takes time but very accurate: ${Math.round(accuracy * 100)}%`],
        updatedAt: new Date(),
      });
    }
  }

  // Check for genre loyalty
  const genreAffinities = Object.values(gameMemory.genreAffinities || {});
  if (genreAffinities.length >= 3) {
    const topGenre = genreAffinities.sort((a, b) => b.affinityScore - a.affinityScore)[0];
    if (topGenre && topGenre.affinityScore > 70) {
      traits.push({
        trait: 'genre_loyal',
        confidence: topGenre.affinityScore / 100,
        evidence: [`Strong affinity for ${topGenre.category}`],
        updatedAt: new Date(),
      });
    }
  }

  // Check for eclectic taste
  const decadeAffinities = Object.values(gameMemory.decadeAffinities || {});
  if (genreAffinities.length >= 4 && decadeAffinities.length >= 3) {
    const allHaveDecentScore = [...genreAffinities, ...decadeAffinities].every(
      (a) => a.affinityScore >= 40
    );
    if (allHaveDecentScore) {
      traits.push({
        trait: 'eclectic',
        confidence: 0.8,
        evidence: ['Good performance across multiple genres and decades'],
        updatedAt: new Date(),
      });
    }
  }

  // Save traits to memory
  gameMemory.musicalPersonality = traits;
  gameMemory.updatedAt = new Date();

  // Generate insights from traits
  for (const trait of traits) {
    insights.push({
      insight: getTraitInsight(trait),
      confidence: trait.confidence,
      supportingTraits: [trait.trait],
    });
  }

  return insights;
}

function getTraitInsight(trait: MusicalPersonalityTrait): string {
  const insightMap: Record<string, string[]> = {
    nostalgic: [
      "You know, you always pick the emotional songs. You've got a sentimental streak - I like that about you.",
      "I notice you gravitate toward songs with meaning. Music is more than sound for you, isn't it?",
    ],
    quick_ear: [
      "You've got a lightning-fast ear! I bet you're the one who always names the song first at parties.",
      'Your recognition speed is impressive. Do you have musical training, or is this just natural talent?',
    ],
    thoughtful: [
      "You take your time, but you're almost always right. Quality over speed - that's a good philosophy.",
      'I notice you think before you answer. And it pays off - your accuracy is really high!',
    ],
    genre_loyal: [
      `You really know your favorite genres inside and out. That deep knowledge is showing!`,
      `I can tell which music speaks to you - your expertise in certain areas is clear.`,
    ],
    eclectic: [
      "Your musical taste is wonderfully diverse! You're equally comfortable across genres and eras.",
      "I love how you appreciate all kinds of music. That's increasingly rare!",
    ],
    decade_specialist: [
      'You really know your era! Were these your formative years, or do you just love the music?',
    ],
    adventurous: ["You're open to anything! I love that adventurous spirit with music."],
  };

  const options = insightMap[trait.trait] || ['You have interesting musical taste!'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Get a personality-based comment to share with user
 */
export function getPersonalityComment(gameMemory: GameMemory): string | null {
  const traits = gameMemory.musicalPersonality || [];
  if (traits.length === 0) return null;

  // Pick a random trait with decent confidence
  const strongTraits = traits.filter((t) => t.confidence >= 0.6);
  if (strongTraits.length === 0) return null;

  const trait = strongTraits[Math.floor(Math.random() * strongTraits.length)];
  return getTraitInsight(trait);
}

// ============================================================================
// CONVERSATION-TO-GAME CALLBACKS
// ============================================================================

/**
 * Store a conversation hint for later use in games
 */
export function storeConversationHint(
  gameMemory: GameMemory,
  topic: string,
  relatedArtists?: string[],
  relatedGenres?: string[]
): void {
  if (!gameMemory.conversationMusicHints) {
    gameMemory.conversationMusicHints = [];
  }

  gameMemory.conversationMusicHints.unshift({
    topic,
    relatedArtists,
    relatedGenres,
    mentionedAt: new Date(),
  });

  // Keep last 10
  if (gameMemory.conversationMusicHints.length > 10) {
    gameMemory.conversationMusicHints = gameMemory.conversationMusicHints.slice(0, 10);
  }

  gameMemory.updatedAt = new Date();

  log.debug({ topic, relatedArtists, relatedGenres }, '🧠 Stored conversation music hint');
}

/**
 * Get a conversation callback if we have a relevant recent topic
 */
export function getConversationCallback(gameMemory: GameMemory): string | null {
  const hints = gameMemory.conversationMusicHints || [];
  if (hints.length === 0) return null;

  // Check for recent hints (within last hour)
  const recentHints = hints.filter(
    (h) => Date.now() - new Date(h.mentionedAt).getTime() < 60 * 60 * 1000
  );
  if (recentHints.length === 0) return null;

  const hint = recentHints[0];

  const callbacks = [
    `Speaking of "${hint.topic}" that we talked about earlier...`,
    `This one might remind you of ${hint.topic}...`,
    `Since you mentioned ${hint.topic}, I thought of this song...`,
  ];

  return callbacks[Math.floor(Math.random() * callbacks.length)];
}

// ============================================================================
// SMART SONG SELECTION
// ============================================================================

/**
 * Get context for intelligent song selection
 */
export function getSongSelectionContext(gameMemory: GameMemory): SongSelectionContext {
  const topGenres = getTopAffinities(gameMemory, 'genre', 3);
  const weakGenres = getWeakAreas(gameMemory, 'genre', 3);
  const topDecades = getTopAffinities(gameMemory, 'decade', 3);
  const weakDecades = getWeakAreas(gameMemory, 'decade', 3);

  // Determine difficulty based on adaptive multiplier
  const multiplier = gameMemory.adaptiveDifficultyMultiplier || 1.0;
  let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  if (multiplier < 0.8) difficulty = 'easy';
  if (multiplier > 1.2) difficulty = 'hard';

  // Get conversation hints
  const hints = gameMemory.conversationMusicHints || [];
  const recentHints = hints
    .filter((h) => Date.now() - new Date(h.mentionedAt).getTime() < 60 * 60 * 1000)
    .map((h) => h.topic);

  return {
    strongGenres: topGenres.map((a) => a.category),
    weakGenres: weakGenres.map((a) => a.category),
    strongDecades: topDecades.map((a) => a.category),
    weakDecades: weakDecades.map((a) => a.category),
    conversationHints: recentHints,
    difficulty,
  };
}

/**
 * Get a message about the user's musical DNA
 */
export function getMusicalDNAMessage(gameMemory: GameMemory): string | null {
  const genreAffinities = Object.values(gameMemory.genreAffinities || {});
  const decadeAffinities = Object.values(gameMemory.decadeAffinities || {});

  if (genreAffinities.length < 2 && decadeAffinities.length < 2) {
    return null; // Not enough data yet
  }

  const messages: string[] = [];

  // Top genre insight
  const topGenre = genreAffinities.sort((a, b) => b.affinityScore - a.affinityScore)[0];
  if (topGenre && topGenre.affinityScore > 60) {
    messages.push(
      `Your ${topGenre.category} knowledge is incredible! ${Math.round(topGenre.successRate * 100)}% accuracy.`
    );
  }

  // Top decade insight
  const topDecade = decadeAffinities.sort((a, b) => b.affinityScore - a.affinityScore)[0];
  if (topDecade && topDecade.affinityScore > 60) {
    messages.push(
      `${topDecade.category} music? You guess those in an average of ${(topDecade.avgGuessTimeMs / 1000).toFixed(1)} seconds!`
    );
  }

  // Weak area challenge
  const weakGenre = genreAffinities.sort((a, b) => a.affinityScore - b.affinityScore)[0];
  if (weakGenre && weakGenre.affinityScore < 40 && weakGenre.totalAttempts >= 3) {
    messages.push(
      `${weakGenre.category} trips you up though - only ${Math.round(weakGenre.successRate * 100)}% there. Want to practice?`
    );
  }

  if (messages.length === 0) return null;

  return messages[Math.floor(Math.random() * messages.length)];
}

// All functions are exported inline with their declarations above
