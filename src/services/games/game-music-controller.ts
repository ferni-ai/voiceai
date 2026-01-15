/**
 * 🎮 Game Music Controller
 *
 * Orchestrates music and sound effects during games.
 * Part of the "More Than Human" music intelligence system (Phase 1.5).
 *
 * Features:
 * - Game-specific background music selection
 * - Sound effects for correct/wrong answers
 * - Dynamic intensity based on game progress
 * - Countdown timer sounds
 * - Streak celebration sounds
 * - Seamless integration with DJ Booth
 */

import { getDJController, getMusicPlayer } from '../../audio/index.js';

// Game music configuration (formerly from dj-enhancements)
interface GameMusicConfig {
  genres: string[];
  tempo: 'slow' | 'medium' | 'fast';
  intensity: number;
  useCountdown?: boolean;
}

function getGameMusicConfig(gameType: string): GameMusicConfig {
  const configs: Record<string, GameMusicConfig> = {
    'name-that-tune': { genres: ['pop', 'rock', 'classic'], tempo: 'medium', intensity: 0.7 },
    'trivia': { genres: ['electronic', 'upbeat'], tempo: 'medium', intensity: 0.6 },
    'word-games': { genres: ['lo-fi', 'chill'], tempo: 'slow', intensity: 0.4 },
    default: { genres: ['instrumental', 'ambient'], tempo: 'medium', intensity: 0.5 },
  };
  return configs[gameType] || configs.default;
}

function getGameMusicPhrase(event: string): string {
  const phrases: Record<string, string[]> = {
    gameStart: ['Game on!', "Let's play!", 'Here we go!'],
    gameEnd: ['Good game!', 'That was fun!', 'Nice playing!'],
    roundStart: ['Next round!', 'Ready?', "Here's the next one!"],
    correctAnswer: ['Nice!', 'Got it!', 'Correct!'],
    wrongAnswer: ['Not quite!', 'Good try!', 'Almost!'],
    streak: ['On fire!', "You're killing it!", 'Streak!'],
  };
  const eventPhrases = phrases[event] || [''];
  return eventPhrases[Math.floor(Math.random() * eventPhrases.length)];
}
import { getLogger } from '../../utils/safe-logger.js';
import { playGameTrack, searchSong, searchSongForMood, stopGameTrack } from './game-music.js';
import {
  playGameEndSound,
  playGameSound,
  playGameStartSound,
  playRoundStartSound,
} from './game-sounds.js';
import type { GameResult, GameType } from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface GameMusicState {
  gameType: GameType | null;
  isActive: boolean;
  currentStreak: number;
  highestStreak: number;
  roundsPlayed: number;
  correctAnswers: number;
  intensity: 'low' | 'medium' | 'high' | 'climax';
  backgroundMusicPlaying: boolean;
  lastSoundEffect: number;
}

export interface GameMusicEventResult {
  verbalResponse?: string;
  shouldSpeak: boolean;
  intensity: GameMusicState['intensity'];
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Cooldown between sound effects to prevent audio overload
const SOUND_EFFECT_COOLDOWN_MS = 500;

// Streak thresholds for intensity escalation
const STREAK_THRESHOLDS = {
  medium: 3,
  high: 5,
  climax: 8,
};

// Search queries for game background music by type
const GAME_BACKGROUND_SEARCHES: Record<string, string[]> = {
  'name-that-tune': ['quiz show music', 'game show theme', 'trivia music'],
  'one-word-song': ['upbeat pop background', 'party music instrumental', 'dance instrumental'],
  'desert-island-discs': ['acoustic chill', 'beach vibes instrumental', 'sunset lounge'],
  'this-or-that': ['fun upbeat', 'energetic pop', 'game music electronic'],
  'mood-dj-challenge': ['ambient electronic', 'chill beats', 'relaxing instrumental'],
};

// ============================================================================
// GAME MUSIC CONTROLLER
// ============================================================================

class GameMusicController {
  private state: GameMusicState;
  private config: GameMusicConfig | null = null;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): GameMusicState {
    return {
      gameType: null,
      isActive: false,
      currentStreak: 0,
      highestStreak: 0,
      roundsPlayed: 0,
      correctAnswers: 0,
      intensity: 'low',
      backgroundMusicPlaying: false,
      lastSoundEffect: 0,
    };
  }

  // ==========================================================================
  // PUBLIC INTERFACE
  // ==========================================================================

