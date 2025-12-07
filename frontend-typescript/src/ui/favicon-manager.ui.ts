/**
 * Living Favicon Manager - State-Aware Browser Tab Icon
 * 
 * Makes Ferni's presence felt even in the browser tab!
 * The favicon responds to app state just like the living logo.
 * 
 * FEATURES:
 * - Breathing animation (via animated SVG)
 * - State indicators (listening, speaking, thinking)
 * - Notification badges
 * - Theme-aware (light/dark mode)
 * 
 * BROWSER SUPPORT:
 * - SVG favicons: Chrome, Firefox, Edge, Safari 15+
 * - Animated SVG: Chrome, Firefox, Edge (Safari static)
 * - Canvas fallback: All browsers
 */

import { createLogger } from '../utils/logger.js';
import { DURATION } from '../config/animation-constants.js';

const log = createLogger('FaviconManager');

// ============================================================================
// TYPES
// ============================================================================

export type FaviconState = 
  | 'idle'        // Breathing zen eye
  | 'connecting'  // Pulsing glow
  | 'listening'   // Active glow ring
  | 'speaking'    // Animated mouth indicator
  | 'thinking'    // Wandering pupil
  | 'notification' // Badge with count
  | 'error';      // Red tint

interface FaviconConfig {
  /** Update interval for canvas animations (ms) */
  animationInterval: number;
  /** Whether to use canvas fallback for better animation control */
  preferCanvas: boolean;
  /** Enable debug mode */
  debug: boolean;
}

// ============================================================================
// STATE
// ============================================================================

let currentState: FaviconState = 'idle';
let notificationCount = 0;
let animationFrame: number | null = null;
let canvasElement: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let isInitialized = false;
let originalFavicon: string | null = null;

// Animation state
let breathePhase = 0;
let pupilOffset = { x: 0, y: 0 };
let glowIntensity = 0.3;

const CONFIG: FaviconConfig = {
  animationInterval: 100,
  preferCanvas: true,
  debug: false,
};

// ============================================================================
// COLORS - From design system
// ============================================================================

