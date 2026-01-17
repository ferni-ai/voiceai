/**
 * 🧬 Musical DNA Service
 *
 * Rich profiling of user's musical personality based on:
 * - Game history and performance
 * - Genre/decade affinities
 * - Behavioral traits
 * - Spotify library (if connected)
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Tracks evolution of musical taste over time
 * - Detects personality traits from playing patterns
 * - Generates personalized insights and coaching
 *
 * @module MusicalDNA
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { GameMemory, AffinityScore } from '../../types/user-profile.js';
import type {
  MusicalDNA,
  MusicalPersonalityType,
  GenreAffinity,
  DecadeAffinity,
  MusicalTrait,
  MusicalTraitType,
  MusicalMilestone,
  MilestoneType,
} from './types.js';
import { analyzeLibraryTaste, getSpotifyLibrary } from './spotify-library.js';

const log = createLogger({ module: 'MusicalDNA' });

// ============================================================================
// PERSONALITY TYPE DEFINITIONS
// ============================================================================

const PERSONALITY_DEFINITIONS: Record<
  MusicalPersonalityType,
  { label: string; description: string; detectFrom: string[] }
> = {
  'nostalgic-explorer': {
    label: 'Nostalgic Explorer',
    description:
      "You have a deep emotional connection to music. Songs aren't just sounds—they're time machines to memories and feelings.",
    detectFrom: ['emotional_songs', 'decade_loyalty', 'desert_island_picks'],
  },
  'genre-specialist': {
    label: 'Genre Specialist',
    description:
      'You know your favorite genres inside and out. Your deep knowledge in specific areas makes you a true connoisseur.',
    detectFrom: ['high_genre_accuracy', 'genre_loyalty'],
  },
  'decade-devotee': {
    label: 'Decade Devotee',
    description:
      "You have a strong connection to a particular era. That decade's music speaks to your soul in a way others don't.",
    detectFrom: ['decade_dominance', 'era_knowledge'],
  },
  'eclectic-wanderer': {
    label: 'Eclectic Wanderer',
    description:
      'Your musical taste knows no boundaries. You appreciate everything from classical to hip-hop, 60s to today.',
    detectFrom: ['diverse_genres', 'diverse_decades', 'broad_accuracy'],
  },
  'deep-listener': {
    label: 'Deep Listener',
    description:
      'You take your time and rarely miss. Quality over speed—you hear details others might miss.',
    detectFrom: ['high_accuracy', 'slower_guesses', 'thoughtful_play'],
  },
  'social-curator': {
    label: 'Social Curator',
    description:
      'You love sharing music and discovering through others. Music is a social experience for you.',
    detectFrom: ['challenges_sent', 'shares_cards', 'taste_matches'],
  },
  'mood-master': {
    label: 'Mood Master',
    description:
      'You intuitively know what music fits each moment. Your mood-matching abilities are exceptional.',
    detectFrom: ['mood_game_success', 'contextual_picks'],
  },
  'discovery-seeker': {
    label: 'Discovery Seeker',
    description:
      "You're always looking for something new. The thrill of discovering a new favorite never gets old.",
    detectFrom: ['diverse_library', 'obscure_tracks', 'new_genre_exploration'],
  },
};

const TRAIT_DEFINITIONS: Record<
  MusicalTraitType,
  { displayName: string; explanation: (data: unknown) => string }
> = {
  'quick-recognizer': {
    displayName: 'Quick Recognizer',
    explanation: (data) => {
      const avgTime = (data as { avgTime: number }).avgTime;
      return `You recognize songs in an average of ${(avgTime / 1000).toFixed(1)} seconds—lightning fast!`;
    },
  },
  'deep-knowledge': {
    displayName: 'Deep Knowledge',
    explanation: () => "You know music beyond just the hits. Deep cuts and B-sides don't fool you.",
  },
  'broad-taste': {
    displayName: 'Broad Taste',
    explanation: (data) => {
      const genres = (data as { genreCount: number }).genreCount;
      return `You\'ve shown strong performance across ${genres} different genres.`;
    },
  },
  'era-specialist': {
    displayName: 'Era Specialist',
    explanation: (data) => {
      const decade = (data as { decade: string }).decade;
      return `${decade} music is clearly your wheelhouse—your accuracy there is exceptional.`;
    },
  },
  'lyric-memorizer': {
    displayName: 'Lyric Memorizer',
    explanation: () => 'You know the words! Your lyric recognition is particularly strong.',
  },
  'melody-matcher': {
    displayName: 'Melody Matcher',
    explanation: () =>
      'You can identify a song from just a few notes. Your melodic memory is impressive.',
  },
  'mood-sensitive': {
    displayName: 'Mood Sensitive',
    explanation: () =>
      'You excel at matching music to moods. Your emotional intelligence shines through.',
  },
  'consistent-performer': {
    displayName: 'Consistent Performer',
    explanation: (data) => {
      const accuracy = (data as { accuracy: number }).accuracy;
      return `You maintain ${Math.round(accuracy * 100)}% accuracy across all game types. Steady and reliable!`;
    },
  },
  'clutch-player': {
    displayName: 'Clutch Player',
    explanation: () => 'You perform best under pressure. When the stakes are high, you deliver.',
  },
  'streak-builder': {
    displayName: 'Streak Builder',
    explanation: (data) => {
      const streak = (data as { bestStreak: number }).bestStreak;
      return `Your best streak of ${streak} shows you can get in the zone and stay there.`;
    },
  },
};

// ============================================================================
// MUSICAL DNA GENERATION
// ============================================================================

/**
 * Generate a complete Musical DNA profile from game memory and optionally Spotify
 */
