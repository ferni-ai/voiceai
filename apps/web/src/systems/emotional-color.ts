/**
 * Emotional Color System
 *
 * Dynamic color temperature engine that shifts the entire UI based on
 * emotional state. Colors become warmer during intimate moments, cooler
 * during reflection, more saturated during joy.
 *
 * This goes beyond themes - it's real-time emotional modulation.
 */

import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { createFrameLoop, type FrameLoop } from '../utils/frame-loop.js';
import { getBreathSync } from './breath-sync.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmotionalColorState {
  /** Color temperature: -1 = cool (blue), 0 = neutral, 1 = warm (amber) */
  warmth: number;

  /** Color intensity: 0 = muted/soft, 1 = vivid/saturated */
  intensity: number;

  /** Depth: 0 = light/airy, 1 = deep/rich */
  depth: number;

  /** Glow strength: 0 = none, 1 = full bloom */
  glow: number;

  /** Current dominant emotion */
  emotion: EmotionCategory;

  /** Blend amount with previous state (0-1) */
  blend: number;

  /** Timestamp of last update */
  timestamp: number;
}

export type EmotionCategory =
  | 'neutral'
  | 'joy'
  | 'calm'
  | 'concern'
  | 'excitement'
  | 'tenderness'
  | 'reflection'
  | 'celebration'
  | 'grief'
  | 'anticipation'
  | 'gratitude'
  | 'vulnerability';

export interface EmotionalColorConfig {
  /** Transition duration in ms */
  transitionDuration: number;

  /** Whether to modulate with breath */
  breathModulation: boolean;

  /** Breath modulation intensity (0-1) */
  breathIntensity: number;

  /** Whether to apply ambient subtle shifts */
  ambientShifts: boolean;
}

type ColorListener = (state: EmotionalColorState) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Emotion Mappings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emotional color profiles - how each emotion affects color
 */
const EMOTION_PROFILES: Record<
  EmotionCategory,
  { warmth: number; intensity: number; depth: number; glow: number }
> = {
  neutral: { warmth: 0, intensity: 0.5, depth: 0.5, glow: 0.2 },

  // Warm emotions
  joy: { warmth: 0.6, intensity: 0.8, depth: 0.4, glow: 0.7 },
  excitement: { warmth: 0.7, intensity: 0.9, depth: 0.3, glow: 0.8 },
  celebration: { warmth: 0.8, intensity: 1.0, depth: 0.3, glow: 1.0 },
  tenderness: { warmth: 0.5, intensity: 0.4, depth: 0.6, glow: 0.5 },
  gratitude: { warmth: 0.4, intensity: 0.5, depth: 0.5, glow: 0.6 },

  // Cool emotions
  calm: { warmth: -0.2, intensity: 0.3, depth: 0.6, glow: 0.3 },
  reflection: { warmth: -0.3, intensity: 0.3, depth: 0.7, glow: 0.2 },

  // Deep emotions
  concern: { warmth: 0.3, intensity: 0.4, depth: 0.8, glow: 0.4 },
  grief: { warmth: -0.1, intensity: 0.2, depth: 0.9, glow: 0.1 },
  vulnerability: { warmth: 0.2, intensity: 0.3, depth: 0.8, glow: 0.3 },

  // Alert emotions
  anticipation: { warmth: 0.3, intensity: 0.7, depth: 0.4, glow: 0.5 },
};

/**
 * Base color values for modulation (in HSL format for easier manipulation)
 * These get shifted based on emotional state
 */
const COLOR_BASES = {
  // Warm accent color (gold/amber) - HSL values
  warmAccent: { h: 42, s: 65, l: 55 },

  // Cool accent color (teal) - HSL values
  coolAccent: { h: 185, s: 40, l: 45 },

  // Glow color (warm gold)
  glowWarm: { h: 40, s: 70, l: 60 },

  // Glow color (cool blue)
  glowCool: { h: 200, s: 50, l: 55 },

  // Background warmth shift range
  bgWarmShift: 10, // degrees of hue shift

  // Background saturation range
  bgSatRange: 8, // percentage points
};

// ─────────────────────────────────────────────────────────────────────────────
// Emotional Color Manager
// ─────────────────────────────────────────────────────────────────────────────

class EmotionalColorManager {
  private config: EmotionalColorConfig;
  private state: EmotionalColorState;
  private targetState: EmotionalColorState;
  private listeners: Set<ColorListener> = new Set();

  /** Runs while an emotion transitions (or modulation has subscribers). */
  private loop: FrameLoop | null = null;
  private transitionStartTime: number = 0;
  private previousState: EmotionalColorState | null = null;

  // Ambient variation state
  private ambientPhase: number = 0;
  private ambientDirection: number = 1;

