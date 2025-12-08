/**
 * 🎯 Game Insights Service
 *
 * Generates coaching-style insights from game memory.
 * Used by both the dashboard and the agent for conversational sharing.
 *
 * Philosophy: Insights should feel like they come from a coach who knows you,
 * not a spreadsheet of statistics.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  GameMemory,
  AffinityScore,
  GameMilestone,
  MusicalPersonalityTrait,
  GameSessionRecord,
} from '../../types/user-profile.js';
import { analyzeMusicalPersonality, getTopAffinities, getWeakAreas } from './game-intelligence.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/** Musical personality summary for display */
export interface PersonalitySummary {
  /** Primary trait label (e.g., "Nostalgic Quick-Ear") */
  label: string;
  /** Short description */
  description: string;
  /** Individual traits with explanations */
  traits: Array<{
    trait: string;
    displayName: string;
    confidence: number;
    explanation: string;
  }>;
  /** Coaching-style quote about their personality */
  coachingQuote: string;
}

/** Strength/growth area for display */
export interface AffinityDisplay {
  category: string;
  displayName: string;
  accuracy: number;
  avgTimeSeconds: number;
  affinityScore: number;
  /** Coaching framing */
  coachingNote: string;
}

/** Milestone for display */
export interface MilestoneDisplay {
  type: string;
  displayName: string;
  achievedAt: Date;
  icon: string;
  description: string;
  celebrated: boolean;
}

/** Memorable moment */
export interface MemorableMoment {
  type: 'fastest_guess' | 'best_streak' | 'high_score' | 'desert_island' | 'perfect_round';
  title: string;
  value: string;
  icon: string;
  coachingNote: string;
}

/** Journey statistics */
export interface JourneyStats {
  totalGames: number;
  totalRounds: number;
  totalMinutes: number;
  favoriteGame: string | null;
  favoriteGameDisplayName: string | null;
  gamesThisWeek: number;
  currentStreak: number;
  bestStreak: number;
  averageScore: number;
}

/** Persona play stats */
export interface PersonaPlayStats {
  personaId: string;
  displayName: string;
  gamesPlayed: number;
  lastPlayed: Date | null;
}

/** Complete insights package */
export interface MusicInsights {
  /** Has enough data to show insights? */
  hasData: boolean;
  /** Minimum games needed for full insights */
  gamesNeededForFullInsights: number;

  /** Musical personality analysis */
  personality: PersonalitySummary | null;

  /** Top strengths (genres/decades they excel at) */
  strengths: AffinityDisplay[];

  /** Growth areas (genres/decades to practice) */
  growthAreas: AffinityDisplay[];

  /** Achieved milestones */
  milestones: MilestoneDisplay[];

  /** Next milestone to achieve */
  nextMilestone: {
    type: string;
    displayName: string;
    description: string;
    progress: number; // 0-100
  } | null;

  /** Memorable moments */
  memorableMoments: MemorableMoment[];

  /** Journey statistics */
  journeyStats: JourneyStats;

  /** Per-persona stats */
  personaStats: PersonaPlayStats[];

  /** Overall coaching message */
  coachingMessage: string;

