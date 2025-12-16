/**
 * Streak Celebrations UI
 *
 * Pixar-inspired celebration animations for streak milestones.
 * These are warm, human moments - not gamified confetti bombs.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses shared components from engagement-components.ts
 * - Uses CSS variables from tokens.css
 * - Uses DURATION from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Warm, zen-inspired particle effects
 */

import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { STREAK_MILESTONES, getStreakMilestoneMessage } from './engagement-components.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('Celebrations');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface StreakCelebration {
  type: 'sparkles' | 'glow' | 'fireworks';
  milestone: number; // 3, 7, 14, 21, 30, 60, 90, 100, 365
  personaId?: string;
  message?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
  life: number;
  maxLife: number;
}

// ============================================================================
// MILESTONE CONFIGURATIONS
// Using golden ratio-inspired particle counts (Fibonacci sequence)
// ============================================================================

const MILESTONE_CONFIG: Record<number, { type: StreakCelebration['type']; particles: number; duration: number }> = {
  3: { type: 'sparkles', particles: 8, duration: DURATION.CELEBRATION },
  7: { type: 'sparkles', particles: 13, duration: DURATION.CELEBRATION },
  14: { type: 'glow', particles: 21, duration: DURATION.ENTRANCE },
  21: { type: 'glow', particles: 34, duration: DURATION.ENTRANCE },
  30: { type: 'fireworks', particles: 55, duration: DURATION.GLACIAL },
  60: { type: 'fireworks', particles: 89, duration: DURATION.GLACIAL },
  90: { type: 'fireworks', particles: 144, duration: DURATION.GLACIAL },
  100: { type: 'fireworks', particles: 233, duration: DURATION.GLACIAL },
  365: { type: 'fireworks', particles: 377, duration: DURATION.GLACIAL * 1.5 },
};

/**
 * Warm, zen-inspired colors
 * These map to our design system's semantic colors
 */
const PARTICLE_COLORS = [
  'rgba(212, 168, 74, 1)',   // Gold accent (celebration)
  'rgba(107, 196, 143, 1)',  // Success green (growth)
  'rgba(192, 168, 130, 1)',  // Warm cedar (warmth)
  'rgba(224, 213, 200, 1)',  // Cream (calm)
  'rgba(166, 124, 53, 1)',   // Warm amber (energy)
];

// ============================================================================
// STREAK CELEBRATIONS CLASS
// ============================================================================

class StreakCelebrationsUI {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private animationFrame: number | null = null;
  private isActive = false;
  private onCompleteCallback: (() => void) | null = null;

  /**
   * Play a streak celebration
   * @param streak - The streak count
   * @param _personaId - Optional persona ID for future persona-specific colors
   * @param centerElement - Optional element to center the celebration on
   * @param onComplete - Optional callback when celebration finishes
   */
  celebrate(
    streak: number,
    _personaId?: string,
    centerElement?: HTMLElement,
    onComplete?: () => void
  ): void {
    // Skip if reduced motion is preferred
    if (prefersReducedMotion()) {
      log.debug(`[Celebration] Skipping animation (reduced motion) for ${streak}-day streak`);
      onComplete?.();
      return;
    }

    // Find the configuration for this milestone
    const config = this.getConfigForMilestone(streak);
    if (!config) {
      log.debug(`[Celebration] No celebration configured for ${streak}-day streak`);
      onComplete?.();
      return;
    }

    this.onCompleteCallback = onComplete ?? null;
    this.initialize();

    // Get center point
    const center = this.getCenterPoint(centerElement);

    // Create particles based on celebration type
    switch (config.type) {
      case 'sparkles':
        this.createSparkles(center.x, center.y, config.particles);
        break;
      case 'glow':
        this.createGlow(center.x, center.y, config.particles);
        break;
      case 'fireworks':
        this.createFireworks(center.x, center.y, config.particles);
        break;
    }

    // Start animation
    this.isActive = true;
    this.animate();

    // Get humanized milestone message
    const message = getStreakMilestoneMessage(streak);
    if (message) {
      log.debug(`[Celebration] ${message}`);
    }

    // Stop after duration
    trackedTimeout(() => {
      this.stop();
    }, config.duration);

    log.debug(
      `[Celebration] Playing ${config.type} for ${streak}-day streak (${config.particles} particles)`
    );
  }

