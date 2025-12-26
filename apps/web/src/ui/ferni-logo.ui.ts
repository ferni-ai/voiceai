/**
 * Ferni Logo Component - FE Text Avatar with Expressive Animations
 * 
 * A reusable animated logo component that can express emotions
 * through subtle animations and expression classes.
 * 
 * @example
 * // Create logo
 * const logo = createFerniLogo({ size: 64 });
 * container.appendChild(logo.element);
 * 
 * // Set expression
 * logo.setExpression('happy');
 * 
 * // Clear expression (back to zen)
 * logo.setExpression('zen');
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('FerniLogo');

// ============================================================================
// TYPES
// ============================================================================

export type LogoExpression = 
  | 'zen'       // Default - calm, centered
  | 'happy'     // Slight bounce, warmth
  | 'excited'   // More bounce, glow
  | 'curious'   // Subtle tilt
  | 'sad'       // Slightly dimmed
  | 'surprised' // Scale pop
  | 'thinking'  // Gentle pulse
  | 'chuckle'   // Wobble
  | 'speaking'  // Active glow
  | 'listening'; // Subtle pulse

export interface FerniLogoOptions {
  /** Size in pixels (width and height) */
  size?: number;
  /** Initial expression */
  expression?: LogoExpression;
  /** Enable animations */
  animated?: boolean;
  /** Use simplified version (fewer details) */
  simplified?: boolean;
  /** Custom class name */
  className?: string;
  /** Include heart badge */
  showBadge?: boolean;
}

export interface FerniLogoInstance {
  /** The SVG element */
  element: SVGSVGElement;
  /** Set the logo expression */
  setExpression: (expression: LogoExpression) => void;
  /** Get current expression */
  getExpression: () => LogoExpression;
  /** Trigger a one-time reaction animation */
  react: (type: 'bounce' | 'wiggle' | 'pulse') => void;
  /** Dispose of the component */
  dispose: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LOGO_COLORS = {
  primary: '#4a6741',      // Sage green
  secondary: '#3d5a35',    // Darker sage
  badge: '#5a8060',        // Light sage for badge
  white: '#ffffff',
  cream: '#F5F1E8',        // Paper cream background
  ring: 'rgba(74, 103, 65, 0.35)', // Ring color
};

// ============================================================================
// LOGO CREATION
// ============================================================================

/**
 * Create an animated Ferni logo instance
 */
export function createFerniLogo(options: FerniLogoOptions = {}): FerniLogoInstance {
  const {
    size = 48,
    expression = 'zen',
    animated = true,
    simplified = size < 32,
    className = '',
    showBadge = false,
  } = options;

  let currentExpression: LogoExpression = expression;
  const animationFrame: number | null = null;

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', showBadge ? '0 0 120 120' : '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `ferni-logo ${className}`.trim());
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Ferni logo');

  // Add inline styles for animations
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = getLogoStyles(animated);
  svg.appendChild(style);