  constructor(config: Partial<EmotionalColorConfig> = {}) {
    this.config = {
      transitionDuration: DURATION.SLOW * 3, // 1.5s transitions
      breathModulation: true,
      breathIntensity: 0.15,
      ambientShifts: true,
      ...config,
    };

    const initial: EmotionalColorState = {
      warmth: 0,
      intensity: 0.5,
      depth: 0.5,
      glow: 0.2,
      emotion: 'neutral',
      blend: 1,
      timestamp: Date.now(),
    };

    this.state = { ...initial };
    this.targetState = { ...initial };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.loop) return;
    this.loop = createFrameLoop(this.tick, () => this.isChanging());
    if (this.tick()) this.loop.wake(); // the first frame writes the initial values
  }

  stop(): void {
    this.loop?.dispose();
    this.loop = null;
  }

  /** Breath and ambient drift only reach subscribers, so they need none here. */
  private isChanging(): boolean {
    const modulated = this.config.breathModulation || this.config.ambientShifts;
    return this.previousState !== null || (modulated && this.listeners.size > 0 && !prefersReducedMotion());
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Set the current emotional state
   * @param emotion The dominant emotion
   * @param intensity Override intensity (0-1), defaults to emotion's natural intensity
   */
  setEmotion(emotion: EmotionCategory, intensity?: number): void {
    const profile = EMOTION_PROFILES[emotion];

    this.previousState = { ...this.state };
    this.transitionStartTime = performance.now();

    this.targetState = {
      warmth: profile.warmth,
      intensity: intensity ?? profile.intensity,
      depth: profile.depth,
      glow: profile.glow,
      emotion,
      blend: 0,
      timestamp: Date.now(),
    };
    this.loop?.wake();
  }

  /**
   * Blend two emotions together
   * @param primary Primary emotion
   * @param secondary Secondary emotion
   * @param ratio Blend ratio (0 = all primary, 1 = all secondary)
   */
  blendEmotions(primary: EmotionCategory, secondary: EmotionCategory, ratio: number): void {
    const p = EMOTION_PROFILES[primary];
    const s = EMOTION_PROFILES[secondary];
    const r = Math.max(0, Math.min(1, ratio));
    const rInv = 1 - r;

    this.previousState = { ...this.state };
    this.transitionStartTime = performance.now();

    this.targetState = {
      warmth: p.warmth * rInv + s.warmth * r,
      intensity: p.intensity * rInv + s.intensity * r,
      depth: p.depth * rInv + s.depth * r,
      glow: p.glow * rInv + s.glow * r,
      emotion: r < 0.5 ? primary : secondary,
      blend: 0,
      timestamp: Date.now(),
    };
    this.loop?.wake();
  }

  /**
   * Trigger a momentary emotional pulse (returns to current after)
   * @param emotion The emotion to pulse
   * @param duration Duration in ms (defaults to 600ms)
   */
  pulseEmotion(emotion: EmotionCategory, duration: number = 600): void {
    const previousEmotion = this.state.emotion;
    this.setEmotion(emotion);

    setTimeout(() => {
      this.setEmotion(previousEmotion);
    }, duration);
  }

  /**
   * Get current color state
   */
  getState(): Readonly<EmotionalColorState> {
    return { ...this.state };
  }

  /**
   * Subscribe to color changes
   */
  subscribe(listener: ColorListener): () => void {
    this.listeners.add(listener);
    this.loop?.wake();
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Animation Loop
  // ─────────────────────────────────────────────────────────────────────────

  private tick = (): boolean => {
    this.interpolateToTarget(performance.now());

    // CSS mirrors the emotion itself, before the per-frame breath and ambient
    // drift, so it changes only during a transition (see setRootVar)
    this.updateCSSProperties();

    if (this.config.breathModulation) this.applyBreathModulation();
    if (this.config.ambientShifts) this.applyAmbientShifts();

    this.notifyListeners();
    return this.isChanging();
  };

  private interpolateToTarget(now: number): void {
    if (!this.previousState) {
      this.state = { ...this.targetState, blend: 1 };
      return;
    }

    const elapsed = now - this.transitionStartTime;
    const progress = Math.min(elapsed / this.config.transitionDuration, 1);

    // Ease out cubic for smooth landing
    const eased = 1 - Math.pow(1 - progress, 3);

    this.state = {
      warmth: this.lerp(this.previousState.warmth, this.targetState.warmth, eased),
      intensity: this.lerp(this.previousState.intensity, this.targetState.intensity, eased),
      depth: this.lerp(this.previousState.depth, this.targetState.depth, eased),
      glow: this.lerp(this.previousState.glow, this.targetState.glow, eased),
      emotion: this.targetState.emotion,
      blend: eased,
      timestamp: Date.now(),
    };

    // Clear previous state when transition complete
    if (progress >= 1) {
      this.previousState = null;
    }
  }

  private applyBreathModulation(): void {
    try {
      const breathSync = getBreathSync();
      const breathPhase = breathSync.getPhase();
      const intensity = this.config.breathIntensity;

      // Subtle warmth pulse with breath
      this.state.warmth += (breathPhase - 0.5) * intensity * 0.1;

      // Subtle glow pulse with breath
      this.state.glow += breathPhase * intensity * 0.15;
    } catch {
      // BreathSync not initialized, skip
    }
  }

  private applyAmbientShifts(): void {
    // Very slow ambient drift (feels alive but not distracting)
    this.ambientPhase += 0.0005 * this.ambientDirection;

    if (this.ambientPhase > 1 || this.ambientPhase < 0) {
      this.ambientDirection *= -1;
    }

    // Tiny warmth drift
    this.state.warmth += Math.sin(this.ambientPhase * Math.PI * 2) * 0.02;
  }

  private updateCSSProperties(): void {
    // Core emotional properties
    this.setRootVar('--emotional-warmth', this.state.warmth.toFixed(3));
    this.setRootVar('--emotional-intensity', this.state.intensity.toFixed(3));
    this.setRootVar('--emotional-depth', this.state.depth.toFixed(3));
    this.setRootVar('--emotional-glow', this.state.glow.toFixed(3));
    this.setRootVar('--emotional-state', this.state.emotion);

    // Calculate derived colors
    this.updateDerivedColors();
  }

  private updateDerivedColors(): void {
    // Accent color shifts based on warmth
    const accentHue = this.lerp(
      COLOR_BASES.coolAccent.h,
      COLOR_BASES.warmAccent.h,
      (this.state.warmth + 1) / 2 // Normalize -1..1 to 0..1
    );

    const accentSat = this.lerp(30, 70, this.state.intensity);
    const accentLit = this.lerp(40, 60, 1 - this.state.depth);

    this.setRootVar(
      '--emotional-accent',
      `hsl(${accentHue.toFixed(1)}, ${accentSat.toFixed(1)}%, ${accentLit.toFixed(1)}%)`
    );

    // Glow color based on warmth
    const glowHue = this.lerp(COLOR_BASES.glowCool.h, COLOR_BASES.glowWarm.h, (this.state.warmth + 1) / 2);
    const glowAlpha = this.state.glow * 0.4;

    this.setRootVar(
      '--emotional-glow-color',
      `hsla(${glowHue.toFixed(1)}, 60%, 55%, ${glowAlpha.toFixed(3)})`
    );

    // Background tint based on warmth and depth
    const bgHueShift = this.state.warmth * COLOR_BASES.bgWarmShift;
    const bgSatShift = (this.state.intensity - 0.5) * COLOR_BASES.bgSatRange;

    this.setRootVar('--emotional-bg-hue-shift', `${bgHueShift.toFixed(1)}deg`);
    this.setRootVar('--emotional-bg-sat-shift', `${bgSatShift.toFixed(1)}%`);

    // Overlay for depth
    const depthOverlay = this.state.depth * 0.08;
    this.setRootVar('--emotional-depth-overlay', `rgba(0, 0, 0, ${depthOverlay.toFixed(3)})`);

    // Highlight brightness based on intensity
    const highlightBrightness = 1 + this.state.intensity * 0.1;
    this.setRootVar('--emotional-highlight-brightness', highlightBrightness.toFixed(3));
  }

  /**
   * A custom property on :root changes the computed style of every element, so
   * each write re-runs style for the whole document. Writing ~11 every frame
   * cost that 60 times a second while idle; write only what changed.
   */
  private setRootVar(name: string, value: string): void {
    // Reading the inline declaration does not compute style, so this is cheap
    const { style } = document.documentElement;
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private notifyListeners(): void {
    const stateCopy = { ...this.state };
    this.listeners.forEach((listener) => {
      try {
        listener(stateCopy);
      } catch (e) {
        console.error('[EmotionalColor] Listener error:', e);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let instance: EmotionalColorManager | null = null;

export function initEmotionalColor(config?: Partial<EmotionalColorConfig>): EmotionalColorManager {
  if (!instance) {
    instance = new EmotionalColorManager(config);
    instance.start();
  }
  return instance;
}

export function getEmotionalColor(): EmotionalColorManager {
  if (!instance) {
    return initEmotionalColor();
  }
  return instance;
}

export function destroyEmotionalColor(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the emotional color state
 */
export function setEmotionalState(emotion: EmotionCategory, intensity?: number): void {
  getEmotionalColor().setEmotion(emotion, intensity);
}

/**
 * Pulse an emotion briefly
 */
export function pulseEmotionalState(emotion: EmotionCategory, duration?: number): void {
  getEmotionalColor().pulseEmotion(emotion, duration);
}

/**
 * Blend two emotions
 */
export function blendEmotionalStates(
  primary: EmotionCategory,
  secondary: EmotionCategory,
  ratio: number
): void {
  getEmotionalColor().blendEmotions(primary, secondary, ratio);
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────────────────────

/*
CSS can read the --emotional-* properties on :root (e.g. box-shadow: 0 0 60px
var(--emotional-glow-color)); they change only while an emotion transitions.
For the per-frame breathing values, subscribe:

getEmotionalColor().subscribe((state) => {
  // Custom logic based on state.warmth, state.intensity, etc.
});
*/
