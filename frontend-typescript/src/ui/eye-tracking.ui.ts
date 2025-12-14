/**
 * Eye Tracking System - The WALL-E Effect
 * 
 * Makes avatars feel ALIVE by having them track the user's cursor/touch.
 * This creates an uncanny sense of being SEEN - the thing that makes
 * WALL-E so lovable.
 * 
 * Can be applied to:
 * - Main coach avatar (primary use)
 * - Header logo (via living-logo.ui.ts)
 * - Any element with an "eye" that should track
 * 
 * FEATURES:
 * - Smooth interpolation (not jerky)
 * - Configurable strength and deadzone
 * - Respects reduced motion preferences
 * - Can pause during speaking/celebrations
 * - Works with both mouse and touch
 * 
 * @example
 * import { initEyeTracking, setEyeTrackingEnabled } from './ui/eye-tracking.ui.js';
 * 
 * initEyeTracking({
 *   targetSelector: '#coachAvatar',
 *   eyeSelector: '.avatar-eye-inner',  // Element to move
 *   strength: 6,
 * });
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('EyeTracking');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface EyeTrackingOptions {
  /** Selector or element for the main container (position reference) */
  targetSelector: string | HTMLElement;
  /** Selector for the "eye" element that moves */
  eyeSelector: string;
  /** Maximum movement in pixels */
  strength?: number;
  /** Smoothing factor (0-1, higher = smoother) */
  smoothing?: number;
  /** Pixels from center before tracking activates */
  deadzone?: number;
  /** Whether to start enabled */
  enabled?: boolean;
  /** Callback when eye position updates */
  onUpdate?: (x: number, y: number) => void;
}

interface TrackingState {
  current: { x: number; y: number };
  target: { x: number; y: number };
  enabled: boolean;
  paused: boolean;
  frame: number | null;
}

interface TrackedElement {
  container: HTMLElement;
  eye: HTMLElement | null;
  options: Required<Omit<EyeTrackingOptions, 'targetSelector' | 'onUpdate'>> & {
    onUpdate?: (x: number, y: number) => void;
  };
  state: TrackingState;
}

// ============================================================================
// STATE
// ============================================================================

const trackedElements: Map<string, TrackedElement> = new Map();
let globalMousePosition = { x: 0, y: 0 };
let isListeningForMouse = false;
let prefersReducedMotion = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize eye tracking for an element
 * @returns A unique ID for this tracking instance
 */