  /** Generated at */
  generatedAt: Date;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Generate complete insights from game memory
 */
export function generateMusicInsights(gameMemory: GameMemory | null | undefined): MusicInsights {
  const now = new Date();

  // Handle no data case
  if (!gameMemory || gameMemory.totalGamesPlayed === 0) {
    return {
      hasData: false,
      gamesNeededForFullInsights: 5,
      personality: null,
      strengths: [],
      growthAreas: [],
      milestones: [],
      nextMilestone: {
        type: 'first_game',
        displayName: 'First Game',
        description: 'Play your first music game to start building your musical profile!',
        progress: 0,
      },
      memorableMoments: [],
      journeyStats: {
        totalGames: 0,
        totalRounds: 0,
        totalMinutes: 0,
        favoriteGame: null,
        favoriteGameDisplayName: null,
        gamesThisWeek: 0,
        currentStreak: 0,
        bestStreak: 0,
        averageScore: 0,
      },
      personaStats: [],
      coachingMessage:
        "Let's play some music games! I'll learn your taste and share insights about your musical personality.",
      generatedAt: now,
    };
  }

  // Generate personality
  const personality = generatePersonalitySummary(gameMemory);

  // Get strengths and growth areas
  const strengths = generateAffinityDisplays(getTopAffinities(gameMemory, 'genre', 3), 'strength');
  const decadeStrengths = generateAffinityDisplays(
    getTopAffinities(gameMemory, 'decade', 2),
    'strength'
  );
  strengths.push(...decadeStrengths);

  const growthAreas = generateAffinityDisplays(getWeakAreas(gameMemory, 'genre', 2), 'growth');
  const decadeGrowth = generateAffinityDisplays(getWeakAreas(gameMemory, 'decade', 1), 'growth');
  growthAreas.push(...decadeGrowth);

  // Generate milestone displays
  const milestones = generateMilestoneDisplays(gameMemory.milestones || []);

  // Calculate next milestone
  const nextMilestone = calculateNextMilestone(gameMemory);

  // Generate memorable moments
  const memorableMoments = generateMemorableMoments(gameMemory);

  // Calculate journey stats
  const journeyStats = calculateJourneyStats(gameMemory);

  // Calculate persona stats
  const personaStats = calculatePersonaStats(gameMemory.recentGames || []);

  // Generate coaching message
  const coachingMessage = generateCoachingMessage(gameMemory, personality);

  return {
    hasData: true,
    gamesNeededForFullInsights: Math.max(0, 5 - gameMemory.totalGamesPlayed),
    personality,
    strengths: strengths.slice(0, 5), // Top 5 combined
    growthAreas: growthAreas.slice(0, 3), // Top 3
    milestones,
    nextMilestone,
    memorableMoments,
    journeyStats,
    personaStats,
    coachingMessage,
    generatedAt: now,
  };
}

// ============================================================================
// PERSONALITY GENERATION
// ============================================================================

function generatePersonalitySummary(gameMemory: GameMemory): PersonalitySummary | null {
  // Ensure we have personality analysis
  if (!gameMemory.musicalPersonality || gameMemory.musicalPersonality.length === 0) {
    // Try to analyze
    analyzeMusicalPersonality(gameMemory);
  }

  const traits = gameMemory.musicalPersonality || [];
  if (traits.length === 0 && gameMemory.totalGamesPlayed < 5) {
    return null; // Not enough data yet
  }

  // Build display traits
  const displayTraits = traits.map((t) => ({
    trait: t.trait,
    displayName: getTraitDisplayName(t.trait),
    confidence: t.confidence,
    explanation: getTraitExplanation(t.trait),
  }));

  // Generate label from top traits
  const topTraits = traits
    .filter((t) => t.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2);

  let label = 'Music Explorer';
  if (topTraits.length >= 2) {
    label = `${getTraitDisplayName(topTraits[0].trait)} ${getTraitDisplayName(topTraits[1].trait)}`;
  } else if (topTraits.length === 1) {
    label = getTraitDisplayName(topTraits[0].trait);
  }

  // Generate description
  const description = generatePersonalityDescription(traits);

  // Generate coaching quote
  const coachingQuote = generatePersonalityQuote(traits);

  return {
    label,
    description,
    traits: displayTraits,
    coachingQuote,
  };
}

function getTraitDisplayName(trait: string): string {
  const names: Record<string, string> = {
    nostalgic: 'Nostalgic Soul',
    eclectic: 'Eclectic Explorer',
    genre_loyal: 'Genre Expert',
    decade_specialist: 'Era Master',
    quick_ear: 'Quick Ear',
    thoughtful: 'Thoughtful Listener',
    adventurous: 'Music Adventurer',
    classic_lover: 'Classic Connoisseur',
    deep_cuts_fan: 'Deep Cuts Fan',
    lyric_focused: 'Lyric Lover',
    vibe_chaser: 'Vibe Chaser',
  };
  return names[trait] || 'Music Lover';
}

function getTraitExplanation(trait: string): string {
  const explanations: Record<string, string> = {
    nostalgic: 'You gravitate toward songs with emotional meaning and memories attached.',
    eclectic: 'Your taste spans across genres and eras - you appreciate all kinds of music.',
    genre_loyal: 'You have deep expertise in your favorite genres.',
    decade_specialist: 'You really know your era - the music of that time speaks to you.',
    quick_ear: 'You recognize songs fast - your musical memory is impressive.',
    thoughtful: "You take your time and think carefully - and you're usually right.",
    adventurous: "You're open to new sounds and willing to explore unfamiliar territory.",
    classic_lover: 'The timeless hits resonate with you.',
    deep_cuts_fan: 'You know the album tracks, not just the singles.',
    lyric_focused: 'The words matter to you as much as the melody.',
    vibe_chaser: 'You choose music by mood and feeling.',
  };
  return explanations[trait] || 'You have a unique musical perspective.';
}

function generatePersonalityDescription(traits: MusicalPersonalityTrait[]): string {
  if (traits.length === 0) {
    return 'Your musical personality is still emerging. Keep playing to discover more about yourself!';
  }

  const topTrait = traits.sort((a, b) => b.confidence - a.confidence)[0];
  const descriptions: Record<string, string> = {
    nostalgic: "Music is more than sound for you - it's memories, feelings, and moments in time.",
    eclectic: "You don't limit yourself to one sound. Every genre has something to offer.",
    genre_loyal: 'When you find music you love, you go deep. That expertise shows.',
    quick_ear: 'Your musical memory is a superpower. Songs stick with you.',
    thoughtful: "You don't rush. Quality over speed - and your accuracy proves it.",
  };

  return descriptions[topTrait.trait] || 'Your musical taste is uniquely yours.';
}

function generatePersonalityQuote(traits: MusicalPersonalityTrait[]): string {
  if (traits.length === 0) {
    return '"Everyone has a musical story. Let\'s discover yours."';
  }

  const quotes: string[] = [
    '"Music reveals who we are. And you? You\'re someone who really listens."',
    '"Your taste in music says a lot about you - and I like what it says."',
    '"The songs we love are the soundtrack of our lives."',
    '"You don\'t just hear music - you feel it."',
  ];

  // Add trait-specific quotes
  const topTrait = traits.sort((a, b) => b.confidence - a.confidence)[0];
  if (topTrait) {
    const traitQuotes: Record<string, string[]> = {
      nostalgic: ['"Music is your time machine. Every song takes you somewhere."'],
      quick_ear: ['"That fast recognition? It\'s because music lives in your bones."'],
      eclectic: ['"A curious ear is a gift. You\'re always discovering."'],
      thoughtful: ['"Taking your time is a sign of respect for the music."'],
    };
    if (traitQuotes[topTrait.trait]) {
      quotes.push(...traitQuotes[topTrait.trait]);
    }
  }

  return quotes[Math.floor(Math.random() * quotes.length)];
}

// ============================================================================
// AFFINITY DISPLAYS
// ============================================================================

function generateAffinityDisplays(
  affinities: AffinityScore[],
  type: 'strength' | 'growth'
): AffinityDisplay[] {
  return affinities.map((a) => ({
    category: a.category,
    displayName: formatCategoryName(a.category),
    accuracy: Math.round(a.successRate * 100),
    avgTimeSeconds: Math.round(a.avgGuessTimeMs / 100) / 10, // One decimal
    affinityScore: a.affinityScore,
    coachingNote: type === 'strength' ? getStrengthNote(a) : getGrowthNote(a),
  }));
}

function formatCategoryName(category: string): string {
  // Handle decades
  if (/^\d{4}s$/.test(category)) {
    return category; // "1980s" stays as is
  }
  // Capitalize genre names
  return category
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getStrengthNote(affinity: AffinityScore): string {
  if (affinity.successRate >= 0.9) {
    return `You're a ${formatCategoryName(affinity.category)} expert! ${Math.round(affinity.successRate * 100)}% accuracy.`;
  }
  if (affinity.avgGuessTimeMs < 4000) {
    return `Lightning fast on ${formatCategoryName(affinity.category)} - avg ${(affinity.avgGuessTimeMs / 1000).toFixed(1)}s!`;
  }
  return `Strong ${formatCategoryName(affinity.category)} knowledge - ${Math.round(affinity.successRate * 100)}% accuracy.`;
}

function getGrowthNote(affinity: AffinityScore): string {
  if (affinity.successRate < 0.4) {
    return `${formatCategoryName(affinity.category)} is tricky for you. Want to practice?`;
  }
  return `Room to grow in ${formatCategoryName(affinity.category)}. Practice makes perfect!`;
}

// ============================================================================
// MILESTONES
// ============================================================================

function generateMilestoneDisplays(milestones: GameMilestone[]): MilestoneDisplay[] {
  const displays: Record<string, { name: string; icon: string; desc: string }> = {
    first_game: { name: 'First Game', icon: '🎉', desc: 'Started your music game journey!' },
    first_perfect_round: { name: 'Perfect Round', icon: '✨', desc: 'Nailed every single guess!' },
    ten_games: { name: '10 Games', icon: '🎮', desc: 'A regular! 10 games played.' },
    fifty_games: { name: '50 Games', icon: '🏆', desc: 'Music game veteran!' },
    fastest_guess: { name: 'Speed Demon', icon: '⚡', desc: 'Fastest guess ever!' },
    high_score_beaten: { name: 'New High Score', icon: '🏅', desc: 'Beat your personal best!' },
    streak_five: { name: 'On Fire', icon: '🔥', desc: '5 correct in a row!' },
    streak_ten: { name: 'Unstoppable', icon: '🔥', desc: '10 correct in a row!' },
    genre_master: { name: 'Genre Master', icon: '🎸', desc: 'Mastered a genre!' },
    decade_specialist: { name: 'Era Expert', icon: '📅', desc: 'Decade specialist!' },
    music_savant: { name: 'Music Savant', icon: '🎹', desc: 'Exceptional musical knowledge!' },
  };

  return milestones
    .map((m) => {
      const display = displays[m.type] || { name: m.type, icon: '🎵', desc: '' };
      return {
        type: m.type,
        displayName: display.name,
        achievedAt: new Date(m.achievedAt),
        icon: display.icon,
        description: m.context || display.desc,
        celebrated: m.celebrated,
      };
    })
    .sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

function calculateNextMilestone(gameMemory: GameMemory): MusicInsights['nextMilestone'] {
  const achieved = new Set((gameMemory.milestones || []).map((m) => m.type));
  const totalGames = gameMemory.totalGamesPlayed || 0;
  const bestStreak = gameMemory.bestStreak || 0;

  // Check milestones in order of likelihood
  if (!achieved.has('first_game')) {
    return {
      type: 'first_game',
      displayName: 'First Game',
      description: 'Complete your first music game!',
      progress: 0,
    };
  }

  if (!achieved.has('streak_five') && bestStreak < 5) {
    return {
      type: 'streak_five',
      displayName: 'Hot Streak',
      description: 'Get 5 correct answers in a row',
      progress: Math.min(100, (bestStreak / 5) * 100),
    };
  }

  if (!achieved.has('ten_games') && totalGames < 10) {
    return {
      type: 'ten_games',
      displayName: '10 Games',
      description: 'Play 10 music games',
      progress: (totalGames / 10) * 100,
    };
  }

  if (!achieved.has('streak_ten') && bestStreak < 10) {
    return {
      type: 'streak_ten',
      displayName: 'Unstoppable',
      description: 'Get 10 correct answers in a row',
      progress: Math.min(100, (bestStreak / 10) * 100),
    };
  }

  if (!achieved.has('fifty_games') && totalGames < 50) {
    return {
      type: 'fifty_games',
      displayName: 'Veteran',
      description: 'Play 50 music games',
      progress: (totalGames / 50) * 100,
    };
  }

  return null; // All major milestones achieved!
}

// ============================================================================
// MEMORABLE MOMENTS
// ============================================================================

function generateMemorableMoments(gameMemory: GameMemory): MemorableMoment[] {
  const moments: MemorableMoment[] = [];

  // Fastest guess
  if (gameMemory.fastestGuessMs && gameMemory.fastestGuessSong) {
    moments.push({
      type: 'fastest_guess',
      title: 'Fastest Guess',
      value: `"${gameMemory.fastestGuessSong}" in ${(gameMemory.fastestGuessMs / 1000).toFixed(1)}s`,
      icon: '⚡',
      coachingNote: 'That song must really be in your DNA!',
    });
  }

  // Best streak
  if (gameMemory.bestStreak && gameMemory.bestStreak >= 3) {
    moments.push({
      type: 'best_streak',
      title: 'Best Streak',
      value: `${gameMemory.bestStreak} correct in a row`,
      icon: '🔥',
      coachingNote: gameMemory.bestStreak >= 7 ? 'Incredible focus!' : 'You were in the zone!',
    });
  }

  // Desert Island picks
  if (gameMemory.desertIslandPicks && gameMemory.desertIslandPicks.length > 0) {
    moments.push({
      type: 'desert_island',
      title: 'Desert Island Picks',
      value: gameMemory.desertIslandPicks.slice(0, 3).join(', '),
      icon: '🏝️',
      coachingNote: 'These songs say a lot about you.',
    });
  }

  // High score (from game stats)
  const stats = Object.values(gameMemory.gameStats || {});
  if (stats.length > 0) {
    const highestScore = Math.max(...stats.map((s) => s.highScore));
    if (highestScore > 0) {
      moments.push({
        type: 'high_score',
        title: 'Personal Best',
        value: `${highestScore} points`,
        icon: '🏆',
        coachingNote: 'Can you beat it?',
      });
    }
  }

  return moments;
}

// ============================================================================
// JOURNEY STATS
// ============================================================================

function calculateJourneyStats(gameMemory: GameMemory): JourneyStats {
  const stats = Object.entries(gameMemory.gameStats || {});
  const recentGames = gameMemory.recentGames || [];

  // Calculate totals
  const totalGames = gameMemory.totalGamesPlayed || 0;
  const totalRounds = recentGames.reduce((sum, g) => sum + g.roundsPlayed, 0);
  const totalSeconds = recentGames.reduce((sum, g) => sum + g.durationSeconds, 0);

  // Find favorite game
  let favoriteGame: string | null = null;
  let maxPlayed = 0;
  for (const [gameType, gameStats] of stats) {
    if (gameStats.gamesPlayed > maxPlayed) {
      maxPlayed = gameStats.gamesPlayed;
      favoriteGame = gameType;
    }
  }

  // Games this week
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const gamesThisWeek = recentGames.filter((g) => new Date(g.playedAt).getTime() > weekAgo).length;

  // Average score
  const avgScore =
    stats.length > 0
      ? Math.round(stats.reduce((sum, [, s]) => sum + s.averageScore, 0) / stats.length)
      : 0;

  return {
    totalGames,
    totalRounds,
    totalMinutes: Math.round(totalSeconds / 60),
    favoriteGame,
    favoriteGameDisplayName: favoriteGame ? formatGameName(favoriteGame) : null,
    gamesThisWeek,
    currentStreak: gameMemory.currentStreak || 0,
    bestStreak: gameMemory.bestStreak || 0,
    averageScore: avgScore,
  };
}

function formatGameName(gameType: string): string {
  const names: Record<string, string> = {
    'name-that-tune': 'Name That Tune',
    'one-word-song': 'One Word Song',
    'desert-island-discs': 'Desert Island Discs',
    'this-or-that': 'This or That',
    'mood-dj-challenge': 'Mood DJ Challenge',
  };
  return names[gameType] || gameType;
}

// ============================================================================
// PERSONA STATS
// ============================================================================

function calculatePersonaStats(recentGames: GameSessionRecord[]): PersonaPlayStats[] {
  const personaCounts: Record<string, { count: number; lastPlayed: Date | null }> = {};

  for (const game of recentGames) {
    if (!personaCounts[game.personaId]) {
      personaCounts[game.personaId] = { count: 0, lastPlayed: null };
    }
    personaCounts[game.personaId].count++;
    const playedAt = new Date(game.playedAt);
    if (
      !personaCounts[game.personaId].lastPlayed ||
      playedAt > personaCounts[game.personaId].lastPlayed!
    ) {
      personaCounts[game.personaId].lastPlayed = playedAt;
    }
  }

  const displayNames: Record<string, string> = {
    ferni: 'Ferni',
    'jack-b': 'Jack',
    'peter-john': 'Peter',
    'alex-chen': 'Alex',
    'maya-santos': 'Maya',
    'jordan-taylor': 'Jordan',
    'nayan-patel': 'Nayan',
  };

  return Object.entries(personaCounts)
    .map(([personaId, data]) => ({
      personaId,
      displayName: displayNames[personaId] || personaId,
      gamesPlayed: data.count,
      lastPlayed: data.lastPlayed,
    }))
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
}

// ============================================================================
// COACHING MESSAGE
// ============================================================================

function generateCoachingMessage(
  gameMemory: GameMemory,
  personality: PersonalitySummary | null
): string {
  const totalGames = gameMemory.totalGamesPlayed || 0;

  if (totalGames < 3) {
    return "We're just getting started! A few more games and I'll have real insights about your musical personality.";
  }

  if (totalGames < 10) {
    return "Your musical profile is taking shape. Keep playing - I'm learning what makes your ears perk up!";
  }

  // Personalized messages based on data
  const messages: string[] = [];

  if (personality && personality.traits.length > 0) {
    messages.push(`You're a ${personality.label}. ${personality.description}`);
  }

  if (gameMemory.bestStreak && gameMemory.bestStreak >= 5) {
    messages.push(
      `Your best streak of ${gameMemory.bestStreak} shows real musical knowledge. Impressive!`
    );
  }

  const topGenre = getTopAffinities(gameMemory, 'genre', 1)[0];
  if (topGenre && topGenre.affinityScore > 70) {
    messages.push(
      `You really know your ${formatCategoryName(topGenre.category)} - ${Math.round(topGenre.successRate * 100)}% accuracy!`
    );
  }

  if (messages.length === 0) {
    messages.push(
      "Music reveals who we are. And based on our games together, I like what I'm learning about you."
    );
  }

  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================================================
// CONVERSATIONAL INSIGHTS (for agent to share)
// ============================================================================

/**
 * Get a conversational insight for the agent to share
 * These are designed to feel natural in conversation
 */
export function getConversationalInsight(gameMemory: GameMemory | null | undefined): string | null {
  if (!gameMemory || gameMemory.totalGamesPlayed < 3) {
    return null;
  }

  const insights: string[] = [];

  // Streak insight
  if (gameMemory.bestStreak && gameMemory.bestStreak >= 5) {
    insights.push(
      `You know, you once got ${gameMemory.bestStreak} in a row. That's not luck - that's real musical knowledge.`
    );
  }

  // Speed insight
  if (gameMemory.fastestGuessMs && gameMemory.fastestGuessMs < 3000) {
    insights.push(
      `Remember when you guessed "${gameMemory.fastestGuessSong}" in ${(gameMemory.fastestGuessMs / 1000).toFixed(1)} seconds? That song must really be part of you.`
    );
  }

  // Genre insight
  const topGenre = getTopAffinities(gameMemory, 'genre', 1)[0];
  if (topGenre && topGenre.affinityScore > 60) {
    insights.push(
      `Your ${formatCategoryName(topGenre.category)} knowledge is impressive - ${Math.round(topGenre.successRate * 100)}% accuracy! Were those your formative years musically?`
    );
  }

  // Weak area (framed as opportunity)
  const weakArea = getWeakAreas(gameMemory, 'genre', 1)[0];
  if (weakArea && weakArea.successRate < 0.5 && weakArea.totalAttempts >= 3) {
    insights.push(
      `${formatCategoryName(weakArea.category)} seems to trip you up. Want me to help you explore that genre more?`
    );
  }

  // Desert Island callback
  if (gameMemory.desertIslandPicks && gameMemory.desertIslandPicks.length > 0) {
    const firstPick = gameMemory.desertIslandPicks[0];
    insights.push(
      `I still remember your Desert Island picks. "${firstPick}" was your number one - that choice says a lot about you.`
    );
  }

  // Personality insight
  const traits = gameMemory.musicalPersonality || [];
  if (traits.length > 0) {
    const topTrait = traits.sort((a, b) => b.confidence - a.confidence)[0];
    const traitInsights: Record<string, string> = {
      nostalgic: "You pick songs with meaning. Music is more than sound for you - it's memories.",
      quick_ear: "You've got a fast ear. Songs stick with you.",
      eclectic: "I love how diverse your taste is. You don't limit yourself.",
      thoughtful:
        "You take your time guessing - but you're almost always right. Quality over speed.",
    };
    if (traitInsights[topTrait.trait]) {
      insights.push(traitInsights[topTrait.trait]);
    }
  }

  if (insights.length === 0) return null;

  return insights[Math.floor(Math.random() * insights.length)];
}

/**
 * Get a game suggestion based on their history
 */
export function getGameSuggestion(gameMemory: GameMemory | null | undefined): string | null {
  if (!gameMemory) {
    return "Want to play a music game? I've got Name That Tune, Desert Island Discs, and more!";
  }

  const stats = gameMemory.gameStats || {};
  const allGames = [
    'name-that-tune',
    'one-word-song',
    'desert-island-discs',
    'this-or-that',
    'mood-dj-challenge',
  ];

  // Find unplayed games
  const unplayed = allGames.filter((g) => !stats[g]);
  if (unplayed.length > 0) {
    const suggestion = unplayed[Math.floor(Math.random() * unplayed.length)];
    return `We haven't tried ${formatGameName(suggestion)} yet! Want to give it a shot?`;
  }

  // Suggest based on favorite
  const favorite = gameMemory.favoriteGames?.[0];
  if (favorite) {
    const daysSince = stats[favorite]?.lastPlayed
      ? Math.floor(
          (Date.now() - new Date(stats[favorite].lastPlayed).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    if (daysSince > 3) {
      return `It's been ${daysSince} days since we played ${formatGameName(favorite)}. Want to go again?`;
    }
  }

  return 'Want to play a music game? I could use some fun!';
}
