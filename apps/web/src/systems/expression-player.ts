/**
 * Expression Player System
 *
 * Plays micro-expressions on the avatar with proper timing, queuing,
 * and priority management. Expressions can interrupt, queue, or blend.
 */

import {
  MicroExpression,
  ExpressionTrigger,
  MICRO_EXPRESSIONS,
  getExpressionForTrigger,
  interpolateKeyframes,
} from '../config/micro-expressions.js';
import { DURATION } from '../config/animation-constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface QueuedExpression {
  expression: MicroExpression;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
  callback?: () => void;
}

interface ExpressionTargets {
  leftEye: HTMLElement | null;
  rightEye: HTMLElement | null;
  body: HTMLElement | null;
  glow: HTMLElement | null;
}

interface PlaybackState {
  isPlaying: boolean;
  currentExpression: MicroExpression | null;
  startTime: number;
  progress: number;
}

type ExpressionEventType = 'start' | 'complete' | 'interrupt';
type ExpressionListener = (event: ExpressionEventType, expression: MicroExpression) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Expression Player
// ─────────────────────────────────────────────────────────────────────────────

class ExpressionPlayer {
  private targets: ExpressionTargets = {
    leftEye: null,
    rightEye: null,
    body: null,
    glow: null,
  };

  private queue: QueuedExpression[] = [];
  private playbackState: PlaybackState = {
    isPlaying: false,
    currentExpression: null,
    startTime: 0,
    progress: 0,
  };

  private animationFrame: number | null = null;
  private listeners: Set<ExpressionListener> = new Set();

  // Cooldown to prevent expression spam
  private lastExpressionTime: number = 0;
  private minCooldown: number = 200; // ms between expressions

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Bind to avatar DOM elements
   */
  bindToAvatar(container: HTMLElement): void {
    this.targets = {
      leftEye: container.querySelector('[data-avatar-left-eye]'),
      rightEye: container.querySelector('[data-avatar-right-eye]'),
      body: container.querySelector('[data-avatar-body]'),
      glow: container.querySelector('[data-avatar-glow]'),
    };

    // Fallback: try class-based selectors
    if (!this.targets.leftEye) {
      this.targets.leftEye = container.querySelector('.avatar-eye-left, .avatar-eye:first-child');
    }
    if (!this.targets.rightEye) {
      this.targets.rightEye = container.querySelector('.avatar-eye-right, .avatar-eye:last-child');
    }
    if (!this.targets.body) {
      this.targets.body = container.querySelector('.avatar-body, .avatar-container');
    }
    if (!this.targets.glow) {
      this.targets.glow = container.querySelector('.avatar-glow, .persona-glow');
    }
  }

  /**
   * Check if player is ready
   */
  isReady(): boolean {
    return !!(this.targets.leftEye || this.targets.rightEye || this.targets.body);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Play an expression by name
   */
  play(name: string, callback?: () => void): void {
    const expression = MICRO_EXPRESSIONS[name];
    if (!expression) {
      console.warn(`[ExpressionPlayer] Unknown expression: ${name}`);
      return;
    }
    this.queueExpression(expression, callback);
  }

  /**
   * Play expression triggered by an event
   */
  trigger(trigger: ExpressionTrigger, callback?: () => void): void {
    const expression = getExpressionForTrigger(trigger);
    if (expression) {
      this.queueExpression(expression, callback);
    }
  }

  /**
   * Immediately play an expression, interrupting current
   */
  playImmediate(name: string, callback?: () => void): void {
    const expression = MICRO_EXPRESSIONS[name];
    if (!expression) return;

    // Interrupt current
    if (this.playbackState.isPlaying && this.playbackState.currentExpression) {
      this.notifyListeners('interrupt', this.playbackState.currentExpression);
    }

    // Clear queue and play
    this.queue = [];
    this.startExpression(expression, callback);
  }

  /**
   * Stop all expressions and clear queue
   */
  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.queue = [];
    this.resetToNeutral();

    if (this.playbackState.currentExpression) {
      this.notifyListeners('interrupt', this.playbackState.currentExpression);
    }

    this.playbackState = {
      isPlaying: false,
      currentExpression: null,
      startTime: 0,
      progress: 0,
    };
  }

  /**
   * Get current playback state
   */
  getState(): Readonly<PlaybackState> {
    return { ...this.playbackState };
  }

  /**
   * Subscribe to expression events
   */
  subscribe(listener: ExpressionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queue Management
  // ─────────────────────────────────────────────────────────────────────────

  private queueExpression(expression: MicroExpression, callback?: () => void): void {
    const now = Date.now();

    // Cooldown check
    if (now - this.lastExpressionTime < this.minCooldown) {
      // Skip low priority during cooldown
      if (expression.priority === 'low') return;
    }

    const queued: QueuedExpression = {
      expression,
      priority: expression.priority,
      timestamp: now,
      callback,
    };

    // High priority: interrupt current if playing low/normal
    if (expression.priority === 'high' && this.playbackState.isPlaying) {
      const currentPriority = this.playbackState.currentExpression?.priority ?? 'low';
      if (currentPriority !== 'high') {
        // Interrupt and play immediately
        if (this.playbackState.currentExpression) {
          this.notifyListeners('interrupt', this.playbackState.currentExpression);
        }
        this.startExpression(expression, callback);
        return;
      }
    }

    // Add to queue sorted by priority then timestamp
    this.queue.push(queued);
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp - b.timestamp;
    });