const COLORS = {
  stone: {
    primary: '#4a6741',
    dark: '#3d5a35',
    light: '#5a8060',
  },
  background: {
    light: '#F5F1E8',
    dark: '#2c2520',
  },
  eye: {
    white: '#ffffff',
    iris: '#5a8060',
    pupil: '#2c2520',
    catchlight: 'rgba(255, 255, 255, 0.9)',
  },
  states: {
    listening: '#6b9f5e',
    speaking: '#5a8060',
    thinking: '#4a6741',
    error: '#c75a5a',
    notification: '#c4856a',
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the favicon manager
 */
export function initFaviconManager(): void {
  if (isInitialized) {
    log.debug('Favicon manager already initialized');
    return;
  }

  // Store original favicon for restoration
  const currentFavicon = document.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
  if (currentFavicon) {
    originalFavicon = currentFavicon.href;
  }

  // Create canvas for dynamic rendering
  canvasElement = document.createElement('canvas');
  canvasElement.width = 32;
  canvasElement.height = 32;
  ctx = canvasElement.getContext('2d');

  // Set up event listeners
  setupEventListeners();

  // Start animation loop if using canvas
  if (CONFIG.preferCanvas && ctx) {
    startAnimationLoop();
  } else {
    // Use animated SVG
    updateToAnimatedSVG();
  }

  isInitialized = true;
  log.info('Favicon manager initialized');
}

/**
 * Dispose of the favicon manager
 */
export function disposeFaviconManager(): void {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  // Restore original favicon
  if (originalFavicon) {
    updateFaviconHref(originalFavicon);
  }

  canvasElement = null;
  ctx = null;
  isInitialized = false;
  log.debug('Favicon manager disposed');
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Set the favicon state
 */
export function setFaviconState(state: FaviconState): void {
  if (state === currentState && state !== 'notification') return;

  currentState = state;
  log.debug('Favicon state:', state);

  if (!CONFIG.preferCanvas) {
    // For SVG mode, swap to state-specific favicon
    updateStaticFavicon();
  }
  // Canvas mode updates automatically in animation loop
}

/**
 * Set notification badge count
 */
export function setNotificationBadge(count: number): void {
  notificationCount = Math.max(0, count);
  if (count > 0) {
    setFaviconState('notification');
  } else if (currentState === 'notification') {
    setFaviconState('idle');
  }
}

/**
 * Clear notification badge
 */
export function clearNotificationBadge(): void {
  setNotificationBadge(0);
}

// ============================================================================
// ANIMATION LOOP (Canvas Mode)
// ============================================================================

function startAnimationLoop(): void {
  if (animationFrame) return;

  const animate = (): void => {
    // Update animation phases
    breathePhase += 0.02;
    updatePupilWander();
    updateGlowIntensity();

    // Render
    if (ctx) {
      renderFavicon();
    }

    animationFrame = requestAnimationFrame(animate);
  };

  animationFrame = requestAnimationFrame(animate);
  log.debug('Animation loop started');
}

function updatePupilWander(): void {
  const wanderSpeed = currentState === 'thinking' ? 0.03 : 0.01;
  const wanderAmount = currentState === 'thinking' ? 1.5 : 0.5;

  pupilOffset.x = Math.sin(breathePhase * wanderSpeed * 100) * wanderAmount;
  pupilOffset.y = Math.cos(breathePhase * wanderSpeed * 70) * wanderAmount * 0.7;
}

function updateGlowIntensity(): void {
  const baseGlow = 0.3;
  const breatheAmount = 0.15;

  switch (currentState) {
    case 'listening':
      glowIntensity = 0.6 + Math.sin(breathePhase * 3) * 0.2;
      break;
    case 'speaking':
      glowIntensity = 0.5 + Math.sin(breathePhase * 8) * 0.3;
      break;
    case 'thinking':
      glowIntensity = baseGlow + Math.sin(breathePhase * 1.5) * breatheAmount;
      break;
    case 'connecting':
      glowIntensity = 0.4 + Math.sin(breathePhase * 4) * 0.3;
      break;
    case 'error':
      glowIntensity = 0.7;
      break;
    default:
      glowIntensity = baseGlow + Math.sin(breathePhase) * breatheAmount;
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderFavicon(): void {
  if (!ctx || !canvasElement) return;

  const size = 32;
  const center = size / 2;

  // Clear canvas
  ctx.clearRect(0, 0, size, size);

  // Background with rounded corners
  ctx.fillStyle = COLORS.background.light;
  roundRect(ctx, 0, 0, size, size, 6);
  ctx.fill();

  // Calculate breathing scale
  const breatheScale = 1 + Math.sin(breathePhase) * 0.02;

  // Outer glow
  const glowColor = currentState === 'error' ? COLORS.states.error : COLORS.stone.primary;
  ctx.save();
  ctx.globalAlpha = glowIntensity;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.arc(center, center, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Main stone body
  ctx.save();
  ctx.translate(center, center);
  ctx.scale(breatheScale, breatheScale);
  ctx.translate(-center, -center);

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, 11);
  gradient.addColorStop(0, COLORS.stone.light);
  gradient.addColorStop(0.7, COLORS.stone.primary);
  gradient.addColorStop(1, COLORS.stone.dark);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Eye white
  ctx.fillStyle = COLORS.eye.white;
  ctx.beginPath();
  ctx.arc(center, center, 5, 0, Math.PI * 2);
  ctx.fill();

  // Iris
  ctx.fillStyle = COLORS.eye.iris;
  ctx.beginPath();
  ctx.arc(center, center, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Pupil (with wander offset)
  ctx.fillStyle = COLORS.eye.pupil;
  ctx.beginPath();
  ctx.arc(center + pupilOffset.x, center + pupilOffset.y, 2, 0, Math.PI * 2);
  ctx.fill();

  // Catchlight
  ctx.fillStyle = COLORS.eye.catchlight;
  ctx.beginPath();
  ctx.arc(center - 1 + pupilOffset.x * 0.3, center - 1 + pupilOffset.y * 0.3, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // State-specific overlays
  renderStateOverlay(ctx, center, size);

  // Notification badge
  if (currentState === 'notification' && notificationCount > 0) {
    renderNotificationBadge(ctx, size);
  }

  // Update favicon
  updateFaviconFromCanvas();
}

function renderStateOverlay(ctx: CanvasRenderingContext2D, center: number, size: number): void {
  switch (currentState) {
    case 'listening':
      // Subtle ear/sound waves
      ctx.save();
      ctx.globalAlpha = 0.4 + Math.sin(breathePhase * 3) * 0.2;
      ctx.strokeStyle = COLORS.states.listening;
      ctx.lineWidth = 1;
      
      // Left wave
      ctx.beginPath();
      ctx.arc(center - 13, center, 3, -Math.PI * 0.3, Math.PI * 0.3);
      ctx.stroke();
      
      // Right wave
      ctx.beginPath();
      ctx.arc(center + 13, center, 3, Math.PI * 0.7, Math.PI * 1.3);
      ctx.stroke();
      ctx.restore();
      break;

    case 'speaking':
      // Animated mouth line
      const mouthOpen = Math.abs(Math.sin(breathePhase * 8)) * 2;
      ctx.save();
      ctx.strokeStyle = COLORS.eye.white;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(center - 4, center + 8);
      ctx.quadraticCurveTo(center, center + 8 + mouthOpen, center + 4, center + 8);
      ctx.stroke();
      ctx.restore();
      break;

    case 'thinking':
      // Thinking dots
      ctx.save();
      ctx.fillStyle = COLORS.eye.white;
      const dotPhase = breathePhase * 2;
      for (let i = 0; i < 3; i++) {
        const alpha = Math.max(0.2, Math.sin(dotPhase + i * 0.8) * 0.5 + 0.5);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(size - 6 + i * 3, 6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;

    case 'error':
      // Red tint overlay
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = COLORS.states.error;
      roundRect(ctx, 0, 0, size, size, 6);
      ctx.fill();
      ctx.restore();
      break;
  }
}

function renderNotificationBadge(ctx: CanvasRenderingContext2D, size: number): void {
  const badgeX = size - 7;
  const badgeY = 7;
  const badgeRadius = 6;

  // Badge background
  ctx.fillStyle = COLORS.states.notification;
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  ctx.fill();

  // Badge border
  ctx.strokeStyle = COLORS.background.light;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Badge number
  if (notificationCount <= 9) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(notificationCount), badgeX, badgeY + 0.5);
  } else {
    // Show "9+" for larger numbers
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('9+', badgeX, badgeY + 0.5);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function updateFaviconFromCanvas(): void {
  if (!canvasElement) return;

  try {
    const dataUrl = canvasElement.toDataURL('image/png');
    updateFaviconHref(dataUrl);
  } catch (error) {
    log.error('Failed to update favicon from canvas:', error);
  }
}

function updateFaviconHref(href: string): void {
  // Update or create the favicon link element
  let favicon = document.querySelector('link[rel="icon"][sizes="32x32"]') as HTMLLinkElement;
  
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.setAttribute('sizes', '32x32');
    document.head.appendChild(favicon);
  }
  
  favicon.href = href;
}

function updateToAnimatedSVG(): void {
  const svgFavicon = document.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
  if (svgFavicon) {
    svgFavicon.href = '/favicon-animated.svg';
  }
}

function updateStaticFavicon(): void {
  // For non-canvas mode, we'd swap between pre-made SVGs
  // This is a simpler implementation
  const svgFavicon = document.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
  if (svgFavicon) {
    svgFavicon.href = '/favicon-animated.svg';
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners(): void {
  // Connection state
  window.addEventListener('ferni:connection-state', ((e: CustomEvent) => {
    const { state } = e.detail;
    switch (state) {
      case 'connecting':
        setFaviconState('connecting');
        break;
      case 'connected':
        // Brief connected state, then idle
        setTimeout(() => setFaviconState('idle'), DURATION.CELEBRATION);
        break;
      case 'disconnected':
        setFaviconState('idle');
        break;
      case 'error':
        setFaviconState('error');
        break;
    }
  }) as EventListener);

  // Speaking
  window.addEventListener('ferni:avatar-speaking', ((e: CustomEvent) => {
    if (e.detail.speaking) {
      setFaviconState('speaking');
    } else if (currentState === 'speaking') {
      setFaviconState('idle');
    }
  }) as EventListener);

  // Listening
  window.addEventListener('ferni:avatar-listening', ((e: CustomEvent) => {
    if (e.detail.listening) {
      setFaviconState('listening');
    } else if (currentState === 'listening') {
      setFaviconState('idle');
    }
  }) as EventListener);

  // Thinking
  window.addEventListener('ferni:thinking', ((e: CustomEvent) => {
    if (e.detail.thinking) {
      setFaviconState('thinking');
    } else if (currentState === 'thinking') {
      setFaviconState('idle');
    }
  }) as EventListener);

  // Page visibility - pause/resume animation
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Pause animation when tab is hidden (save resources)
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    } else {
      // Resume animation when tab is visible
      if (CONFIG.preferCanvas && ctx && !animationFrame) {
        startAnimationLoop();
      }
    }
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export const faviconManager = {
  init: initFaviconManager,
  dispose: disposeFaviconManager,
  setState: setFaviconState,
  setNotification: setNotificationBadge,
  clearNotification: clearNotificationBadge,
};

// Expose to window for dev testing
if (typeof window !== 'undefined') {
  (window as Window & { faviconManager?: typeof faviconManager }).faviconManager = faviconManager;
}

export default faviconManager;

