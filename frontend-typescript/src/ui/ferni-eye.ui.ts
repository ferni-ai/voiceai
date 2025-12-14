/**
 * Ferni Eye UI - Awareness Presence Indicator
 * 
 * Three testable modes for finding the right balance:
 * 
 * 1. PUPIL: Simple dark circle + catchlight (Pixar lamp style)
 * 2. SPARKLE: Just a sparkle/star (ultra minimal, Apple-esque)
 * 3. GLOW: Original orb with subtle glow changes (no eye at all)
 * 
 * Philosophy: The awareness should feel like a surprise gift, not a constant feature.
 * It appears rarely enough to be delightful, not expected.
 */

import { prefersReducedMotion } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('FerniEye');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type AwarenessStyle = 'pupil' | 'sparkle' | 'glow';
type EyeAnimation = 'peek' | 'blink' | 'wink' | 'curious' | 'look-around' | 'sparkle';

interface EyeState {
  isVisible: boolean;
  isAnimating: boolean;
  isTracking: boolean;
  currentAnimation: EyeAnimation | null;
  currentStyle: AwarenessStyle;
}

// ============================================================================
// CONFIGURATION - Tune these for personality!
// ============================================================================

const CONFIG = {
  // Random peek timing (milliseconds)
  peekIntervalMin: 45000,    // At least 45 seconds between peeks
  peekIntervalMax: 120000,   // At most 2 minutes between peeks
  peekChance: 0.4,           // 40% chance to actually peek when timer fires
  
  // Blink timing
  blinkIntervalMin: 2500,
  blinkIntervalMax: 6000,
  
  // Cursor tracking
  trackingStrength: 12,      // Max pixels pupil can move
  trackingSmoothing: 0.12,   // How smooth the tracking is
  trackingDeadzone: 60,      // Pixels from center before tracking starts
  
  // Animation durations
  peekDuration: 2000,        // How long the eye stays visible during peek
  blinkDuration: 150,
  winkDuration: 400,
};

// ============================================================================
// STATE
// ============================================================================

let eyeElement: HTMLElement | null = null;
let glowElement: HTMLElement | null = null;
let pupilGroup: SVGGElement | null = null;
let avatarElement: HTMLElement | null = null;

const state: EyeState = {
  isVisible: false,
  isAnimating: false,
  isTracking: false,
  currentAnimation: null,
  currentStyle: 'pupil', // Default style
};

// Timers
let peekTimer: ReturnType<typeof setTimeout> | null = null;
let blinkTimer: ReturnType<typeof setTimeout> | null = null;
let trackingFrame: number | null = null;

// Tracking state
let currentPupilOffset = { x: 0, y: 0 };
let targetPupilOffset = { x: 0, y: 0 };
let lastMousePosition = { x: 0, y: 0 };

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Ferni Eye system
 */
export function initFerniEye(): void {
  eyeElement = document.getElementById('ferniEye');
  glowElement = document.getElementById('ferniAwareGlow');
  avatarElement = document.getElementById('coachAvatar');
  
  if (!eyeElement) {
    log.warn('Ferni eye element not found');
    return;
  }
  
  pupilGroup = eyeElement.querySelector('.ferni-eye__pupil-group') as SVGGElement;
  
  // Skip random animations if user prefers reduced motion
  if (prefersReducedMotion()) {
    log.info('Ferni eye animations limited: user prefers reduced motion');
    return;
  }
  
  // Start random peek timer
  scheduleNextPeek();
  
  // Listen for mouse movement
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  
  // Listen for avatar hover
  avatarElement?.addEventListener('mouseenter', handleAvatarHover);
  avatarElement?.addEventListener('mouseleave', handleAvatarLeave);
  
  log.info('🎬 Ferni awareness initialized - ready for Pixar moments!');
}

/**
 * Dispose of the Ferni Eye system
 */
