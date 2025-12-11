/**
 * Ambient Sounds Service
 *
 * Manages background ambient audio loops for the Personalize feature.
 * Sound packs include: rain, fireplace, forest sounds.
 *
 * Design principles:
 * - Subtle background ambience, not distracting
 * - Smooth crossfades between packs
 * - Respects user preferences and system volume
 * - Auto-pauses during Ferni speech
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('AmbientSounds');

// ============================================================================
// TYPES
// ============================================================================

export type AmbientSoundPack = 'none' | 'rain' | 'fireplace' | 'forest';

interface AmbientConfig {
  id: AmbientSoundPack;
  name: string;
  description: string;
  file: string;
  volume: number; // Base volume (0-1)
}

// ============================================================================
// SOUND PACK CONFIGURATIONS
// ============================================================================

const AMBIENT_PACKS: Record<AmbientSoundPack, AmbientConfig | null> = {
  none: null,
  rain: {
    id: 'rain',
    name: 'Gentle Rain',
    description: 'Soft rainfall ambience',
    file: '/sounds/ambient/rain-loop.mp3',
    volume: 0.15, // Subtle
  },
  fireplace: {
    id: 'fireplace',
    name: 'Crackling Fire',
    description: 'Cozy fireplace sounds',
    file: '/sounds/ambient/fireplace-loop.mp3',
    volume: 0.12, // Very subtle crackling
  },
  forest: {
    id: 'forest',
    name: 'Forest Morning',
    description: 'Birds and gentle wind',
    file: '/sounds/ambient/forest-loop.mp3',
    volume: 0.18, // Nature sounds can be slightly louder
  },
};

// Map cosmetic IDs to ambient packs
const COSMETIC_TO_PACK: Record<string, AmbientSoundPack> = {
  'sounds-rain': 'rain',
  'sounds-fireplace': 'fireplace',
  'sounds-nature': 'forest',
};

// ============================================================================
// STATE
// ============================================================================

let audioContext: AudioContext | null = null;
let currentAudio: HTMLAudioElement | null = null;
let gainNode: GainNode | null = null;
let currentPack: AmbientSoundPack = 'none';
let isPlaying = false;
let isMuted = false;
let isPausedForSpeech = false;
let masterVolume = 1.0;

const CROSSFADE_DURATION = 2000; // 2s crossfade
const SPEECH_DUCK_VOLUME = 0.3; // Duck to 30% during speech
const SPEECH_DUCK_DURATION = 500; // 500ms fade

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the ambient sounds service
 */
export function initAmbientSounds(): void {
  // Listen for speech events to duck audio
  document.addEventListener('ferni:agent-speech-start', handleSpeechStart);
  document.addEventListener('ferni:agent-speech-end', handleSpeechEnd);

  // Listen for cosmetics changes
  document.addEventListener('ferni:sound-pack-change', ((e: CustomEvent) => {
    const { packId } = e.detail as { packId: string };
    const pack = COSMETIC_TO_PACK[packId] || 'none';
    void setAmbientPack(pack);
  }) as EventListener);

  log.info('Ambient sounds service initialized');
}

/**
 * Create audio context on first interaction (browser requirement)
 */
function ensureAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = masterVolume;
    return audioContext;
  } catch (e) {
    log.warn('Web Audio not supported');
    return null;
  }
}

// ============================================================================
// PLAYBACK CONTROL
// ============================================================================

/**
 * Set the active ambient sound pack
 */
export async function setAmbientPack(pack: AmbientSoundPack): Promise<void> {
  if (pack === currentPack) return;

  log.info({ from: currentPack, to: pack }, 'Switching ambient pack');

  // Crossfade out current
  if (currentAudio && isPlaying) {
    await fadeOut(currentAudio, CROSSFADE_DURATION);
    currentAudio.pause();
    currentAudio = null;
  }

  currentPack = pack;

  // Start new pack if not 'none'
  if (pack !== 'none') {
    await playAmbient(pack);
  }

  isPlaying = pack !== 'none';
}

/**
 * Set ambient pack from cosmetic ID
 */
export async function setAmbientFromCosmetic(cosmeticId: string | null): Promise<void> {
  if (!cosmeticId) {
    await setAmbientPack('none');
    return;
  }

  const pack = COSMETIC_TO_PACK[cosmeticId] || 'none';
  await setAmbientPack(pack);
}

/**
 * Play an ambient sound pack
 */
