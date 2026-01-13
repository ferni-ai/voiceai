/**
 * Moment Orchestrator
 *
 * Orchestrates signature moments - multi-phase sequences that combine
 * expressions, animations, colors, audio, and haptics into cohesive
 * emotional experiences.
 *
 * Signature Moments:
 * 1. Recognition - When Ferni remembers something about the user
 * 2. Breakthrough - When the user has a realization or growth moment
 * 3. Holding Space - When the user shares something vulnerable
 * 4. Handoff - When transitioning between personas
 */

import { getExpressionPlayer } from './expression-player.js';
import { getBreathSync } from './breath-sync.js';
import { DURATION, EASING } from '../config/animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MomentPhase {
  name: string;
  duration: number;

  // What happens during this phase
  actions: PhaseAction[];

  // Optional audio cue
  audio?: AudioCue;

  // Optional haptic pattern
  haptic?: HapticPattern;
}

export type PhaseAction =
  | { type: 'expression'; name: string }
  | { type: 'css-class'; target: string; add?: string[]; remove?: string[] }
  | { type: 'css-property'; target: string; property: string; value: string }
  | { type: 'animate'; target: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions }
  | { type: 'color-shift'; warmth?: number; intensity?: number; depth?: number }
  | { type: 'breath-rate'; rate: number }
  | { type: 'callback'; fn: () => void | Promise<void> }
  | { type: 'text-reveal'; target: string; text: string; mode: 'breath' | 'emphasis' | 'profound' };

export interface AudioCue {
  sound: string;
  volume?: number;
  delay?: number;
}

export interface HapticPattern {
  pattern: 'tap' | 'pulse' | 'heartbeat' | 'success' | 'gentle';
  intensity?: number;
}

export interface SignatureMoment {
  name: string;
  description: string;

  // Total duration calculated from phases
  phases: MomentPhase[];

  // Pre-conditions
  canInterrupt: boolean;
  minTimeSinceLast?: number; // ms

  // Cleanup after moment
  cleanup?: () => void;
}

