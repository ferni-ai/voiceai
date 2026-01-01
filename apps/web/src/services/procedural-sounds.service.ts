/**
 * Procedural Sound Generator
 *
 * Creates beautiful, on-brand sounds using Web Audio API synthesis.
 * No MP3 files needed - sounds are generated in real-time.
 *
 * Each persona has a unique sonic signature based on their color/personality:
 * - Ferni (sage green): Warm earth tones, grounding, root notes
 * - Peter (ocean teal): Clear, analytical, crystalline
 * - Maya (terracotta): Nurturing, earthy warmth
 * - Jordan (coral): Energetic, celebratory, ascending
 * - Alex (slate blue): Professional, clear, balanced
 * - Nayan (golden): Wise, resonant, contemplative
 *
 * All sounds use the pentatonic scale for universal pleasantness.
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('ProceduralSounds');

// ============================================================================
// MUSICAL CONSTANTS
// ============================================================================

/**
 * Pentatonic scale frequencies (universally pleasing, no dissonance).
 * Based on C major pentatonic: C, D, E, G, A
 */
const PENTATONIC = {
  // Low octave (warm, grounding)
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196.0,
  A3: 220.0,

  // Middle octave (balanced)
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,

  // High octave (bright, uplifting)
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
};

/**
 * Persona sonic profiles - each persona has a unique sound signature.
 */
interface PersonaSonicProfile {
  /** Base frequencies for handoff chime (3-4 notes) */
  handoffNotes: number[];
  /** Note durations in seconds */
  noteDurations: number[];
  /** Fundamental waveform */
  waveform: OscillatorType;
  /** Attack time (how quickly sound reaches full volume) */
  attack: number;
  /** Decay time (how quickly sound fades) */
  decay: number;
  /** Reverb amount (0-1) */
  reverb: number;
  /** Filter cutoff frequency (for warmth) */
  filterCutoff: number;
  /** Overall gain multiplier */
  gain: number;
  /** Optional harmonic overtones for richness */
  harmonics?: number[];
}

const PERSONA_PROFILES: Record<string, PersonaSonicProfile> = {
  // Ferni - sage green - warm, grounding, like coming home
  ferni: {
    handoffNotes: [PENTATONIC.G3, PENTATONIC.C4, PENTATONIC.E4, PENTATONIC.G4],
    noteDurations: [0.15, 0.15, 0.15, 0.4],
    waveform: 'sine',
    attack: 0.02,
    decay: 0.4,
    reverb: 0.3,
    filterCutoff: 2000,
    gain: 0.25,
    harmonics: [1, 0.3, 0.1], // Soft harmonics for warmth
  },

  // Peter - ocean teal - clear, analytical, crystalline
  peter: {
    handoffNotes: [PENTATONIC.E4, PENTATONIC.G4, PENTATONIC.A4, PENTATONIC.C5],
    noteDurations: [0.12, 0.12, 0.12, 0.35],
    waveform: 'sine',
    attack: 0.01,
    decay: 0.35,
    reverb: 0.25,
    filterCutoff: 4000,
    gain: 0.22,
    harmonics: [1, 0.15], // Pure, clear
  },

  // Maya - terracotta - nurturing, earthy warmth
  maya: {
    handoffNotes: [PENTATONIC.C3, PENTATONIC.E3, PENTATONIC.G3, PENTATONIC.C4],
    noteDurations: [0.18, 0.18, 0.18, 0.45],
    waveform: 'sine',
    attack: 0.03,
    decay: 0.5,
    reverb: 0.35,
    filterCutoff: 1500,
    gain: 0.28,
    harmonics: [1, 0.4, 0.15, 0.05], // Rich, warm harmonics
  },

  // Jordan - coral - energetic, celebratory
  jordan: {
    handoffNotes: [PENTATONIC.G4, PENTATONIC.A4, PENTATONIC.C5, PENTATONIC.D5, PENTATONIC.E5],
    noteDurations: [0.1, 0.1, 0.1, 0.1, 0.3],
    waveform: 'sine',
    attack: 0.01,
    decay: 0.3,
    reverb: 0.2,
    filterCutoff: 5000,
    gain: 0.2,
    harmonics: [1, 0.2, 0.1], // Bright and clear
  },

  // Alex - slate blue - professional, balanced
  alex: {
    handoffNotes: [PENTATONIC.D4, PENTATONIC.G4, PENTATONIC.A4, PENTATONIC.D5],
    noteDurations: [0.13, 0.13, 0.13, 0.35],
    waveform: 'sine',
    attack: 0.015,
    decay: 0.35,
    reverb: 0.2,
    filterCutoff: 3000,
    gain: 0.22,
    harmonics: [1, 0.2],
  },

  // Nayan - golden - wise, resonant, contemplative
  nayan: {
    handoffNotes: [PENTATONIC.C3, PENTATONIC.G3, PENTATONIC.C4, PENTATONIC.E4],
    noteDurations: [0.25, 0.25, 0.25, 0.6],
    waveform: 'sine',
    attack: 0.04,
    decay: 0.7,
    reverb: 0.45,
    filterCutoff: 1200,
    gain: 0.25,
    harmonics: [1, 0.5, 0.25, 0.12], // Deep, resonant harmonics
  },

  // Jack (legacy) - same as Peter
  jack: {
    handoffNotes: [PENTATONIC.E4, PENTATONIC.G4, PENTATONIC.A4, PENTATONIC.C5],
    noteDurations: [0.12, 0.12, 0.12, 0.35],
    waveform: 'sine',
    attack: 0.01,
    decay: 0.35,
    reverb: 0.25,
    filterCutoff: 4000,
    gain: 0.22,
    harmonics: [1, 0.15],
  },
};

