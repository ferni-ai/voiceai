/**
 * 🔊 Game Sound Effects
 *
 * Short audio cues for game feedback.
 * Uses simple tones generated via Web Audio API concepts
 * or short audio URLs for a polished experience.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getMusicPlayer } from '../../audio/music-player.js';

const log = getLogger();

// ============================================================================
// SOUND EFFECT URLs
// ============================================================================

// Using royalty-free sound effects
// In production, these would be hosted on your CDN
const SOUND_EFFECTS = {
  // Correct answer - celebratory ding
  correct: 'https://www.soundjay.com/buttons/sounds/button-09.mp3',
  
  // Wrong answer - gentle "nope" tone  
  wrong: 'https://www.soundjay.com/buttons/sounds/button-10.mp3',
  
  // Game start - upbeat intro
  gameStart: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3',
  
  // Game end - fanfare
  gameEnd: 'https://www.soundjay.com/misc/sounds/magic-chime-01.mp3',
  
  // New high score - celebration
  highScore: 'https://www.soundjay.com/misc/sounds/magic-chime-02.mp3',
  
  // Hint given
  hint: 'https://www.soundjay.com/buttons/sounds/button-16.mp3',
  
  // Round start
  roundStart: 'https://www.soundjay.com/buttons/sounds/button-30.mp3',
  
  // Countdown tick (for timed games)
  tick: 'https://www.soundjay.com/clock/sounds/clock-ticking-2.mp3',
};

// ============================================================================
// SSML SOUND EFFECTS (Alternative - works without external URLs)
// ============================================================================

/**
 * Generate SSML for sound effects using speech synthesis cues
 * This works even without external audio files
 */
export const SSML_SOUNDS = {
  correct: `<audio src="https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg" />`,
  wrong: `<audio src="https://actions.google.com/sounds/v1/cartoon/slide_whistle.ogg" />`,
  fanfare: `<audio src="https://actions.google.com/sounds/v1/cartoon/drum_roll.ogg" />`,
  tick: `<audio src="https://actions.google.com/sounds/v1/clocks/grandfather_clock.ogg" />`,
};

// ============================================================================
// VERBAL SOUND EFFECTS (Most reliable - uses TTS)
// ============================================================================

/**
 * Get verbal sound effect that TTS will pronounce
 * These work reliably across all TTS providers
 */
export function getVerbalSoundEffect(type: 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd'): string {
  const sounds: Record<string, string[]> = {
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
    highScore: [
      '<break time="200ms"/><prosody pitch="+30%" rate="fast">New high score!</prosody><break time="200ms"/>',
      '<break time="200ms"/><emphasis level="strong">Record breaker!</emphasis>',
      '<break time="200ms"/>That\'s a new personal best!',
    ],
    hint: [
      '<break time="100ms"/>Okay, here\'s a hint...',
      '<break time="100ms"/>Alright, let me help you out...',
    ],
    gameEnd: [
      '<break time="200ms"/>And that\'s the game!',
      '<break time="200ms"/>Game over!',
      '<break time="200ms"/>That\'s a wrap!',
    ],
  };

  const options = sounds[type] || sounds.correct;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// PLAY SOUND EFFECTS
// ============================================================================

/**
 * Play a sound effect (if music player is available)
 * Falls back to verbal cue if audio not available
 */
export async function playGameSound(
  type: keyof typeof SOUND_EFFECTS
): Promise<{ played: boolean; verbalFallback?: string }> {
  const player = getMusicPlayer();
  
  if (!player.isInitialized()) {
    log.debug('🔊 Music player not initialized, using verbal sound effect');
    return {
      played: false,
      verbalFallback: getVerbalSoundEffect(type as 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd'),
    };
  }

  const soundUrl = SOUND_EFFECTS[type];
  if (!soundUrl) {
    log.warn({ type }, '🔊 Unknown sound effect type');
    return { played: false };
  }

  try {
    // Save current volume
    const wasPlaying = player.isPlaying();
    
    // Play the sound effect at moderate volume
    player.setVolume(0.5);
    
    const success = await player.playFromUrl(soundUrl, {
      name: `sound-effect-${type}`,
      artist: 'system',
      previewUrl: soundUrl,
      duration: 2000, // Sound effects are short
    });

    if (success) {
      log.debug({ type }, '🔊 Played game sound effect');
      
      // Wait for sound to finish (most are < 1 second)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Stop it to prepare for next audio
      if (!wasPlaying) {
        player.stop();
      }
    }

    return { played: success };
  } catch (error) {
    log.error({ error, type }, '🔊 Failed to play sound effect');
    return {
      played: false,
      verbalFallback: getVerbalSoundEffect(type as 'correct' | 'wrong' | 'highScore' | 'hint' | 'gameEnd'),
    };
  }
}

// ============================================================================
// INTEGRATED FEEDBACK
// ============================================================================

/**
 * Get complete feedback for a game result
 * Includes sound effect (or verbal fallback) + message
 */
export async function getGameFeedback(
  isCorrect: boolean,
  isHighScore: boolean = false,
  baseMessage: string = ''
): Promise<string> {
  let prefix = '';
  
  if (isHighScore) {
    const result = await playGameSound('highScore');
    prefix = result.verbalFallback || getVerbalSoundEffect('highScore');
  } else if (isCorrect) {
    const result = await playGameSound('correct');
    prefix = result.verbalFallback || getVerbalSoundEffect('correct');
  } else {
    const result = await playGameSound('wrong');
    prefix = result.verbalFallback || getVerbalSoundEffect('wrong');
  }

  return prefix + ' ' + baseMessage;
}

/**
 * Play game start sound
 */
export async function playGameStartSound(): Promise<string> {
  const result = await playGameSound('gameStart');
  if (!result.played) {
    return '<break time="200ms"/>Let\'s do this!<break time="200ms"/>';
  }
  return '';
}

/**
 * Play game end sound/fanfare
 */
export async function playGameEndSound(score: number, isHighScore: boolean): Promise<string> {
  if (isHighScore) {
    const result = await playGameSound('highScore');
    return result.verbalFallback || getVerbalSoundEffect('highScore');
  }
  
  const result = await playGameSound('gameEnd');
  return result.verbalFallback || getVerbalSoundEffect('gameEnd');
}