export function disposeFerniEye(): void {
  // FIX BUG: Clear all tracked timeouts first
  clearAllTimeouts();

  if (peekTimer) clearTimeout(peekTimer);
  if (blinkTimer) clearTimeout(blinkTimer);
  if (trackingFrame) cancelAnimationFrame(trackingFrame);

  document.removeEventListener('mousemove', handleMouseMove);
  avatarElement?.removeEventListener('mouseenter', handleAvatarHover);
  avatarElement?.removeEventListener('mouseleave', handleAvatarLeave);

  eyeElement = null;
  glowElement = null;
  pupilGroup = null;
  avatarElement = null;
}

// ============================================================================
// STYLE SWITCHING - Test different awareness modes
// ============================================================================

/**
 * Set the awareness style
 * @param style - 'pupil' | 'sparkle' | 'glow'
 */
export function setAwarenessStyle(style: AwarenessStyle): void {
  state.currentStyle = style;
  
  if (eyeElement) {
    eyeElement.setAttribute('data-style', style);
  }
  
  log.info({ style }, '🎨 Awareness style changed');
}

/**
 * Get current awareness style
 */
export function getAwarenessStyle(): AwarenessStyle {
  return state.currentStyle;
}

// ============================================================================
// RANDOM PEEK SYSTEM - The magic!
// ============================================================================

/**
 * Schedule the next random peek
 */
function scheduleNextPeek(): void {
  if (peekTimer) clearTimeout(peekTimer);
  
  const delay = randomBetween(CONFIG.peekIntervalMin, CONFIG.peekIntervalMax);
  
  peekTimer = setTimeout(() => {
    // Random chance to actually peek
    if (Math.random() < CONFIG.peekChance) {
      triggerPeek();
    }
    // Schedule next one regardless
    scheduleNextPeek();
  }, delay);
  
  log.debug(`Next peek scheduled in ${Math.round(delay / 1000)}s`);
}

// ============================================================================
// PUBLIC API - Trigger animations
// ============================================================================

/**
 * Trigger the awareness peek animation
 * Behavior changes based on current style:
 * - pupil/sparkle: Eye element appears
 * - glow: Just the glow overlay pulses
 */
export function triggerPeek(): void {
  if (state.isAnimating) return;
  
  state.isAnimating = true;
  state.currentAnimation = 'peek';
  
  // GLOW MODE: Use the glow overlay instead of eye
  if (state.currentStyle === 'glow') {
    if (!glowElement) return;
    
    resetAnimationClasses();
    glowElement.classList.add('glow-peek');
    startGlowTracking();
    
    trackedTimeout(() => {
      stopGlowTracking();
      glowElement?.classList.remove('glow-peek');
      state.isAnimating = false;
      state.currentAnimation = null;
    }, CONFIG.peekDuration + 200);
    
    log.debug('✨ Glow peek triggered!');
    return;
  }
  
  // PUPIL/SPARKLE MODE: Use the eye element
  if (!eyeElement) return;
  
  resetAnimationClasses();
  eyeElement.classList.add('eye-peek');
  startTracking();
  
  // Maybe look around during the peek (only for pupil mode)
  if (state.currentStyle === 'pupil') {
    trackedTimeout(() => {
      if (Math.random() > 0.5) {
        eyeElement?.classList.add('eye-look-around');
      }
    }, 400);
  }
  
  // Clean up after animation
  trackedTimeout(() => {
    stopTracking();
    resetAnimationClasses();
    state.isAnimating = false;
    state.currentAnimation = null;
  }, CONFIG.peekDuration);
  
  log.debug('👁️ Peek triggered!');
}

/**
 * Trigger a quick blink
 */
export function triggerBlink(): void {
  if (!eyeElement || !state.isVisible) return;
  
  eyeElement.classList.add('eye-blink');

  trackedTimeout(() => {
    eyeElement?.classList.remove('eye-blink');
  }, CONFIG.blinkDuration);
}

/**
 * Trigger a playful wink
 */
