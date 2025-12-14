/**
 * Living Logo UI - Subtle Presence
 * 
 * A header logo that responds to app state with quiet awareness.
 * The magic is in the restraint — just enough life to feel present,
 * not so much that it's distracting.
 * 
 * WHAT IT DOES:
 * - Eye tracks cursor position (very subtle, WALL-E effect)
 * - Responds to app states (listening, speaking, thinking)
 * - Expresses emotions briefly when triggered
 * 
 * WHAT IT DOESN'T DO:
 * - Breathe constantly (distracting)
 * - Pulse with rings (too much)
 * - Bounce around (theme park energy)
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { createFerniLogo, type LogoExpression, type FerniLogoInstance } from './ferni-logo.ui.js';
import { EASING, prefersReducedMotion } from '../config/animation-constants.js';

const log = createLogger('LivingLogo');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type LogoState = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'celebrating'
  | 'error';

// ============================================================================
// STATE
// ============================================================================

let logoInstance: FerniLogoInstance | null = null;
let containerElement: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;
let currentState: LogoState = 'idle';

// Eye tracking state
let eyeTrackingEnabled = true;
const currentEyeOffset = { x: 0, y: 0 };
let targetEyeOffset = { x: 0, y: 0 };
let eyeTrackingFrame: number | null = null;
let lastMousePosition = { x: 0, y: 0 };

// Eye tracking config - VERY subtle
const EYE_CONFIG = {
  strength: 2.5,      // Max pixel movement (reduced from 4)
  smoothing: 0.08,    // Slower, more contemplative (reduced from 0.12)
  deadzone: 80,       // Larger deadzone (increased from 50)
};

// State to expression mapping
const STATE_EXPRESSIONS: Record<LogoState, LogoExpression> = {
  idle: 'zen',
  connecting: 'curious',
  connected: 'happy',
  listening: 'listening',
  speaking: 'speaking',
  thinking: 'thinking',
  celebrating: 'excited',
  error: 'sad',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the living logo in a container
 */
export function initLivingLogo(
  selector: string | HTMLElement,
  size = 44
): void {
  if (isInitialized) {
    log.debug('Living logo already initialized');
    return;
  }
  
  // Skip if reduced motion preferred
  if (prefersReducedMotion()) {
    log.info('Living logo animations disabled: user prefers reduced motion');
    // Still create the logo, just without eye tracking
    eyeTrackingEnabled = false;
  }
  
  // Find container
  containerElement = typeof selector === 'string' 
    ? document.querySelector(selector)
    : selector;
  
  if (!containerElement) {
    log.warn('Living logo container not found:', selector);
    return;
  }
  
  // Inject styles
  injectStyles();
  
  // Create the logo
  logoInstance = createFerniLogo({
    size,
    animated: true,
    expression: 'zen',
    className: 'living-logo',
  });
  
  // Clear container and add logo
  containerElement.innerHTML = '';
  containerElement.appendChild(logoInstance.element);
  containerElement.classList.add('living-logo-container');
  
  // Start subtle eye tracking
  if (eyeTrackingEnabled) {
    startEyeTracking();
  }
  
  // Listen for app events
  setupEventListeners();
  
  isInitialized = true;
  log.info('Living logo initialized');
}

/**
 * Dispose of the living logo
 */