  /**
   * Stop the celebration
   */
  stop(): void {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.particles = [];
    this.clearCanvas();
    
    // Fire completion callback
    if (this.onCompleteCallback) {
      this.onCompleteCallback();
      this.onCompleteCallback = null;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private initialize(): void {
    if (this.canvas) return;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'streak-celebration-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: var(--z-celebration, 9999);
    `;
    document.body.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private getCenterPoint(element?: HTMLElement): { x: number; y: number } {
    if (element) {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  private getConfigForMilestone(streak: number): (typeof MILESTONE_CONFIG)[number] | null {
    // Find exact match or closest lower milestone
    const milestones = Object.keys(MILESTONE_CONFIG)
      .map(Number)
      .sort((a, b) => b - a);
    for (const milestone of milestones) {
      if (streak >= milestone) {
        return MILESTONE_CONFIG[milestone] ?? null;
      }
    }
    return null;
  }

  private getRandomColor(): string {
    const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
    return color ?? PARTICLE_COLORS[0] ?? 'rgba(212, 168, 74, 1)';
  }

  // ============================================================================
  // PARTICLE GENERATORS
  // Each type creates a different emotional response
  // ============================================================================

  /**
   * Sparkles: Quick, light celebration (early milestones)
   * Small particles bursting outward with slight upward drift
   */
  private createSparkles(cx: number, cy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 3;
      const life = DURATION.CELEBRATION + Math.random() * DURATION.SLOW;

      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // Slight upward bias
        size: 3 + Math.random() * 4,
        opacity: 1,
        color: this.getRandomColor(),
        life,
        maxLife: life,
      });
    }
  }

  /**
   * Glow: Warm, expanding aura (medium milestones)
   * Larger soft particles with a sparkle ring
   */
  private createGlow(cx: number, cy: number, count: number): void {
    // Central glow - soft, warm particles
    for (let i = 0; i < count / 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 50;
      const life = DURATION.ENTRANCE + Math.random() * DURATION.MODERATE;

      this.particles.push({
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.5 - Math.random() * 0.5,
        size: 8 + Math.random() * 12,
        opacity: 0.4 + Math.random() * 0.4,
        color: this.getRandomColor(),
        life,
        maxLife: life,
      });
    }

    // Sparkle ring - crisp particles at the edges
    for (let i = 0; i < (count * 2) / 3; i++) {
      const angle = (Math.PI * 2 * i) / ((count * 2) / 3);
      const distance = 60 + Math.random() * 40;
      const life = DURATION.DELIBERATE + Math.random() * DURATION.SLOW;

      this.particles.push({
        x: cx + Math.cos(angle) * distance,
        y: cy + Math.sin(angle) * distance,
        vx: Math.cos(angle) * 0.5,
        vy: Math.sin(angle) * 0.5 - 0.3,
        size: 2 + Math.random() * 3,
        opacity: 1,
        color: this.getRandomColor(),
        life,
        maxLife: life,
      });
    }
  }

  /**
   * Fireworks: Multiple cascading bursts (major milestones)
   * Multiple delayed explosions across the screen
   */
  private createFireworks(cx: number, cy: number, count: number): void {
    // Multiple burst points
    const burstCount = Math.floor(count / 30);
    for (let b = 0; b < burstCount; b++) {
      // Delayed bursts create a cascading effect
      trackedTimeout(() => {
        const bx = cx + (Math.random() - 0.5) * 300;
        const by = cy + (Math.random() - 0.5) * 200 - 50;
        const burstParticles = Math.floor(count / burstCount);

        for (let i = 0; i < burstParticles; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 5;
          const life = DURATION.CELEBRATION + Math.random() * DURATION.MODERATE;

          this.particles.push({
            x: bx,
            y: by,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 2 + Math.random() * 4,
            opacity: 1,
            color: this.getRandomColor(),
            life,
            maxLife: life,
          });
        }
      }, b * 200);
    }
  }

  // ============================================================================
  // ANIMATION LOOP
  // ============================================================================

  private animate(): void {
    if (!this.isActive || !this.ctx || !this.canvas) return;

    this.clearCanvas();

    const gravity = 0.05;
    const friction = 0.98;

    // Update and draw particles
    this.particles = this.particles.filter((p) => {
      // Update physics
      p.vy += gravity;
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 16; // ~60fps

      // Update opacity based on life
      p.opacity = Math.max(0, p.life / p.maxLife);

      // Draw
      if (p.opacity > 0 && this.ctx) {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color.replace('1)', `${p.opacity})`);
        this.ctx.fill();

        // Glow effect
        this.ctx.shadowBlur = p.size * 2;
        this.ctx.shadowColor = p.color;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }

      return p.life > 0;
    });

    // Continue animation if particles remain
    if (this.particles.length > 0 && this.isActive) {
      this.animationFrame = requestAnimationFrame(() => this.animate());
    } else {
      this.stop();
    }
  }

  private clearCanvas(): void {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stop();
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: StreakCelebrationsUI | null = null;

export function getStreakCelebrationsUI(): StreakCelebrationsUI {
  if (!instance) {
    instance = new StreakCelebrationsUI();
  }
  return instance;
}

/**
 * Play a celebration for a streak milestone
 */
export function celebrateStreak(
  streak: number,
  personaId?: string,
  centerElement?: HTMLElement,
  onComplete?: () => void
): void {
  getStreakCelebrationsUI().celebrate(streak, personaId, centerElement, onComplete);
}

/**
 * Check if a streak count is a milestone
 */
export function isStreakMilestone(count: number): boolean {
  return count in STREAK_MILESTONES || Object.keys(MILESTONE_CONFIG).map(Number).includes(count);
}

/**
 * Get the celebration message for a milestone
 */
export function getMilestoneMessage(count: number): string | null {
  return getStreakMilestoneMessage(count);
}

export default StreakCelebrationsUI;
