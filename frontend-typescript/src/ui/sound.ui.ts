/**
 * Sound UI - Satisfying audio feedback
 *
 * Subtle, pleasing sounds for:
 * - Connect/disconnect
 * - Persona switch
 * - Button clicks
 * - Achievements
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('SoundUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

type SoundName =
  | 'connect'
  | 'disconnect'
  | 'goodbye' // Warm, resolving goodbye (different from abrupt disconnect)
  | 'hangup' // Satisfying phone receiver click at moment of disconnect
  | 'enter' // Ferni enters/joins - dramatic entrance
  | 'click'
  | 'hover'
  | 'switch'
  | 'success'
  | 'celebrate'
  | 'thinking'
  | 'message';

interface SoundConfig {
  frequency?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
  attack?: number;
  decay?: number;
  frequencies?: number[]; // For multi-tone sounds
  delays?: number[]; // Delays between frequencies
}

// ============================================================================
// MP3 SOUND PATHS - Real audio files for key moments
// ============================================================================

const MP3_SOUNDS: Partial<Record<SoundName, string>> = {
  connect: '/sounds/connect.mp3',
  disconnect: '/sounds/disconnect.mp3',
  goodbye: '/sounds/disconnect.mp3', // Use disconnect sound for goodbye too
  enter: '/sounds/dramatic-entrance.mp3', // Ferni enters the room
  // hangup uses synth-only for that satisfying click feel
};

// Pre-loaded audio elements for instant playback
const preloadedAudio: Map<SoundName, HTMLAudioElement> = new Map();

// ============================================================================
// STATE
// ============================================================================

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isMuted = false;
let isInitialized = false;

// ============================================================================
// DEBOUNCING - Prevents "casino effect" from multiple rapid sounds
// ============================================================================

/** Last time any sound was played (global cooldown) */
let lastSoundTime = 0;

/** Last time each specific sound was played */
const lastPlayTimes: Map<SoundName, number> = new Map();

/** Global minimum gap between any sounds (ms) */
const GLOBAL_SOUND_COOLDOWN = 100;

/** Per-sound cooldown to prevent same sound spam (ms) */
const SAME_SOUND_COOLDOWN: Partial<Record<SoundName, number>> = {
  success: 2000, // Success shouldn't repeat quickly
  celebrate: 2000, // Same for celebrate
  connect: 1000, // Connection sounds need gap
  disconnect: 1000,
  goodbye: 3000, // Goodbye is a ceremony - don't repeat
  hangup: 1000, // Hangup click shouldn't repeat
  enter: 2000, // Ferni enters - don't repeat quickly
  switch: 300, // Switch can be slightly more frequent
};

/** Check if a sound can play (debounce logic) */
function canPlaySound(name: SoundName): boolean {
  const now = Date.now();

  // Check global cooldown
  if (now - lastSoundTime < GLOBAL_SOUND_COOLDOWN) {
    return false;
  }

  // Check per-sound cooldown
  const lastPlay = lastPlayTimes.get(name) ?? 0;
  const cooldown = SAME_SOUND_COOLDOWN[name] ?? 150;
  if (now - lastPlay < cooldown) {
    return false;
  }

  return true;
}

/** Record that a sound was played */
function recordSoundPlay(name: SoundName): void {
  const now = Date.now();
  lastSoundTime = now;
  lastPlayTimes.set(name, now);
}