  // Define gradients
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="logoGrad-${size}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${LOGO_COLORS.secondary}"/>
      <stop offset="100%" stop-color="${LOGO_COLORS.primary}"/>
    </linearGradient>
    ${showBadge ? `
    <linearGradient id="badgeGrad-${size}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${LOGO_COLORS.secondary}"/>
      <stop offset="100%" stop-color="${LOGO_COLORS.badge}"/>
    </linearGradient>
    <filter id="badgeShadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#2c2520" flood-opacity="0.2"/>
    </filter>
    ` : ''}
  `;
  svg.appendChild(defs);

  // Outer presence ring
  if (!simplified) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('class', 'presence-ring');
    ring.setAttribute('cx', '50');
    ring.setAttribute('cy', '50');
    ring.setAttribute('r', '46');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', LOGO_COLORS.primary);
    ring.setAttribute('stroke-width', size > 64 ? '2' : '1');
    ring.setAttribute('opacity', '0.35');
    svg.appendChild(ring);
  }

  // Avatar group (for animations)
  const avatarGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  avatarGroup.setAttribute('class', 'avatar-group');

  // Main avatar circle
  const avatar = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  avatar.setAttribute('class', 'avatar-body');
  avatar.setAttribute('cx', '50');
  avatar.setAttribute('cy', '50');
  avatar.setAttribute('r', '40');
  avatar.setAttribute('fill', `url(#logoGrad-${size})`);
  avatarGroup.appendChild(avatar);

  // FE Text
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('class', 'fe-text');
  text.setAttribute('x', '50');
  text.setAttribute('y', '50');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-family', "'Plus Jakarta Sans', 'SF Pro Display', system-ui, sans-serif");
  text.setAttribute('font-weight', '800');
  text.setAttribute('fill', LOGO_COLORS.white);
  
  // Scale font size based on logo size
  const fontSize = simplified ? Math.max(size * 0.5, 8) : Math.round(size * 0.6);
  text.setAttribute('font-size', String(Math.min(fontSize, 30)));
  text.setAttribute('letter-spacing', '-1');
  
  const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
  tspan.setAttribute('dy', '2');
  tspan.textContent = 'FE';
  text.appendChild(tspan);
  avatarGroup.appendChild(text);

  // Shine overlay (above text for 3D effect)
  if (!simplified) {
    const shine = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    shine.setAttribute('class', 'shine');
    shine.setAttribute('cx', '39');
    shine.setAttribute('cy', '34');
    shine.setAttribute('rx', '20');
    shine.setAttribute('ry', '10');
    shine.setAttribute('fill', LOGO_COLORS.white);
    shine.setAttribute('opacity', '0.15');
    avatarGroup.appendChild(shine);
  }

  svg.appendChild(avatarGroup);

  // Heart badge (optional)
  if (showBadge) {
    const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badgeGroup.setAttribute('class', 'badge-group');
    
    // Badge circle
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badge.setAttribute('cx', '95');
    badge.setAttribute('cy', '95');
    badge.setAttribute('r', '18');
    badge.setAttribute('fill', `url(#badgeGrad-${size})`);
    badge.setAttribute('stroke', '#FFFDFB');
    badge.setAttribute('stroke-width', '3');
    badge.setAttribute('filter', `url(#badgeShadow-${size})`);
    badgeGroup.appendChild(badge);
    
    // Heart icon
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    heart.setAttribute('d', 'M95 89c0-2.2-1.8-4-4-4s-4 1.8-4 4c0 4 7.5 9.5 7.5 9.5s7.5-5.5 7.5-9.5c0-2.2-1.8-4-4-4s-4 1.8-4 4z');
    heart.setAttribute('fill', 'none');
    heart.setAttribute('stroke', LOGO_COLORS.white);
    heart.setAttribute('stroke-width', '1.5');
    heart.setAttribute('stroke-linecap', 'round');
    heart.setAttribute('stroke-linejoin', 'round');
    badgeGroup.appendChild(heart);
    
    svg.appendChild(badgeGroup);
  }

  // Apply initial expression
  if (expression !== 'zen') {
    svg.classList.add(expression);
  }

  // ========================================
  // METHODS
  // ========================================

  function setExpression(newExpression: LogoExpression): void {
    if (newExpression === currentExpression) return;
    
    // Remove current expression class
    svg.classList.remove(currentExpression);
    
    // Add new expression (zen has no class)
    if (newExpression !== 'zen') {
      svg.classList.add(newExpression);
    }
    
    currentExpression = newExpression;
    log.debug('Expression changed:', newExpression);
  }

  function getExpression(): LogoExpression {
    return currentExpression;
  }

  function react(type: 'bounce' | 'wiggle' | 'pulse'): void {
    if (!animated) return;
    
    const reactions: Record<string, Keyframe[]> = {
      bounce: [
        { transform: 'scale(1)' },
        { transform: 'scale(1.1)', offset: 0.3 },
        { transform: 'scale(0.95)', offset: 0.6 },
        { transform: 'scale(1)' },
      ],
      wiggle: [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-5deg)', offset: 0.25 },
        { transform: 'rotate(5deg)', offset: 0.5 },
        { transform: 'rotate(-3deg)', offset: 0.75 },
        { transform: 'rotate(0deg)' },
      ],
      pulse: [
        { opacity: 1 },
        { opacity: 0.7, offset: 0.5 },
        { opacity: 1 },
      ],
    };

    const keyframes = reactions[type];
    if (keyframes) {
      svg.animate(keyframes, {
        duration: DURATION.CELEBRATION,
        easing: EASING.SPRING,
      });
    }
  }

