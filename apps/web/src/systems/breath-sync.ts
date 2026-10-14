/**
 * Breath Synchronization System
 *
 * Everything in Ferni breathes. This system provides a global breath rhythm
 * that can be synced to user breathing (detected from voice) or run ambient.
 *
 * The breath phase (0-1) drives subtle animations throughout the UI:
 * - Avatar rise/fall
 * - Glass surface expansion
 * - Ambient motion speed
 * - Color intensity pulses
 */

import { prefersReducedMotion } from '../config/animation-constants.js';
import { createFrameLoop, type FrameLoop } from '../utils/frame-loop.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BreathSync');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BreathState {
  /** Current phase: 0 = exhale complete, 0.5 = inhale peak, 1 = exhale complete */
  phase: number;

  /** Breaths per minute (typical human: 12-20, calm: 12-14, stressed: 20+) */
  rate: number;

  /** Depth of breath: 0 = shallow, 1 = deep */
  depth: number;

  /** Source of breath timing */
  source: 'ambient' | 'detected' | 'guided';

  /** Timestamp of last update */
  timestamp: number;
}

export interface BreathConfig {
  /** Default breath rate in BPM */
  baseRate: number;

  /** Natural variation in timing (0.1 = ±10%) */
  variability: number;

  /** Whether to modulate based on emotional state */
  emotionalModulation: boolean;

  /** Whether to attempt voice-based breath detection */
  voiceDetection: boolean;
}

type BreathListener = (state: BreathState) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: BreathConfig = {
  baseRate: 14, // Calm, centered breathing
  variability: 0.08, // 8% natural variation
  emotionalModulation: true,
  voiceDetection: true,
};

/** Breath rates for different emotional states */
const EMOTIONAL_BREATH_RATES: Record<string, number> = {
  calm: 12,
  centered: 14,
  engaged: 16,
  excited: 18,
  stressed: 20,
  anxious: 22,
};

// ─────────────────────────────────────────────────────────────────────────────
// Breath Sync Manager
// ─────────────────────────────────────────────────────────────────────────────

class BreathSyncManager {
  private config: BreathConfig;
  private state: BreathState;
  private listeners: Set<BreathListener> = new Set();
  /** Pushes the phase to subscribers; idle when nobody subscribes. */
  private loop: FrameLoop | null = null;
  private startTime: number = 0;

  // For natural variation
  private phaseOffset: number = 0;
  private nextVariationTime: number = 0;

