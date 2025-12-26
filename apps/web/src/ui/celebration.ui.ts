/**
 * Celebration UI Component
 *
 * Creates beautiful, multi-sensory celebration moments that
 * combine visuals, sound, and haptics for maximum delight.
 *
 * @module @ferni/celebration
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getFerniAudioEngine } from '../services/ferni-audio.service.js';
import { getGlowController } from '../services/glow-controller.service.js';
import { getHapticsService } from '../services/haptics.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('CelebrationUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type CelebrationType =
  | 'small_win' // Quick acknowledgment
  | 'big_win' // Major achievement
  | 'milestone' // Significant progress
  | 'streak' // Consistency reward
  | 'team_unlock' // New persona available
  | 'first_meeting' // Meeting a new persona
  | 'deep_moment'; // Emotional breakthrough

export interface CelebrationConfig {
  type: CelebrationType;
  title?: string;
  subtitle?: string;
  emoji?: string;
  duration?: number;
  showConfetti?: boolean;
  hapticPattern?: string;
  soundId?: string;
}

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  size: number;
  element: HTMLElement;
}

// ============================================================================
// CELEBRATION PRESETS
// ============================================================================

// ============================================================================
// ZEN CELEBRATION PRESETS - Warm, human, not game-like
// No confetti. No fanfares. Just gentle acknowledgment.
// ============================================================================

const CELEBRATION_PRESETS: Record<CelebrationType, Partial<CelebrationConfig>> = {
  small_win: {
    duration: DURATION.SLOW, // 300ms - quick acknowledgment
    showConfetti: false,
    hapticPattern: 'softTap', // Gentle tap only
    soundId: undefined, // No sound - haptic only
  },
  big_win: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti - let the moment breathe
    hapticPattern: 'success',
    soundId: undefined, // No sound
  },
  milestone: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti
    hapticPattern: 'success',
    soundId: undefined, // No sound - visual + haptic only
  },
  streak: {
    duration: DURATION.CELEBRATION, // 800ms
    showConfetti: false, // No confetti
    hapticPattern: 'success',
    soundId: undefined, // No sound
  },
  team_unlock: {
    duration: DURATION.CELEBRATION, // 800ms (was 3000!)
    showConfetti: false, // No confetti
    hapticPattern: 'warmWelcome',
    soundId: 'notification.gentle', // Keep gentle notification for unlocks
  },
  first_meeting: {
    duration: DURATION.DELIBERATE, // 500ms
    showConfetti: false,
    hapticPattern: 'warmWelcome',
    soundId: undefined, // Silent
  },
  deep_moment: {
    duration: DURATION.DELIBERATE, // 500ms
    showConfetti: false,
    hapticPattern: 'empathy',
    soundId: undefined, // Silent - let the emotional moment speak
  },
};

// ============================================================================
// CONFETTI COLORS (Ferni brand palette)
// ============================================================================

const CONFETTI_COLORS = [
  '#4a6741', // Ferni sage
  '#9a7b5a', // Jack cedar
  '#3a6b73', // Peter teal
  '#5a6b8a', // Alex indigo
  '#a67a6a', // Maya terracotta
  '#c4856a', // Jordan coral
  '#F5F1E8', // Cream accent
];

// ============================================================================
// CELEBRATION UI
// ============================================================================

export class CelebrationUI {
  private container: HTMLElement | null = null;
  private confettiCanvas: HTMLCanvasElement | null = null;
  private confettiParticles: ConfettiParticle[] = [];
  private confettiAnimationFrame: number | null = null;
  private isShowing: boolean = false;

  constructor() {
    this.cleanupOrphanedElements();
    this.createContainer();
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.ferni-celebration-container').forEach((el) => el.remove());
    document.querySelectorAll('.ferni-confetti-canvas').forEach((el) => el.remove());
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'ferni-celebration-container';
    this.container.setAttribute('aria-live', 'polite');

    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: 'var(--z-tooltip)',
      overflow: 'hidden',
    });

    document.body.appendChild(this.container);
    log.debug('Celebration container created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Show a celebration
   */
  async celebrate(config: CelebrationConfig): Promise<void> {
    if (this.isShowing) {
      log.debug('Celebration already showing, queuing');
      await this.waitForCurrent();
    }

    this.isShowing = true;

    const preset = CELEBRATION_PRESETS[config.type];
    const fullConfig: CelebrationConfig = {
      ...preset,
      ...config,
    };

    log.info('Showing celebration', { type: config.type, title: config.title });

    // Start multi-sensory experience
    await Promise.all([
      this.playSound(fullConfig.soundId),
      this.playHaptic(fullConfig.hapticPattern),
      this.showVisuals(fullConfig),
      this.triggerGlow(),
    ]);

    this.isShowing = false;
  }

  /**
   * Quick celebration helper
   */
  async smallWin(title?: string): Promise<void> {
    await this.celebrate({ type: 'small_win', title });
  }

  async bigWin(title?: string, subtitle?: string): Promise<void> {
    await this.celebrate({ type: 'big_win', title, subtitle });
  }

  async milestone(title: string, subtitle?: string): Promise<void> {
    await this.celebrate({ type: 'milestone', title, subtitle });
  }

  async streak(count: number): Promise<void> {
    await this.celebrate({
      type: 'streak',
      title: `${count} day streak!`,
      subtitle: "You're on a roll!",
    });
  }

  async teamUnlock(personaName: string): Promise<void> {
    await this.celebrate({
      type: 'team_unlock',
      title: `Meet ${personaName}!`,
      subtitle: 'A new friend has joined your team',
    });
  }

  // ==========================================================================
  // AUDIO
  // ==========================================================================

  private async playSound(soundId?: string): Promise<void> {
    if (!soundId) return;

    try {
      const audio = getFerniAudioEngine();
      await audio.play(soundId);
    } catch (error) {
      log.warn('Failed to play celebration sound', { soundId, error });
    }
  }

  // ==========================================================================
  // HAPTICS
  // ==========================================================================

  private async playHaptic(pattern?: string): Promise<void> {
    if (!pattern) return;

    try {
      const haptics = getHapticsService();
      haptics.play(pattern);
    } catch (error) {
      log.warn('Failed to play celebration haptic', { pattern, error });
    }
  }

  // ==========================================================================
  // GLOW
  // ==========================================================================

  private async triggerGlow(): Promise<void> {
    try {
      const glow = getGlowController();
      glow.celebrate(DURATION.CELEBRATION);
    } catch (error) {
      log.warn('Failed to trigger glow celebration', { error });
    }
  }

  // ==========================================================================
  // VISUALS
  // ==========================================================================

  private async showVisuals(config: CelebrationConfig): Promise<void> {
    if (!this.container) return;

    const duration = config.duration || DURATION.CELEBRATION;

    // Create celebration card
    const card = this.createCelebrationCard(config);
    this.container.appendChild(card);

    // Animate card in
    await this.animateCardIn(card);

    // Show confetti if enabled
    if (config.showConfetti) {
      this.startConfetti(duration);
    }

    // Wait for display duration
    await this.wait(duration - DURATION.SLOW);

    // Animate card out
    await this.animateCardOut(card);

    // Cleanup
    card.remove();

    if (config.showConfetti) {
      this.stopConfetti();
    }
  }

  private createCelebrationCard(config: CelebrationConfig): HTMLElement {
    const card = document.createElement('div');
    card.className = 'ferni-celebration-card';

    Object.assign(card.style, {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) scale(0.8)',
      opacity: '0',
      padding: 'var(--space-6, 24px) var(--space-8, 32px)',
      background: 'var(--color-background-elevated, #FFFDFB)',
      borderRadius: 'var(--radius-2xl, 24px)',
      boxShadow: 'var(--shadow-2xl), 0 0 60px rgba(74, 103, 65, 0.3)',
      textAlign: 'center',
      maxWidth: '90vw',
      pointerEvents: 'auto',
    });

    // Emoji
    if (config.emoji) {
      const emoji = document.createElement('div');
      emoji.className = 'celebration-emoji';
      emoji.textContent = config.emoji;
      emoji.style.fontSize = '48px';
      emoji.style.marginBottom = '12px';
      card.appendChild(emoji);
    }

    // Title
    if (config.title) {
      const title = document.createElement('h2');
      title.className = 'celebration-title';
      title.textContent = config.title;
      Object.assign(title.style, {
        fontFamily: 'var(--font-display)',
        fontSize: '24px',
        fontWeight: '600',
        color: 'var(--color-text-primary, #2C2520)',
        margin: '0 0 8px 0',
      });
      card.appendChild(title);
    }

    // Subtitle
    if (config.subtitle) {
      const subtitle = document.createElement('p');
      subtitle.className = 'celebration-subtitle';
      subtitle.textContent = config.subtitle;
      Object.assign(subtitle.style, {
        fontFamily: 'var(--font-body)',
        fontSize: '16px',
        color: 'var(--color-text-secondary, #70605a)',
        margin: '0',
      });
      card.appendChild(subtitle);
    }

    return card;
  }

  private async animateCardIn(card: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      card.animate(
        [
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.SPRING,
          fill: 'forwards',
        }
      ).onfinish = () => resolve();
    });
  }

  private async animateCardOut(card: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      card.animate(
        [
          { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
          { opacity: 0, transform: 'translate(-50%, -50%) scale(0.95) translateY(-20px)' },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      ).onfinish = () => resolve();
    });
  }

  // ==========================================================================
  // CONFETTI
  // ==========================================================================

  private startConfetti(duration: number): void {
    if (!this.container) return;

    // Create canvas
    this.confettiCanvas = document.createElement('canvas');
    this.confettiCanvas.className = 'ferni-confetti-canvas';
    this.confettiCanvas.width = window.innerWidth;
    this.confettiCanvas.height = window.innerHeight;

    Object.assign(this.confettiCanvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    });

    this.container.appendChild(this.confettiCanvas);

    // Create particles
    this.confettiParticles = this.createConfettiParticles(50);

    // Start animation
    this.animateConfetti();

    // Schedule stop
    trackedTimeout(() => this.fadeOutConfetti(), duration - 500);
  }

  private createConfettiParticles(count: number): ConfettiParticle[] {
    const particles: ConfettiParticle[] = [];

    for (let i = 0; i < count; i++) {
      const element = document.createElement('div');
      element.className = 'confetti-particle';

      const size = 8 + Math.random() * 8;
      const color =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] || '#4a6741';

      Object.assign(element.style, {
        position: 'absolute',
        width: `${size}px`,
        height: `${size * 0.6}px`,
        background: color,
        borderRadius: '2px',
        pointerEvents: 'none',
      });

      particles.push({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
        y: window.innerHeight / 2,
        vx: (Math.random() - 0.5) * 15,
        vy: -10 - Math.random() * 10,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20,
        color,
        size,
        element,
      });

      this.container?.appendChild(element);
    }

    return particles;
  }

  private animateConfetti(): void {
    const gravity = 0.3;
    const friction = 0.99;

    const tick = () => {
      for (const particle of this.confettiParticles) {
        particle.vy += gravity;
        particle.vx *= friction;
        particle.vy *= friction;

        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.rotationSpeed;

        particle.element.style.transform = `translate(${particle.x}px, ${particle.y}px) rotate(${particle.rotation}deg)`;
      }

      // Remove particles that are off screen
      this.confettiParticles = this.confettiParticles.filter((p) => {
        if (p.y > window.innerHeight + 50) {
          p.element.remove();
          return false;
        }
        return true;
      });

      if (this.confettiParticles.length > 0) {
        this.confettiAnimationFrame = requestAnimationFrame(tick);
      }
    };

    this.confettiAnimationFrame = requestAnimationFrame(tick);
  }

  private fadeOutConfetti(): void {
    for (const particle of this.confettiParticles) {
      particle.element.style.transition = 'opacity 0.5s ease-out';
      particle.element.style.opacity = '0';
    }
  }

  private stopConfetti(): void {
    if (this.confettiAnimationFrame !== null) {
      cancelAnimationFrame(this.confettiAnimationFrame);
      this.confettiAnimationFrame = null;
    }

    for (const particle of this.confettiParticles) {
      particle.element.remove();
    }
    this.confettiParticles = [];

    this.confettiCanvas?.remove();
    this.confettiCanvas = null;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => trackedTimeout(resolve, ms));
  }

  private async waitForCurrent(): Promise<void> {
    while (this.isShowing) {
      await this.wait(100);
    }
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  destroy(): void {
    this.stopConfetti();
    this.container?.remove();
    this.container = null;
    log.debug('Celebration UI destroyed');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let celebrationUIInstance: CelebrationUI | null = null;

export function getCelebrationUI(): CelebrationUI {
  if (!celebrationUIInstance) {
    celebrationUIInstance = new CelebrationUI();
  }
  return celebrationUIInstance;
}

export function resetCelebrationUI(): void {
  if (celebrationUIInstance) {
    celebrationUIInstance.destroy();
  }
  celebrationUIInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const celebrate = (config: CelebrationConfig) => getCelebrationUI().celebrate(config);
export const smallWin = (title?: string) => getCelebrationUI().smallWin(title);
export const bigWin = (title?: string, subtitle?: string) =>
  getCelebrationUI().bigWin(title, subtitle);
export const milestone = (title: string, subtitle?: string) =>
  getCelebrationUI().milestone(title, subtitle);
export const streak = (count: number) => getCelebrationUI().streak(count);
export const teamUnlock = (personaName: string) => getCelebrationUI().teamUnlock(personaName);
