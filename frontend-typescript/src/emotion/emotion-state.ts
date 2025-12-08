/**
 * 🎭 Emotion State Machine
 * 
 * Central emotion management for Ferni's character-level animation system.
 * All visual feedback (avatar, ring, glow, waveform) reacts to this state.
 * 
 * Design Philosophy:
 * - Single source of truth for emotional state
 * - Smooth transitions between emotions (never jarring)
 * - Brand-compliant colors from design tokens
 * - Persona-aware emotion palettes
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('EmotionState');

// ============================================================================
// TYPES
// ============================================================================

export type EmotionId = 
  | 'neutral'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'calm'
  | 'sad'
  | 'frustrated'
  | 'listening'
  | 'speaking';

export interface EmotionColor {
  /** Ring/glow primary color - CSS variable or hex */
  primary: string;
  /** Shadow/glow color with alpha */
  glow: string;
  /** Glow intensity 0-1 */
  intensity: number;
}

export interface BreathingParams {
  /** Breaths per minute (human range: 12-20) */
  rate: number;
  /** Squash/stretch depth (0.98-1.04 range) */
  depth: number;
  /** Breathing rhythm pattern */
  rhythm: 'regular' | 'irregular' | 'sighing';
}

export interface MovementParams {
  /** Overall movement intensity 0-1 */
  energy: number;
  /** Animation speed multiplier */
  speed: number;
  /** Random micro-movement amount */
  jitter: number;
}

export interface WaveformParams {
  /** 9-bar height curve (0-1 for each bar) */
  shape: number[];
  /** Response to volume peaks */
  bounce: number;
  /** How quickly bars settle */
  smoothing: number;
}

export interface QuirkParams {
  /** Blinks per minute */
  blinkRate: number;
  /** Enable curious head tilts */
  curiousTilts: boolean;
  /** Enable warmth pulse effects */
  warmthPulses: boolean;
}

export interface EmotionState {
  id: EmotionId;
  color: EmotionColor;
  breathing: BreathingParams;
  movement: MovementParams;
  waveform: WaveformParams;
  quirks: QuirkParams;
}

export interface TransitionOptions {
  /** Transition duration in seconds */
  duration?: number;
  /** Easing function name */
  ease?: string;
  /** Callback when transition completes */
  onComplete?: () => void;
}

// ============================================================================
// EMOTION PRESETS - Brand-Compliant Colors
// ============================================================================

export const EMOTIONS: Record<EmotionId, EmotionState> = {
  neutral: {
    id: 'neutral',
    color: {
      primary: 'var(--persona-primary)',
      glow: 'var(--persona-glow)',
      intensity: 0.3,
    },
    breathing: { rate: 14, depth: 1.015, rhythm: 'regular' },
    movement: { energy: 0.3, speed: 1.0, jitter: 0.02 },
    waveform: {
      shape: [0.3, 0.5, 0.7, 0.85, 1.0, 0.85, 0.7, 0.5, 0.3],
      bounce: 0,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 15, curiousTilts: true, warmthPulses: false },
  },

  happy: {
    id: 'happy',
    color: {
      primary: 'var(--color-highlight, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.4)',
      intensity: 0.5,
    },
    breathing: { rate: 16, depth: 1.02, rhythm: 'regular' },
    movement: { energy: 0.6, speed: 1.1, jitter: 0.05 },
    // SMILE shape - edges up like corners of mouth
    waveform: {
      shape: [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9],
      bounce: 0.15,
      smoothing: 0.08,
    },
    quirks: { blinkRate: 12, curiousTilts: true, warmthPulses: true },
  },

  excited: {
    id: 'excited',
    color: {
      primary: 'var(--color-jordan, #c4856a)',
      glow: 'rgba(196, 133, 106, 0.5)',
      intensity: 0.7,
    },
    breathing: { rate: 20, depth: 1.03, rhythm: 'irregular' },
    movement: { energy: 0.9, speed: 1.4, jitter: 0.1 },
    // ALL HIGH with bounce
    waveform: {
      shape: [0.85, 0.95, 1.0, 0.9, 1.0, 0.9, 1.0, 0.95, 0.85],
      bounce: 0.3,
      smoothing: 0.05,
    },
    quirks: { blinkRate: 18, curiousTilts: false, warmthPulses: true },
  },

  curious: {
    id: 'curious',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.4)',
      intensity: 0.4,
    },
    breathing: { rate: 15, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.5, speed: 0.9, jitter: 0.03 },
    // Slightly raised in middle - attentive
    waveform: {
      shape: [0.4, 0.5, 0.65, 0.8, 0.9, 0.8, 0.65, 0.5, 0.4],
      bounce: 0.08,
      smoothing: 0.12,
    },
    quirks: { blinkRate: 10, curiousTilts: true, warmthPulses: false },
  },

  thinking: {
    id: 'thinking',
    color: {
      primary: 'var(--color-alex, #5a6b8a)',
      glow: 'rgba(90, 107, 138, 0.35)',
      intensity: 0.35,
    },
    breathing: { rate: 12, depth: 1.01, rhythm: 'sighing' },
    movement: { energy: 0.2, speed: 0.7, jitter: 0.01 },
    // Pulsing, contemplative
    waveform: {
      shape: [0.4, 0.5, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4],
      bounce: 0.05,
      smoothing: 0.15,
    },
    quirks: { blinkRate: 8, curiousTilts: false, warmthPulses: false },
  },

  calm: {
    id: 'calm',
    color: {
      primary: 'var(--color-ferni, #4a6741)',
      glow: 'rgba(74, 103, 65, 0.3)',
      intensity: 0.25,
    },
    breathing: { rate: 10, depth: 1.012, rhythm: 'regular' },
    movement: { energy: 0.15, speed: 0.6, jitter: 0.005 },
    // Gentle even wave
    waveform: {
      shape: [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5],
      bounce: 0.02,
      smoothing: 0.2,
    },
    quirks: { blinkRate: 12, curiousTilts: false, warmthPulses: true },
  },

  sad: {
    id: 'sad',
    color: {
      primary: 'var(--color-peter, #3a6b73)',
      glow: 'rgba(58, 107, 115, 0.25)',
      intensity: 0.2,
    },
    breathing: { rate: 11, depth: 1.008, rhythm: 'sighing' },
    movement: { energy: 0.1, speed: 0.5, jitter: 0 },
    // FROWN shape - edges down
    waveform: {
      shape: [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2],
      bounce: 0,
      smoothing: 0.25,
    },
    quirks: { blinkRate: 20, curiousTilts: false, warmthPulses: false },
  },

  frustrated: {
    id: 'frustrated',
    color: {
      primary: 'var(--color-error, #a65a52)',
      glow: 'rgba(166, 90, 82, 0.4)',
      intensity: 0.45,
    },
    breathing: { rate: 18, depth: 1.025, rhythm: 'irregular' },
    movement: { energy: 0.7, speed: 1.2, jitter: 0.08 },
    // Jagged peaks
    waveform: {
      shape: [0.3, 0.8, 0.4, 0.9, 0.5, 0.85, 0.35, 0.75, 0.25],
      bounce: 0.12,
      smoothing: 0.06,
    },
    quirks: { blinkRate: 25, curiousTilts: false, warmthPulses: false },
  },

  listening: {
    id: 'listening',
    color: {
      primary: 'var(--color-accent, #C4A265)',
      glow: 'rgba(196, 162, 101, 0.35)',
      intensity: 0.4,
    },
    breathing: { rate: 13, depth: 1.018, rhythm: 'regular' },
    movement: { energy: 0.4, speed: 0.8, jitter: 0.02 },
    // Receptive, open shape
    waveform: {
      shape: [0.5, 0.6, 0.7, 0.8, 0.85, 0.8, 0.7, 0.6, 0.5],
      bounce: 0.1,
      smoothing: 0.1,
    },
    quirks: { blinkRate: 14, curiousTilts: true, warmthPulses: false },
  },

  speaking: {
    id: 'speaking',
    color: {
      primary: 'var(--persona-primary)',
      glow: 'var(--persona-glow)',
      intensity: 0.5,
    },
    breathing: { rate: 16, depth: 1.02, rhythm: 'irregular' },
    movement: { energy: 0.6, speed: 1.0, jitter: 0.04 },
    // Active, expressive
    waveform: {
      shape: [0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4],
      bounce: 0.2,
      smoothing: 0.06,
    },
    quirks: { blinkRate: 16, curiousTilts: false, warmthPulses: false },
  },
};

