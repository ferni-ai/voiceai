/**
 * 🎵 Session Sound Effects
 *
 * Audio stingers for session lifecycle events:
 * - Session start (welcoming warmth)
 * - Session end (satisfying closure)
 * - Thinking moments (subtle processing indicator)
 * - Success celebrations
 * - Game sounds
 *
 * These are designed to be:
 * - Short (under 2 seconds)
 * - Warm and human (not robotic beeps)
 * - Consistent with Ferni's earthy aesthetic
 *
 * 🔊 NOTE: Uses dedicated SoundEffectsPlayer (NOT MusicPlayer!)
 * This ensures sound effects don't trigger "music ended" announcements
 * or any other DJ/music callbacks.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getSoundEffectsPlayer } from './sound-effects-player.js';

const log = getLogger();

// ============================================================================
// SOUND TYPES
// ============================================================================

export type SessionSoundType =
  | 'session-start' // Warm welcome chime
  | 'session-end' // Satisfying outro
  | 'thinking-start' // Subtle processing start
  | 'thinking-end' // Processing complete
  | 'success' // Celebration/achievement
  | 'correct' // Game correct answer
  | 'wrong' // Game wrong answer
  | 'hint' // Game hint given
  | 'game-start' // Game beginning
  | 'game-end' // Game complete
  | 'high-score' // New high score!
  | 'handoff' // Generic handoff sound
  | 'notification' // Attention getter
  | 'milestone-fanfare' // Big achievement unlocked
  | 'milestone-sparkle' // Small achievement
  | 'milestone-applause' // Recognition moment
  | 'streak-fire'; // You're on fire!

// ============================================================================
// SOUND URLs - Using design system assets
// ============================================================================

/**
 * Sound file paths - relative to public root
 * These are located in frontend-typescript/public/sounds/
 */
const SOUND_PATHS: Record<SessionSoundType, string> = {
  'session-start': '/sounds/connect.mp3',
  'session-end': '/sounds/disconnect.mp3',
  'thinking-start': '/sounds/connect.mp3', // Reuse soft version
  'thinking-end': '/sounds/connect.mp3',
  success: '/sounds/dramatic-entrance.mp3',
  correct: '/sounds/correct.mp3',
  wrong: '/sounds/wrong.mp3',
  hint: '/sounds/hint.mp3',
  'game-start': '/sounds/game-start.mp3',
  'game-end': '/sounds/game-end.mp3',
  'high-score': '/sounds/high-score.mp3',
  handoff: '/sounds/connect.mp3',
  notification: '/sounds/connect.mp3',
  'milestone-fanfare': '/sounds/dramatic-entrance.mp3', // Reuse for now
  'milestone-sparkle': '/sounds/connect.mp3',
  'milestone-applause': '/sounds/high-score.mp3',
  'streak-fire': '/sounds/correct.mp3',
};

/**
 * Fallback sounds if primary isn't available
 */
const SOUND_FALLBACKS: Partial<Record<SessionSoundType, SessionSoundType>> = {
  correct: 'success',
  wrong: 'notification',
  hint: 'notification',
  'game-start': 'session-start',
  'game-end': 'session-end',
  'high-score': 'success',
  'thinking-start': 'notification',
  'thinking-end': 'notification',
  'milestone-fanfare': 'high-score',
  'milestone-sparkle': 'success',
  'milestone-applause': 'high-score',
  'streak-fire': 'correct',
};

/**
 * Volume multipliers per sound type
 */
const SOUND_VOLUMES: Record<SessionSoundType, number> = {
  'session-start': 0.5,
  'session-end': 0.4,
  'thinking-start': 0.2,
  'thinking-end': 0.2,
  success: 0.6,
  correct: 0.5,
  wrong: 0.3,
  hint: 0.3,
  'game-start': 0.5,
  'game-end': 0.5,
  'high-score': 0.6,
  handoff: 0.5,
  notification: 0.3,
  'milestone-fanfare': 0.7, // Big celebration!
  'milestone-sparkle': 0.4,
  'milestone-applause': 0.6,
  'streak-fire': 0.5,
};