type MomentEventType = 'start' | 'phase' | 'complete' | 'interrupt';
type MomentListener = (event: MomentEventType, moment: SignatureMoment, phase?: MomentPhase) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Signature Moments Definitions
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNATURE_MOMENTS: Record<string, SignatureMoment> = {
  /**
   * RECOGNITION MOMENT
   * When Ferni makes a connection the user didn't expect
   * "I remember you mentioned..." "I noticed a pattern..."
   */
  recognition: {
    name: 'recognition',
    description: 'Ferni recalls something meaningful about the user',
    canInterrupt: true,
    minTimeSinceLast: 30000, // 30 seconds
    phases: [
      {
        name: 'pause',
        duration: 200,
        actions: [
          { type: 'expression', name: 'recognition' },
          { type: 'css-class', target: '.avatar-container', add: ['moment-active'] },
          { type: 'color-shift', intensity: 0.2 },
        ],
      },
      {
        name: 'flash',
        duration: 80,
        actions: [
          { type: 'css-property', target: '.avatar-glow', property: 'opacity', value: '0.6' },
          { type: 'color-shift', warmth: 0.3, intensity: 0.4 },
        ],
        audio: { sound: 'clarity', volume: 0.3 },
      },
      {
        name: 'lean',
        duration: 300,
        actions: [
          {
            type: 'animate',
            target: '.avatar-container',
            keyframes: [
              { transform: 'translateY(0)' },
              { transform: 'translateY(-4px)' },
            ],
            options: { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
          },
        ],
      },
      {
        name: 'reveal',
        duration: 400,
        actions: [
          { type: 'css-class', target: '.insight-reveal', add: ['visible'] },
          {
            type: 'animate',
            target: '.insight-reveal',
            keyframes: [
              { opacity: '0', transform: 'translateY(10px)' },
              { opacity: '1', transform: 'translateY(0)' },
            ],
            options: { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
          },
        ],
      },
      {
        name: 'settle',
        duration: 220,
        actions: [
          { type: 'color-shift', warmth: 0.1, intensity: 0.1, depth: 0 },
          { type: 'css-class', target: '.avatar-container', remove: ['moment-active'] },
          {
            type: 'animate',
            target: '.avatar-container',
            keyframes: [
              { transform: 'translateY(-4px)' },
              { transform: 'translateY(0)' },
            ],
            options: { duration: 220, easing: 'ease-out' },
          },
        ],
      },
    ],
  },

  /**
   * BREAKTHROUGH MOMENT
   * When the user has a realization or growth moment
   * Celebration of insight and progress
   */
  breakthrough: {
    name: 'breakthrough',
    description: 'User experiences a realization or growth moment',
    canInterrupt: true,
    minTimeSinceLast: 60000, // 1 minute
    phases: [
      {
        name: 'build',
        duration: 400,
        actions: [
          { type: 'color-shift', warmth: 0.2, intensity: 0.3 },
          { type: 'css-class', target: '.avatar-container', add: ['moment-breakthrough', 'building'] },
          {
            type: 'animate',
            target: '.avatar-glow',
            keyframes: [
              { transform: 'scale(1)', opacity: '0.1' },
              { transform: 'scale(1.3)', opacity: '0.3' },
            ],
            options: { duration: 400, easing: 'ease-out' },
          },
        ],
      },
      {
        name: 'burst',
        duration: 200,
        actions: [
          { type: 'expression', name: 'joy' },
          { type: 'color-shift', warmth: 0.6, intensity: 0.8 },
          {
            type: 'animate',
            target: '.avatar-glow',
            keyframes: [
              { transform: 'scale(1.3)', opacity: '0.3' },
              { transform: 'scale(2)', opacity: '0.6' },
            ],
            options: { duration: 200, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
          },
          { type: 'css-class', target: '.avatar-container', add: ['burst'], remove: ['building'] },
        ],
        audio: { sound: 'warmth', volume: 0.4 },
        haptic: { pattern: 'success', intensity: 0.7 },
      },
      {
        name: 'cascade',
        duration: 600,
        actions: [
          { type: 'css-class', target: 'body', add: ['breakthrough-ripple'] },
          {
            type: 'animate',
            target: '.breakthrough-ripple-effect',
            keyframes: [
              { transform: 'scale(0)', opacity: '0.5' },
              { transform: 'scale(3)', opacity: '0' },
            ],
            options: { duration: 600, easing: 'ease-out' },
          },
        ],
      },
      {
        name: 'celebration',
        duration: 500,
        actions: [
          { type: 'expression', name: 'joy' },
          { type: 'color-shift', warmth: 0.4, intensity: 0.5 },
          {
            type: 'animate',
            target: '.avatar-container',
            keyframes: [
              { transform: 'translateY(-8px) scale(1.02)' },
              { transform: 'translateY(-4px) scale(1.01)' },
              { transform: 'translateY(-6px) scale(1.015)' },
              { transform: 'translateY(0) scale(1)' },
            ],
            options: { duration: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
          },
        ],
      },
      {
        name: 'ground',
        duration: 300,
        actions: [
          { type: 'color-shift', warmth: 0.15, intensity: 0.2, depth: 0 },
          { type: 'css-class', target: '.avatar-container', remove: ['moment-breakthrough', 'burst'] },
          { type: 'css-class', target: 'body', remove: ['breakthrough-ripple'] },
          {
            type: 'animate',
            target: '.avatar-glow',
            keyframes: [
              { transform: 'scale(1.5)', opacity: '0.4' },
              { transform: 'scale(1)', opacity: '0.1' },
            ],
            options: { duration: 300, easing: 'ease-out' },
          },
        ],
      },
    ],
  },

  /**
   * HOLDING SPACE MOMENT
   * When the user shares something vulnerable
   * Creates intimate, safe atmosphere
   */
  holdingSpace: {
    name: 'holdingSpace',
    description: 'User shares something vulnerable - create safe space',
    canInterrupt: false, // Never interrupt vulnerability
    phases: [
      {
        name: 'soften',
        duration: 500,
        actions: [
          { type: 'expression', name: 'concern' },
          { type: 'color-shift', warmth: 0.1, intensity: -0.2, depth: 0.3 },
          { type: 'css-class', target: 'body', add: ['holding-space'] },
          { type: 'breath-rate', rate: 10 }, // Slow, calming breath
          {
            type: 'animate',
            target: '.ui-chrome',
            keyframes: [
              { opacity: '1' },
              { opacity: '0.5' },
            ],
            options: { duration: 500, easing: 'ease-out' },
          },
        ],
      },
      {
        name: 'cocoon',
        duration: 300,
        actions: [
          { type: 'css-class', target: '.avatar-container', add: ['intimate'] },
          {
            type: 'animate',
            target: '.vignette-overlay',
            keyframes: [
              { opacity: '0' },
              { opacity: '0.3' },
            ],
            options: { duration: 300, easing: 'ease-out', fill: 'forwards' },
          },
        ],
      },
      {
        name: 'presence',
        duration: 0, // Sustained until user-triggered exit
        actions: [
          { type: 'expression', name: 'patience' },
          // Breath sync becomes primary feedback
        ],
      },
    ],
    cleanup: () => {
      // Called when exiting holding space
      document.body.classList.remove('holding-space');
      document.querySelector('.avatar-container')?.classList.remove('intimate');
    },
  },

  /**
   * HANDOFF MOMENT
   * When transitioning between personas
   * Fluid color and character morphing
   */
  handoff: {
    name: 'handoff',
    description: 'Transition from one persona to another',
    canInterrupt: false,
    phases: [
      {
        name: 'acknowledge',
        duration: 300,
        actions: [
          { type: 'expression', name: 'understanding' },
          { type: 'css-class', target: '.avatar-container', add: ['handoff-out'] },
        ],
      },
      {
        name: 'fade-merge',
        duration: 400,
        actions: [
          { type: 'css-class', target: '.avatar-container', add: ['morphing'] },
          {
            type: 'animate',
            target: '.avatar-body',
            keyframes: [
              { opacity: '1', filter: 'blur(0)' },
              { opacity: '0.5', filter: 'blur(4px)' },
            ],
            options: { duration: 200, easing: 'ease-out', fill: 'forwards' },
          },
          // Color blend happens via CSS custom properties
          // The persona change triggers color update externally
        ],
        audio: { sound: 'handoff-blend', volume: 0.25 },
      },
      {
        name: 'emerge',
        duration: 400,
        actions: [
          { type: 'css-class', target: '.avatar-container', remove: ['handoff-out'], add: ['handoff-in'] },
          {
            type: 'animate',
            target: '.avatar-body',
            keyframes: [
              { opacity: '0.5', filter: 'blur(4px)' },
              { opacity: '1', filter: 'blur(0)' },
            ],
            options: { duration: 400, easing: 'ease-out', fill: 'forwards' },
          },
        ],
      },
      {
        name: 'greet',
        duration: 400,
        actions: [
          { type: 'expression', name: 'greeting' },
          { type: 'css-class', target: '.avatar-container', remove: ['morphing', 'handoff-in'] },
          { type: 'color-shift', warmth: 0.2, intensity: 0.2 },
        ],
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Moment Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

class MomentOrchestrator {
  private activeMoment: SignatureMoment | null = null;
  private activePhaseIndex: number = -1;
  private phaseTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastMomentTimes: Map<string, number> = new Map();
  private listeners: Set<MomentListener> = new Set();

  // External systems
  private audioManager: AudioManager | null = null;
  private hapticManager: HapticManager | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
  }

  setHapticManager(manager: HapticManager): void {
    this.hapticManager = manager;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Play a signature moment
   */
  async play(name: string): Promise<boolean> {
    const moment = SIGNATURE_MOMENTS[name];
    if (!moment) {
      console.warn(`[MomentOrchestrator] Unknown moment: ${name}`);
      return false;
    }

    // Check cooldown
    const lastTime = this.lastMomentTimes.get(name) ?? 0;
    const now = Date.now();
    if (moment.minTimeSinceLast && now - lastTime < moment.minTimeSinceLast) {
      console.debug(`[MomentOrchestrator] Moment ${name} on cooldown`);
      return false;
    }

    // Check if we can interrupt current
    if (this.activeMoment) {
      if (!this.activeMoment.canInterrupt) {
        console.debug(`[MomentOrchestrator] Cannot interrupt ${this.activeMoment.name}`);
        return false;
      }
      this.interrupt();
    }

    // Start moment
    this.activeMoment = moment;
    this.lastMomentTimes.set(name, now);
    this.notifyListeners('start', moment);

    // Play phases sequentially
    for (let i = 0; i < moment.phases.length; i++) {
      if (this.activeMoment !== moment) break; // Interrupted

      this.activePhaseIndex = i;
      const phase = moment.phases[i];
      if (!phase) continue; // Skip if phase is somehow undefined

      this.notifyListeners('phase', moment, phase);
      await this.playPhase(phase);
    }

    // Complete
    if (this.activeMoment === moment) {
      this.notifyListeners('complete', moment);
      this.activeMoment = null;
      this.activePhaseIndex = -1;
    }

    return true;
  }

  /**
   * Exit holding space moment (user-triggered)
   */
  async exitHoldingSpace(duration: number = 800): Promise<void> {
    if (this.activeMoment?.name !== 'holdingSpace') return;

    const moment = this.activeMoment;

    // Gradual exit animation
    await this.playPhase({
      name: 'emerge',
      duration,
      actions: [
        { type: 'breath-rate', rate: 14 }, // Return to normal
        { type: 'color-shift', warmth: 0, intensity: 0, depth: 0 },
        {
          type: 'animate',
          target: '.vignette-overlay',
          keyframes: [
            { opacity: '0.3' },
            { opacity: '0' },
          ],
          options: { duration, easing: 'ease-out', fill: 'forwards' },
        },
        {
          type: 'animate',
          target: '.ui-chrome',
          keyframes: [
            { opacity: '0.5' },
            { opacity: '1' },
          ],
          options: { duration, easing: 'ease-out', fill: 'forwards' },
        },
      ],
    });

    // Cleanup
    moment.cleanup?.();
    this.activeMoment = null;
    this.notifyListeners('complete', moment);
  }

  /**
   * Interrupt current moment
   */
  interrupt(): void {
    if (!this.activeMoment) return;

    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
      this.phaseTimeout = null;
    }

    this.notifyListeners('interrupt', this.activeMoment);
    this.activeMoment.cleanup?.();
    this.activeMoment = null;
    this.activePhaseIndex = -1;
  }

  /**
   * Check if a moment is currently playing
   */
  isPlaying(): boolean {
    return this.activeMoment !== null;
  }

  /**
   * Get current moment name
   */
  getCurrentMoment(): string | null {
    return this.activeMoment?.name ?? null;
  }

  /**
   * Subscribe to moment events
   */
  subscribe(listener: MomentListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase Execution
  // ─────────────────────────────────────────────────────────────────────────

  private async playPhase(phase: MomentPhase): Promise<void> {
    // Execute all actions
    const actionPromises = phase.actions.map(action => this.executeAction(action));

    // Play audio if present
    if (phase.audio) {
      this.playAudio(phase.audio);
    }

    // Trigger haptic if present
    if (phase.haptic) {
      this.triggerHaptic(phase.haptic);
    }

    // Wait for phase duration (0 = indefinite, handled externally)
    if (phase.duration > 0) {
      await Promise.all([
        Promise.all(actionPromises),
        new Promise(resolve => {
          this.phaseTimeout = setTimeout(resolve, phase.duration);
        }),
      ]);
    }
  }

  private async executeAction(action: PhaseAction): Promise<void> {
    switch (action.type) {
      case 'expression':
        getExpressionPlayer().play(action.name);
        break;

      case 'css-class': {
        const el = document.querySelector(action.target);
        if (el) {
          action.add?.forEach(cls => el.classList.add(cls));
          action.remove?.forEach(cls => el.classList.remove(cls));
        }
        break;
      }

      case 'css-property': {
        const el = document.querySelector(action.target) as HTMLElement;
        if (el) {
          el.style.setProperty(action.property, action.value);
        }
        break;
      }

      case 'animate': {
        const el = document.querySelector(action.target);
        if (el) {
          await el.animate(action.keyframes, action.options).finished;
        }
        break;
      }

      case 'color-shift':
        this.applyColorShift(action);
        break;

      case 'breath-rate':
        getBreathSync().setGuidedBreathing(action.rate);
        break;

      case 'callback':
        await action.fn();
        break;

      case 'text-reveal':
        // TODO: Implement kinetic typography
        break;
    }
  }

  private applyColorShift(shift: { warmth?: number; intensity?: number; depth?: number }): void {
    const root = document.documentElement;

    if (shift.warmth !== undefined) {
      root.style.setProperty('--emotional-warmth', shift.warmth.toString());
    }
    if (shift.intensity !== undefined) {
      root.style.setProperty('--emotional-intensity', shift.intensity.toString());
    }
    if (shift.depth !== undefined) {
      root.style.setProperty('--emotional-depth', shift.depth.toString());
    }
  }

  private playAudio(cue: AudioCue): void {
    if (!this.audioManager) return;

    setTimeout(() => {
      this.audioManager?.play(cue.sound, cue.volume ?? 1);
    }, cue.delay ?? 0);
  }

  private triggerHaptic(pattern: HapticPattern): void {
    if (!this.hapticManager) return;
    this.hapticManager.play(pattern.pattern, pattern.intensity ?? 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Listeners
  // ─────────────────────────────────────────────────────────────────────────

  private notifyListeners(event: MomentEventType, moment: SignatureMoment, phase?: MomentPhase): void {
    this.listeners.forEach(listener => {
      try {
        listener(event, moment, phase);
      } catch (e) {
        console.error('[MomentOrchestrator] Listener error:', e);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio & Haptic Interfaces (to be implemented separately)
// ─────────────────────────────────────────────────────────────────────────────

interface AudioManager {
  play(sound: string, volume?: number): void;
}

interface HapticManager {
  play(pattern: string, intensity?: number): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let instance: MomentOrchestrator | null = null;

export function getMomentOrchestrator(): MomentOrchestrator {
  if (!instance) {
    instance = new MomentOrchestrator();
  }
  return instance;
}

export function destroyMomentOrchestrator(): void {
  if (instance) {
    instance.interrupt();
    instance = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function playRecognitionMoment(): Promise<boolean> {
  return getMomentOrchestrator().play('recognition');
}

export async function playBreakthroughMoment(): Promise<boolean> {
  return getMomentOrchestrator().play('breakthrough');
}

export async function enterHoldingSpace(): Promise<boolean> {
  return getMomentOrchestrator().play('holdingSpace');
}

export async function exitHoldingSpace(): Promise<void> {
  return getMomentOrchestrator().exitHoldingSpace();
}

export async function playHandoffMoment(): Promise<boolean> {
  return getMomentOrchestrator().play('handoff');
}