export function triggerWink(): void {
  if (!eyeElement) return;
  
  state.isAnimating = true;
  
  // Show eye if not visible
  showEye();

  trackedTimeout(() => {
    eyeElement?.classList.add('eye-wink');
  }, 100);

  trackedTimeout(() => {
    eyeElement?.classList.remove('eye-wink');
    // Hide after wink if it wasn't visible before
    if (!state.isVisible) {
      hideEye();
    }
    state.isAnimating = false;
  }, CONFIG.winkDuration + 200);
  
  log.debug('😉 Wink triggered!');
}

/**
 * Trigger curious animation (style-aware)
 */
export function triggerCurious(): void {
  // GLOW MODE
  if (state.currentStyle === 'glow') {
    if (!glowElement) return;
    glowElement.classList.add('glow-visible', 'glow-curious');
    trackedTimeout(() => {
      glowElement?.classList.remove('glow-curious');
      if (!state.isTracking) {
        glowElement?.classList.remove('glow-visible');
      }
    }, 600);
    log.debug('✨ Glow curious triggered!');
    return;
  }
  
  // PUPIL/SPARKLE MODE
  if (!eyeElement) return;
  
  showEye();
  eyeElement.classList.add('eye-curious');

  trackedTimeout(() => {
    eyeElement?.classList.remove('eye-curious');
    if (!state.isTracking) {
      hideEye();
    }
  }, 800);
  
  log.debug('🤔 Curious triggered!');
}

/**
 * Show the awareness indicator (style-aware)
 */
export function showEye(): void {
  // GLOW MODE
  if (state.currentStyle === 'glow') {
    if (!glowElement) return;
    glowElement.classList.add('glow-visible');
    state.isVisible = true;
    startGlowTracking();
    return;
  }
  
  // PUPIL/SPARKLE MODE
  if (!eyeElement) return;
  
  eyeElement.classList.add('eye-visible');
  state.isVisible = true;
  startTracking();
  
  // Only schedule blinks for pupil mode
  if (state.currentStyle === 'pupil') {
    scheduleRandomBlinks();
  }
}

/**
 * Hide the awareness indicator
 */
export function hideEye(): void {
  // GLOW MODE
  if (state.currentStyle === 'glow') {
    glowElement?.classList.remove('glow-visible');
    state.isVisible = false;
    stopGlowTracking();
    return;
  }
  
  // PUPIL/SPARKLE MODE
  if (!eyeElement) return;
  
  eyeElement.classList.remove('eye-visible');
  state.isVisible = false;
  stopTracking();
  if (blinkTimer) {
    clearTimeout(blinkTimer);
    blinkTimer = null;
  }
}

// ============================================================================
// CURSOR TRACKING - WALL-E style
// ============================================================================

function startTracking(): void {
  if (state.isTracking || prefersReducedMotion()) return;
  
  state.isTracking = true;
  trackingFrame = requestAnimationFrame(updateTracking);
}

function stopTracking(): void {
  state.isTracking = false;
  if (trackingFrame) {
    cancelAnimationFrame(trackingFrame);
    trackingFrame = null;
  }
  // Reset pupil to center
  if (pupilGroup) {
    pupilGroup.style.transform = 'translate(0, 0)';
  }
  currentPupilOffset = { x: 0, y: 0 };
}

function updateTracking(): void {
  if (!state.isTracking || !pupilGroup || !avatarElement) return;
  
  // Get avatar center
  const rect = avatarElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Calculate distance from center
  const dx = lastMousePosition.x - centerX;
  const dy = lastMousePosition.y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Only track if outside deadzone
  if (distance > CONFIG.trackingDeadzone) {
    // Normalize and apply strength
    const strength = Math.min(distance / 200, 1) * CONFIG.trackingStrength;
    targetPupilOffset = {
      x: (dx / distance) * strength,
      y: (dy / distance) * strength,
    };
  } else {
    targetPupilOffset = { x: 0, y: 0 };
  }
  
  // Smooth interpolation
  currentPupilOffset = {
    x: currentPupilOffset.x + (targetPupilOffset.x - currentPupilOffset.x) * CONFIG.trackingSmoothing,
    y: currentPupilOffset.y + (targetPupilOffset.y - currentPupilOffset.y) * CONFIG.trackingSmoothing,
  };
  
  // Apply transform
  pupilGroup.style.transform = `translate(${currentPupilOffset.x}px, ${currentPupilOffset.y}px)`;
  
  // Continue loop
  trackingFrame = requestAnimationFrame(updateTracking);
}

