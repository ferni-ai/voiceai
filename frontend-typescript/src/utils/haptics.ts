/**
 * Ferni Haptics Utility
 * 
 * Provides meaningful touch feedback for emotional connection.
 * Uses design system tokens for consistent haptic patterns across personas.
 * 
 * Usage:
 *   import { haptics } from '../utils/haptics';
 *   haptics.tap();
 *   haptics.persona('ferni').speaking();
 *   haptics.emotional('empathy');
 */

import { createLogger } from './logger.js';

const log = createLogger('Haptics');

// =============================================================================
// TYPES
// =============================================================================

export type HapticIntensity = 1 | 2 | 3 | 4 | 5;

export interface HapticPattern {
  duration: number;
  intensity: HapticIntensity | HapticIntensity[];
  waveform?: number[];
  gap?: number;
  repeat?: number;
}

export type PersonaId = 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';
export type EmotionalState = 'empathy' | 'encouragement' | 'understanding' | 'concern' | 'celebration' | 'curiosity';

// =============================================================================
// BASE PATTERNS (from design-system/tokens/haptics.json)
// =============================================================================

const BASE_PATTERNS: Record<string, HapticPattern> = {
  tap: { duration: 10, intensity: 2 },
  softTap: { duration: 8, intensity: 1 },
  doubleTap: { duration: 40, intensity: 2, gap: 30 },
  bump: { duration: 20, intensity: 3 },
  click: { duration: 15, intensity: 3 },
};

const ORGANIC_PATTERNS: Record<string, HapticPattern> = {
  ferniBreath: { duration: 300, intensity: 2, waveform: [0.2, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4, 0.2, 0] },
  warmPulse: { duration: 250, intensity: 3, waveform: [0.3, 0.6, 1, 0.6, 0.3, 0] },
  heartbeat: { duration: 800, intensity: [3, 2] as HapticIntensity[], waveform: [0.6, 1, 0, 0, 0.5, 0.8, 0, 0, 0] },
  slowBreath: { duration: 500, intensity: 2 },
  quickBreath: { duration: 200, intensity: 2 },
};

const CELEBRATION_PATTERNS: Record<string, HapticPattern> = {
  smallWin: { duration: 200, intensity: [2, 1, 1] as HapticIntensity[] },
  bigWin: { duration: 400, intensity: [3, 4, 2, 2, 1] as HapticIntensity[] },
  streakAchieved: { duration: 500, intensity: [2, 2, 2, 3] as HapticIntensity[] },
};

// =============================================================================
// PERSONA HAPTIC SIGNATURES
// =============================================================================

interface PersonaHapticSignature {
  signature: string;
  speaking: HapticPattern;
  acknowledgment?: HapticPattern;
  insight?: HapticPattern;
  celebration?: HapticPattern;
}

const PERSONA_HAPTICS: Record<PersonaId, PersonaHapticSignature> = {
  ferni: {
    signature: 'ferniBreath',
    speaking: { duration: 300, intensity: 2 },
    acknowledgment: { duration: 40, intensity: 2, gap: 40 },
    insight: { duration: 300, intensity: 3 },
    celebration: { duration: 250, intensity: 3 },
  },
  peter: {
    signature: 'quickBreath',
    speaking: { duration: 200, intensity: 2 },
    acknowledgment: { duration: 300, intensity: [3, 2, 2, 1] as HapticIntensity[] },
    insight: { duration: 350, intensity: 4 },
  },
  alex: {
    signature: 'warmPulse',
    speaking: { duration: 350, intensity: 2 },
    acknowledgment: { duration: 15, intensity: 2 },
    insight: { duration: 250, intensity: 3 },
  },
  maya: {
    signature: 'steadyRhythm',
    speaking: { duration: 300, intensity: 2 },
    acknowledgment: { duration: 20, intensity: 3 },
    insight: { duration: 400, intensity: [1, 2, 2] as HapticIntensity[] },
  },
  jordan: {
    signature: 'bounce',
    speaking: { duration: 250, intensity: 2 },
    acknowledgment: { duration: 350, intensity: [2, 2, 3, 2] as HapticIntensity[] },
    celebration: { duration: 500, intensity: 4 },
  },
  nayan: {
    signature: 'deepBreath',
    speaking: { duration: 600, intensity: 2 },
    acknowledgment: { duration: 600, intensity: 3 },
    insight: { duration: 400, intensity: 3 },
  },
};

// =============================================================================
// EMOTIONAL HAPTICS
// =============================================================================

const EMOTIONAL_HAPTICS: Record<EmotionalState, HapticPattern> = {
  empathy: { duration: 300, intensity: 3 },
  encouragement: { duration: 200, intensity: 2 },
  understanding: { duration: 500, intensity: 2 },
  concern: { duration: 400, intensity: 2 },
  celebration: { duration: 400, intensity: 3 },
  curiosity: { duration: 180, intensity: 2 },
};

// =============================================================================
// HAPTICS ENGINE
// =============================================================================

class HapticsEngine {
  private enabled: boolean = true;
  private supportsVibration: boolean = false;

  constructor() {
    this.checkSupport();
  }

  private checkSupport(): void {
    if (typeof window === 'undefined') {
      this.supportsVibration = false;
      return;
    }

    // Check Web Vibration API support
    this.supportsVibration = 'vibrate' in navigator;

    // Check for reduced motion preference
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.enabled = false;
      log.debug('Haptics disabled due to prefers-reduced-motion');
    }