// Default profile for unknown personas
const DEFAULT_PROFILE = PERSONA_PROFILES.ferni;

// ============================================================================
// SOUND GENERATOR SERVICE
// ============================================================================

class ProceduralSoundsService {
  private audioContext: AudioContext | null = null;
  private initialized = false;

  /**
   * Initialize the audio context (must be called after user interaction).
   */
  async initialize(): Promise<boolean> {
    if (this.initialized && this.audioContext) return true;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      this.audioContext = new AudioContextClass();

      // Resume if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.initialized = true;
      log.info('Procedural sounds initialized');
      return true;
    } catch (error) {
      log.error('Failed to initialize procedural sounds:', error);
      return false;
    }
  }

  /**
   * Resume audio context if suspended.
   */
  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Play a handoff sound for a specific persona.
   */
  async playHandoffSound(personaId: string): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) {
      log.warn('Audio context not available');
      return;
    }

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const profile = this.getPersonaProfile(personaId);
    await this.playChimeSequence(profile);
  }

  /**
   * Play a cameo arrival sound (lighter, shorter).
   */
  async playCameoArrive(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Gentle two-note ascending chime
    const profile: PersonaSonicProfile = {
      handoffNotes: [PENTATONIC.E4, PENTATONIC.G4],
      noteDurations: [0.1, 0.25],
      waveform: 'sine',
      attack: 0.02,
      decay: 0.3,
      reverb: 0.2,
      filterCutoff: 3000,
      gain: 0.15,
      harmonics: [1, 0.2],
    };

    await this.playChimeSequence(profile);
  }

  /**
   * Play a cameo return sound (Ferni coming back).
   */
  async playCameoReturn(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Warm descending then resolving to home note
    const profile: PersonaSonicProfile = {
      handoffNotes: [PENTATONIC.G4, PENTATONIC.E4, PENTATONIC.C4],
      noteDurations: [0.12, 0.12, 0.35],
      waveform: 'sine',
      attack: 0.02,
      decay: 0.4,
      reverb: 0.3,
      filterCutoff: 2000,
      gain: 0.18,
      harmonics: [1, 0.3, 0.1],
    };

    await this.playChimeSequence(profile);
  }

  /**
   * Play a connect sound (session starting).
   */
  async playConnect(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Gentle ascending "ready" chime
    const profile: PersonaSonicProfile = {
      handoffNotes: [PENTATONIC.C4, PENTATONIC.E4, PENTATONIC.G4],
      noteDurations: [0.1, 0.1, 0.3],
      waveform: 'sine',
      attack: 0.02,
      decay: 0.35,
      reverb: 0.25,
      filterCutoff: 2500,
      gain: 0.2,
      harmonics: [1, 0.25, 0.08],
    };

    await this.playChimeSequence(profile);
  }

  /**
   * Play a disconnect sound (session ending).
   */
  async playDisconnect(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Soft descending "goodbye" chime
    const profile: PersonaSonicProfile = {
      handoffNotes: [PENTATONIC.G4, PENTATONIC.E4, PENTATONIC.C4],
      noteDurations: [0.15, 0.15, 0.4],
      waveform: 'sine',
      attack: 0.03,
      decay: 0.5,
      reverb: 0.35,
      filterCutoff: 1800,
      gain: 0.18,
      harmonics: [1, 0.35, 0.12],
    };

    await this.playChimeSequence(profile);
  }

  /**
   * Play a dramatic entrance sound (special occasions).
   */
  async playDramaticEntrance(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Fuller, more resonant entrance
    const profile: PersonaSonicProfile = {
      handoffNotes: [PENTATONIC.C3, PENTATONIC.G3, PENTATONIC.C4, PENTATONIC.E4, PENTATONIC.G4],
      noteDurations: [0.2, 0.15, 0.15, 0.15, 0.5],
      waveform: 'sine',
      attack: 0.02,
      decay: 0.6,
      reverb: 0.4,
      filterCutoff: 2500,
      gain: 0.25,
      harmonics: [1, 0.4, 0.2, 0.08],
    };

    await this.playChimeSequence(profile);
  }

  /**
   * Get the sonic profile for a persona.
   */
  private getPersonaProfile(personaId: string): PersonaSonicProfile {
    // Normalize persona ID (remove suffixes like "-santos", "-taylor")
    const normalizedId = personaId.split('-')[0]?.toLowerCase() ?? personaId.toLowerCase();

    return (PERSONA_PROFILES[normalizedId] ?? DEFAULT_PROFILE) as PersonaSonicProfile;
  }

  /**
   * Play a sequence of chime notes.
   */
  private async playChimeSequence(profile: PersonaSonicProfile): Promise<void> {
    const ctx = this.audioContext;
    if (!ctx) return;

    const { handoffNotes, noteDurations, waveform, attack, decay, reverb, filterCutoff, gain, harmonics } =
      profile;

    let currentTime = ctx.currentTime;

    for (let i = 0; i < handoffNotes.length; i++) {
      const frequency = handoffNotes[i];
      const duration = noteDurations[i] ?? 0.2;

      if (frequency !== undefined) {
        this.playNote(ctx, frequency, currentTime, duration, {
          waveform,
          attack,
          decay,
          reverb,
          filterCutoff,
          gain,
          harmonics,
        });
      }

      currentTime += duration * 0.8; // Slight overlap for smoothness
    }

    // Wait for the sequence to complete
    const totalDuration = noteDurations.reduce((sum, d) => sum + d, 0);
    await new Promise((resolve) => setTimeout(resolve, totalDuration * 1000 + 200));
  }

  /**
   * Play a single note with the specified parameters.
   */
  private playNote(
    ctx: AudioContext,
    frequency: number,
    startTime: number,
    duration: number,
    options: {
      waveform: OscillatorType;
      attack: number;
      decay: number;
      reverb: number;
      filterCutoff: number;
      gain: number;
      harmonics?: number[];
    }
  ): void {
    const { waveform, attack, decay, filterCutoff, gain: noteGain, harmonics } = options;

    // Create gain node for volume envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(noteGain, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + attack + decay);

    // Create filter for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterCutoff, startTime);
    filter.Q.setValueAtTime(0.5, startTime);

    // Connect: oscillators -> filter -> gain -> destination
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Create oscillators (fundamental + harmonics)
    const oscillators: OscillatorNode[] = [];

    if (harmonics && harmonics.length > 0) {
      // Play with harmonic overtones for richness
      harmonics.forEach((harmonicGain, index) => {
        if (harmonicGain <= 0) return;

        const osc = ctx.createOscillator();
        osc.type = waveform;
        osc.frequency.setValueAtTime(frequency * (index + 1), startTime);

        // Individual gain for this harmonic
        const harmonicGainNode = ctx.createGain();
        harmonicGainNode.gain.setValueAtTime(harmonicGain, startTime);

        osc.connect(harmonicGainNode);
        harmonicGainNode.connect(filter);

        osc.start(startTime);
        osc.stop(startTime + duration + decay);

        oscillators.push(osc);
      });
    } else {
      // Simple single oscillator
      const osc = ctx.createOscillator();
      osc.type = waveform;
      osc.frequency.setValueAtTime(frequency, startTime);
      osc.connect(filter);
      osc.start(startTime);
      osc.stop(startTime + duration + decay);
      oscillators.push(osc);
    }

    // Cleanup after note completes
    setTimeout(
      () => {
        oscillators.forEach((osc) => {
          try {
            osc.disconnect();
          } catch {
            /* already disconnected */
          }
        });
        try {
          gainNode.disconnect();
          filter.disconnect();
        } catch {
          /* already disconnected */
        }
      },
      (startTime - ctx.currentTime + duration + decay + 0.5) * 1000
    );
  }

  /**
   * Check if procedural sounds are available.
   */
  isAvailable(): boolean {
    return typeof window !== 'undefined' && (!!window.AudioContext || !!(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
      this.audioContext = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const proceduralSounds = new ProceduralSoundsService();

/**
 * Type for sound effect names that can be played procedurally.
 */
export type ProceduralSoundEffect =
  | 'connect'
  | 'disconnect'
  | 'dramatic-entrance'
  | 'cameo-arrive'
  | 'cameo-return'
  | `handoff-to-${string}`;

/**
 * Play a procedural sound by effect name.
 * This is the main API for playing sounds.
 */
export async function playProceduralSound(effect: ProceduralSoundEffect): Promise<void> {
  // Handle different sound types
  if (effect === 'connect') {
    return proceduralSounds.playConnect();
  }
  if (effect === 'disconnect') {
    return proceduralSounds.playDisconnect();
  }
  if (effect === 'dramatic-entrance') {
    return proceduralSounds.playDramaticEntrance();
  }
  if (effect === 'cameo-arrive') {
    return proceduralSounds.playCameoArrive();
  }
  if (effect === 'cameo-return') {
    return proceduralSounds.playCameoReturn();
  }

  // Handle handoff sounds
  if (effect.startsWith('handoff-to-')) {
    const personaId = effect.replace('handoff-to-', '');
    return proceduralSounds.playHandoffSound(personaId);
  }

  log.warn(`Unknown procedural sound effect: ${effect}`);
}

