/**
 * Ferni Logo Component - Three Stones with Expressive Animations
 * 
 * A reusable animated logo component that can express emotions
 * through eye movement and simple line mouth reveals.
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

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

const log = createLogger('FerniLogo');

// ============================================================================
// TYPES
// ============================================================================

export type LogoExpression = 
  | 'zen'       // Default - no mouth, centered eye
  | 'happy'     // Eye up, smile
  | 'excited'   // Bouncy eye, wide smile
  | 'curious'   // Tilted eye, small smile
  | 'sad'       // Soft eye, frown
  | 'surprised' // Wide eye, small o
  | 'thinking'  // Wandering eye, no mouth
  | 'chuckle'   // Squinty eye, wobbly smile
  | 'speaking'  // Animated mouth
  | 'listening'; // Gentle pulse

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
  outer: '#4a6741',      // Sage green
  iris: '#5a8060',       // Light sage
  pupil: '#2c2520',      // Dark ink
  white: '#ffffff',
  catchlight: 'rgba(255, 255, 255, 0.9)',
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
  } = options;

  let currentExpression: LogoExpression = expression;
  let animationFrame: number | null = null;

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', `ferni-logo ${className}`.trim());
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Ferni logo');

  // Add inline styles for animations
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = getLogoStyles(animated);
  svg.appendChild(style);

  // Outer stone (body)
  const outer = createCircle(50, 50, 45, LOGO_COLORS.outer);
  svg.appendChild(outer);

  // Eye group (for animations)
  const eyeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  eyeGroup.setAttribute('class', 'eye-group');

  // Eye white
  const eyeWhite = createCircle(50, 50, 18, LOGO_COLORS.white);
  eyeWhite.setAttribute('class', 'eye-white');
  eyeGroup.appendChild(eyeWhite);

  // Iris (skip for simplified)
  if (!simplified) {
    const iris = createCircle(50, 50, 12, LOGO_COLORS.iris);
    eyeGroup.appendChild(iris);
  }

  // Pupil group (for look direction)
  const pupilGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  pupilGroup.setAttribute('class', 'pupil-group');

  // Pupil
  const pupil = createCircle(50, 50, simplified ? 8 : 6, LOGO_COLORS.pupil);
  pupilGroup.appendChild(pupil);

  // Catchlight (skip for simplified)
  if (!simplified) {
    const catchlight = createCircle(47, 47, 2, LOGO_COLORS.white);
    catchlight.setAttribute('opacity', '0.9');
    pupilGroup.appendChild(catchlight);
  }

  eyeGroup.appendChild(pupilGroup);
  svg.appendChild(eyeGroup);

  // Mouth (hidden by default)
  if (animated) {
    const mouth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    mouth.setAttribute('class', 'mouth');
    mouth.setAttribute('d', 'M 35 68 Q 50 78 65 68');
    mouth.setAttribute('stroke', LOGO_COLORS.white);
    mouth.setAttribute('stroke-width', '4');
    mouth.setAttribute('stroke-linecap', 'round');
    mouth.setAttribute('fill', 'none');
    svg.appendChild(mouth);
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

function createCircle(cx: number, cy: number, r: number, fill: string): SVGCircleElement {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(cx));
  circle.setAttribute('cy', String(cy));
  circle.setAttribute('r', String(r));
  circle.setAttribute('fill', fill);
  return circle;
}

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
    
    .eye-group {
      transform-origin: 50px 50px;
      transition: transform var(--duration-normal) var(--ease-spring);
    }
    
    .eye-white {
      transform-origin: 50px 50px;
      transition: transform var(--duration-normal) var(--ease-gentle);
    }
    
    .pupil-group {
      transform-origin: 50px 50px;
      transition: transform var(--duration-fast) var(--ease-gentle);
    }
    
    .mouth {
      opacity: 0;
      transform-origin: 50px 68px;
      transition: 
        opacity var(--duration-normal) var(--ease-gentle),
        transform var(--duration-normal) var(--ease-spring);
    }
    
    /* Happy */
    .ferni-logo.happy .eye-group { transform: translateY(-12px); }
    .ferni-logo.happy .eye-white { transform: scaleY(0.92); }
    .ferni-logo.happy .mouth { opacity: 1; }
    
    /* Excited */
    .ferni-logo.excited .eye-group { transform: translateY(-14px) scale(1.05); }
    .ferni-logo.excited .eye-white { transform: scaleY(0.88); }
    .ferni-logo.excited .mouth { opacity: 1; transform: scaleX(1.2); }
    
    /* Curious */
    .ferni-logo.curious .eye-group { transform: translateY(-8px) translateX(-3px) rotate(-3deg); }
    .ferni-logo.curious .pupil-group { transform: translateX(4px) translateY(-3px); }
    .ferni-logo.curious .mouth { opacity: 0.7; transform: scale(0.7) translateX(3px); }
    
    /* Sad */
    .ferni-logo.sad .eye-group { transform: translateY(-6px); }
    .ferni-logo.sad .eye-white { transform: scaleY(0.85); }
    .ferni-logo.sad .mouth { opacity: 1; transform: scaleY(-1) translateY(-8px); }
    
    /* Surprised */
    .ferni-logo.surprised .eye-group { transform: translateY(-16px) scale(1.12); }
    .ferni-logo.surprised .eye-white { transform: scaleY(1.08) scaleX(1.05); }
    .ferni-logo.surprised .mouth { opacity: 1; transform: scale(0.4); }
    
    /* Thinking */
    .ferni-logo.thinking .eye-group {
      animation: thinking-wander 3000ms ease-in-out infinite;
    }
    .ferni-logo.thinking .pupil-group {
      animation: thinking-look 3000ms ease-in-out infinite;
    }
    
    @keyframes thinking-wander {
      0%, 100% { transform: translateY(-3px) translateX(3px); }
      25% { transform: translateY(-5px) translateX(-4px) rotate(-2deg); }
      50% { transform: translateY(-2px) translateX(4px) rotate(1deg); }
      75% { transform: translateY(-4px) translateX(-2px) rotate(-1deg); }
    }
    
    @keyframes thinking-look {
      0%, 100% { transform: translateX(2px) translateY(-1px); }
      25% { transform: translateX(-3px) translateY(1px); }
      50% { transform: translateX(3px) translateY(-2px); }
      75% { transform: translateX(-2px) translateY(0px); }
    }
    
    /* Chuckle */
    .ferni-logo.chuckle .eye-group { transform: translateY(-10px); }
    .ferni-logo.chuckle .eye-white { transform: scaleY(0.7); }
    .ferni-logo.chuckle .mouth {
      opacity: 1;
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
    .ferni-logo.speaking .eye-group { transform: translateY(-8px); }
    .ferni-logo.speaking .mouth {
      opacity: 1;
      animation: speaking-mouth 400ms ease-in-out infinite;
    }
    
    @keyframes speaking-mouth {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(0.5); }
    }
    
    /* Listening */
    .ferni-logo.listening .eye-group {
      transform: translateY(-2px);
      animation: listening-pulse 2000ms ease-in-out infinite;
    }
    .ferni-logo.listening .pupil-group {
      animation: listening-focus 2000ms ease-in-out infinite;
    }
    
    @keyframes listening-pulse {
      0%, 100% { transform: translateY(-2px) scale(1); }
      50% { transform: translateY(-3px) scale(1.02); }
    }
    
    @keyframes listening-focus {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(0.95); }
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
} = {}): string {
  const { 
    size = 48, 
    color = LOGO_COLORS.outer,
    simplified = size < 32 
  } = options;
  
  const irisColor = simplified ? '' : `<circle cx="50" cy="50" r="12" fill="${LOGO_COLORS.iris}"/>`;
  const catchlight = simplified ? '' : `<circle cx="47" cy="47" r="2" fill="${LOGO_COLORS.white}" opacity="0.9"/>`;
  
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="Ferni logo" class="avatar-logo-svg">
    <circle class="stone-outer" cx="50" cy="50" r="45" fill="${color}"/>
    <circle class="stone-eye-white" cx="50" cy="50" r="18" fill="${LOGO_COLORS.white}"/>
    ${irisColor}
    <circle class="stone-pupil" cx="50" cy="50" r="${simplified ? 8 : 6}" fill="${LOGO_COLORS.pupil}"/>
    ${catchlight}
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
} = {}): HTMLDivElement {
  const { 
    size = 48, 
    color = LOGO_COLORS.outer,
    className = '',
    animated = false
  } = options;
  
  const avatar = document.createElement('div');
  avatar.className = `avatar avatar--logo ${className}`.trim();
  avatar.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: ${color};
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  `;
  
  if (animated) {
    const logo = createFerniLogo({ size, animated: true });
    avatar.appendChild(logo.element);
    // Store reference for cleanup
    (avatar as HTMLDivElement & { _logoInstance: FerniLogoInstance })._logoInstance = logo;
  } else {
    avatar.innerHTML = getFerniLogoSVG({ size: size - 4, color: 'transparent' });
    // Make the SVG fill the space
    const svg = avatar.querySelector('svg');
    if (svg) {
      svg.style.cssText = 'width: 100%; height: 100%;';
    }
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