// Sound configurations - musical, satisfying tones
const SOUNDS: Record<SoundName, SoundConfig> = {
  connect: {
    frequencies: [523.25, 659.25, 783.99], // C5, E5, G5 (C major chord ascending)
    delays: [0, 0.08, 0.16],
    duration: 0.15,
    type: 'sine',
    volume: 0.12,
    attack: 0.01,
    decay: 0.12,
  },
  disconnect: {
    frequencies: [783.99, 659.25, 523.25], // G5, E5, C5 (descending)
    delays: [0, 0.06, 0.12],
    duration: 0.12,
    type: 'sine',
    volume: 0.1,
    attack: 0.01,
    decay: 0.1,
  },
  // 🌅 GOODBYE - Warm, resolving session end (2s per sonic identity spec)
  // Musical: Am7 → G/B → Cmaj7 → (hold) - "That was meaningful"
  // This is the CEREMONY sound, not abrupt disconnect
  goodbye: {
    // Am7 (A3-C4-E4-G4) → G/B (B3-D4-G4) → Cmaj7 (C4-E4-G4-B4)
    // Simplified to key notes that create the warm resolution feel
    frequencies: [
      220.0, // A3 - Am7 root
      261.63, // C4 - Am7 color
      329.63, // E4 - Am7 fifth
      246.94, // B3 - G/B bass
      293.66, // D4 - G chord
      392.0, // G4 - G chord root
      261.63, // C4 - Cmaj7 root (final resolution)
      329.63, // E4 - Cmaj7
      392.0, // G4 - Cmaj7
      493.88, // B4 - Cmaj7 seventh (color)
    ],
    delays: [0, 0.05, 0.1, 0.5, 0.55, 0.6, 1.0, 1.05, 1.1, 1.15],
    duration: 0.8, // Each note's duration
    type: 'sine',
    volume: 0.08,
    attack: 0.05, // Softer attack for warmth
    decay: 0.7, // Long decay for resolution feel
  },
  // 📞 HANGUP - Satisfying phone receiver click
  // Like gently placing down a phone receiver - tactile finality
  // Plays at the moment of actual disconnect for that "click" closure
  hangup: {
    frequencies: [
      180, // Low thud (receiver body)
      420, // Mid click (latch)
      280, // Low resonance (settling)
    ],
    delays: [0, 0.015, 0.04], // Very quick sequence
    duration: 0.06,
    type: 'sine',
    volume: 0.12,
    attack: 0.002, // Very quick attack (click)
    decay: 0.05, // Quick decay (not reverby)
  },
  // 🎭 ENTER - Ferni joins the room (dramatic entrance)
  // Ascending chord with presence - "I'm here for you"
  enter: {
    frequencies: [261.63, 329.63, 392.0, 523.25], // C4, E4, G4, C5 (C major octave)
    delays: [0, 0.1, 0.2, 0.35],
    duration: 0.25,
    type: 'sine',
    volume: 0.1,
    attack: 0.03,
    decay: 0.2,
  },
  click: {
    frequency: 1200,
    duration: 0.04,
    type: 'sine',
    volume: 0.06,
    attack: 0.001,
    decay: 0.035,
  },
  hover: {
    frequency: 800,
    duration: 0.025,
    type: 'sine',
    volume: 0.03,
    attack: 0.001,
    decay: 0.02,
  },
  switch: {
    frequencies: [440, 554.37], // A4, C#5 (major third)
    delays: [0, 0.05],
    duration: 0.1,
    type: 'sine',
    volume: 0.08,
    attack: 0.01,
    decay: 0.08,
  },
  // Success - subtle two-note acknowledgment, not triumphant
  // A4 → C5 (minor third up) - gentle "got it"
  success: {
    frequencies: [440, 523.25], // A4 → C5 (just 2 notes)
    delays: [0, 0.12],
    duration: 0.15,
    type: 'sine',
    volume: 0.06, // Quiet
    attack: 0.02,
    decay: 0.12,
  },
  // Zen warmth pulse - gentle, human, not game-like
  // Just a soft A3 hum that fades warmly - "I see you"
  celebrate: {
    frequency: 220, // A3 - warm low tone
    duration: 0.4,
    type: 'sine',
    volume: 0.04, // Very quiet
    attack: 0.1, // Slow fade in
    decay: 0.3, // Slow fade out
  },
  thinking: {
    frequencies: [350, 370],
    delays: [0, 0.3],
    duration: 0.15,
    type: 'sine',
    volume: 0.04,
    attack: 0.05,
    decay: 0.1,
  },
  message: {
    frequency: 880,
    duration: 0.08,
    type: 'sine',
    volume: 0.06,
    attack: 0.01,
    decay: 0.06,
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initSoundUI(): void {
  // Preload MP3 sounds for instant playback
  preloadMP3Sounds();

  // Create audio context on first user interaction
  const initOnInteraction = () => {
    if (isInitialized) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      audioContext = new (window.AudioContext ?? (window as any).webkitAudioContext)();
      masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      masterGain.gain.value = 1;
      isInitialized = true;
    } catch (e) {
      log.warn('Audio not supported');
    }

    // Remove listeners after init
    document.removeEventListener('click', initOnInteraction);
    document.removeEventListener('touchstart', initOnInteraction);
    document.removeEventListener('keydown', initOnInteraction);
  };

  // Initialize on first interaction (browser requirement)
  document.addEventListener('click', initOnInteraction, { once: true });
  document.addEventListener('touchstart', initOnInteraction, { once: true });
  document.addEventListener('keydown', initOnInteraction, { once: true });

  // Set up hover sounds for interactive elements
  setupHoverSounds();
}

/**
 * Preload MP3 sounds for instant playback.
 * Called early so sounds are ready when needed.
 */
function preloadMP3Sounds(): void {
  for (const [name, path] of Object.entries(MP3_SOUNDS)) {
    try {
      const audio = new Audio(path);
      audio.preload = 'auto';
      audio.volume = 0.4; // Moderate volume for MP3s
      preloadedAudio.set(name as SoundName, audio);
      log.debug(`Preloaded sound: ${name}`);
    } catch (e) {
      log.debug(`Failed to preload ${name}:`, e);
    }
  }
}

/**
 * Play an MP3 sound file.
 * Returns true if playback started successfully.
 */
async function playMP3(name: SoundName): Promise<boolean> {
  const audio = preloadedAudio.get(name);
  if (!audio) return false;

  try {
    // Clone the audio element for overlapping plays
    const clone = audio.cloneNode() as HTMLAudioElement;
    clone.volume = isMuted ? 0 : 0.4;
    await clone.play();
    log.debug(`🔊 Playing MP3: ${name}`);
    return true;
  } catch (e) {
    log.debug(`MP3 play failed for ${name}:`, e);
    return false;
  }
}

// ============================================================================
// SOUND PLAYBACK
// ============================================================================

export function play(name: SoundName): void {
  if (isMuted) return;

  // MOBILE FIX: Debounce sounds to prevent "casino effect"
  if (!canPlaySound(name)) {
    log.debug(`Sound debounced: ${name}`);
    return;
  }

  // Record this play for debouncing
  recordSoundPlay(name);

  // Try MP3 first for key sounds (connect, disconnect, goodbye)
  if (MP3_SOUNDS[name]) {
    void playMP3(name).then((success) => {
      if (!success) {
        // Fall back to synth sound
        playSynth(name);
      }
    });
    return;
  }

  // For other sounds, use synth
  playSynth(name);
}

/**
 * Play a synthesized sound (Web Audio API oscillator).
 */
function playSynth(name: SoundName): void {
  if (!isInitialized || !audioContext || !masterGain) return;

  const config = SOUNDS[name];
  if (!config) return;

  // Resume context if suspended
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }

  // Play single or multi-tone sound
  if (config.frequencies && config.delays) {
    config.frequencies.forEach((freq, i) => {
      trackedTimeout(
        () => {
          playTone({
            ...config,
            frequency: freq,
          });
        },
        (config.delays?.[i] ?? 0) * 1000
      );
    });
  } else if (config.frequency) {
    playTone(config);
  }
}