// ============================================================================
// VERBAL SOUND EFFECTS (TTS Fallbacks)
// ============================================================================

/**
 * SSML verbal fallbacks when audio files aren't available
 * These are spoken by TTS and still feel like "sounds"
 */
export const VERBAL_SOUNDS: Record<SessionSoundType, string[]> = {
  'session-start': [
    '<break time="200ms"/>',
    '<break time="300ms"/><prosody pitch="+5%">Hey!</prosody><break time="100ms"/>',
  ],
  'session-end': ['<break time="200ms"/>', '<break time="300ms"/>'],
  'thinking-start': [
    '<break time="150ms"/><prosody rate="slow">Hmm</prosody><break time="200ms"/>',
    '<break time="100ms"/>Let me think<break time="200ms"/>',
  ],
  'thinking-end': ['<break time="100ms"/>'],
  success: [
    '<break time="100ms"/><prosody rate="fast">Yes!</prosody><break time="100ms"/>',
    '<break time="100ms"/><emphasis level="strong">Nice!</emphasis><break time="100ms"/>',
  ],
  correct: [
    '<break time="100ms"/><prosody rate="fast">Ding ding ding!</prosody>',
    '<break time="100ms"/><prosody pitch="+20%">Yes!</prosody>',
    '<break time="100ms"/><emphasis level="strong">Boom!</emphasis>',
    '<break time="100ms"/>Nailed it!',
  ],
  wrong: [
    '<break time="150ms"/><prosody pitch="-10%">Ohhh</prosody><break time="100ms"/>',
    '<break time="150ms"/>Hmm, not quite.',
    '<break time="150ms"/><prosody rate="slow">Nope.</prosody>',
  ],
  hint: [
    '<break time="100ms"/>Okay, here\'s a hint...<break time="150ms"/>',
    '<break time="100ms"/>Alright, let me help you out...<break time="150ms"/>',
  ],
  'game-start': [
    '<break time="200ms"/><prosody rate="fast">Let\'s go!</prosody><break time="200ms"/>',
    '<break time="200ms"/>Ready? Here we go!<break time="200ms"/>',
  ],
  'game-end': [
    '<break time="200ms"/>And that\'s the game!',
    '<break time="200ms"/>Game over!',
    '<break time="200ms"/>That\'s a wrap!',
  ],
  'high-score': [
    '<break time="200ms"/><prosody pitch="+30%" rate="fast">New high score!</prosody><break time="200ms"/>',
    '<break time="200ms"/><emphasis level="strong">Record breaker!</emphasis>',
    '<break time="200ms"/>That\'s a new personal best!',
  ],
  handoff: ['<break time="300ms"/>'],
  notification: ['<break time="150ms"/>'],
  'milestone-fanfare': [
    '<break time="200ms"/><prosody pitch="+20%" rate="fast">Achievement unlocked!</prosody><break time="200ms"/>',
    '<break time="200ms"/><emphasis level="strong">Milestone reached!</emphasis><break time="200ms"/>',
    '<break time="200ms"/><prosody pitch="+30%">Wow!</prosody> That\'s huge!<break time="200ms"/>',
  ],
  'milestone-sparkle': [
    '<break time="100ms"/><prosody pitch="+10%">Nice!</prosody><break time="100ms"/>',
    '<break time="100ms"/>Look at you!<break time="100ms"/>',
    '<break time="100ms"/><prosody pitch="+15%">Sweet!</prosody><break time="100ms"/>',
  ],
  'milestone-applause': [
    '<break time="200ms"/><prosody rate="slow">Im. Pressed.</prosody><break time="200ms"/>',
    '<break time="200ms"/>Take a bow!<break time="200ms"/>',
    '<break time="200ms"/><emphasis level="strong">Standing ovation!</emphasis><break time="200ms"/>',
  ],
  'streak-fire': [
    '<break time="100ms"/><prosody pitch="+10%" rate="fast">On fire!</prosody>',
    '<break time="100ms"/><emphasis level="strong">Hot streak!</emphasis>',
    '<break time="100ms"/>Keep it going!',
  ],
};