  constructor(config: Partial<BreathConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      phase: 0,
      rate: this.config.baseRate,
      depth: 0.7,
      source: 'ambient',
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * The phase is a pure function of time, computed when read. The frame loop
   * only pushes it to subscribers, so with none (or with reduced motion, or a
   * hidden page) nothing runs per frame.
   */
  start(): void {
    if (this.loop) return;

    this.startTime = performance.now();
    this.nextVariationTime = this.startTime + this.getNextVariationInterval();
    this.updateCSSProperties();
    this.loop = createFrameLoop(this.tick, () => this.listeners.size > 0 && !prefersReducedMotion());
    this.loop.wake();
  }

  stop(): void {
    this.loop?.dispose();
    this.loop = null;
  }

  /** True while the per-frame loop is scheduled. */
  isLooping(): boolean {
    return this.loop?.isRunning() ?? false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Access
  // ─────────────────────────────────────────────────────────────────────────

  getState(): Readonly<BreathState> {
    this.advance(performance.now());
    return { ...this.state };
  }

  getPhase(): number {
    this.advance(performance.now());
    return this.state.phase;
  }

  getRate(): number {
    return this.state.rate;
  }

  /** Get cycle duration in milliseconds */
  getCycleDuration(): number {
    return (60 / this.state.rate) * 1000;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // External Input
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Update breath rate based on detected emotion
   */
  setEmotionalState(emotion: string): void {
    if (!this.config.emotionalModulation) return;

    const targetRate = EMOTIONAL_BREATH_RATES[emotion] ?? this.config.baseRate;

    // Smoothly transition to new rate over ~3 breath cycles
    this.transitionToRate(targetRate, 3);
  }

  /**
   * Sync to detected breath from voice analysis
   */
  syncToDetected(detectedPhase: number, confidence: number): void {
    if (!this.config.voiceDetection) return;
    if (confidence < 0.6) return; // Only sync on confident detection

    // Blend detected phase with current, weighted by confidence
    const blendedPhase = this.state.phase * (1 - confidence * 0.3) + detectedPhase * (confidence * 0.3);

    this.state = {
      ...this.state,
      phase: blendedPhase,
      source: 'detected',
      timestamp: Date.now(),
    };
  }

  /**
   * Enter guided breathing mode (e.g., for breathing exercises)
   */
  setGuidedBreathing(rate: number, depth: number = 1): void {
    this.state = {
      ...this.state,
      rate,
      depth,
      source: 'guided',
      timestamp: Date.now(),
    };
    this.updateCSSProperties();
  }

  /**
   * Return to ambient breathing
   */
  returnToAmbient(): void {
    this.transitionToRate(this.config.baseRate, 2);
    this.state.source = 'ambient';
    this.state.depth = 0.7;
    this.updateCSSProperties();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Listeners
  // ─────────────────────────────────────────────────────────────────────────

  subscribe(listener: BreathListener): () => void {
    this.listeners.add(listener);
    this.loop?.wake();
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Animation Loop
  // ─────────────────────────────────────────────────────────────────────────

  private tick = (): void => {
    this.advance(performance.now());
    this.notifyListeners();
  };

  /** Bring the phase up to `now`. */
  private advance(now: number): void {
    const elapsed = now - this.startTime;

    // Apply natural variation periodically
    if (now >= this.nextVariationTime) {
      this.applyNaturalVariation();
      this.nextVariationTime = now + this.getNextVariationInterval();
    }

    // Calculate phase using sine wave for smooth breathing curve
    // Phase 0 = exhale complete, 0.5 = inhale peak, 1 = exhale complete
    const cycleDuration = this.getCycleDuration();
    const cyclePosition = ((elapsed + this.phaseOffset) % cycleDuration) / cycleDuration;

    // Use sine for natural breath curve (0-1-0 over cycle)
    // Offset by -π/2 so we start at 0 (exhale)
    const phase = (Math.sin(cyclePosition * Math.PI * 2 - Math.PI / 2) + 1) / 2;

    this.state = {
      ...this.state,
      phase,
      timestamp: Date.now(),
    };
  }

  private notifyListeners(): void {
    const stateCopy = { ...this.state };
    this.listeners.forEach(listener => {
      try {
        listener(stateCopy);
      } catch (e) {
        log.error('Listener error:', e);
      }
    });
  }

  /**
   * Mirror the slow-changing breath values to :root, only when they change.
   * The per-frame phase is not mirrored: a custom property on :root changes
   * the computed style of every element, so writing one each frame re-ran
   * style for the whole document (~2,000 elements) 60 times a second, and no
   * stylesheet read it. Per-frame consumers subscribe() instead.
   */
  private updateCSSProperties(): void {
    this.setRootVar('--breath-rate-ms', `${Math.round(this.getCycleDuration())}ms`);
    this.setRootVar('--breath-depth', this.state.depth.toFixed(2));
  }

  private setRootVar(name: string, value: string): void {
    // Reading the inline declaration does not compute style, so this is cheap
    const { style } = document.documentElement;
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Variation Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private applyNaturalVariation(): void {
    if (this.state.source === 'guided') return; // No variation in guided mode

    // Add small random offset to phase for natural feel
    const variation = (Math.random() - 0.5) * 2 * this.config.variability;
    this.phaseOffset += variation * this.getCycleDuration();
  }

  private getNextVariationInterval(): number {
    // Vary every 2-4 breath cycles
    return this.getCycleDuration() * (2 + Math.random() * 2);
  }

  private transitionToRate(targetRate: number, cycles: number): void {
    const currentRate = this.state.rate;
    const duration = this.getCycleDuration() * cycles;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out for smooth landing
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      this.state.rate = currentRate + (targetRate - currentRate) * easedProgress;
      this.updateCSSProperties();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let instance: BreathSyncManager | null = null;

export function initBreathSync(config?: Partial<BreathConfig>): BreathSyncManager {
  if (!instance) {
    instance = new BreathSyncManager(config);
    instance.start();
  }
  return instance;
}

export function getBreathSync(): BreathSyncManager {
  if (!instance) {
    return initBreathSync();
  }
  return instance;
}

export function destroyBreathSync(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage
// ─────────────────────────────────────────────────────────────────────────────

/*
CSS can read --breath-rate-ms and --breath-depth (on :root, written on change).
For per-frame motion, subscribe and write to the element you animate, or use a
CSS animation with duration var(--breath-rate-ms):

getBreathSync().subscribe((state) => {
  // Custom animation logic based on state.phase
});
*/