// ============================================================================
// GLOW TRACKING - For "aware glow" mode (no eye, just glow position)
// ============================================================================

let glowTrackingFrame: number | null = null;

function startGlowTracking(): void {
  if (prefersReducedMotion() || !glowElement) return;
  glowTrackingFrame = requestAnimationFrame(updateGlowTracking);
}

function stopGlowTracking(): void {
  if (glowTrackingFrame) {
    cancelAnimationFrame(glowTrackingFrame);
    glowTrackingFrame = null;
  }
  // Reset glow position
  if (glowElement) {
    glowElement.style.background = '';
  }
}

function updateGlowTracking(): void {
  if (!glowElement || !avatarElement) return;
  
  // Get avatar center
  const rect = avatarElement.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  // Calculate direction from avatar to cursor
  const dx = lastMousePosition.x - centerX;
  const dy = lastMousePosition.y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Map cursor position to glow position (20% - 80% range)
  let glowX = 50;
  let glowY = 50;
  
  if (distance > CONFIG.trackingDeadzone) {
    // Normalize direction
    const nx = dx / distance;
    const ny = dy / distance;
    // Map to percentage (inverted - glow follows cursor)
    glowX = 50 + nx * 25;
    glowY = 50 + ny * 25;
  }
  
  // Apply as radial gradient position
  glowElement.style.background = `radial-gradient(
    circle at ${glowX}% ${glowY}%,
    rgba(255, 255, 255, 0.25) 0%,
    rgba(255, 255, 255, 0.1) 30%,
    transparent 60%
  )`;
  
  // Continue loop
  glowTrackingFrame = requestAnimationFrame(updateGlowTracking);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleMouseMove(e: MouseEvent): void {
  lastMousePosition = { x: e.clientX, y: e.clientY };
}

function handleAvatarHover(): void {
  // Random chance to show curious eye on hover
  if (Math.random() < 0.15 && !state.isAnimating) {
    triggerCurious();
  }
}

function handleAvatarLeave(): void {
  if (state.isVisible && !state.isAnimating) {
    hideEye();
  }
}

// ============================================================================
// BLINK SYSTEM
// ============================================================================

function scheduleRandomBlinks(): void {
  if (!state.isVisible) return;
  
  const delay = randomBetween(CONFIG.blinkIntervalMin, CONFIG.blinkIntervalMax);
  
  blinkTimer = setTimeout(() => {
    if (state.isVisible) {
      triggerBlink();
      scheduleRandomBlinks();
    }
  }, delay);
}

// ============================================================================
// HELPERS
// ============================================================================

function resetAnimationClasses(): void {
  // Reset eye element classes
  eyeElement?.classList.remove(
    'eye-visible',
    'eye-peek',
    'eye-blink',
    'eye-wink',
    'eye-curious',
    'eye-look-around',
    'eye-sparkle'
  );
  
  // Reset glow element classes
  glowElement?.classList.remove(
    'glow-visible',
    'glow-peek',
    'glow-curious'
  );
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================================
// EXPORTED API
// ============================================================================

export const ferniEye = {
  init: initFerniEye,
  dispose: disposeFerniEye,
  // Style switching
  setStyle: setAwarenessStyle,
  getStyle: getAwarenessStyle,
  // Animations
  peek: triggerPeek,
  blink: triggerBlink,
  wink: triggerWink,
  curious: triggerCurious,
  show: showEye,
  hide: hideEye,
};

export default ferniEye;