  /**
   * Called when a game starts
   * Sets up background music and plays start sound
   */
  async onGameStart(gameType: GameType): Promise<GameMusicEventResult> {
    log.info({ gameType }, '🎮🎵 Game music controller: Game started');

    // Reset state
    this.state = this.createInitialState();
    this.state.gameType = gameType;
    this.state.isActive = true;

    // Get config for this game type
    this.config = getGameMusicConfig(gameType);

    // Play game start sound
    const startVocal = await playGameStartSound();

    // Start background music (non-blocking)
    void this.startBackgroundMusic(gameType);

    // Get verbal phrase
    const phrase = getGameMusicPhrase('gameStart');

    return {
      verbalResponse: startVocal || phrase,
      shouldSpeak: true,
      intensity: 'low',
    };
  }

  /**
   * Called when a round starts
   * Plays round start sound if multi-round game
   */
  async onRoundStart(roundNumber: number): Promise<GameMusicEventResult> {
    this.state.roundsPlayed = roundNumber;

    // Only play sound for rounds after the first
    if (roundNumber > 1) {
      const roundVocal = await playRoundStartSound();
      return {
        verbalResponse: roundVocal,
        shouldSpeak: !!roundVocal,
        intensity: this.state.intensity,
      };
    }

    return {
      shouldSpeak: false,
      intensity: this.state.intensity,
    };
  }

  /**
   * Called when an answer is submitted
   * Handles correct/wrong sounds and streak tracking
   */
  async onAnswer(result: GameResult): Promise<GameMusicEventResult> {
    if (!this.state.isActive) {
      return { shouldSpeak: false, intensity: 'low' };
    }

    // Prevent sound effect spam
    const now = Date.now();
    if (now - this.state.lastSoundEffect < SOUND_EFFECT_COOLDOWN_MS) {
      return { shouldSpeak: false, intensity: this.state.intensity };
    }
    this.state.lastSoundEffect = now;

    let verbalResponse: string | undefined;

    if (result.correct) {
      // Track streak
      this.state.currentStreak++;
      this.state.correctAnswers++;
      if (this.state.currentStreak > this.state.highestStreak) {
        this.state.highestStreak = this.state.currentStreak;
      }

      // Update intensity based on streak
      this.updateIntensity();

      // Check for streak milestone sounds
      if (this.state.currentStreak === STREAK_THRESHOLDS.high) {
        // Special streak sound
        await playGameSound('highScore');
        verbalResponse = `🔥 ${this.state.currentStreak} in a row! You're on fire!`;
      } else if (this.state.currentStreak === STREAK_THRESHOLDS.climax) {
        // Epic streak sound
        await playGameSound('highScore');
        verbalResponse = `🚀 ${this.state.currentStreak} streak! Unstoppable!`;
      } else {
        // Normal correct sound
        const soundResult = await playGameSound('correct');
        verbalResponse = soundResult.verbalFallback || getGameMusicPhrase('correctAnswer');
      }
    } else {
      // Reset streak on wrong answer
      this.state.currentStreak = 0;
      this.updateIntensity();

      // Wrong answer sound
      const soundResult = await playGameSound('wrong');
      verbalResponse = soundResult.verbalFallback || getGameMusicPhrase('wrongAnswer');
    }

    return {
      verbalResponse,
      shouldSpeak: true,
      intensity: this.state.intensity,
    };
  }

  /**
   * Called when a game ends
   * Plays end sounds and stops background music
   */
  async onGameEnd(finalScore: number, isHighScore: boolean): Promise<GameMusicEventResult> {
    log.info(
      { gameType: this.state.gameType, finalScore, isHighScore, streak: this.state.highestStreak },
      '🎮🎵 Game music controller: Game ended'
    );

    // Stop background music
    if (this.state.backgroundMusicPlaying) {
      stopGameTrack();
      this.state.backgroundMusicPlaying = false;
    }

    // Play end sound
    const endVocal = await playGameEndSound(finalScore, isHighScore);

    // Get appropriate phrase
    let phrase: string;
    if (isHighScore) {
      phrase = getGameMusicPhrase('highScore');
    } else {
      phrase = getGameMusicPhrase('gameEnd');
    }

    // Reset state
    this.state.isActive = false;
    this.state.gameType = null;
    this.config = null;

    return {
      verbalResponse: endVocal || phrase,
      shouldSpeak: true,
      intensity: 'low',
    };
  }

  /**
   * Called when countdown timer is active
   * Plays tick sounds at appropriate intervals
   */
  async onCountdownTick(secondsRemaining: number): Promise<void> {
    if (!this.config?.useCountdown) return;

    // Only play ticks at critical moments
    if (secondsRemaining === 10 || secondsRemaining === 5 || secondsRemaining <= 3) {
      await playGameSound('tick');

      // Increase intensity as time runs out
      if (secondsRemaining <= 3) {
        this.state.intensity = 'climax';
      } else if (secondsRemaining <= 5) {
        this.state.intensity = 'high';
      }
    }
  }