// ============================================================================
// EMOTION STATE MANAGER
// ============================================================================

type EmotionListener = (emotion: EmotionState, previous: EmotionState) => void;

class EmotionStateManager {
  private current: EmotionState = EMOTIONS.neutral;
  private previous: EmotionState = EMOTIONS.neutral;
  private listeners: Set<EmotionListener> = new Set();
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null;
  
  /**
   * Get current emotion state
   */
  get emotion(): EmotionState {
    return this.current;
  }
  
  /**
   * Get previous emotion state (for transitions)
   */
  get previousEmotion(): EmotionState {
    return this.previous;
  }
  
  /**
   * Set emotion with optional transition
   */
  setEmotion(emotionId: EmotionId, options?: TransitionOptions): void {
    const newEmotion = EMOTIONS[emotionId];
    if (!newEmotion) {
      log.warn(`Unknown emotion: ${emotionId}`);
      return;
    }
    
    if (this.current.id === emotionId) {
      return; // Already in this emotion
    }
    
    log.debug(`Emotion transition: ${this.current.id} → ${emotionId}`);
    
    this.previous = this.current;
    this.current = newEmotion;
    
    // Notify listeners
    this.notifyListeners();
    
    // Handle onComplete callback
    if (options?.onComplete) {
      const duration = (options.duration ?? 0.8) * 1000;
      this.transitionTimeout = setTimeout(options.onComplete, duration);
    }
  }
  
  /**
   * Flash an emotion temporarily, then return to previous
   */
  flashEmotion(emotionId: EmotionId, durationMs: number = 2000): void {
    const returnTo = this.current.id;
    
    this.setEmotion(emotionId);
    
    // Clear any existing timeout
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }
    
    this.transitionTimeout = setTimeout(() => {
      this.setEmotion(returnTo);
    }, durationMs);
  }
  
  /**
   * Subscribe to emotion changes
   */
  subscribe(listener: EmotionListener): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current state
    listener(this.current, this.previous);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }
  
  /**
   * Notify all listeners of emotion change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.current, this.previous);
      } catch (error) {
        log.error('Emotion listener error:', error);
      }
    });
  }
  
  /**
   * Clean up
   */
  dispose(): void {
    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }
    this.listeners.clear();
    this.current = EMOTIONS.neutral;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const emotionState = new EmotionStateManager();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export function setEmotion(emotionId: EmotionId, options?: TransitionOptions): void {
  emotionState.setEmotion(emotionId, options);
}

// Alias for backward compatibility
export const transitionEmotion = setEmotion;

export function flashEmotion(emotionId: EmotionId, durationMs?: number): void {
  emotionState.flashEmotion(emotionId, durationMs);
}

export function getCurrentEmotion(): EmotionState {
  return emotionState.emotion;
}

export function subscribeToEmotion(listener: EmotionListener): () => void {
  return emotionState.subscribe(listener);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default emotionState;

