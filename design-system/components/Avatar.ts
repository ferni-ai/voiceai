/**
 * Ferni Avatar Component
 *
 * A living, breathing avatar with persona colors, glow effects,
 * and Ferni EQ emotional intelligence capabilities.
 *
 * Features:
 * - Continuous breathing animation
 * - Persona-specific colors and glow
 * - Micro-expressions (subliminal emotional feedback)
 * - Active listening (nodding during user speech)
 * - Multiple states (idle, listening, speaking, thinking, celebrating)
 */

// ============================================================================
// Types
// ============================================================================

export type PersonaId = 'ferni' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan';

export type AvatarState =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'celebrating'
  | 'disconnected';

export type MicroExpression =
  | 'recognition'
  | 'concernFlash'
  | 'delightFlash'
  | 'warmthPulse'
  | 'interestFlash';

export interface AvatarOptions {
  /** Persona ID determines colors and animation timing */
  persona?: PersonaId;
  /** Size in pixels */
  size?: number;
  /** Initial state */
  state?: AvatarState;
  /** Enable breathing animation */
  breathing?: boolean;
  /** Enable glow effect */
  glow?: boolean;
  /** Enable micro-expressions */
  microExpressions?: boolean;
  /** Enable active listening (nodding) */
  activeListening?: boolean;
  /** Callback when avatar is clicked */
  onClick?: () => void;
}

// ============================================================================
// Persona Colors (inline for standalone use)
// ============================================================================

const PERSONA_COLORS: Record<PersonaId, { primary: string; secondary: string; glow: string }> = {
  ferni: { primary: '#4a6741', secondary: '#3d5a35', glow: 'rgba(74, 103, 65, 0.4)' },
  peter: { primary: '#3a6b73', secondary: '#2d5359', glow: 'rgba(58, 107, 115, 0.4)' },
  alex: { primary: '#5a6b8a', secondary: '#4a5a73', glow: 'rgba(90, 107, 138, 0.4)' },
  maya: { primary: '#a67a6a', secondary: '#8a635a', glow: 'rgba(166, 122, 106, 0.4)' },
  jordan: { primary: '#c4856a', secondary: '#a86d55', glow: 'rgba(196, 133, 106, 0.4)' },
  nayan: { primary: '#b8956a', secondary: '#9a7a52', glow: 'rgba(184, 149, 106, 0.4)' },
};

// ============================================================================
// Animation Timing by Persona
// ============================================================================

const PERSONA_TIMING: Record<PersonaId, number> = {
  ferni: 1.0,
  peter: 0.85,
  alex: 1.0,
  maya: 0.95,
  jordan: 0.8,
  nayan: 1.1,
};

// ============================================================================
// Micro-Expression Config
// ============================================================================

const MICRO_EXPRESSIONS: Record<MicroExpression, { duration: number; intensity: number }> = {
  recognition: { duration: 80, intensity: 0.4 },
  concernFlash: { duration: 60, intensity: 0.3 },
  delightFlash: { duration: 100, intensity: 0.5 },
  warmthPulse: { duration: 120, intensity: 0.3 },
  interestFlash: { duration: 70, intensity: 0.4 },
};

// ============================================================================
// Avatar Component
// ============================================================================

export class Avatar {
  private container: HTMLElement;
  private avatarEl: HTMLElement;
  private glowEl: HTMLElement;
  private persona: PersonaId;
  private state: AvatarState;
  private options: AvatarOptions;
  private breathingAnimation: Animation | null = null;
  private glowAnimation: Animation | null = null;
  private isDestroyed = false;

  constructor(container: HTMLElement | string, options: AvatarOptions = {}) {
    // Get container element
    if (typeof container === 'string') {
      const el = document.querySelector(container);
      if (!el) throw new Error(`Container not found: ${container}`);
      this.container = el as HTMLElement;
    } else {
      this.container = container;
    }

    // Set defaults
    this.options = {
      persona: 'ferni',
      size: 200,
      state: 'idle',
      breathing: true,
      glow: true,
      microExpressions: true,
      activeListening: true,
      ...options,
    };

    this.persona = this.options.persona!;
    this.state = this.options.state!;

    // Build DOM
    this.avatarEl = this.createAvatarElement();
    this.glowEl = this.createGlowElement();

    // Assemble
    this.container.innerHTML = '';
    this.container.style.position = 'relative';
    this.container.style.display = 'inline-block';
    this.container.appendChild(this.glowEl);
    this.container.appendChild(this.avatarEl);

    // Start animations
    if (this.options.breathing) {
      this.startBreathing();
    }
    if (this.options.glow) {
      this.startGlowPulse();
    }

    // Click handler
    if (this.options.onClick) {
      this.avatarEl.addEventListener('click', this.options.onClick);
      this.avatarEl.style.cursor = 'pointer';
    }
  }

  // ==========================================================================
  // DOM Creation
  // ==========================================================================

  private createAvatarElement(): HTMLElement {
    const colors = PERSONA_COLORS[this.persona];
    const size = this.options.size!;

    const el = document.createElement('div');
    el.className = 'ferni-avatar';
    el.setAttribute('data-persona', this.persona);
    el.setAttribute('data-state', this.state);
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `${this.persona} avatar`);

