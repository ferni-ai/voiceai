/**
 * Ferni Celebration Component
 *
 * Orchestrates celebration sequences for achievements, streaks,
 * and special moments.
 *
 * Features:
 * - Confetti effects
 * - Sound integration
 * - Haptic feedback
 * - Multiple intensity levels
 * - Sequence orchestration
 */

// ============================================================================
// Types
// ============================================================================

export type CelebrationType = 'small_win' | 'big_win' | 'streak' | 'team_unlock' | 'deep_moment';

export interface CelebrationOptions {
  /** Type determines intensity */
  type?: CelebrationType;
  /** Custom message to display */
  message?: string;
  /** Show confetti */
  confetti?: boolean;
  /** Play sound */
  sound?: boolean;
  /** Trigger haptic feedback */
  haptic?: boolean;
  /** Duration in ms */
  duration?: number;
  /** Callback when complete */
  onComplete?: () => void;
  /** Target persona colors */
  personaId?: string;
}

interface ConfettiParticle {
  element: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CELEBRATION_CONFIG: Record<
  CelebrationType,
  {
    confetti: boolean;
    particleCount: number;
    duration: number;
    soundKey: string;
    hapticPattern: string;
  }
> = {
  small_win: {
    confetti: false,
    particleCount: 0,
    duration: 600,
    soundKey: 'celebration.small',
    hapticPattern: 'success',
  },
  big_win: {
    confetti: true,
    particleCount: 50,
    duration: 1500,
    soundKey: 'celebration.big',
    hapticPattern: 'celebration',
  },
  streak: {
    confetti: true,
    particleCount: 30,
    duration: 1200,
    soundKey: 'celebration.streak',
    hapticPattern: 'success',
  },
  team_unlock: {
    confetti: true,
    particleCount: 60,
    duration: 2000,
    soundKey: 'celebration.teamUnlock',
    hapticPattern: 'celebration',
  },
  deep_moment: {
    confetti: false,
    particleCount: 0,
    duration: 2000,
    soundKey: 'notification.gentle',
    hapticPattern: 'empathy',
  },
};

const PERSONA_COLORS: Record<string, string[]> = {
  ferni: ['#4a6741', '#5a8050', '#3d5a35', '#FFD700'],
  peter: ['#3a6b73', '#4a8b95', '#2d5359', '#FFD700'],
  alex: ['#5a6b8a', '#7a8baa', '#4a5a73', '#FFD700'],
  maya: ['#a67a6a', '#c69a8a', '#8a635a', '#FFD700'],
  jordan: ['#c4856a', '#e4a58a', '#a86d55', '#FFD700'],
  nayan: ['#b8956a', '#d8b58a', '#9a7a52', '#FFD700'],
  default: ['#4a6741', '#FFD700', '#c4856a', '#3a6b73'],
};

// ============================================================================
// Celebration Manager
// ============================================================================

class CelebrationManager {
  private container: HTMLElement | null = null;
  private particles: ConfettiParticle[] = [];
  private animationFrame: number | null = null;
  private isActive = false;

  // ==========================================================================
  // Main Trigger
  // ==========================================================================

  celebrate(options: CelebrationOptions = {}): void {
    const type = options.type || 'small_win';
    const config = CELEBRATION_CONFIG[type];

    const opts: Required<CelebrationOptions> = {
      type,
      message: options.message || '',
      confetti: options.confetti ?? config.confetti,
      sound: options.sound ?? true,
      haptic: options.haptic ?? true,
      duration: options.duration ?? config.duration,
      onComplete: options.onComplete || (() => {}),
      personaId: options.personaId || 'default',
    };

    // Don't overlap celebrations
    if (this.isActive) {
      this.cleanup();
    }
    this.isActive = true;

    // Execute celebration
    if (opts.confetti && config.particleCount > 0) {
      this.showConfetti(config.particleCount, opts.duration, opts.personaId);
    }

    if (opts.sound) {
      this.playSound(config.soundKey);
    }

    if (opts.haptic) {
      this.triggerHaptic(config.hapticPattern);
    }

    if (opts.message) {
      this.showMessage(opts.message, opts.duration);
    }

    // Cleanup after duration
    setTimeout(() => {
      this.cleanup();
      opts.onComplete();
    }, opts.duration);
  }

  // ==========================================================================
  // Confetti
  // ==========================================================================

