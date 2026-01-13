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
import type { GameMemory, AffinityScore, GameMilestone } from '../../types/user-profile.js';
import type { GameType, GameResult } from './types.js';
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
/**
 * Record a guess timing and update affinities
 */
export declare function recordGuess(gameMemory: GameMemory, item: string, guessTimeMs: number, correct: boolean, genre?: string, decade?: string): GameMemory;
/**
 * Get top affinities (strongest areas)
 */
export declare function getTopAffinities(gameMemory: GameMemory, type: 'genre' | 'decade', limit?: number): AffinityScore[];
/**
 * Get weak areas (for challenge mode or learning)
 */
export declare function getWeakAreas(gameMemory: GameMemory, type: 'genre' | 'decade', limit?: number): AffinityScore[];
/**
 * Analyze recent performance and recommend difficulty adjustment
 */
export declare function analyzeDifficulty(gameMemory: GameMemory, recentResults: GameResult[], currentRound: number): DifficultyRecommendation;
/**
 * Check for new milestones after a game action
 */
export declare function checkMilestones(gameMemory: GameMemory, gameType: GameType, result?: GameResult, guessTimeMs?: number): MilestoneEvent | null;
/**
 * Analyze game history to detect musical personality traits
 */
export declare function analyzeMusicalPersonality(gameMemory: GameMemory): PersonalityInsight[];
/**
 * Get a personality-based comment to share with user
 */
export declare function getPersonalityComment(gameMemory: GameMemory): string | null;
/**
 * Store a conversation hint for later use in games
 */
export declare function storeConversationHint(gameMemory: GameMemory, topic: string, relatedArtists?: string[], relatedGenres?: string[]): void;
/**
 * Get a conversation callback if we have a relevant recent topic
 */
export declare function getConversationCallback(gameMemory: GameMemory): string | null;
/**
 * Get context for intelligent song selection
 */
export declare function getSongSelectionContext(gameMemory: GameMemory): SongSelectionContext;
/**
 * Get a message about the user's musical DNA
 */
export declare function getMusicalDNAMessage(gameMemory: GameMemory): string | null;
//# sourceMappingURL=game-intelligence.d.ts.map