    Object.assign(el.style, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`,
      position: 'relative',
      zIndex: '1',
      transition: 'transform 0.3s ease, filter 0.3s ease',
    });

    return el;
  }

  private createGlowElement(): HTMLElement {
    const colors = PERSONA_COLORS[this.persona];
    const size = this.options.size!;

    const el = document.createElement('div');
    el.className = 'ferni-avatar-glow';

    Object.assign(el.style, {
      position: 'absolute',
      top: '-15px',
      left: '-15px',
      right: '-15px',
      bottom: '-15px',
      borderRadius: '50%',
      background: colors.glow,
      filter: 'blur(20px)',
      zIndex: '0',
      opacity: '0.6',
    });

    return el;
  }

  // ==========================================================================
  // Animation Methods
  // ==========================================================================

  private startBreathing(): void {
    const timing = PERSONA_TIMING[this.persona];
    const duration = 5000 * timing;

    // Squash & stretch breathing (Pixar-style)
    const keyframes = [
      { transform: 'scale(1) translateY(0)', offset: 0 },
      { transform: 'scale(1.02, 0.99) translateY(-3px)', offset: 0.5 },
      { transform: 'scale(1) translateY(0)', offset: 1 },
    ];

    this.breathingAnimation = this.avatarEl.animate(keyframes, {
      duration,
      iterations: Infinity,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
    });
  }

  private startGlowPulse(): void {
    const timing = PERSONA_TIMING[this.persona];
    const duration = 5000 * timing;

    const keyframes = [
      { opacity: 0.5, transform: 'scale(1)', offset: 0 },
      { opacity: 0.8, transform: 'scale(1.05)', offset: 0.5 },
      { opacity: 0.5, transform: 'scale(1)', offset: 1 },
    ];

    this.glowAnimation = this.glowEl.animate(keyframes, {
      duration,
      iterations: Infinity,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
    });
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  setState(newState: AvatarState): void {
    if (this.isDestroyed) return;

    this.state = newState;
    this.avatarEl.setAttribute('data-state', newState);

    // Adjust breathing based on state
    if (this.breathingAnimation) {
      switch (newState) {
        case 'speaking':
          this.breathingAnimation.playbackRate = 1.5;
          break;
        case 'listening':
          this.breathingAnimation.playbackRate = 1.0;
          break;
        case 'thinking':
          this.breathingAnimation.playbackRate = 0.7;
          break;
        case 'celebrating':
          this.playJoyBounce();
          break;
        case 'disconnected':
          this.breathingAnimation.pause();
          this.avatarEl.style.filter = 'grayscale(50%)';
          break;
        default:
          this.breathingAnimation.playbackRate = 1.0;
          this.avatarEl.style.filter = '';
      }
    }
  }

  setPersona(newPersona: PersonaId): void {
    if (this.isDestroyed) return;

    this.persona = newPersona;
    this.avatarEl.setAttribute('data-persona', newPersona);

    // Update colors
    const colors = PERSONA_COLORS[newPersona];
    this.avatarEl.style.background = `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`;
    this.glowEl.style.background = colors.glow;

    // Update timing
    const timing = PERSONA_TIMING[newPersona];
    if (this.breathingAnimation) {
      this.breathingAnimation.playbackRate = timing;
    }
    if (this.glowAnimation) {
      this.glowAnimation.playbackRate = timing;
    }
  }

  // ==========================================================================
  // Micro-Expressions (Ferni EQ)
  // ==========================================================================

  playMicroExpression(type: MicroExpression): void {
    if (this.isDestroyed || !this.options.microExpressions) return;

    const config = MICRO_EXPRESSIONS[type];

    // Quick flash of glow intensity
    this.glowEl.animate(
      [
        { opacity: 0.6, transform: 'scale(1)' },
        { opacity: 0.6 + config.intensity, transform: 'scale(1.05)' },
        { opacity: 0.6, transform: 'scale(1)' },
      ],
      {
        duration: config.duration,
        easing: 'ease-out',
      }
    );
  }

  // ==========================================================================
  // Active Listening (Nodding)
  // ==========================================================================

  nod(intensity: 'micro' | 'subtle' | 'visible' = 'subtle'): void {
    if (this.isDestroyed || !this.options.activeListening) return;

    const nodConfig = {
      micro: { y: 1.5, duration: 180 },
      subtle: { y: 2.5, duration: 220 },
      visible: { y: 4, duration: 280 },
    };

    const config = nodConfig[intensity];

    this.avatarEl.animate(
      [
        { transform: 'translateY(0)' },
        { transform: `translateY(-${config.y}px)` },
        { transform: 'translateY(0)' },
      ],
      {
        duration: config.duration,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      }
    );
  }

  // ==========================================================================
  // Special Animations
  // ==========================================================================

  playJoyBounce(): void {
    if (this.isDestroyed) return;

    this.avatarEl.animate(
      [
        { transform: 'scale(1) translateY(0)' },
        { transform: 'scale(1.15) translateY(-20px)' },
        { transform: 'scale(0.95) translateY(0)' },
        { transform: 'scale(1.05) translateY(-8px)' },
        { transform: 'scale(1) translateY(0)' },
      ],
      {
        duration: 600,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      }
    );

    // Glow burst
    this.glowEl.animate(
      [
        { opacity: 0.6, transform: 'scale(1)' },
        { opacity: 1, transform: 'scale(1.3)' },
        { opacity: 0.6, transform: 'scale(1)' },
      ],
      {
        duration: 800,
        easing: 'ease-out',
      }
    );
  }

  curiousTilt(): void {
    if (this.isDestroyed) return;

    this.avatarEl.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0deg)' }],
      {
        duration: 400,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      }
    );
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  destroy(): void {
    this.isDestroyed = true;

    if (this.breathingAnimation) {
      this.breathingAnimation.cancel();
    }
    if (this.glowAnimation) {
      this.glowAnimation.cancel();
    }

    this.container.innerHTML = '';
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAvatar(container: HTMLElement | string, options?: AvatarOptions): Avatar {
  return new Avatar(container, options);
}

export default Avatar;
