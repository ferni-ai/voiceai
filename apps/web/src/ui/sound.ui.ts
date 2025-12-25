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
  | 'phoneClick' // Tactile phone click - when Ferni hangs up (more assertive than hangup)
  | 'enter' // Ferni enters/joins - dramatic entrance
  | 'teamUnlock' // New teammate unlocked - celebratory!
  | 'click'
  | 'hover'
  | 'switch'
  | 'success'
  | 'celebrate'
  | 'thinking'
  | 'message'
  | 'open' // Modal/panel opening
  | 'close'; // Modal/panel closing

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
//
// Note: Most sounds now use the synthesizer for that "airy, happy" feel.
// MP3s are kept as fallback and can be replaced with custom recordings.
// The synth sounds are designed to sound like wind chimes and gentle bells.
// ============================================================================

const MP3_SOUNDS: Partial<Record<SoundName, string>> = {
  // Note: We now prefer synth sounds for their airy, delightful quality.
  // These MP3s serve as fallbacks if synth sounds don't work.
  connect: '/sounds/connect.mp3',
  disconnect: '/sounds/disconnect.mp3',
  goodbye: '/sounds/disconnect.mp3',
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
  teamUnlock: 3000, // Team unlock is a ceremony - don't repeat
  connect: 1000, // Connection sounds need gap
  disconnect: 1000,
  goodbye: 3000, // Goodbye is a ceremony - don't repeat
  hangup: 1000, // Hangup click shouldn't repeat
  phoneClick: 1000, // Phone click shouldn't repeat
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

// ============================================================================
// SOUND CONFIGURATIONS - Airy, Happy, Delightful
//
// Design Philosophy:
// - Wind chimes and gentle bells for connection/disconnection
// - Bright, sparkling tones that feel like morning sunshine
// - Soft, rounded attacks for warmth (never harsh)
// - Higher octaves for lightness and happiness
// - Long, gentle decays that linger like a smile
// ============================================================================

const SOUNDS: Record<SoundName, SoundConfig> = {
  // ✨ CONNECT - Magical awakening, like wind chimes greeting you
  // Pentatonic scale (no tension) creates instant happiness
  // F5 → A5 → C6 → F6 (pure, bright, ascending joy)
  connect: {
    frequencies: [698.46, 880.0, 1046.5, 1396.91], // F5, A5, C6, F6
    delays: [0, 0.06, 0.12, 0.2],
    duration: 0.35,
    type: 'sine',
    volume: 0.08,
    attack: 0.03, // Soft attack like a breeze
    decay: 0.3, // Long, lingering decay
  },

  // 🍃 DISCONNECT - Gentle goodbye, like leaves settling
  // Descending but still happy - "see you soon" not "goodbye forever"
  // Uses major 6th interval for warmth
  disconnect: {
    frequencies: [1046.5, 880.0, 698.46], // C6, A5, F5 (gentle descent)
    delays: [0, 0.1, 0.2],
    duration: 0.25,
    type: 'sine',
    volume: 0.06,
    attack: 0.04,
    decay: 0.2,
  },

  // 🌅 GOODBYE - Warm, resolving session end
  // Simple, heartfelt: just two notes that feel like a warm hug
  // Major 6th harmony (D5 + B5) - universally warm interval
  goodbye: {
    frequencies: [587.33, 739.99, 987.77], // D5, F#5, B5 (Bm add11 - bittersweet beautiful)
    delays: [0, 0.15, 0.3],
    duration: 0.6,
    type: 'sine',
    volume: 0.06,
    attack: 0.08, // Very soft entrance
    decay: 0.5, // Long, warm fade
  },

  // 🎐 HANGUP - Soft wind chime "ting"
  // Single clear note that feels final but gentle
  hangup: {
    frequencies: [1318.51, 1760.0], // E6, A6 (pure fifth - satisfying)
    delays: [0, 0.02],
    duration: 0.15,
    type: 'sine',
    volume: 0.05,
    attack: 0.005,
    decay: 0.14,
  },

  // 📞 PHONE CLICK - Tactile phone receiver click
  // When Ferni hangs up - more assertive, like placing a receiver down firmly
  // Lower frequency, sharper attack = more "physical" feel
  // Two-tone click: thunk + settle (like a mechanical latch)
  phoneClick: {
    frequencies: [220, 147], // A3, D3 - low, solid thunk
    delays: [0, 0.03],
    duration: 0.08,
    type: 'sine',
    volume: 0.12, // Slightly louder for presence
    attack: 0.002, // Very sharp attack - tactile
    decay: 0.07, // Quick decay - no lingering
  },

  // 🌸 ENTER - Ferni arrives with gentle magic
  // Like morning birdsong or a friendly greeting
  // Bright, ascending, full of possibility
  enter: {
    frequencies: [659.25, 880.0, 1046.5, 1318.51], // E5, A5, C6, E6 (A major spread)
    delays: [0, 0.08, 0.16, 0.26],
    duration: 0.3,
    type: 'sine',
    volume: 0.08,
    attack: 0.025,
    decay: 0.25,
  },

  // 🎊 TEAM UNLOCK - Celebration sparkles!
  // Like confetti or champagne bubbles - effervescent joy
  // Cascading major arpeggio that twinkles
  teamUnlock: {
    frequencies: [784.0, 987.77, 1174.66, 1567.98, 1975.53], // G5, B5, D6, G6, B6
    delays: [0, 0.05, 0.1, 0.17, 0.25],
    duration: 0.25,
    type: 'sine',
    volume: 0.07,
    attack: 0.015,
    decay: 0.22,
  },

  // 💫 CLICK - Tiny water droplet
  // Soft, round, satisfying micro-interaction
  click: {
    frequency: 1760, // A6 - bright but not harsh
    duration: 0.06,
    type: 'sine',
    volume: 0.04,
    attack: 0.003,
    decay: 0.055,
  },

  // 🌬️ HOVER - Gentle breath of air
  // So subtle you almost imagine it
  hover: {
    frequency: 1318.51, // E6 - airy
    duration: 0.04,
    type: 'sine',
    volume: 0.02,
    attack: 0.005,
    decay: 0.035,
  },

  // 🔄 SWITCH - Persona carousel whoosh
  // Two-note interval that suggests movement and choice
  // Perfect fourth interval - forward motion without tension
  switch: {
    frequencies: [880.0, 1174.66], // A5, D6 (perfect fourth)
    delays: [0, 0.04],
    duration: 0.12,
    type: 'sine',
    volume: 0.06,
    attack: 0.01,
    decay: 0.1,
  },

  // ✅ SUCCESS - Happy little acknowledgment
  // Like a gentle "ping!" of delight
  // Major third going up - universally happy
  success: {
    frequencies: [880.0, 1108.73], // A5, C#6 (major third)
    delays: [0, 0.08],
    duration: 0.2,
    type: 'sine',
    volume: 0.05,
    attack: 0.015,
    decay: 0.18,
  },

  // 🎉 CELEBRATE - Sparkle shower
  // Multiple quick high notes like light catching glitter
  celebrate: {
    frequencies: [1318.51, 1567.98, 1760.0, 2093.0], // E6, G6, A6, C7
    delays: [0, 0.03, 0.07, 0.12],
    duration: 0.15,
    type: 'sine',
    volume: 0.05,
    attack: 0.01,
    decay: 0.13,
  },

  // 💭 THINKING - Soft contemplation
  // Gentle oscillation like breathing or meditation
  // Two notes very close together create shimmer
  thinking: {
    frequencies: [523.25, 554.37], // C5, C#5 - gentle shimmer
    delays: [0, 0.2],
    duration: 0.25,
    type: 'sine',
    volume: 0.03,
    attack: 0.08,
    decay: 0.15,
  },

  // 💬 MESSAGE - Soft notification bubble
  // Like a soap bubble popping gently
  message: {
    frequency: 1396.91, // F6 - clear but soft
    duration: 0.1,
    type: 'sine',
    volume: 0.04,
    attack: 0.008,
    decay: 0.09,
  },

  // 🚪 OPEN - Modal/panel opening, like a door gently opening
  // Rising major arpeggio for invitation
  open: {
    frequencies: [523.25, 659.25, 783.99], // C5, E5, G5 (C major)
    delays: [0, 0.04, 0.08],
    duration: 0.15,
    type: 'sine',
    volume: 0.05,
    attack: 0.02,
    decay: 0.12,
  },

  // 🚪 CLOSE - Modal/panel closing, soft resolution
  // Single descending note for gentle closure
  close: {
    frequencies: [659.25, 523.25], // E5, C5 (settling down)
    delays: [0, 0.06],
    duration: 0.12,
    type: 'sine',
    volume: 0.04,
    attack: 0.02,
    decay: 0.1,
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

/**
 * Check if device is primarily touch-based.
 * On touch devices, hover sounds don't make sense and can cause
 * the "casio effect" due to synthetic mouse events firing unexpectedly.
 */
function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - vendor prefix for older browsers
    navigator.msMaxTouchPoints > 0
  );
}

function setupHoverSounds(): void {
  // MOBILE FIX: Disable hover sounds on touch devices
  // Touch devices generate synthetic mouseenter events that cause
  // repeating sounds when scrolling or touching near buttons
  if (isTouchDevice()) {
    log.debug('Hover sounds disabled on touch device');
    return;
  }

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
export function playPhoneClick(): void {
  play('phoneClick');
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
export function playTeamUnlock(): void {
  play('teamUnlock');
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
  playPhoneClick,
  playEnter,
  playTeamUnlock,
  playClick,
  playSwitch,
  playSuccess,
  playCelebrate,
  dispose,
};