    // Check localStorage preference
    if (localStorage.getItem('ferni-haptics-disabled') === 'true') {
      this.enabled = false;
      log.debug('Haptics disabled by user preference');
    }
  }

  /**
   * Enable or disable haptics
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem('ferni-haptics-disabled', enabled ? 'false' : 'true');
    log.info(`Haptics ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if haptics are available and enabled
   */
  isAvailable(): boolean {
    return this.supportsVibration && this.enabled;
  }

  /**
   * Play a haptic pattern
   */
  private play(pattern: HapticPattern): void {
    if (!this.isAvailable()) return;

    try {
      // Convert pattern to vibration sequence
      const sequence = this.patternToVibration(pattern);
      navigator.vibrate(sequence);
      log.debug('Haptic played', { duration: pattern.duration });
    } catch (error) {
      log.warn('Haptic playback failed', error);
    }
  }

  /**
   * Convert a HapticPattern to Web Vibration API sequence
   */
  private patternToVibration(pattern: HapticPattern): number | number[] {
    // Simple duration-based vibration
    if (!pattern.waveform && !pattern.gap) {
      return pattern.duration;
    }

    // Pattern with gap (double-tap style)
    if (pattern.gap) {
      const halfDuration = Math.floor((pattern.duration - pattern.gap) / 2);
      return [halfDuration, pattern.gap, halfDuration];
    }

    // Waveform pattern - simulate with on/off pulses
    if (pattern.waveform) {
      const pulseLength = Math.floor(pattern.duration / pattern.waveform.length);
      const sequence: number[] = [];
      
      pattern.waveform.forEach((intensity, i) => {
        if (intensity > 0.3) {
          sequence.push(pulseLength); // vibrate
        } else {
          sequence.push(0); // pause
        }
        if (i < pattern.waveform!.length - 1) {
          sequence.push(10); // tiny gap between pulses
        }
      });
      
      return sequence;
    }

    return pattern.duration;
  }

  // ===========================================================================
  // BASE INTERACTIONS
  // ===========================================================================

  /** Quick tap - button press, selection */
  tap(): void {
    this.play(BASE_PATTERNS.tap);
  }

  /** Soft tap - toggle off, dismiss */
  softTap(): void {
    this.play(BASE_PATTERNS.softTap);
  }

  /** Double tap - confirmation */
  doubleTap(): void {
    this.play(BASE_PATTERNS.doubleTap);
  }

  /** Bump - toggle on, snap */
  bump(): void {
    this.play(BASE_PATTERNS.bump);
  }

  /** Click - task complete */
  click(): void {
    this.play(BASE_PATTERNS.click);
  }

  // ===========================================================================
  // ORGANIC PATTERNS (Ferni Signature)
  // ===========================================================================

  /** Ferni breath - warm, grounding */
  ferniBreath(): void {
    this.play(ORGANIC_PATTERNS.ferniBreath);
  }

  /** Warm pulse - emotional acknowledgment */
  warmPulse(): void {
    this.play(ORGANIC_PATTERNS.warmPulse);
  }

  /** Heartbeat - connection, love */
  heartbeat(): void {
    this.play(ORGANIC_PATTERNS.heartbeat);
  }

  // ===========================================================================
  // CELEBRATIONS
  // ===========================================================================

  /** Small win - task complete, streak continued */
  smallWin(): void {
    this.play(CELEBRATION_PATTERNS.smallWin);
  }

  /** Big win - milestone, level up */
  bigWin(): void {
    this.play(CELEBRATION_PATTERNS.bigWin);
  }

  /** Streak achieved */
  streak(): void {
    this.play(CELEBRATION_PATTERNS.streakAchieved);
  }

  // ===========================================================================
  // PERSONA-SPECIFIC
  // ===========================================================================

  /**
   * Get persona-specific haptic functions
   */
  persona(id: PersonaId) {
    const signature = PERSONA_HAPTICS[id] || PERSONA_HAPTICS.ferni;

    return {
      /** Play when persona is speaking */
      speaking: () => this.play(signature.speaking),
      
      /** Play for acknowledgment */
      acknowledgment: () => {
        if (signature.acknowledgment) {
          this.play(signature.acknowledgment);
        } else {
          this.doubleTap();
        }
      },
      
      /** Play for insight moment */
      insight: () => {
        if (signature.insight) {
          this.play(signature.insight);
        } else {
          this.warmPulse();
        }
      },
      
      /** Play for celebration */
      celebration: () => {
        if (signature.celebration) {
          this.play(signature.celebration);
        } else {
          this.smallWin();
        }
      },
    };
  }

  // ===========================================================================
  // EMOTIONAL RESPONSES
  // ===========================================================================

  /**
   * Play haptic for emotional state
   */
  emotional(state: EmotionalState): void {
    const pattern = EMOTIONAL_HAPTICS[state];
    if (pattern) {
      this.play(pattern);
    }
  }

  // ===========================================================================
  // CONNECTION EVENTS
  // ===========================================================================

  /** Connection established */
  connectionSuccess(): void {
    this.ferniBreath();
    setTimeout(() => this.doubleTap(), 350);
  }

  /** Connection lost */
  connectionLost(): void {
    this.play({ duration: 300, intensity: [2, 1] as HapticIntensity[] });
  }

  // ===========================================================================
  // ERROR HAPTICS
  // ===========================================================================

  /** Soft error - not alarming */
  error(): void {
    this.doubleTap();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const haptics = new HapticsEngine();

// Also export the class for testing
export { HapticsEngine };