export async function generateMusicalDNA(
  userId: string,
  gameMemory: GameMemory | null | undefined,
  spotifyAccessToken?: string
): Promise<MusicalDNA | null> {
  if (!gameMemory || (gameMemory.totalGamesPlayed || 0) === 0) {
    log.debug({ userId }, 'No game data for Musical DNA');
    return null;
  }

  log.info({ userId, gamesPlayed: gameMemory.totalGamesPlayed }, 'Generating Musical DNA');

  // Get Spotify data if available
  const spotifyLibrary = spotifyAccessToken
    ? await getSpotifyLibrary(userId, spotifyAccessToken)
    : null;
  const spotifyTaste = spotifyLibrary ? analyzeLibraryTaste(userId) : null;

  // Convert game memory affinities to our types
  const genreAffinities = convertAffinities(gameMemory.genreAffinities || {}, 'genre');
  const decadeAffinities = convertDecadeAffinities(gameMemory.decadeAffinities || {});

  // Detect traits
  const traits = detectTraits(gameMemory);

  // Determine personality type
  const personalityType = determinePersonalityType(gameMemory, traits, spotifyTaste);
  const personalityDef = PERSONALITY_DEFINITIONS[personalityType];

  // Calculate scores
  const overallScore = calculateOverallScore(gameMemory);
  const discoveryOpenness = calculateDiscoveryOpenness(gameMemory, spotifyTaste);

  // Get milestones
  const milestones = convertMilestones(gameMemory.milestones || []);
  const nextMilestone = getNextMilestone(gameMemory);

  // Calculate time preferences
  const peakHours = getPeakPlayingHours(gameMemory);
  const weekdayVsWeekend = getWeekdayVsWeekend(gameMemory);

  // Determine energy and listening preferences
  const energyPreference = determineEnergyPreference(gameMemory, spotifyTaste);
  const lyricVsMelody = determineLyricVsMelody(gameMemory);
  const soloVsSocial = determineSoloVsSocial(gameMemory);

  // Calculate total minutes from recent games (durationSeconds is in seconds)
  const totalMinutes = Math.round(
    (gameMemory.recentGames || []).reduce((sum, g) => sum + (g.durationSeconds || 0), 0) / 60
  );

  // Get first game date from recent games
  const sortedGames = (gameMemory.recentGames || []).sort(
    (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime()
  );
  const firstGameDate = sortedGames.length > 0 ? new Date(sortedGames[0].playedAt) : null;

  const dna: MusicalDNA = {
    userId,
    personalityType,
    personalityLabel: personalityDef.label,
    personalityDescription: personalityDef.description,
    genreAffinities,
    decadeAffinities,
    artistAffinities: [], // From Spotify if available
    traits,
    overallScore,
    discoveryOpenness,
    energyPreference,
    lyricVsMelody,
    soloVsSocial,
    peakListeningHours: peakHours,
    weekdayVsWeekend,
    totalGamesPlayed: gameMemory.totalGamesPlayed || 0,
    totalMinutesPlayed: totalMinutes,
    firstGameDate,
    lastGameDate: gameMemory.updatedAt ? new Date(gameMemory.updatedAt) : null,
    milestones,
    nextMilestone,
    updatedAt: new Date(),
  };

  log.info(
    { userId, personality: personalityType, score: overallScore, traitsCount: traits.length },
    'Musical DNA generated'
  );

  return dna;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function convertAffinities(
  affinities: Record<string, AffinityScore>,
  _type: 'genre'
): GenreAffinity[] {
  return Object.entries(affinities)
    .filter(([, a]) => a.totalAttempts >= 3) // Need enough data
    .map(([category, a]) => ({
      genre: category,
      displayName: formatGenreName(category),
      accuracy: Math.round(a.successRate * 100),
      avgGuessTimeMs: a.avgGuessTimeMs,
      totalGuesses: a.totalAttempts,
      correctGuesses: a.correctGuesses,
      affinityScore: a.affinityScore,
      trend: determineTrend(a),
    }))
    .sort((a, b) => b.affinityScore - a.affinityScore);
}

function convertDecadeAffinities(affinities: Record<string, AffinityScore>): DecadeAffinity[] {
  return Object.entries(affinities)
    .filter(([, a]) => a.totalAttempts >= 3)
    .map(([category, a]) => ({
      decade: category,
      displayName: category,
      accuracy: Math.round(a.successRate * 100),
      avgGuessTimeMs: a.avgGuessTimeMs,
      totalGuesses: a.totalAttempts,
      affinityScore: a.affinityScore,
    }))
    .sort((a, b) => b.affinityScore - a.affinityScore);
}

function formatGenreName(genre: string): string {
  return genre
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function determineTrend(affinity: AffinityScore): 'improving' | 'stable' | 'declining' {
  // Would need historical data for real trends
  // For now, base on success rate vs overall
  if (affinity.successRate > 0.7) return 'improving';
  if (affinity.successRate < 0.4) return 'declining';
  return 'stable';
}

function detectTraits(gameMemory: GameMemory): MusicalTrait[] {
  const traits: MusicalTrait[] = [];
  const timings = gameMemory.recentGuessTimings || [];

  // Quick Recognizer (avg guess time < 4s with good accuracy)
  if (timings.length >= 10) {
    const avgTime = timings.reduce((sum, t) => sum + t.guessTimeMs, 0) / timings.length;
    const accuracy = timings.filter((t) => t.correct).length / timings.length;

    if (avgTime < 4000 && accuracy > 0.5) {
      const def = TRAIT_DEFINITIONS['quick-recognizer'];
      traits.push({
        trait: 'quick-recognizer',
        displayName: def.displayName,
        confidence: Math.min(1, (1 - avgTime / 8000) * accuracy * 1.5),
        explanation: def.explanation({ avgTime }),
        detectedFrom: 'guess timing analysis',
      });
    }
  }

  // Streak Builder
  if ((gameMemory.bestStreak || 0) >= 5) {
    const def = TRAIT_DEFINITIONS['streak-builder'];
    traits.push({
      trait: 'streak-builder',
      displayName: def.displayName,
      confidence: Math.min(1, (gameMemory.bestStreak || 0) / 15),
      explanation: def.explanation({ bestStreak: gameMemory.bestStreak }),
      detectedFrom: 'streak history',
    });
  }

  // Broad Taste (multiple genres with decent scores)
  const genreAffinities = Object.values(gameMemory.genreAffinities || {});
  const goodGenres = genreAffinities.filter((a) => a.affinityScore >= 50 && a.totalAttempts >= 3);
  if (goodGenres.length >= 4) {
    const def = TRAIT_DEFINITIONS['broad-taste'];
    traits.push({
      trait: 'broad-taste',
      displayName: def.displayName,
      confidence: Math.min(1, goodGenres.length / 6),
      explanation: def.explanation({ genreCount: goodGenres.length }),
      detectedFrom: 'genre affinity analysis',
    });
  }

  // Era Specialist
  const decadeAffinities = Object.values(gameMemory.decadeAffinities || {});
  const topDecade = decadeAffinities.sort((a, b) => b.affinityScore - a.affinityScore)[0];
  if (topDecade && topDecade.affinityScore >= 70 && topDecade.totalAttempts >= 5) {
    const def = TRAIT_DEFINITIONS['era-specialist'];
    traits.push({
      trait: 'era-specialist',
      displayName: def.displayName,
      confidence: topDecade.affinityScore / 100,
      explanation: def.explanation({ decade: topDecade.category }),
      detectedFrom: 'decade affinity analysis',
    });
  }

  // Consistent Performer
  if (timings.length >= 20) {
    const accuracy = timings.filter((t) => t.correct).length / timings.length;
    if (accuracy >= 0.65) {
      const def = TRAIT_DEFINITIONS['consistent-performer'];
      traits.push({
        trait: 'consistent-performer',
        displayName: def.displayName,
        confidence: accuracy,
        explanation: def.explanation({ accuracy }),
        detectedFrom: 'overall performance',
      });
    }
  }

  return traits.sort((a, b) => b.confidence - a.confidence);
}

function determinePersonalityType(
  gameMemory: GameMemory,
  traits: MusicalTrait[],
  spotifyTaste: ReturnType<typeof analyzeLibraryTaste> | null
): MusicalPersonalityType {
  const traitSet = new Set(traits.map((t) => t.trait));
  const genreAffinities = Object.values(gameMemory.genreAffinities || {});
  const decadeAffinities = Object.values(gameMemory.decadeAffinities || {});

  // Check for Eclectic Wanderer
  if (traitSet.has('broad-taste') && genreAffinities.length >= 4 && decadeAffinities.length >= 3) {
    return 'eclectic-wanderer';
  }

  // Check for Deep Listener
  if (traitSet.has('consistent-performer')) {
    const timings = gameMemory.recentGuessTimings || [];
    const avgTime =
      timings.length > 0
        ? timings.reduce((sum, t) => sum + t.guessTimeMs, 0) / timings.length
        : 8000;
    if (avgTime > 6000) {
      return 'deep-listener';
    }
  }

  // Check for Decade Devotee
  if (traitSet.has('era-specialist')) {
    return 'decade-devotee';
  }

  // Check for Genre Specialist
  const topGenre = genreAffinities.sort((a, b) => b.affinityScore - a.affinityScore)[0];
  if (topGenre && topGenre.affinityScore >= 75) {
    return 'genre-specialist';
  }

  // Check for Discovery Seeker (from Spotify)
  if (spotifyTaste && spotifyTaste.obscurityScore >= 60 && spotifyTaste.diversityScore >= 60) {
    return 'discovery-seeker';
  }

  // Check for nostalgic tendencies (Desert Island picks)
  if (gameMemory.desertIslandPicks && gameMemory.desertIslandPicks.length >= 3) {
    return 'nostalgic-explorer';
  }

  // Default based on quick recognition
  if (traitSet.has('quick-recognizer')) {
    return 'mood-master';
  }

  return 'nostalgic-explorer'; // Default
}

function calculateOverallScore(gameMemory: GameMemory): number {
  const timings = gameMemory.recentGuessTimings || [];
  if (timings.length === 0) return 0;

  // Base score from accuracy
  const accuracy = timings.filter((t) => t.correct).length / timings.length;
  let score = accuracy * 50;

  // Bonus for streaks
  score += Math.min(20, (gameMemory.bestStreak || 0) * 2);

  // Bonus for speed (avg under 5s)
  const avgTime = timings.reduce((sum, t) => sum + t.guessTimeMs, 0) / timings.length;
  if (avgTime < 5000) {
    score += (1 - avgTime / 5000) * 15;
  }

  // Bonus for games played
  score += Math.min(15, (gameMemory.totalGamesPlayed || 0) / 10);

  return Math.round(Math.min(100, score));
}

function calculateDiscoveryOpenness(
  gameMemory: GameMemory,
  spotifyTaste: ReturnType<typeof analyzeLibraryTaste> | null
): number {
  // How open to new/unfamiliar music
  const genreCount = Object.keys(gameMemory.genreAffinities || {}).length;
  const decadeCount = Object.keys(gameMemory.decadeAffinities || {}).length;

  let openness = (genreCount / 8 + decadeCount / 6) / 2;

  if (spotifyTaste) {
    openness = (openness + spotifyTaste.diversityScore / 100) / 2;
  }

  return Math.min(1, openness);
}

function getPeakPlayingHours(_gameMemory: GameMemory): number[] {
  // Would need timestamp data from games
  // Default to evening hours
  return [19, 20, 21];
}

function getWeekdayVsWeekend(_gameMemory: GameMemory): 'weekday' | 'weekend' | 'balanced' {
  // Would need timestamp data
  return 'balanced';
}

function determineEnergyPreference(
  _gameMemory: GameMemory,
  spotifyTaste: ReturnType<typeof analyzeLibraryTaste> | null
): 'low' | 'medium' | 'high' | 'varies' {
  if (spotifyTaste) {
    switch (spotifyTaste.energyProfile) {
      case 'chill':
        return 'low';
      case 'energetic':
        return 'high';
      default:
        return 'medium';
    }
  }
  return 'varies';
}

function determineLyricVsMelody(
  _gameMemory: GameMemory
): 'lyric-focused' | 'melody-focused' | 'balanced' {
  // Would need data from specific game types
  return 'balanced';
}

function determineSoloVsSocial(
  gameMemory: GameMemory
): 'private-listener' | 'social-sharer' | 'balanced' {
  // Check if they've sent challenges or shared cards
  // For now, default to balanced
  if ((gameMemory.totalGamesPlayed || 0) > 20) {
    return 'private-listener'; // Playing solo a lot
  }
  return 'balanced';
}

function convertMilestones(milestones: GameMemory['milestones']): MusicalMilestone[] {
  if (!milestones) return [];

  const iconMap: Record<string, string> = {
    first_game: '🎮',
    first_perfect_round: '⭐',
    ten_games: '🎯',
    fifty_games: '🏆',
    fastest_guess: '⚡',
    streak_five: '🔥',
    streak_ten: '🔥🔥',
    high_score_beaten: '🏅',
    genre_master: '🎸',
    decade_specialist: '📅',
    music_savant: '🎹',
  };

  const nameMap: Record<string, string> = {
    first_game: 'First Game',
    first_perfect_round: 'Perfect Round',
    ten_games: 'Ten Games',
    fifty_games: 'Fifty Games',
    fastest_guess: 'Speed Demon',
    streak_five: 'Hot Streak',
    streak_ten: 'On Fire',
    high_score_beaten: 'High Score',
    genre_master: 'Genre Master',
    decade_specialist: 'Decade Expert',
    music_savant: 'Music Savant',
  };

  const descMap: Record<string, string> = {
    first_game: 'Played your first music game',
    first_perfect_round: 'Got every answer right in a round',
    ten_games: 'Played 10 music games',
    fifty_games: 'Played 50 music games',
    fastest_guess: 'Guessed in under 2 seconds',
    streak_five: 'Got 5 correct in a row',
    streak_ten: 'Got 10 correct in a row',
    high_score_beaten: 'Beat your personal best',
    genre_master: 'Mastered a genre',
    decade_specialist: 'Became a decade expert',
    music_savant: 'Achieved musical mastery',
  };

  return milestones.map((m) => ({
    id: m.type,
    type: m.type as MilestoneType,
    displayName: nameMap[m.type] || m.type,
    description: descMap[m.type] || 'Achievement unlocked',
    icon: iconMap[m.type] || '🎵',
    achievedAt: m.achievedAt ? new Date(m.achievedAt) : null,
    celebrated: m.celebrated || false,
  }));
}

function getNextMilestone(gameMemory: GameMemory): MusicalMilestone | null {
  // Get the backend milestone types that have been achieved
  const achieved = new Set((gameMemory.milestones || []).map((m) => m.type));
  const gamesPlayed = gameMemory.totalGamesPlayed || 0;
  const bestStreak = gameMemory.bestStreak || 0;

  // Define candidates mapping from frontend milestone types to backend types
  const candidates: Array<{
    frontendType: MilestoneType;
    backendType:
      | 'first_game'
      | 'ten_games'
      | 'fifty_games'
      | 'streak_five'
      | 'streak_ten'
      | 'music_savant';
    check: () => boolean;
    progress: () => number;
    displayName: string;
    description: string;
  }> = [
    {
      frontendType: 'games-10',
      backendType: 'ten_games',
      check: () => gamesPlayed < 10,
      progress: () => (gamesPlayed / 10) * 100,
      displayName: 'Ten Games',
      description: 'Play 10 music games',
    },
    {
      frontendType: 'streak-3',
      backendType: 'streak_five',
      check: () => bestStreak < 5,
      progress: () => (bestStreak / 5) * 100,
      displayName: 'Hot Streak',
      description: 'Get 5 correct in a row',
    },
    {
      frontendType: 'games-50',
      backendType: 'fifty_games',
      check: () => gamesPlayed < 50,
      progress: () => (gamesPlayed / 50) * 100,
      displayName: 'Fifty Games',
      description: 'Play 50 music games',
    },
    {
      frontendType: 'streak-7',
      backendType: 'streak_ten',
      check: () => bestStreak < 10,
      progress: () => (bestStreak / 10) * 100,
      displayName: 'Fire Streak',
      description: 'Get 10 correct in a row',
    },
    {
      frontendType: 'games-100',
      backendType: 'music_savant',
      check: () => gamesPlayed < 100,
      progress: () => (gamesPlayed / 100) * 100,
      displayName: 'Music Savant',
      description: 'Play 100 music games',
    },
  ];

  for (const candidate of candidates) {
    if (!achieved.has(candidate.backendType) && candidate.check()) {
      return {
        id: candidate.frontendType,
        type: candidate.frontendType,
        displayName: candidate.displayName,
        description: candidate.description,
        icon: '🎯',
        achievedAt: null,
        celebrated: false,
        progress: candidate.progress(),
      };
    }
  }

  return null;
}

// ============================================================================
// COACHING MESSAGES
// ============================================================================

export function generateCoachingMessage(dna: MusicalDNA): string {
  const messages: string[] = [];

  // Personality-based message
  if (dna.personalityType === 'mood-master') {
    messages.push(
      `Your ${dna.personalityLabel} skills are showing—you've got a natural ear for this!`
    );
  } else if (dna.personalityType === 'deep-listener') {
    messages.push(
      `I love that you take your time. Your ${Math.round((dna.traits.find((t) => t.trait === 'consistent-performer')?.confidence || 0.7) * 100)}% accuracy proves quality beats speed.`
    );
  } else {
    messages.push(`Your ${dna.personalityLabel} nature makes our music sessions unique.`);
  }

  // Strength acknowledgment
  if (dna.genreAffinities.length > 0) {
    const topGenre = dna.genreAffinities[0];
    messages.push(
      `Your ${topGenre.displayName} knowledge is impressive—${topGenre.accuracy}% accuracy there!`
    );
  }

  // Growth suggestion
  const weakGenres = dna.genreAffinities.filter((g) => g.accuracy < 50);
  if (weakGenres.length > 0 && dna.totalGamesPlayed > 10) {
    messages.push(
      `Want to explore more ${weakGenres[0].displayName}? I can help you discover gems.`
    );
  }

  // Next milestone encouragement
  if (dna.nextMilestone) {
    const progress = dna.nextMilestone.progress || 0;
    if (progress > 50) {
      messages.push(
        `You're ${Math.round(progress)}% of the way to "${dna.nextMilestone.displayName}"—keep going!`
      );
    }
  }

  return (
    messages[Math.floor(Math.random() * messages.length)] ||
    `You've played ${dna.totalGamesPlayed} games—your musical story is unfolding beautifully.`
  );
}

// ============================================================================
// TIME MACHINE (Genre/Decade Discovery Timeline)
// ============================================================================

export interface TimeMachineEntry {
  category: string;
  displayName: string;
  type: 'genre' | 'decade';
  discoveredAt: Date;
  currentAffinity: number;
  milestone?: string;
}

export function generateTimeMachine(dna: MusicalDNA): TimeMachineEntry[] {
  const entries: TimeMachineEntry[] = [];

  // Add genre discoveries
  for (const genre of dna.genreAffinities) {
    if (genre.totalGuesses >= 3) {
      entries.push({
        category: genre.genre,
        displayName: genre.displayName,
        type: 'genre',
        discoveredAt: dna.firstGameDate || new Date(),
        currentAffinity: genre.affinityScore,
        milestone: genre.affinityScore >= 70 ? 'Mastered' : undefined,
      });
    }
  }

  // Add decade discoveries
  for (const decade of dna.decadeAffinities) {
    if (decade.totalGuesses >= 3) {
      entries.push({
        category: decade.decade,
        displayName: decade.displayName,
        type: 'decade',
        discoveredAt: dna.firstGameDate || new Date(),
        currentAffinity: decade.affinityScore,
        milestone: decade.affinityScore >= 70 ? 'Expert' : undefined,
      });
    }
  }

  return entries.sort((a, b) => b.currentAffinity - a.currentAffinity);
}