    // Limit queue size
    if (this.queue.length > 5) {
      this.queue = this.queue.slice(0, 5);
    }

    // Start playing if not already
    if (!this.playbackState.isPlaying) {
      this.playNext();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.playbackState.isPlaying = false;
      return;
    }

    const next = this.queue.shift()!;
    this.startExpression(next.expression, next.callback);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Playback
  // ─────────────────────────────────────────────────────────────────────────

  private startExpression(expression: MicroExpression, callback?: () => void): void {
    this.playbackState = {
      isPlaying: true,
      currentExpression: expression,
      startTime: performance.now(),
      progress: 0,
    };

    this.lastExpressionTime = Date.now();
    this.notifyListeners('start', expression);

    // Start animation loop
    const animate = (now: number) => {
      const elapsed = now - this.playbackState.startTime;
      const progress = Math.min(elapsed / expression.duration, 1);
      this.playbackState.progress = progress;

      // Apply transforms
      this.applyExpression(expression, progress);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        // Complete
        this.animationFrame = null;
        this.notifyListeners('complete', expression);
        callback?.();

        // Reset to neutral briefly, then play next
        this.resetToNeutral();

        // Small gap before next expression
        setTimeout(() => {
          this.playNext();
        }, 50);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  private applyExpression(expression: MicroExpression, progress: number): void {
    const { eyes, body, glow, eyeStagger } = expression;

    // Calculate staggered progress for right eye
    const staggerProgress = Math.max(
      0,
      Math.min(1, (progress * expression.duration - eyeStagger) / expression.duration)
    );

    // Apply to left eye
    if (this.targets.leftEye) {
      const scaleX = interpolateKeyframes(eyes.scaleX, progress);
      const scaleY = interpolateKeyframes(eyes.scaleY, progress);
      const translateY = interpolateKeyframes(eyes.translateY, progress);
      const rotation = eyes.rotation ? interpolateKeyframes(eyes.rotation, progress) : 0;

      this.targets.leftEye.style.transform = `
        scaleX(${scaleX})
        scaleY(${scaleY})
        translateY(${translateY}px)
        rotate(${rotation}deg)
      `;
    }

    // Apply to right eye (with stagger)
    if (this.targets.rightEye) {
      const scaleX = interpolateKeyframes(eyes.scaleX, staggerProgress);
      const scaleY = interpolateKeyframes(eyes.scaleY, staggerProgress);
      const translateY = interpolateKeyframes(eyes.translateY, staggerProgress);
      const rotation = eyes.rotation ? interpolateKeyframes(eyes.rotation, staggerProgress) : 0;

      this.targets.rightEye.style.transform = `
        scaleX(${scaleX})
        scaleY(${scaleY})
        translateY(${translateY}px)
        rotate(${-rotation}deg)
      `;
    }

    // Apply to body
    if (this.targets.body) {
      const scale = interpolateKeyframes(body.scale, progress);
      const translateY = interpolateKeyframes(body.translateY, progress);
      const rotation = body.rotation ? interpolateKeyframes(body.rotation, progress) : 0;

      this.targets.body.style.transform = `
        scale(${scale})
        translateY(${translateY}px)
        rotate(${rotation}deg)
      `;
    }

    // Apply to glow
    if (this.targets.glow) {
      const opacity = interpolateKeyframes(glow.opacity, progress);
      const scale = interpolateKeyframes(glow.scale, progress);

      this.targets.glow.style.opacity = opacity.toString();
      this.targets.glow.style.transform = `scale(${scale})`;
    }
  }

  private resetToNeutral(): void {
    if (this.targets.leftEye) {
      this.targets.leftEye.style.transform = '';
    }
    if (this.targets.rightEye) {
      this.targets.rightEye.style.transform = '';
    }
    if (this.targets.body) {
      this.targets.body.style.transform = '';
    }
    if (this.targets.glow) {
      this.targets.glow.style.opacity = '';
      this.targets.glow.style.transform = '';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Listeners
  // ─────────────────────────────────────────────────────────────────────────

  private notifyListeners(event: ExpressionEventType, expression: MicroExpression): void {
    this.listeners.forEach(listener => {
      try {
        listener(event, expression);
      } catch (e) {
        console.error('[ExpressionPlayer] Listener error:', e);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Instance
// ─────────────────────────────────────────────────────────────────────────────

let instance: ExpressionPlayer | null = null;

export function getExpressionPlayer(): ExpressionPlayer {
  if (!instance) {
    instance = new ExpressionPlayer();
  }
  return instance;
}

export function destroyExpressionPlayer(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quick play an expression
 */
export function playExpression(name: string): void {
  getExpressionPlayer().play(name);
}

/**
 * Trigger expression from emotion event
 */
export function triggerExpression(trigger: ExpressionTrigger): void {
  getExpressionPlayer().trigger(trigger);
}
