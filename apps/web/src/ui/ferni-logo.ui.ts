/**
 * Ferni Logo Component - Eyes Avatar with Expressive Animations
 *
 * A reusable animated logo component featuring expressive eyes
 * (no pupils - just opaque white with sparkles) that can express
 * emotions through subtle animations.
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

  // Define gradients and filters using safe DOM methods
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // Logo gradient
  const logoGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  logoGrad.setAttribute('id', `logoGrad-${size}`);
  logoGrad.setAttribute('x1', '0%');
  logoGrad.setAttribute('y1', '100%');
  logoGrad.setAttribute('x2', '100%');
  logoGrad.setAttribute('y2', '0%');
  const logoStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  logoStop1.setAttribute('offset', '0%');
  logoStop1.setAttribute('stop-color', LOGO_COLORS.secondary);
  const logoStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  logoStop2.setAttribute('offset', '100%');
  logoStop2.setAttribute('stop-color', LOGO_COLORS.primary);
  logoGrad.appendChild(logoStop1);
  logoGrad.appendChild(logoStop2);
  defs.appendChild(logoGrad);

  // Eye fill gradient (white to light gray)
  const eyeFillGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  eyeFillGrad.setAttribute('id', `eyeFill-${size}`);
  eyeFillGrad.setAttribute('x1', '0%');
  eyeFillGrad.setAttribute('y1', '0%');
  eyeFillGrad.setAttribute('x2', '0%');
  eyeFillGrad.setAttribute('y2', '100%');
  const eyeStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  eyeStop1.setAttribute('offset', '0%');
  eyeStop1.setAttribute('stop-color', '#ffffff');
  const eyeStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  eyeStop2.setAttribute('offset', '100%');
  eyeStop2.setAttribute('stop-color', '#f0f0f0');
  eyeFillGrad.appendChild(eyeStop1);
  eyeFillGrad.appendChild(eyeStop2);
  defs.appendChild(eyeFillGrad);

  // Eye shadow filter
  const eyeShadowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  eyeShadowFilter.setAttribute('id', `eyeShadow-${size}`);
  eyeShadowFilter.setAttribute('x', '-20%');
  eyeShadowFilter.setAttribute('y', '-20%');
  eyeShadowFilter.setAttribute('width', '140%');
  eyeShadowFilter.setAttribute('height', '140%');
  const eyeDropShadow1 = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  eyeDropShadow1.setAttribute('dx', '0');
  eyeDropShadow1.setAttribute('dy', '0.5');
  eyeDropShadow1.setAttribute('stdDeviation', '1');
  eyeDropShadow1.setAttribute('flood-color', 'black');
  eyeDropShadow1.setAttribute('flood-opacity', '0.1');
  const eyeDropShadow2 = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  eyeDropShadow2.setAttribute('dx', '0');
  eyeDropShadow2.setAttribute('dy', '-0.5');
  eyeDropShadow2.setAttribute('stdDeviation', '1');
  eyeDropShadow2.setAttribute('flood-color', 'white');
  eyeDropShadow2.setAttribute('flood-opacity', '0.4');
  eyeShadowFilter.appendChild(eyeDropShadow1);
  eyeShadowFilter.appendChild(eyeDropShadow2);
  defs.appendChild(eyeShadowFilter);

  // Sparkle glow filter
  const sparkleFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  sparkleFilter.setAttribute('id', `sparkleGlow-${size}`);
  sparkleFilter.setAttribute('x', '-100%');
  sparkleFilter.setAttribute('y', '-100%');
  sparkleFilter.setAttribute('width', '300%');
  sparkleFilter.setAttribute('height', '300%');
  const sparkleBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  sparkleBlur.setAttribute('stdDeviation', '0.8');
  sparkleBlur.setAttribute('result', 'blur');
  const sparkleMerge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const mergeNode1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mergeNode1.setAttribute('in', 'blur');
  const mergeNode2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mergeNode2.setAttribute('in', 'SourceGraphic');
  sparkleMerge.appendChild(mergeNode1);
  sparkleMerge.appendChild(mergeNode2);
  sparkleFilter.appendChild(sparkleBlur);
  sparkleFilter.appendChild(sparkleMerge);
  defs.appendChild(sparkleFilter);

  // Badge gradients/filters if needed
  if (showBadge) {
    const badgeGrad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    badgeGrad.setAttribute('id', `badgeGrad-${size}`);
    badgeGrad.setAttribute('x1', '0%');
    badgeGrad.setAttribute('y1', '100%');
    badgeGrad.setAttribute('x2', '100%');
    badgeGrad.setAttribute('y2', '0%');
    const badgeStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    badgeStop1.setAttribute('offset', '0%');
    badgeStop1.setAttribute('stop-color', LOGO_COLORS.secondary);
    const badgeStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    badgeStop2.setAttribute('offset', '100%');
    badgeStop2.setAttribute('stop-color', LOGO_COLORS.badge);
    badgeGrad.appendChild(badgeStop1);
    badgeGrad.appendChild(badgeStop2);
    defs.appendChild(badgeGrad);

    const badgeShadowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    badgeShadowFilter.setAttribute('id', `badgeShadow-${size}`);
    badgeShadowFilter.setAttribute('x', '-50%');
    badgeShadowFilter.setAttribute('y', '-50%');
    badgeShadowFilter.setAttribute('width', '200%');
    badgeShadowFilter.setAttribute('height', '200%');
    const badgeDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    badgeDropShadow.setAttribute('dx', '0');
    badgeDropShadow.setAttribute('dy', '1');
    badgeDropShadow.setAttribute('stdDeviation', '1.5');
    badgeDropShadow.setAttribute('flood-color', '#2c2520');
    badgeDropShadow.setAttribute('flood-opacity', '0.2');
    badgeShadowFilter.appendChild(badgeDropShadow);
    defs.appendChild(badgeShadowFilter);
  }

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

  // Eyes group (no pupils - just opaque white with sparkles)
  const eyesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  eyesGroup.setAttribute('class', 'eyes-group');

  // Scale eye dimensions based on logo size
  // Eyes are positioned at roughly 35 and 65 on x-axis, centered on y-axis
  const eyeRx = simplified ? 6 : 8;  // Horizontal radius
  const eyeRy = simplified ? 8 : 11; // Vertical radius (taller than wide)
  const eyeSpacing = simplified ? 12 : 15;
  const eyeY = 50; // Centered vertically

  // Create left eye
  const leftEyeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  leftEyeGroup.setAttribute('class', 'eye-left');
  leftEyeGroup.setAttribute('transform', `translate(${50 - eyeSpacing}, ${eyeY})`);

  // Left eye outer glow
  const leftEyeGlow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  leftEyeGlow.setAttribute('cx', '0');
  leftEyeGlow.setAttribute('cy', '0');
  leftEyeGlow.setAttribute('rx', String(eyeRx + 2));
  leftEyeGlow.setAttribute('ry', String(eyeRy + 2));
  leftEyeGlow.setAttribute('fill', `url(#eyeFill-${size})`);
  leftEyeGlow.setAttribute('opacity', '0.3');
  leftEyeGroup.appendChild(leftEyeGlow);

  // Left eye main
  const leftEye = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  leftEye.setAttribute('class', 'eye-main');
  leftEye.setAttribute('cx', '0');
  leftEye.setAttribute('cy', '0');
  leftEye.setAttribute('rx', String(eyeRx));
  leftEye.setAttribute('ry', String(eyeRy));
  leftEye.setAttribute('fill', `url(#eyeFill-${size})`);
  leftEye.setAttribute('filter', `url(#eyeShadow-${size})`);
  leftEyeGroup.appendChild(leftEye);

  // Left eye sparkles
  if (!simplified) {
    const leftSparkleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    leftSparkleGroup.setAttribute('class', 'sparkle-group');
    leftSparkleGroup.setAttribute('transform', `translate(${-eyeRx * 0.35}, ${-eyeRy * 0.4})`);
    leftSparkleGroup.setAttribute('filter', `url(#sparkleGlow-${size})`);

    const leftSparkle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    leftSparkle1.setAttribute('cx', '0');
    leftSparkle1.setAttribute('cy', '0');
    leftSparkle1.setAttribute('r', String(Math.max(2, eyeRx * 0.3)));
    leftSparkle1.setAttribute('fill', 'white');
    leftSparkleGroup.appendChild(leftSparkle1);

    const leftSparkle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    leftSparkle2.setAttribute('cx', String(eyeRx * 0.2));
    leftSparkle2.setAttribute('cy', String(eyeRy * 0.15));
    leftSparkle2.setAttribute('r', String(Math.max(1, eyeRx * 0.15)));
    leftSparkle2.setAttribute('fill', 'white');
    leftSparkle2.setAttribute('opacity', '0.7');
    leftSparkleGroup.appendChild(leftSparkle2);

    leftEyeGroup.appendChild(leftSparkleGroup);
  }

  eyesGroup.appendChild(leftEyeGroup);

  // Create right eye
  const rightEyeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  rightEyeGroup.setAttribute('class', 'eye-right');
  rightEyeGroup.setAttribute('transform', `translate(${50 + eyeSpacing}, ${eyeY})`);

  // Right eye outer glow
  const rightEyeGlow = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  rightEyeGlow.setAttribute('cx', '0');
  rightEyeGlow.setAttribute('cy', '0');
  rightEyeGlow.setAttribute('rx', String(eyeRx + 2));
  rightEyeGlow.setAttribute('ry', String(eyeRy + 2));
  rightEyeGlow.setAttribute('fill', `url(#eyeFill-${size})`);
  rightEyeGlow.setAttribute('opacity', '0.3');
  rightEyeGroup.appendChild(rightEyeGlow);

  // Right eye main
  const rightEye = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
  rightEye.setAttribute('class', 'eye-main');
  rightEye.setAttribute('cx', '0');
  rightEye.setAttribute('cy', '0');
  rightEye.setAttribute('rx', String(eyeRx));
  rightEye.setAttribute('ry', String(eyeRy));
  rightEye.setAttribute('fill', `url(#eyeFill-${size})`);
  rightEye.setAttribute('filter', `url(#eyeShadow-${size})`);
  rightEyeGroup.appendChild(rightEye);

  // Right eye sparkles
  if (!simplified) {
    const rightSparkleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rightSparkleGroup.setAttribute('class', 'sparkle-group');
    rightSparkleGroup.setAttribute('transform', `translate(${-eyeRx * 0.3}, ${-eyeRy * 0.4})`);
    rightSparkleGroup.setAttribute('filter', `url(#sparkleGlow-${size})`);

    const rightSparkle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rightSparkle1.setAttribute('cx', '0');
    rightSparkle1.setAttribute('cy', '0');
    rightSparkle1.setAttribute('r', String(Math.max(2, eyeRx * 0.3)));
    rightSparkle1.setAttribute('fill', 'white');
    rightSparkleGroup.appendChild(rightSparkle1);

    const rightSparkle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rightSparkle2.setAttribute('cx', String(eyeRx * 0.2));
    rightSparkle2.setAttribute('cy', String(eyeRy * 0.15));
    rightSparkle2.setAttribute('r', String(Math.max(1, eyeRx * 0.15)));
    rightSparkle2.setAttribute('fill', 'white');
    rightSparkle2.setAttribute('opacity', '0.7');
    rightSparkleGroup.appendChild(rightSparkle2);

    rightEyeGroup.appendChild(rightSparkleGroup);
  }

  eyesGroup.appendChild(rightEyeGroup);
  avatarGroup.appendChild(eyesGroup);

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

    .eyes-group {
      transform-origin: 50px 50px;
      transition: transform var(--duration-fast) var(--ease-gentle);
    }

    .eye-main {
      transition: transform var(--duration-fast) var(--ease-gentle);
    }

    .sparkle-group {
      transition: opacity var(--duration-normal) var(--ease-gentle);
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
    
    /* Happy - eyes brighten */
    .ferni-logo.happy .avatar-group { transform: translateY(-2px) scale(1.02); }
    .ferni-logo.happy .presence-ring { opacity: 0.5; }
    .ferni-logo.happy .shine { opacity: 0.25; }
    .ferni-logo.happy .sparkle-group { opacity: 1; }

    /* Excited - eyes widen, sparkles glow */
    .ferni-logo.excited .avatar-group { transform: scale(1.05); }
    .ferni-logo.excited .presence-ring { opacity: 0.6; transform: scale(1.05); }
    .ferni-logo.excited .shine { opacity: 0.3; }
    .ferni-logo.excited .eye-main { transform: scaleY(1.1); }
    .ferni-logo.excited .sparkle-group { opacity: 1; }

    /* Curious - slight tilt, eyes shift */
    .ferni-logo.curious .avatar-group { transform: translateX(-2px) rotate(-3deg); }
    .ferni-logo.curious .presence-ring { transform: rotate(-3deg); }
    .ferni-logo.curious .eyes-group { transform: translateX(2px); }

    /* Sad - eyes droop slightly */
    .ferni-logo.sad .avatar-group { transform: translateY(2px) scale(0.98); }
    .ferni-logo.sad .presence-ring { opacity: 0.2; }
    .ferni-logo.sad .shine { opacity: 0.08; }
    .ferni-logo.sad .eye-main { transform: scaleY(0.85); }
    .ferni-logo.sad .sparkle-group { opacity: 0.5; }

    /* Surprised - eyes widen significantly */
    .ferni-logo.surprised .avatar-group { transform: scale(1.08); }
    .ferni-logo.surprised .presence-ring { transform: scale(1.1); opacity: 0.6; }
    .ferni-logo.surprised .shine { opacity: 0.35; }
    .ferni-logo.surprised .eye-main { transform: scaleY(1.2); }
    .ferni-logo.surprised .sparkle-group { opacity: 1; }
    
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

  // Scale eye dimensions
  const eyeRx = simplified ? 6 : 8;
  const eyeRy = simplified ? 8 : 11;
  const eyeSpacing = simplified ? 12 : 15;
  const sparkleR1 = Math.max(2, eyeRx * 0.3);
  const sparkleR2 = Math.max(1, eyeRx * 0.15);

  const ring = showRing ? `<circle cx="50" cy="50" r="46" fill="none" stroke="${LOGO_COLORS.primary}" stroke-width="1" opacity="0.35"/>` : '';
  const shine = simplified ? '' : `<ellipse cx="39" cy="34" rx="20" ry="10" fill="${LOGO_COLORS.white}" opacity="0.15"/>`;

  // Eye sparkles (only for non-simplified)
  const sparkles = simplified ? '' : `
      <g class="sparkle-group" transform="translate(${-eyeRx * 0.35}, ${-eyeRy * 0.4})">
        <circle cx="0" cy="0" r="${sparkleR1}" fill="white"/>
        <circle cx="${eyeRx * 0.2}" cy="${eyeRy * 0.15}" r="${sparkleR2}" fill="white" opacity="0.7"/>
      </g>`;

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${t('accessibility.ferniLogo')}" class="avatar-logo-svg">
    <defs>
      <linearGradient id="logoGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${LOGO_COLORS.secondary}"/>
        <stop offset="100%" stop-color="${color}"/>
      </linearGradient>
      <linearGradient id="eyeFill" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#f0f0f0"/>
      </linearGradient>
    </defs>
    ${ring}
    <circle class="avatar-body" cx="50" cy="50" r="40" fill="url(#logoGrad)"/>
    <!-- Left Eye -->
    <g class="eye-left" transform="translate(${50 - eyeSpacing}, 50)">
      <ellipse cx="0" cy="0" rx="${eyeRx + 2}" ry="${eyeRy + 2}" fill="url(#eyeFill)" opacity="0.3"/>
      <ellipse class="eye-main" cx="0" cy="0" rx="${eyeRx}" ry="${eyeRy}" fill="url(#eyeFill)"/>
      ${sparkles}
    </g>
    <!-- Right Eye -->
    <g class="eye-right" transform="translate(${50 + eyeSpacing}, 50)">
      <ellipse cx="0" cy="0" rx="${eyeRx + 2}" ry="${eyeRy + 2}" fill="url(#eyeFill)" opacity="0.3"/>
      <ellipse class="eye-main" cx="0" cy="0" rx="${eyeRx}" ry="${eyeRy}" fill="url(#eyeFill)"/>
      ${sparkles}
    </g>
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