function playTone(config: SoundConfig): void {
  if (!audioContext || !masterGain) return;

  const now = audioContext.currentTime;

  // Create oscillator
  const oscillator = audioContext.createOscillator();
  oscillator.type = config.type ?? 'sine';
  oscillator.frequency.value = config.frequency ?? 440;

  // Create gain for envelope
  const gainNode = audioContext.createGain();
  gainNode.gain.setValueAtTime(0, now);

  // Attack
  gainNode.gain.linearRampToValueAtTime(config.volume ?? 0.1, now + (config.attack ?? 0.01));

  // Decay
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + (config.duration ?? 0.1));

  // Connect and play
  oscillator.connect(gainNode);
  gainNode.connect(masterGain);

  oscillator.start(now);
  oscillator.stop(now + (config.duration ?? 0.1) + 0.01);
}

// ============================================================================
// HOVER SOUNDS
// ============================================================================

function setupHoverSounds(): void {
  // Debounce to prevent spam
  let lastHoverTime = 0;
  const HOVER_DEBOUNCE = 50;

  document.addEventListener(
    'mouseenter',
    (e) => {
      const target = e.target;

      // Ensure target is an Element (not a Text node or other)
      if (!(target instanceof Element)) return;

      // Only for interactive elements
      if (
        target.matches('button, .btn, .team-member, .footer-link, a') &&
        !target.matches(':disabled')
      ) {
        const now = Date.now();
        if (now - lastHoverTime > HOVER_DEBOUNCE) {
          play('hover');
          lastHoverTime = now;
        }
      }
    },
    true
  );
}

// ============================================================================
// CONTROLS
// ============================================================================

export function setMuted(muted: boolean): void {
  isMuted = muted;

  if (masterGain) {
    masterGain.gain.value = muted ? 0 : 1;
  }
}

export function toggleMute(): boolean {
  setMuted(!isMuted);
  return isMuted;
}

export function getMuted(): boolean {
  return isMuted;
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

export function playConnect(): void {
  play('connect');
}
export function playDisconnect(): void {
  play('disconnect');
}
export function playGoodbye(): void {
  play('goodbye');
}
export function playHangup(): void {
  play('hangup');
}
export function playEnter(): void {
  play('enter');
}
export function playClick(): void {
  play('click');
}
export function playSwitch(): void {
  play('switch');
}
export function playSuccess(): void {
  play('success');
}
export function playCelebrate(): void {
  play('celebrate');
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
  masterGain = null;
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const soundUI = {
  init: initSoundUI,
  play,
  setMuted,
  toggleMute,
  getMuted,
  playConnect,
  playDisconnect,
  playGoodbye,
  playHangup,
  playEnter,
  playClick,
  playSwitch,
  playSuccess,
  playCelebrate,
  dispose,
};