  function dispose(): void {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    svg.remove();
  }

  return {
    element: svg,
    setExpression,
    getExpression,
    react,
    dispose,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function getLogoStyles(animated: boolean): string {
  if (!animated) return '';
  
  return `
    .ferni-logo {
      --duration-fast: ${DURATION.FAST}ms;
      --duration-normal: ${DURATION.NORMAL}ms;
      --duration-slow: ${DURATION.SLOW}ms;
      --ease-spring: ${EASING.SPRING};
      --ease-gentle: ${EASING.GENTLE};
    }
    
    .avatar-group {
      transform-origin: 50px 50px;
      transition: transform var(--duration-normal) var(--ease-spring);
    }
    
    .avatar-body {
      transform-origin: 50px 50px;
      transition: transform var(--duration-normal) var(--ease-gentle);
    }
    
    .fe-text {
      transform-origin: 50px 50px;
      transition: transform var(--duration-fast) var(--ease-gentle);
    }
    
    .shine {
      opacity: 0.15;
      transition: opacity var(--duration-normal) var(--ease-gentle);
    }
    
    .presence-ring {
      transform-origin: 50px 50px;
      transition: 
        opacity var(--duration-normal) var(--ease-gentle),
        transform var(--duration-normal) var(--ease-spring);
    }
    
    /* Happy */
    .ferni-logo.happy .avatar-group { transform: translateY(-2px) scale(1.02); }
    .ferni-logo.happy .presence-ring { opacity: 0.5; }
    .ferni-logo.happy .shine { opacity: 0.25; }
    
    /* Excited */
    .ferni-logo.excited .avatar-group { transform: scale(1.05); }
    .ferni-logo.excited .presence-ring { opacity: 0.6; transform: scale(1.05); }
    .ferni-logo.excited .shine { opacity: 0.3; }
    
    /* Curious */
    .ferni-logo.curious .avatar-group { transform: translateX(-2px) rotate(-3deg); }
    .ferni-logo.curious .presence-ring { transform: rotate(-3deg); }
    
    /* Sad */
    .ferni-logo.sad .avatar-group { transform: translateY(2px) scale(0.98); }
    .ferni-logo.sad .presence-ring { opacity: 0.2; }
    .ferni-logo.sad .shine { opacity: 0.08; }
    
    /* Surprised */
    .ferni-logo.surprised .avatar-group { transform: scale(1.08); }
    .ferni-logo.surprised .presence-ring { transform: scale(1.1); opacity: 0.6; }
    .ferni-logo.surprised .shine { opacity: 0.35; }
    
    /* Thinking */
    .ferni-logo.thinking .avatar-group {
      animation: thinking-pulse 2000ms ease-in-out infinite;
    }
    .ferni-logo.thinking .presence-ring {
      animation: thinking-ring 2000ms ease-in-out infinite;
    }
    
    @keyframes thinking-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02) translateX(1px); }
    }
    
    @keyframes thinking-ring {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.5; }
    }
    
    /* Chuckle */
    .ferni-logo.chuckle .avatar-group {
      animation: chuckle-wobble 600ms var(--ease-spring);
    }
    
    @keyframes chuckle-wobble {
      0%, 100% { transform: rotate(0deg); }
      20% { transform: rotate(-4deg); }
      40% { transform: rotate(3deg); }
      60% { transform: rotate(-2deg); }
      80% { transform: rotate(1deg); }
    }
    
    /* Speaking */
    .ferni-logo.speaking .avatar-group { transform: translateY(-1px); }
    .ferni-logo.speaking .presence-ring {
      animation: speaking-glow 800ms ease-in-out infinite;
    }
    .ferni-logo.speaking .shine {
      animation: speaking-shine 800ms ease-in-out infinite;
    }
    
    @keyframes speaking-glow {
      0%, 100% { opacity: 0.35; transform: scale(1); }
      50% { opacity: 0.55; transform: scale(1.02); }
    }
    
    @keyframes speaking-shine {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 0.25; }
    }
    
    /* Listening */
    .ferni-logo.listening .avatar-group {
      animation: listening-pulse 2500ms ease-in-out infinite;
    }
    .ferni-logo.listening .presence-ring {
      animation: listening-ring 2500ms ease-in-out infinite;
    }
    
    @keyframes listening-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.015); }
    }
    
    @keyframes listening-ring {
      0%, 100% { opacity: 0.35; }
      50% { opacity: 0.45; }
    }
  `;
}

// ============================================================================
// STATIC LOGO SVG - For embedding in avatars without animation overhead
// ============================================================================

/**
 * Get a static Ferni logo SVG string for embedding in avatars
 * This is lighter weight than createFerniLogo for static use cases
 * 
 * @example
 * avatar.innerHTML = getFerniLogoSVG({ size: 48, color: '#4a6741' });
 */
export function getFerniLogoSVG(options: { 
  size?: number; 
  color?: string;
  simplified?: boolean;
  showRing?: boolean;
} = {}): string {
  const { 
    size = 48, 
    color = LOGO_COLORS.primary,
    simplified = size < 32,
    showRing = !simplified
  } = options;
  
  const fontSize = simplified ? Math.max(size * 0.4, 6) : Math.round(size * 0.5);
  const ring = showRing ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${LOGO_COLORS.primary}" stroke-width="1" opacity="0.35"/>` : '';
  const shine = simplified ? '' : `<ellipse cx="39" cy="34" rx="20" ry="10" fill="${LOGO_COLORS.white}" opacity="0.15"/>`;
  
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${t('accessibility.ferniLogo')}" class="avatar-logo-svg">
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${LOGO_COLORS.secondary}"/>
        <stop offset="100%" stop-color="${color}"/>
      </linearGradient>
    </defs>
    ${ring}
    <circle class="avatar-body" cx="50" cy="50" r="40" fill="url(#logoGrad)"/>
    <text 
      x="50" 
      y="50" 
      text-anchor="middle" 
      dominant-baseline="central"
      font-family="'Plus Jakarta Sans', 'SF Pro Display', system-ui, sans-serif"
      font-size="${Math.min(fontSize, 30)}"
      font-weight="800"
      fill="${LOGO_COLORS.white}"
      letter-spacing="-1">
      <tspan dy="2">FE</tspan>
    </text>
    ${shine}
  </svg>`;
}

/**
 * Create a circular avatar element with the Ferni logo embedded
 * 
 * @example
 * const avatar = createLogoAvatar({ size: 64, color: '#4a6741' });
 * container.appendChild(avatar);
 */
export function createLogoAvatar(options: {
  size?: number;
  color?: string;
  className?: string;
  animated?: boolean;
  showBadge?: boolean;
} = {}): HTMLDivElement {
  const { 
    size = 48, 
    color = LOGO_COLORS.primary,
    className = '',
    animated = false,
    showBadge = false
  } = options;
  
  const avatar = document.createElement('div');
  avatar.className = `avatar avatar--logo ${className}`.trim();
  avatar.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;
  `;
  
  if (animated) {
    const logo = createFerniLogo({ size, animated: true, showBadge });
    avatar.appendChild(logo.element);
    // Store reference for cleanup
    (avatar as HTMLDivElement & { _logoInstance: FerniLogoInstance })._logoInstance = logo;
  } else {
    avatar.innerHTML = getFerniLogoSVG({ size, color, showRing: size >= 48 });
  }
  
  return avatar;
}

/**
 * Avatar size presets matching design system tokens
 */
export const AVATAR_SIZES = {
  xs: 24,
  sm: 32,
  md: 48,
  lg: 64,
  xl: 80,
  '2xl': 120,
} as const;

// ============================================================================
// EXPORTS
// ============================================================================

export default createFerniLogo;