// ============================================================================
// SESSION SOUNDS SERVICE
// ============================================================================

class SessionSoundsService {
  private audioCache = new Map<string, ArrayBuffer>();
  private isEnabled = true;

  constructor() {
    log.debug('🎵 Session sounds service initialized');
  }

  /**
   * Enable or disable session sounds
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    log.debug('🎵 Session sounds', { enabled });
  }

  /**
   * Play a session sound effect
   * Returns the verbal fallback if audio couldn't play
   *
   * 🔊 Uses dedicated SoundEffectsPlayer - NOT the music player!
   * This prevents "music ended" announcements and DJ callbacks.
   */
  async playSound(type: SessionSoundType): Promise<{
    played: boolean;
    verbalFallback?: string;
  }> {
    if (!this.isEnabled) {
      return { played: false };
    }

    const player = getSoundEffectsPlayer();

    // If sound effects player not available, use verbal fallback
    if (!player.isInitialized()) {
      log.debug('🔊 Sound effects player not initialized, using verbal fallback', { type });
      return {
        played: false,
        verbalFallback: this.getVerbalSound(type),
      };
    }

    try {
      const soundPath = SOUND_PATHS[type];
      const volume = SOUND_VOLUMES[type];

      log.debug('🔊 Playing session sound', { type, soundPath, volume });

      // Play through dedicated sound effects player (no callbacks!)
      const success = await player.playSound(soundPath, volume);

      if (success) {
        log.debug('🔊 Session sound completed', { type });
        return { played: true };
      }

      log.warn('🔊 Session sound failed to play', { type, soundPath });

      // Couldn't play - try fallback sound
      const fallbackType = SOUND_FALLBACKS[type];
      if (fallbackType && fallbackType !== type) {
        log.debug('🔊 Trying fallback sound', { from: type, to: fallbackType });
        return this.playSound(fallbackType);
      }

      // No audio available - use verbal
      return {
        played: false,
        verbalFallback: this.getVerbalSound(type),
      };
    } catch (error) {
      log.warn('🔊 Error playing session sound', { type, error: String(error) });
      return {
        played: false,
        verbalFallback: this.getVerbalSound(type),
      };
    }
  }

  /**
   * Get a random verbal sound effect for TTS
   */
  getVerbalSound(type: SessionSoundType): string {
    const sounds = VERBAL_SOUNDS[type];
    if (!sounds || sounds.length === 0) {
      return '<break time="150ms"/>';
    }
    return sounds[Math.floor(Math.random() * sounds.length)];
  }

  /**
   * Play session start sound
   */
  async playSessionStart(): Promise<string | undefined> {
    const result = await this.playSound('session-start');
    return result.verbalFallback;
  }

  /**
   * Play session end sound
   */
  async playSessionEnd(): Promise<string | undefined> {
    const result = await this.playSound('session-end');
    return result.verbalFallback;
  }

  /**
   * Play game sound with verbal fallback
   */
  async playGameSound(
    type: 'correct' | 'wrong' | 'hint' | 'game-start' | 'game-end' | 'high-score'
  ): Promise<string> {
    const result = await this.playSound(type);
    return result.verbalFallback || '';
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let sessionSoundsInstance: SessionSoundsService | null = null;

export function getSessionSounds(): SessionSoundsService {
  if (!sessionSoundsInstance) {
    sessionSoundsInstance = new SessionSoundsService();
  }
  return sessionSoundsInstance;
}

export function resetSessionSounds(): void {
  sessionSoundsInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Play a session sound effect
 */
export async function playSessionSound(
  type: SessionSoundType
): Promise<{ played: boolean; verbalFallback?: string }> {
  return getSessionSounds().playSound(type);
}

/**
 * Get verbal sound for TTS (when audio not available)
 */
export function getVerbalSound(type: SessionSoundType): string {
  return getSessionSounds().getVerbalSound(type);
}

export default getSessionSounds;
