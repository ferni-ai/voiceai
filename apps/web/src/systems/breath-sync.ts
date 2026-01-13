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

import { DURATION } from '../config/animation-constants.js';

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
  private animationFrame: number | null = null;
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

  start(): void {
    if (this.animationFrame) return;

    this.startTime = performance.now();
    this.nextVariationTime = this.startTime + this.getNextVariationInterval();
    this.tick();
  }

  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Access
  // ─────────────────────────────────────────────────────────────────────────

  getState(): Readonly<BreathState> {
    return { ...this.state };
  }

  getPhase(): number {
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
  }

  /**
   * Return to ambient breathing
   */
  returnToAmbient(): void {
    this.transitionToRate(this.config.baseRate, 2);
    this.state.source = 'ambient';
    this.state.depth = 0.7;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Listeners
  // ─────────────────────────────────────────────────────────────────────────

  subscribe(listener: BreathListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal Animation Loop
  // ─────────────────────────────────────────────────────────────────────────

  private tick = (): void => {
    const now = performance.now();
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

    // Notify listeners
    this.notifyListeners();

    // Update CSS custom properties
    this.updateCSSProperties();

    // Continue loop
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private notifyListeners(): void {
    const stateCopy = { ...this.state };
    this.listeners.forEach(listener => {
      try {
        listener(stateCopy);
      } catch (e) {
        console.error('[BreathSync] Listener error:', e);
      }
    });
  }

  private updateCSSProperties(): void {
    const root = document.documentElement;

    // Core breath properties
    root.style.setProperty('--breath-phase', this.state.phase.toFixed(4));
    root.style.setProperty('--breath-rate-ms', `${this.getCycleDuration()}ms`);
    root.style.setProperty('--breath-depth', this.state.depth.toFixed(2));

    // Derived properties for common use cases
    // Scale: 1.0 at exhale, 1.002 at inhale peak (subtle!)
    const breathScale = 1 + this.state.phase * 0.002 * this.state.depth;
    root.style.setProperty('--breath-scale', breathScale.toFixed(5));

    // Opacity pulse: 0.95 at exhale, 1.0 at inhale
    const breathOpacity = 0.95 + this.state.phase * 0.05 * this.state.depth;
    root.style.setProperty('--breath-opacity', breathOpacity.toFixed(3));

    // Translate for subtle rise/fall: 0 at exhale, -2px at inhale
    const breathTranslateY = -this.state.phase * 2 * this.state.depth;
    root.style.setProperty('--breath-translate-y', `${breathTranslateY.toFixed(2)}px`);
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
// CSS Usage Examples (for reference)
// ─────────────────────────────────────────────────────────────────────────────

/*
Usage in CSS:

.avatar-container {
  transform: translateY(var(--breath-translate-y)) scale(var(--breath-scale));
}

.glass-card {
  transform: scale(var(--breath-scale));
  opacity: var(--breath-opacity);
}

.ambient-glow {
  opacity: calc(0.3 + var(--breath-phase) * 0.1);
}

For more complex animations, subscribe to updates:

import { getBreathSync } from './breath-sync.js';

getBreathSync().subscribe((state) => {
  // Custom animation logic based on state.phase
});
*/