async function playAmbient(pack: AmbientSoundPack): Promise<void> {
  const config = AMBIENT_PACKS[pack];
  if (!config) return;

  ensureAudioContext();

  try {
    const audio = new Audio(config.file);
    audio.loop = true;
    audio.volume = 0; // Start silent for fade-in

    // Wait for audio to be ready
    await new Promise<void>((resolve, reject) => {
      audio.oncanplaythrough = () => resolve();
      audio.onerror = () => reject(new Error(`Failed to load ${config.file}`));
      audio.load();
    });

    currentAudio = audio;
    await audio.play();

    // Fade in
    await fadeIn(audio, config.volume * masterVolume, CROSSFADE_DURATION);

    log.debug({ pack }, 'Ambient audio playing');
  } catch (error) {
    log.warn({ pack, error }, 'Failed to play ambient audio - file may not exist yet');
    // Graceful degradation - ambient packs are optional
  }
}

/**
 * Fade audio in
 */
function fadeIn(audio: HTMLAudioElement, targetVolume: number, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const startVolume = audio.volume;
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out curve for natural fade
      const eased = 1 - Math.pow(1 - progress, 2);
      audio.volume = startVolume + (targetVolume - startVolume) * eased;

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(fade);
  });
}

/**
 * Fade audio out
 */
function fadeOut(audio: HTMLAudioElement, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const startVolume = audio.volume;
    const startTime = Date.now();

    const fade = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease in curve for natural fade
      const eased = progress * progress;
      audio.volume = startVolume * (1 - eased);

      if (progress < 1) {
        requestAnimationFrame(fade);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(fade);
  });
}

// ============================================================================
// SPEECH DUCKING
// ============================================================================

/**
 * Duck audio when Ferni is speaking
 */
function handleSpeechStart(): void {
  if (!currentAudio || !isPlaying || isPausedForSpeech) return;

  isPausedForSpeech = true;
  const config = AMBIENT_PACKS[currentPack];
  if (!config) return;

  const targetVolume = config.volume * masterVolume * SPEECH_DUCK_VOLUME;
  void fadeIn(currentAudio, targetVolume, SPEECH_DUCK_DURATION);

  log.debug('Ducking ambient audio for speech');
}

/**
 * Restore audio when speech ends
 */
function handleSpeechEnd(): void {
  if (!currentAudio || !isPlaying || !isPausedForSpeech) return;

  isPausedForSpeech = false;
  const config = AMBIENT_PACKS[currentPack];
  if (!config) return;

  const targetVolume = config.volume * masterVolume;
  void fadeIn(currentAudio, targetVolume, SPEECH_DUCK_DURATION);

  log.debug('Restoring ambient audio after speech');
}

// ============================================================================
// VOLUME CONTROL
// ============================================================================

/**
 * Set master volume for ambient sounds
 */
export function setVolume(volume: number): void {
  masterVolume = Math.max(0, Math.min(1, volume));

  if (currentAudio && isPlaying && !isPausedForSpeech) {
    const config = AMBIENT_PACKS[currentPack];
    if (config) {
      currentAudio.volume = config.volume * masterVolume;
    }
  }

  log.debug({ volume: masterVolume }, 'Ambient volume set');
}

/**
 * Mute/unmute ambient sounds
 */
export function setMuted(muted: boolean): void {
  isMuted = muted;

  if (currentAudio) {
    if (muted) {
      currentAudio.volume = 0;
    } else if (isPlaying && !isPausedForSpeech) {
      const config = AMBIENT_PACKS[currentPack];
      if (config) {
        currentAudio.volume = config.volume * masterVolume;
      }
    }
  }

  log.debug({ muted }, 'Ambient mute state');
}

/**
 * Toggle mute state
 */
export function toggleMute(): boolean {
  setMuted(!isMuted);
  return isMuted;
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get current ambient pack
 */
export function getCurrentPack(): AmbientSoundPack {
  return currentPack;
}

/**
 * Check if ambient is playing
 */
export function isAmbientPlaying(): boolean {
  return isPlaying && !isMuted;
}

/**
 * Get available ambient packs
 */
export function getAvailablePacks(): AmbientConfig[] {
  return Object.values(AMBIENT_PACKS).filter((p): p is AmbientConfig => p !== null);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Stop and clean up ambient audio
 */
export function dispose(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }

  gainNode = null;
  isPlaying = false;
  currentPack = 'none';

  document.removeEventListener('ferni:agent-speech-start', handleSpeechStart);
  document.removeEventListener('ferni:agent-speech-end', handleSpeechEnd);

  log.info('Ambient sounds service disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ambientSounds = {
  init: initAmbientSounds,
  setPack: setAmbientPack,
  setFromCosmetic: setAmbientFromCosmetic,
  setVolume,
  setMuted,
  toggleMute,
  getCurrentPack,
  isPlaying: isAmbientPlaying,
  getAvailablePacks,
  dispose,
};

export default ambientSounds;