  /**
   * Called when user starts speaking (making a guess)
   * Ducks the background music
   */
  onUserSpeaking(): void {
    if (this.state.backgroundMusicPlaying) {
      const player = getMusicPlayer();
      player.duck();
    }
  }

  /**
   * Called when user stops speaking
   * Restores background music
   */
  onUserStoppedSpeaking(): void {
    if (this.state.backgroundMusicPlaying) {
      const player = getMusicPlayer();
      player.unduck();
    }
  }

  /**
   * Get current game music state
   */
  getState(): GameMusicState {
    return { ...this.state };
  }

  /**
   * Check if controller is active
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Get current intensity level
   */
  getIntensity(): GameMusicState['intensity'] {
    return this.state.intensity;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Start background music appropriate for the game type
   */
  private async startBackgroundMusic(gameType: GameType): Promise<void> {
    try {
      // Get search queries for this game type
      const searches = GAME_BACKGROUND_SEARCHES[gameType] || ['upbeat instrumental'];
      const query = searches[Math.floor(Math.random() * searches.length)];

      // First, try mood-based search
      let result = await searchSongForMood(query);

      // Fall back to direct search if mood search fails
      if (!result.found || !result.track) {
        result = await searchSong(query);
      }

      if (result.found && result.track) {
        const success = await playGameTrack(result.track, false);
        if (success) {
          this.state.backgroundMusicPlaying = true;
          log.debug({ track: result.track.name, gameType }, '🎮🎵 Game background music started');
        }
      }
    } catch (error) {
      log.warn({ error, gameType }, '🎮🎵 Failed to start game background music');
      // Games continue without background music - not critical
    }
  }

  /**
   * Update intensity based on game state
   * 🎵 "FEEL ALIVE" FEATURE: Dynamic music intensity
   */
  private updateIntensity(): void {
    const streak = this.state.currentStreak;
    const previousIntensity = this.state.intensity;

    if (streak >= STREAK_THRESHOLDS.climax) {
      this.state.intensity = 'climax';
    } else if (streak >= STREAK_THRESHOLDS.high) {
      this.state.intensity = 'high';
    } else if (streak >= STREAK_THRESHOLDS.medium) {
      this.state.intensity = 'medium';
    } else {
      this.state.intensity = 'low';
    }

    // 🎵 DYNAMIC MUSIC: Adjust volume based on intensity
    // This makes the music feel alive and responsive to game performance
    if (previousIntensity !== this.state.intensity && this.state.backgroundMusicPlaying) {
      this.adjustMusicForIntensity(this.state.intensity);
    }

    // Notify DJ Booth of intensity change (for potential music adjustments)
    void this.notifyDJBooth();
  }

  /**
   * 🎵 "FEEL ALIVE" FEATURE: Adjust music volume/energy based on game intensity
   * Makes the music respond to how well the player is doing
   */
  private adjustMusicForIntensity(intensity: GameMusicState['intensity']): void {
    const player = getMusicPlayer();

    // Volume mapping based on intensity
    // Higher intensity = slightly louder, more presence
    const volumeMap: Record<GameMusicState['intensity'], number> = {
      low: 0.25, // Subtle background
      medium: 0.35, // Building engagement
      high: 0.45, // Exciting!
      climax: 0.55, // Peak excitement
    };

    const targetVolume = volumeMap[intensity];

    // Fade to new volume smoothly
    player.setVolume(targetVolume);

    log.debug(
      { intensity, targetVolume },
      '🎮🎵 Game music intensity adjusted - music responding to streak!'
    );
  }

  /**
   * Notify DJ Controller of game music state changes
   */
  private async notifyDJBooth(): Promise<void> {
    try {
      const djController = getDJController();
      // DJ Controller handles game state via commands
      // Games can duck music when active
      if (this.state.isActive) {
        djController.dispatch({ type: 'DUCK', reason: 'game' });
      }
    } catch {
      // DJ Controller may not be initialized - that's okay
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let controllerInstance: GameMusicController | null = null;

export function getGameMusicController(): GameMusicController {
  if (!controllerInstance) {
    controllerInstance = new GameMusicController();
  }
  return controllerInstance;
}

export function resetGameMusicController(): void {
  if (controllerInstance?.isActive()) {
    void controllerInstance.onGameEnd(0, false);
  }
  controllerInstance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check if game music is active
 */
export function isGameMusicActive(): boolean {
  return controllerInstance?.isActive() ?? false;
}

/**
 * Get current game music intensity
 */
export function getGameMusicIntensity(): GameMusicState['intensity'] {
  return controllerInstance?.getIntensity() ?? 'low';
}