export function initEyeTracking(options: EyeTrackingOptions): string {
  // Check reduced motion preference
  prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion) {
    log.info('Eye tracking disabled: user prefers reduced motion');
    return '';
  }
  
  // Find container element
  const container = typeof options.targetSelector === 'string'
    ? document.querySelector(options.targetSelector) as HTMLElement
    : options.targetSelector;
  
  if (!container) {
    log.warn('Eye tracking container not found:', options.targetSelector);
    return '';
  }
  
  // Generate unique ID
  const id = `eye-tracking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Create tracked element entry
  // Note: Defaults are intentionally subtle (zen aesthetic)
  const tracked: TrackedElement = {
    container,
    eye: null,  // Found dynamically each frame (in case DOM changes)
    options: {
      eyeSelector: options.eyeSelector,
      strength: options.strength ?? 3,       // Subtle movement
      smoothing: options.smoothing ?? 0.08,  // Slow, contemplative
      deadzone: options.deadzone ?? 80,      // Comfortable deadzone
      enabled: options.enabled ?? true,
      onUpdate: options.onUpdate,
    },
    state: {
      current: { x: 0, y: 0 },
      target: { x: 0, y: 0 },
      enabled: options.enabled ?? true,
      paused: false,
      frame: null,
    },
  };
  
  trackedElements.set(id, tracked);
  
  // Start global mouse tracking if not already
  if (!isListeningForMouse) {
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    isListeningForMouse = true;
  }
  
  // Start animation loop for this element
  tracked.state.frame = requestAnimationFrame(() => updateEyePosition(id));
  
  log.info('Eye tracking initialized:', { id, selector: options.targetSelector });
  
  return id;
}

/**
 * Dispose of eye tracking for a specific instance
 */
export function disposeEyeTracking(id: string): void {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  if (tracked.state.frame) {
    cancelAnimationFrame(tracked.state.frame);
  }
  
  // Reset eye position
  const eye = tracked.container.querySelector(tracked.options.eyeSelector) as HTMLElement;
  if (eye) {
    eye.style.transform = '';
  }
  
  trackedElements.delete(id);
  
  // Stop global listeners if no more tracked elements
  if (trackedElements.size === 0 && isListeningForMouse) {
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('touchmove', handleGlobalTouchMove);
    isListeningForMouse = false;
  }
  
  log.debug('Eye tracking disposed:', id);
}

/**
 * Dispose all eye tracking instances
 */
export function disposeAllEyeTracking(): void {
  for (const id of trackedElements.keys()) {
    disposeEyeTracking(id);
  }
}

// ============================================================================
// CONTROL FUNCTIONS
// ============================================================================

/**
 * Enable/disable eye tracking for an instance
 */
export function setEyeTrackingEnabled(id: string, enabled: boolean): void {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  tracked.state.enabled = enabled;
  
  if (!enabled) {
    // Smoothly return to center
    tracked.state.target = { x: 0, y: 0 };
  }
}

/**
 * Temporarily pause eye tracking (e.g., during animations)
 */
export function pauseEyeTracking(id: string, duration: number): void {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  tracked.state.paused = true;
  tracked.state.target = { x: 0, y: 0 };
  
  trackedTimeout(() => {
    if (tracked) {
      tracked.state.paused = false;
    }
  }, duration);
}

/**
 * Update tracking strength dynamically
 */
export function setEyeTrackingStrength(id: string, strength: number): void {
  const tracked = trackedElements.get(id);
  if (tracked) {
    tracked.options.strength = strength;
  }
}

/**
 * Update smoothing dynamically (useful for state changes)
 */
export function setEyeTrackingSmoothness(id: string, smoothing: number): void {
  const tracked = trackedElements.get(id);
  if (tracked) {
    tracked.options.smoothing = Math.max(0.01, Math.min(1, smoothing));
  }
}

/**
 * Force eye to look at a specific position (screen coordinates)
 */
export function lookAt(id: string, x: number, y: number, duration = 300): void {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  // Temporarily pause normal tracking
  tracked.state.paused = true;
  
  // Calculate offset to look at position
  const rect = tracked.container.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  
  const angle = Math.atan2(deltaY, deltaX);
  const strength = tracked.options.strength;
  
  tracked.state.target = {
    x: Math.cos(angle) * strength,
    y: Math.sin(angle) * strength,
  };
  
  // Resume normal tracking after duration
  trackedTimeout(() => {
    if (tracked) {
      tracked.state.paused = false;
    }
  }, duration);
}

/**
 * Make eye do a "look around" animation
 */
export async function lookAround(id: string): Promise<void> {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  tracked.state.paused = true;
  const strength = tracked.options.strength;
  
  // Look sequence: right, up-left, down-right, center
  const positions = [
    { x: strength, y: -strength * 0.3 },
    { x: -strength * 0.8, y: -strength * 0.5 },
    { x: strength * 0.6, y: strength * 0.4 },
    { x: 0, y: 0 },
  ];
  
  for (const pos of positions) {
    tracked.state.target = pos;
    await sleep(400);
  }
  
  tracked.state.paused = false;
}

// ============================================================================
// GLOBAL MOUSE HANDLING
// ============================================================================

function handleGlobalMouseMove(e: MouseEvent): void {
  globalMousePosition = { x: e.clientX, y: e.clientY };
  updateAllTargets();
}

function handleGlobalTouchMove(e: TouchEvent): void {
  const touch = e.touches[0];
  if (touch) {
    globalMousePosition = { x: touch.clientX, y: touch.clientY };
    updateAllTargets();
  }
}

/**
 * Update target positions for all tracked elements
 */
function updateAllTargets(): void {
  for (const tracked of trackedElements.values()) {
    if (!tracked.state.enabled || tracked.state.paused) continue;
    
    const rect = tracked.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = globalMousePosition.x - centerX;
    const deltaY = globalMousePosition.y - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Apply deadzone
    if (distance < tracked.options.deadzone) {
      tracked.state.target = { x: 0, y: 0 };
      continue;
    }
    
    // Calculate direction and apply strength with distance falloff
    const angle = Math.atan2(deltaY, deltaX);
    const maxDistance = Math.max(window.innerWidth, window.innerHeight) / 2;
    const falloff = Math.min(1, (distance - tracked.options.deadzone) / maxDistance);
    const strength = tracked.options.strength * falloff;
    
    tracked.state.target = {
      x: Math.cos(angle) * strength,
      y: Math.sin(angle) * strength,
    };
  }
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================

/**
 * Animation frame handler for smooth eye movement
 */
function updateEyePosition(id: string): void {
  const tracked = trackedElements.get(id);
  if (!tracked) return;
  
  const { state, options, container } = tracked;
  
  // Smooth interpolation
  state.current.x += (state.target.x - state.current.x) * options.smoothing;
  state.current.y += (state.target.y - state.current.y) * options.smoothing;
  
  // Find eye element (may change if DOM updates)
  const eye = container.querySelector(options.eyeSelector) as HTMLElement;
  
  if (eye) {
    eye.style.transform = `translate(${state.current.x}px, ${state.current.y}px)`;
    
    // Call update callback if provided
    options.onUpdate?.(state.current.x, state.current.y);
  }
  
  // Continue animation loop
  state.frame = requestAnimationFrame(() => updateEyePosition(id));
}

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => trackedTimeout(resolve, ms));
}

// ============================================================================
// CONVENIENCE: AVATAR EYE TRACKING
// ============================================================================

let avatarEyeTrackingId: string | null = null;

/**
 * Initialize eye tracking for the main coach avatar
 * Convenience wrapper with sensible defaults
 * 
 * Note: Values are intentionally subtle (zen, not hyperactive)
 */
export function initAvatarEyeTracking(avatarSelector = '#coachAvatar'): string {
  if (avatarEyeTrackingId) {
    log.debug('Avatar eye tracking already initialized');
    return avatarEyeTrackingId;
  }
  
  avatarEyeTrackingId = initEyeTracking({
    targetSelector: avatarSelector,
    eyeSelector: '#avatarText, .avatar-text, .avatar-initials',  // The inner element that should "look"
    strength: 3,       // Subtle movement (reduced from 5)
    smoothing: 0.06,   // Slower, contemplative (reduced from 0.1)
    deadzone: 120,     // Larger deadzone (increased from 100)
  });
  
  return avatarEyeTrackingId;
}

/**
 * Dispose avatar eye tracking
 */
export function disposeAvatarEyeTracking(): void {
  if (avatarEyeTrackingId) {
    disposeEyeTracking(avatarEyeTrackingId);
    avatarEyeTrackingId = null;
  }
}

/**
 * Pause avatar eye tracking (e.g., during celebrations)
 */
export function pauseAvatarEyeTracking(duration: number): void {
  if (avatarEyeTrackingId) {
    pauseEyeTracking(avatarEyeTrackingId, duration);
  }
}

/**
 * Make avatar look at something
 */
export function avatarLookAt(x: number, y: number, duration = 300): void {
  if (avatarEyeTrackingId) {
    lookAt(avatarEyeTrackingId, x, y, duration);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const eyeTracking = {
  init: initEyeTracking,
  dispose: disposeEyeTracking,
  disposeAll: disposeAllEyeTracking,
  setEnabled: setEyeTrackingEnabled,
  pause: pauseEyeTracking,
  setStrength: setEyeTrackingStrength,
  setSmoothness: setEyeTrackingSmoothness,
  lookAt,
  lookAround,
  // Avatar conveniences
  initAvatar: initAvatarEyeTracking,
  disposeAvatar: disposeAvatarEyeTracking,
  pauseAvatar: pauseAvatarEyeTracking,
  avatarLookAt,
};

export default eyeTracking;