  private showConfetti(count: number, duration: number, personaId: string): void {
    this.ensureContainer();
    const colors = PERSONA_COLORS[personaId] || PERSONA_COLORS.default;

    // Create particles
    for (let i = 0; i < count; i++) {
      const particle = this.createParticle(colors);
      this.particles.push(particle);
      this.container!.appendChild(particle.element);
    }

    // Start animation
    this.animateParticles();
  }

  private createParticle(colors: string[]): ConfettiParticle {
    const el = document.createElement('div');
    el.className = 'ferni-confetti-particle';

    const size = 8 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = Math.random() > 0.5 ? '50%' : '0';

    Object.assign(el.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      background: color,
      borderRadius: shape,
      pointerEvents: 'none',
    });

    // Start from center-top
    const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 200;
    const startY = window.innerHeight * 0.3;

    return {
      element: el,
      x: startX,
      y: startY,
      vx: (Math.random() - 0.5) * 15,
      vy: -10 - Math.random() * 10,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      opacity: 1,
    };
  }

  private animateParticles(): void {
    const gravity = 0.4;
    const friction = 0.99;

    const animate = () => {
      let allGone = true;

      for (const p of this.particles) {
        // Apply physics
        p.vy += gravity;
        p.vx *= friction;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        // Fade out as it falls
        if (p.y > window.innerHeight * 0.7) {
          p.opacity -= 0.02;
        }

        // Update element
        if (p.opacity > 0 && p.y < window.innerHeight + 100) {
          allGone = false;
          p.element.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg)`;
          p.element.style.opacity = String(p.opacity);
        } else {
          p.element.remove();
        }
      }

      // Continue or stop
      if (!allGone) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.particles = [];
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  // ==========================================================================
  // Message
  // ==========================================================================

  private showMessage(message: string, duration: number): void {
    const el = document.createElement('div');
    el.className = 'ferni-celebration-message';
    el.textContent = message;

    Object.assign(el.style, {
      position: 'fixed',
      top: '40%',
      left: '50%',
      transform: 'translate(-50%, -50%) scale(0.8)',
      fontSize: '32px',
      fontWeight: '700',
      color: '#2C2520',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      textAlign: 'center',
      opacity: '0',
      transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      zIndex: '10001',
      textShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      pointerEvents: 'none',
    });

    document.body.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // Animate out
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, -50%) scale(0.9)';
      setTimeout(() => el.remove(), 400);
    }, duration - 400);
  }

  // ==========================================================================
  // Sound
  // ==========================================================================

  private playSound(key: string): void {
    // Try to play sound (requires sound system integration)
    const event = new CustomEvent('ferni:play-sound', { detail: { key } });
    window.dispatchEvent(event);
  }

  // ==========================================================================
  // Haptics
  // ==========================================================================

  private triggerHaptic(pattern: string): void {
    // Try to trigger haptic (requires haptic system integration)
    const event = new CustomEvent('ferni:haptic', { detail: { pattern } });
    window.dispatchEvent(event);

    // Fallback: use Vibration API if available
    if ('vibrate' in navigator) {
      switch (pattern) {
        case 'success':
          navigator.vibrate([50, 50, 50]);
          break;
        case 'celebration':
          navigator.vibrate([100, 50, 100, 50, 100]);
          break;
        case 'empathy':
          navigator.vibrate([200, 100, 200]);
          break;
      }
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private ensureContainer(): void {
    if (this.container && document.body.contains(this.container)) {
      return;
    }

    // Cleanup orphaned containers
    document.querySelectorAll('.ferni-celebration-container').forEach((el) => el.remove());

    this.container = document.createElement('div');
    this.container.className = 'ferni-celebration-container';
    Object.assign(this.container.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '10000',
      overflow: 'hidden',
    });

    document.body.appendChild(this.container);
  }

  private cleanup(): void {
    this.isActive = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    for (const p of this.particles) {
      p.element.remove();
    }
    this.particles = [];

    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  smallWin(message?: string): void {
    this.celebrate({ type: 'small_win', message });
  }

  bigWin(message?: string): void {
    this.celebrate({ type: 'big_win', message });
  }

  streak(days: number): void {
    const message = `${days} day streak!`;
    this.celebrate({ type: 'streak', message });
  }

  teamUnlock(personaId: string, personaName: string): void {
    this.celebrate({
      type: 'team_unlock',
      message: `${personaName} joined your team!`,
      personaId,
    });
  }

  deepMoment(): void {
    this.celebrate({ type: 'deep_moment' });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const celebration = new CelebrationManager();

export { CelebrationManager };
export default celebration;