export function disposeLivingLogo(): void {
  stopEyeTracking();
  
  logoInstance?.dispose();
  logoInstance = null;
  
  styleElement?.remove();
  styleElement = null;
  
  containerElement?.classList.remove('living-logo-container');
  containerElement = null;
  
  isInitialized = false;
  log.debug('Living logo disposed');
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Set the logo state
 */
export function setLogoState(state: LogoState): void {
  if (state === currentState) return;
  
  currentState = state;
  
  // Update expression
  const expression = STATE_EXPRESSIONS[state];
  logoInstance?.setExpression(expression);
  
  // State-specific behaviors
  switch (state) {
    case 'connected':
      // Brief happy moment
      pauseEyeTracking(600);
      break;
      
    case 'celebrating':
      // Brief reaction, then back to normal
      pauseEyeTracking(800);
      trackedTimeout(() => setLogoState('idle'), 1200);
      break;
      
    case 'error':
      // Stay in error state until explicitly changed
      break;
      
    case 'thinking':
      // Slower eye tracking for contemplative feel
      EYE_CONFIG.smoothing = 0.04;
      break;
      
    default:
      // Reset to normal
      EYE_CONFIG.smoothing = 0.08;
  }
  
  log.debug('Logo state:', state);
}

/**
 * Get current logo state
 */
export function getLogoState(): LogoState {
  return currentState;
}

/**
 * Trigger a brief reaction
 */
export function triggerLogoReaction(type: 'bounce' | 'wiggle' | 'pulse'): void {
  if (prefersReducedMotion()) return;
  logoInstance?.react(type);
}

/**
 * Set expression with optional auto-return to state
 */
export function setLogoExpression(expression: LogoExpression, duration = 0): void {
  logoInstance?.setExpression(expression);
  
  if (duration > 0) {
    trackedTimeout(() => {
      const stateExpression = STATE_EXPRESSIONS[currentState];
      logoInstance?.setExpression(stateExpression);
    }, duration);
  }
}

// ============================================================================
// EYE TRACKING - Subtle WALL-E effect
// ============================================================================

function startEyeTracking(): void {
  if (eyeTrackingFrame || prefersReducedMotion()) return;
  
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('touchmove', handleTouchMove, { passive: true });
  
  eyeTrackingFrame = requestAnimationFrame(updateEyeTracking);
  log.debug('Eye tracking started');
}

function stopEyeTracking(): void {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('touchmove', handleTouchMove);
  
  if (eyeTrackingFrame) {
    cancelAnimationFrame(eyeTrackingFrame);
    eyeTrackingFrame = null;
  }
}

function pauseEyeTracking(duration: number): void {
  eyeTrackingEnabled = false;
  targetEyeOffset = { x: 0, y: 0 };
  
  trackedTimeout(() => {
    eyeTrackingEnabled = true;
  }, duration);
}

function handleMouseMove(e: MouseEvent): void {
  lastMousePosition = { x: e.clientX, y: e.clientY };
  calculateEyeTarget();
}

function handleTouchMove(e: TouchEvent): void {
  const touch = e.touches[0];
  if (touch) {
    lastMousePosition = { x: touch.clientX, y: touch.clientY };
    calculateEyeTarget();
  }
}

function calculateEyeTarget(): void {
  if (!containerElement || !eyeTrackingEnabled) return;
  
  const rect = containerElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const deltaX = lastMousePosition.x - centerX;
  const deltaY = lastMousePosition.y - centerY;
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  // Apply deadzone
  if (distance < EYE_CONFIG.deadzone) {
    targetEyeOffset = { x: 0, y: 0 };
    return;
  }
  
  // Calculate direction with falloff
  const angle = Math.atan2(deltaY, deltaX);
  const maxDistance = Math.max(window.innerWidth, window.innerHeight) / 2;
  const falloff = Math.min(1, (distance - EYE_CONFIG.deadzone) / maxDistance);
  const strength = EYE_CONFIG.strength * falloff;
  
  targetEyeOffset = {
    x: Math.cos(angle) * strength,
    y: Math.sin(angle) * strength,
  };
}

function updateEyeTracking(): void {
  if (!logoInstance) {
    eyeTrackingFrame = requestAnimationFrame(updateEyeTracking);
    return;
  }
  
  // Smooth interpolation
  currentEyeOffset.x += (targetEyeOffset.x - currentEyeOffset.x) * EYE_CONFIG.smoothing;
  currentEyeOffset.y += (targetEyeOffset.y - currentEyeOffset.y) * EYE_CONFIG.smoothing;
  
  // Apply to pupil
  const svg = logoInstance.element;
  const pupilGroup = svg.querySelector('.pupil-group');
  
  if (pupilGroup) {
    (pupilGroup as SVGGElement).style.transform = 
      `translate(${currentEyeOffset.x}px, ${currentEyeOffset.y}px)`;
  }
  
  eyeTrackingFrame = requestAnimationFrame(updateEyeTracking);
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
        setLogoState('connecting');
        break;
      case 'connected':
        setLogoState('connected');
        trackedTimeout(() => {
          if (currentState === 'connected') setLogoState('idle');
        }, 1000);
        break;
      case 'disconnected':
        setLogoState('idle');
        break;
      case 'error':
        setLogoState('error');
        break;
    }
  }) as EventListener);
  
  // Speaking
  window.addEventListener('ferni:avatar-speaking', ((e: CustomEvent) => {
    if (e.detail.speaking) {
      setLogoState('speaking');
    } else if (currentState === 'speaking') {
      setLogoState('idle');
    }
  }) as EventListener);
  
  // Listening
  window.addEventListener('ferni:avatar-listening', ((e: CustomEvent) => {
    if (e.detail.listening) {
      setLogoState('listening');
    } else if (currentState === 'listening') {
      setLogoState('idle');
    }
  }) as EventListener);
  
  // Thinking
  window.addEventListener('ferni:thinking', ((e: CustomEvent) => {
    if (e.detail.thinking) {
      setLogoState('thinking');
    } else if (currentState === 'thinking') {
      setLogoState('idle');
    }
  }) as EventListener);
  
  // Emotions
  window.addEventListener('ferni:avatar-emotion', ((e: CustomEvent) => {
    const { emotion } = e.detail;
    if (emotion === 'joy' || emotion === 'excited' || emotion === 'delight') {
      setLogoState('celebrating');
    }
  }) as EventListener);
  
  // Celebration
  window.addEventListener('ferni:celebration', () => {
    setLogoState('celebrating');
  });
  
  // Persona change - brief curious look
  window.addEventListener('ferni:switch-persona', () => {
    setLogoExpression('curious', 600);
  });
}

// ============================================================================
// STYLES - Minimal
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'living-logo-styles';
  styleElement.textContent = `
    .living-logo-container {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .living-logo {
      cursor: pointer;
      transition: transform 150ms ${EASING.SPRING};
    }
    
    .living-logo:hover {
      transform: scale(1.05);
    }
    
    .living-logo:active {
      transform: scale(0.95);
    }
    
    .living-logo .pupil-group {
      transition: transform 100ms ease-out;
    }
    
    @media (prefers-reduced-motion: reduce) {
      .living-logo {
        transition: none;
      }
      .living-logo .pupil-group {
        transform: none !important;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const livingLogo = {
  init: initLivingLogo,
  dispose: disposeLivingLogo,
  setState: setLogoState,
  getState: getLogoState,
  setExpression: setLogoExpression,
  triggerReaction: triggerLogoReaction,
};

export default livingLogo;
