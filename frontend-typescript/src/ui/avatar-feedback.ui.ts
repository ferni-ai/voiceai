/**
 * Avatar Feedback UI - Visual Communication with Subtle Context
 * 
 * The avatar IS the notification system.
 * Communicates state through behavior AND subtle contextual hints.
 * 
 * Pixar Philosophy: Emotions are shown through movement.
 * Apple Philosophy: The best interface is invisible.
 * Brand Philosophy: Warm, Grounded, Wise, Present, Human.
 * 
 * 🆕 Now includes optional "whisper" status messages that feel like
 * the avatar is briefly speaking its state, not interrupting.
 * 
 * 🆕 Persona-specific idle behaviors make each character feel unique.
 */

import { 
  DURATION, 
  EASING, 
  registerAnimation, 
  unregisterAnimation, 
  isAnimating,
} from '../config/animation-constants.js';
import {
  getPersonaAnimationProfile,
  getEasing,
  type PersonaAnimationProfile,
} from '@design-system/tokens';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AvatarFeedback');

// Animation target IDs for conflict prevention
const ANIMATION_TARGET_IDLE = 'avatar-idle';
const ANIMATION_TARGET_FEEDBACK = 'avatar-feedback';

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let avatar: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
let avatarRing: HTMLElement | null = null;
let connectingAnimation: Animation | null = null;
let dancingAnimation: Animation | null = null;
let dancingRingAnimation: Animation | null = null;
let isDancing = false;

// 🆕 Status whisper element - subtle text near avatar
let statusWhisperElement: HTMLElement | null = null;
let statusWhisperTimeout: ReturnType<typeof setTimeout> | null = null;
let lastWhisperMessage: string | null = null; // Track to prevent duplicate whispers

// 🆕 Persona-specific idle animations
let currentPersonaId: string = 'ferni';
let personaIdleAnimation: Animation | null = null;
let personaIdleTimeoutId: ReturnType<typeof setTimeout> | null = null;

// 🎬 FIX: Track if entrance animation is complete before starting idle behaviors
let entranceComplete = false;
let pendingIdleStart = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initAvatarFeedback(): void {
  avatar = document.getElementById('coachAvatar');
  avatarContainer = document.getElementById('coach');
  avatarRing = document.getElementById('avatarRing');
  
  // 🆕 Create status whisper element if it doesn't exist
  createStatusWhisperElement();
  
  // 🎬 NOTE: GPU hints removed - causes visible box bug in Safari
  // GSAP handles GPU acceleration automatically with force3D
  // The clip-path: circle(50%) on #coachAvatar provides clipping without the bug
  
  // 🎬 FIX: DON'T start idle behaviors immediately
  // Wait for entrance animations to complete (signaled via setEntranceComplete)
  // This prevents animation contention that causes the jarring effect
  pendingIdleStart = true;
  entranceComplete = false;
}

// ============================================================================
// STATUS WHISPER - Subtle contextual messages that feel human
// ============================================================================

/**
 * Type-specific whisper styling configurations.
 * Uses design system tokens for consistency with brand.
 */
const WHISPER_TYPE_STYLES: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  success: {
    color: 'var(--color-semantic-success, #4a6741)',
    bgColor: 'var(--color-semantic-success-tint, rgba(74, 103, 65, 0.08))',
    borderColor: 'var(--color-semantic-success-border, rgba(74, 103, 65, 0.15))',
  },
  error: {
    color: 'var(--color-semantic-error, #7a5a52)',
    bgColor: 'var(--color-semantic-error-tint, rgba(122, 90, 82, 0.08))',
    borderColor: 'var(--color-semantic-error-border, rgba(122, 90, 82, 0.15))',
  },
  warning: {
    color: 'var(--color-semantic-warning, #b8956a)',
    bgColor: 'var(--color-semantic-warning-tint, rgba(184, 149, 106, 0.08))',
    borderColor: 'var(--color-semantic-warning-border, rgba(184, 149, 106, 0.15))',
  },
  info: {
    color: 'var(--color-text-secondary, #5C544A)',
    bgColor: 'var(--color-background-elevated, rgba(255,253,251,0.95))',
    borderColor: 'var(--color-border-subtle, rgba(44,37,32,0.08))',
  },
};

/**
 * Create the status whisper element.
 * Uses design system tokens for typography, spacing, and colors.
 * 
 * Design Philosophy:
 * - Subtle pill that floats below avatar
 * - Uses brand fonts (Inter for body text)
 * - Earthy palette matching our Japanese zen aesthetic
 * - Smooth organic animations (never jarring)
 */
function createStatusWhisperElement(): void {
  if (statusWhisperElement || !avatarContainer) return;
  
  statusWhisperElement = document.createElement('div');
  statusWhisperElement.id = 'statusWhisper';
  statusWhisperElement.className = 'status-whisper';
  statusWhisperElement.setAttribute('aria-live', 'polite');
  statusWhisperElement.setAttribute('aria-atomic', 'true');
  
  // Design system-aligned styling
  // Uses CSS variables from index.html and brand tokens
  statusWhisperElement.style.cssText = `
    position: absolute;
    bottom: -36px;
    left: 50%;
    transform: translateX(-50%) translateY(8px) scale(0.95);
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    background: var(--color-bg-elevated, rgba(255,253,251,0.95));
    border: 1px solid var(--color-border-subtle, rgba(44,37,32,0.08));
    border-radius: var(--radius-full, 9999px);
    font-family: var(--font-body, 'Inter', -apple-system, sans-serif);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.01em;
    color: var(--color-text-secondary, #5C544A);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    z-index: 5;
    box-shadow: var(--shadow-md, 0 1px 3px rgba(44,37,32,0.04), 0 4px 12px rgba(44,37,32,0.06));
    backdrop-filter: blur(var(--glass-blur-subtle, 8px));
    -webkit-backdrop-filter: blur(var(--glass-blur-subtle, 8px));
    transition: 
      opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
    will-change: opacity, transform;
  `;
  
  // Insert into the avatar container
  avatarContainer.appendChild(statusWhisperElement);
}

/**
 * Show a brief whisper message near the avatar.
 * Used for status updates that feel like the avatar is speaking.
 * 
 * Design: Subtle, non-intrusive, type-specific coloring.
 * 
 * @param message - Short status text
 * @param type - Message type for styling (info, success, error, warning)
 * @param durationMs - How long to show (default 2500ms)
 */
export function whisperStatus(
  message: string, 
  type: 'info' | 'success' | 'error' | 'warning' = 'info',
  durationMs: number = 2500
): void {
  if (!statusWhisperElement) return;
  
  // Don't show duplicate whispers in quick succession (debounce)
  if (message === lastWhisperMessage && statusWhisperElement.style.opacity === '1') {
    return;
  }
  lastWhisperMessage = message;
  
  // Clear any existing timeout
  if (statusWhisperTimeout) {
    clearTimeout(statusWhisperTimeout);
  }
  
  // Apply type-specific styling from design system
  const typeStyle = WHISPER_TYPE_STYLES[type] ?? WHISPER_TYPE_STYLES.info;
  statusWhisperElement.style.color = typeStyle?.color ?? '#ffffff';
  statusWhisperElement.style.background = typeStyle?.bgColor ?? 'rgba(0,0,0,0.8)';
  statusWhisperElement.style.borderColor = typeStyle?.borderColor ?? 'rgba(255,255,255,0.1)';
  
  // Update text and show with spring animation
  statusWhisperElement.textContent = message;
  statusWhisperElement.style.opacity = '1';
  statusWhisperElement.style.transform = 'translateX(-50%) translateY(0) scale(1)';
  
  // Auto-hide after duration (0 means stay visible)
  if (durationMs > 0) {
    statusWhisperTimeout = setTimeout(() => {
      hideStatusWhisper();
    }, durationMs);
  }
}

/**
 * Hide the status whisper with smooth exit animation.
 */
export function hideStatusWhisper(): void {
  if (!statusWhisperElement) return;
  
  statusWhisperElement.style.opacity = '0';
  statusWhisperElement.style.transform = 'translateX(-50%) translateY(8px) scale(0.95)';
  
  if (statusWhisperTimeout) {
    clearTimeout(statusWhisperTimeout);
    statusWhisperTimeout = null;
  }
  
  // Clear last message after fade out
  setTimeout(() => {
    lastWhisperMessage = null;
  }, 350);
}

// ============================================================================
// PERSONA-SPECIFIC IDLE BEHAVIORS - Each character feels unique
// ============================================================================

/**
 * Set the current persona for persona-specific animations.
 * @param personaId - The persona ID (e.g., 'ferni', 'jack-bogle')
 */
export function setPersona(personaId: string): void {
  currentPersonaId = personaId;
  // Restart idle behaviors with new persona's profile (only if entrance is complete)
  stopPersonaIdleBehaviors();
  if (entranceComplete) {
    startPersonaIdleBehaviors();
  }
}

/**
 * 🎬 FIX: Signal that entrance animations are complete.
 * Call this after the avatar's entrance animation finishes.
 * This unlocks the idle behaviors to prevent animation contention.
 */
export function setEntranceComplete(): void {
  entranceComplete = true;
  
  // Start idle behaviors if they were pending
  if (pendingIdleStart) {
    pendingIdleStart = false;
    // Add a small delay for smoother transition from entrance to idle
    setTimeout(() => {
      startPersonaIdleBehaviors();
    }, 200);
  }
  
  // 🎬 Clean up GPU hints after entrance - browser can now manage layers
  // NOTE: willChange cleanup removed - we no longer set these styles (Safari bug fix)
}

/**
 * Start persona-specific idle behaviors.
 * Each persona has their own movement style based on their personality.
 * 
 * From design system:
 * - ferni: Warm, playful, curious (like WALL-E)
 * - jack-bogle: Wise, measured, deliberate (like Carl from Up)
 * - peter-john: Energetic, practical, quick
 * - alex-chen: Thoughtful, articulate, empathetic
 * - maya-santos: Organized, practical, steady
 * - jordan-taylor: Creative, enthusiastic, expressive
 */
function startPersonaIdleBehaviors(): void {
  if (!avatarContainer) return;
  
  // 🎬 FIX: Don't start idle behaviors until entrance animations are complete
  // This prevents animation contention that causes jarring on startup
  if (!entranceComplete) {
    pendingIdleStart = true;
    return;
  }
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  const profile = getPersonaAnimationProfile(currentPersonaId);
  if (!profile) return;
  
  const scheduleIdleAnimation = () => {
    // Timing varies by persona (wise characters move slower)
    const baseInterval = 5000;
    const interval = baseInterval * profile.timingMultiplier;
    const variance = interval * 0.4;
    const delay = interval + (Math.random() * variance - variance / 2);
    
    personaIdleTimeoutId = setTimeout(() => {
      performPersonaIdleAnimation(profile);
      scheduleIdleAnimation();
    }, delay);
  };
  
  scheduleIdleAnimation();
}

/**
 * Perform a persona-specific idle animation.
 * Animation style matches the character's personality.
 * 
 * 🎬 FIX: Uses animation conflict prevention to avoid contention with feedback animations.
 */
function performPersonaIdleAnimation(profile: PersonaAnimationProfile): void {
  if (!avatarContainer || personaIdleAnimation) return;
  
  // Don't animate while dancing or doing other actions
  if (isDancing) return;
  
  // 🎬 FIX: Check if feedback animation is running - don't interrupt it
  if (isAnimating(ANIMATION_TARGET_FEEDBACK)) return;
  
  // Register this animation
  if (!registerAnimation(ANIMATION_TARGET_IDLE)) return;
  
  let keyframes: Keyframe[];
  let duration: number;
  
  switch (profile.thinkingStyle) {
    case 'curious-tilt':
      // Ferni - WALL-E style curious head tilt
      keyframes = [
        { transform: 'rotate(0deg) translateX(0)' },
        { transform: `rotate(${(Math.random() - 0.5) * 5}deg) translateX(${(Math.random() - 0.5) * 3}px)` },
        { transform: 'rotate(0deg) translateX(0)' },
      ];
      duration = DURATION.CELEBRATION * profile.timingMultiplier;
      break;
      
    case 'contemplative-pause':
      // Jack Bogle - Wise, measured settling
      keyframes = [
        { transform: 'translateY(0) scale(1, 1)' },
        { transform: 'translateY(-1px) scale(0.998, 1.002)' },
        { transform: 'translateY(0.5px) scale(1.001, 0.999)' },
        { transform: 'translateY(0) scale(1, 1)' },
      ];
      duration = DURATION.DRAMATIC * profile.timingMultiplier;
      break;
      
    case 'rapid-process':
      // Peter Lynch - Quick, energetic micro-movements
      keyframes = [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(2deg) translateY(-1px)' },
        { transform: 'rotate(-1deg) translateY(0.5px)' },
        { transform: 'rotate(0deg)' },
      ];
      duration = DURATION.SLOW * profile.timingMultiplier;
      break;
      
    case 'careful-consideration':
      // Alex Chen - Thoughtful, gentle sway
      keyframes = [
        { transform: 'translateX(0) rotate(0deg)' },
        { transform: 'translateX(1px) rotate(0.5deg)' },
        { transform: 'translateX(-0.5px) rotate(-0.3deg)' },
        { transform: 'translateX(0) rotate(0deg)' },
      ];
      duration = DURATION.CELEBRATION * profile.timingMultiplier;
      break;
      
    case 'methodical':
      // Maya Santos - Practical, focused micro-movements
      keyframes = [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-0.8px)' },
        { transform: 'translateY(0.3px)' },
        { transform: 'translateY(0)' },
      ];
      duration = DURATION.DELIBERATE * profile.timingMultiplier;
      break;
      
    case 'brainstorm-burst':
      // Jordan Taylor - Enthusiastic, bouncy energy
      keyframes = [
        { transform: 'scale(1, 1) rotate(0deg)' },
        { transform: `scale(${1 + profile.bounciness * 0.02}, ${1 - profile.bounciness * 0.01}) rotate(${(Math.random() - 0.5) * 3}deg)` },
        { transform: 'scale(0.998, 1.002) rotate(0deg)' },
        { transform: 'scale(1, 1) rotate(0deg)' },
      ];
      duration = DURATION.SLOW * profile.timingMultiplier;
      break;
      
    default:
      // Neutral fallback
      keyframes = [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-1px)' },
        { transform: 'translateY(0)' },
      ];
      duration = DURATION.DELIBERATE;
  }
  
  // Get persona-appropriate easing
  const easing = getEasing(profile.easingPreference);
  
  personaIdleAnimation = avatarContainer.animate(keyframes, {
    duration,
    easing,
    composite: 'add',
  });
  
  personaIdleAnimation.onfinish = () => {
    personaIdleAnimation = null;
    // 🎬 FIX: Unregister animation when complete
    unregisterAnimation(ANIMATION_TARGET_IDLE);
  };
}

/**
 * Stop persona-specific idle behaviors.
 */
function stopPersonaIdleBehaviors(): void {
  if (personaIdleTimeoutId) {
    clearTimeout(personaIdleTimeoutId);
    personaIdleTimeoutId = null;
  }
  if (personaIdleAnimation) {
    personaIdleAnimation.cancel();
    personaIdleAnimation = null;
  }
  // 🎬 FIX: Unregister animation
  unregisterAnimation(ANIMATION_TARGET_IDLE);
}

// ============================================================================
// FEEDBACK FUNCTIONS - Avatar communicates through behavior
// ============================================================================

/**
 * 🎬 FIX: Helper to stop idle and register feedback animation.
 * Ensures feedback animations run smoothly without contention.
 */
function startFeedbackAnimation(): boolean {
  // Stop any idle animation to prevent conflicts
  if (personaIdleAnimation) {
    personaIdleAnimation.cancel();
    personaIdleAnimation = null;
    unregisterAnimation(ANIMATION_TARGET_IDLE);
  }
  
  // Register feedback animation (short-lived, auto-clears)
  registerAnimation(ANIMATION_TARGET_FEEDBACK);
  
  // Auto-unregister after typical feedback duration
  setTimeout(() => {
    unregisterAnimation(ANIMATION_TARGET_FEEDBACK);
  }, DURATION.DRAMATIC);
  
  return true;
}

/**
 * SUCCESS: Warm glow pulse + ring brightens
 * Used for: Connected, action completed, positive confirmation
 * 
 * @param message - Optional whisper message to show
 */
export function feedbackSuccess(message?: string): void {
  if (!avatar || !avatarRing) return;
  
  // 🎬 FIX: Ensure clean animation start
  startFeedbackAnimation();
  
  // Avatar warm pulse
  avatar.animate([
    { filter: 'brightness(1) saturate(1)', boxShadow: 'var(--shadow-xl)' },
    { filter: 'brightness(1.08) saturate(1.15)', boxShadow: 'var(--shadow-xl), 0 0 20px 4px var(--persona-glow)' },
    { filter: 'brightness(1.03) saturate(1.05)', boxShadow: 'var(--shadow-xl), 0 0 10px 2px var(--persona-glow)' },
    { filter: 'brightness(1) saturate(1)', boxShadow: 'var(--shadow-xl)' },
  ], { duration: DURATION.DRAMATIC, easing: EASING.STANDARD });
  
  // Ring brightens
  avatarRing.animate([
    { opacity: '0.6', transform: 'scale(1)' },
    { opacity: '0.9', transform: 'scale(1.03)' },
    { opacity: '0.7', transform: 'scale(1)' },
  ], { duration: DURATION.DELIBERATE, easing: EASING.STANDARD });
  
  // 🆕 Show whisper if message provided (type-specific styling)
  if (message) {
    whisperStatus(message, 'success', 2000);
  }
}

/**
 * ERROR: Quick shake + ring flickers
 * Used for: Connection failed, permission denied, error state
 * 
 * @param message - Optional whisper message to show
 */
export function feedbackError(message?: string): void {
  if (!avatarContainer || !avatarRing) return;
  
  // 🎬 FIX: Ensure clean animation start
  startFeedbackAnimation();
  
  // Avatar shake
  avatarContainer.animate([
    { transform: 'translateX(0)' },
    { transform: 'translateX(-3px)' },
    { transform: 'translateX(3px)' },
    { transform: 'translateX(-2px)' },
    { transform: 'translateX(2px)' },
    { transform: 'translateX(0)' },
  ], { duration: DURATION.SLOW, easing: EASING.STANDARD });
  
  // Ring flickers with error color (earthy clay from semantic colors)
  const errorColor = 'var(--color-error, #7a5a52)';
  avatarRing.animate([
    { borderColor: 'var(--persona-primary)', opacity: '0.6' },
    { borderColor: errorColor, opacity: '0.8' },
    { borderColor: 'var(--persona-primary)', opacity: '0.5' },
    { borderColor: errorColor, opacity: '0.7' },
    { borderColor: 'var(--persona-primary)', opacity: '0.6' },
  ], { duration: DURATION.MODERATE, easing: EASING.EASE_OUT });
  
  // 🆕 Show whisper if message provided (error styling - longer duration)
  if (message) {
    whisperStatus(message, 'error', 3500);
  }
}

/**
 * WARNING: Curious tilt + ring pulses amber
 * Used for: Needs attention, caution state
 * 
 * @param message - Optional whisper message to show
 */
export function feedbackWarning(message?: string): void {
  if (!avatarContainer || !avatarRing) return;
  
  // 🎬 FIX: Ensure clean animation start
  startFeedbackAnimation();
  
  // Curious head tilt
  avatarContainer.animate([
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(-4deg)' },
    { transform: 'rotate(2deg)' },
    { transform: 'rotate(0deg)' },
  ], { duration: DURATION.MODERATE, easing: EASING.SPRING });
  
  // Ring pulse using persona color - earthy palette
  avatarRing.animate([
    { borderColor: 'var(--persona-primary)', opacity: '0.6' },
    { borderColor: 'var(--persona-secondary)', opacity: '0.9' },
    { borderColor: 'var(--persona-primary)', opacity: '0.6' },
  ], { duration: DURATION.DELIBERATE, easing: EASING.EASE_OUT });
  
  // 🆕 Show whisper if message provided (warning styling)
  if (message) {
    whisperStatus(message, 'warning', 3000);
  }
}

/**
 * INFO: Gentle nod + ring breathes
 * Used for: Acknowledgment, neutral notification
 * 
 * @param message - Optional whisper message to show
 */
export function feedbackInfo(message?: string): void {
  if (!avatarContainer) return;
  
  // 🎬 FIX: Ensure clean animation start
  startFeedbackAnimation();
  
  // Gentle nod
  avatarContainer.animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-2px)' },
    { transform: 'translateY(1px)' },
    { transform: 'translateY(0)' },
  ], { duration: DURATION.SLOW, easing: EASING.STANDARD });
  
  // 🆕 Show whisper if message provided (info styling)
  if (message) {
    whisperStatus(message, 'info', 2500);
  }
}

/**
 * CONNECTING: Ring spins slowly
 * Used for: Connection in progress
 */
export function feedbackConnecting(): void {
  if (!avatarRing) return;
  
  // Stop any existing connecting animation
  feedbackStopConnecting();
  
  // Ring rotation
  connectingAnimation = avatarRing.animate([
    { transform: 'rotate(0deg)', opacity: '0.5' },
    { transform: 'rotate(180deg)', opacity: '0.7' },
    { transform: 'rotate(360deg)', opacity: '0.5' },
  ], { duration: DURATION.GLACIAL, iterations: Infinity, easing: EASING.LINEAR });
}

/**
 * Stop connecting animation
 */
export function feedbackStopConnecting(): void {
  if (connectingAnimation) {
    connectingAnimation.cancel();
    connectingAnimation = null;
  }
  
  // Also cancel any lingering animations on the ring
  if (avatarRing) {
    avatarRing.getAnimations().forEach(a => {
      if (a !== connectingAnimation) return;
      a.cancel();
    });
  }
}

/**
 * DISCONNECTED: Avatar dims, exhales
 * Used for: Connection ended
 */
export function feedbackDisconnected(): void {
  if (!avatar || !avatarRing) return;
  
  feedbackStopConnecting();
  
  // Avatar dims
  avatar.animate([
    { filter: 'brightness(1)', opacity: '1' },
    { filter: 'brightness(0.95)', opacity: '0.9' },
    { filter: 'brightness(1)', opacity: '1' },
  ], { duration: DURATION.MODERATE, easing: EASING.EASE_OUT });
  
  // Ring fades
  avatarRing.animate([
    { opacity: '0.6' },
    { opacity: '0.3' },
    { opacity: '0.5' },
  ], { duration: DURATION.MODERATE, easing: EASING.EASE_OUT });
}

/**
 * LISTENING: Subtle attention pulse
 * Used for: Ready to receive input
 */
export function feedbackListening(): void {
  if (!avatarRing) return;
  
  // Ring gentle glow pulse
  avatarRing.animate([
    { opacity: '0.5', boxShadow: '0 0 0 transparent' },
    { opacity: '0.7', boxShadow: '0 0 8px var(--persona-glow)' },
    { opacity: '0.6', boxShadow: '0 0 4px var(--persona-glow)' },
  ], { duration: DURATION.CELEBRATION, easing: EASING.EASE_OUT });
}

/**
 * THINKING: Cool tint + ring pulses
 * Used for: Processing, loading
 */
export function feedbackThinking(): void {
  if (!avatar || !avatarRing) return;
  
  // 🎬 FIX: Stop idle animations for thinking (long-running)
  if (personaIdleAnimation) {
    personaIdleAnimation.cancel();
    personaIdleAnimation = null;
    unregisterAnimation(ANIMATION_TARGET_IDLE);
  }
  registerAnimation(ANIMATION_TARGET_FEEDBACK);
  
  // Avatar cool tint
  avatar.animate([
    { filter: 'brightness(1) saturate(1) hue-rotate(0deg)' },
    { filter: 'brightness(0.98) saturate(0.95) hue-rotate(5deg)' },
  ], { duration: DURATION.SLOW, easing: EASING.EASE_OUT, fill: 'forwards' });
  
  // Ring slow pulse
  avatarRing.animate([
    { opacity: '0.5', transform: 'scale(1)' },
    { opacity: '0.7', transform: 'scale(1.02)' },
    { opacity: '0.5', transform: 'scale(1)' },
  ], { duration: DURATION.GLACIAL, iterations: Infinity, easing: EASING.EASE_IN_OUT });
}

/**
 * Stop thinking animation
 */
export function feedbackStopThinking(): void {
  if (!avatar || !avatarRing) return;
  
  // 🎬 FIX: Unregister feedback animation
  unregisterAnimation(ANIMATION_TARGET_FEEDBACK);
  
  // Reset avatar filter
  avatar.animate([
    { filter: 'brightness(1) saturate(1) hue-rotate(0deg)' },
  ], { duration: DURATION.NORMAL, easing: EASING.EASE_OUT, fill: 'forwards' });
  
  // Stop ring animations
  avatarRing.getAnimations().forEach(a => a.cancel());
}

// ============================================================================
// MUSIC ANIMATIONS - Bass Speaker Effect
// ============================================================================

/**
 * LISTENING TO MUSIC: Bass Speaker Reverberation
 * 
 * The avatar pulses like an old-time bass speaker cone.
 * Halo stays static - no movement, just the avatar responds.
 */
export function feedbackDancing(): void {
  if (!avatarContainer || !avatar) return;
  
  // Don't double-start
  if (isDancing) return;
  isDancing = true;
  
  // Stop any conflicting animations
  feedbackStopThinking();
  feedbackStopConnecting();
  
  // Add music class for CSS hooks
  avatarContainer.classList.add('is-listening-music');
  
  // Avatar: Bass speaker cone pulse - subtle scale breathing
  // Like the paper cone of a vintage speaker responding to bass
  dancingAnimation = avatar.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.012)', filter: 'brightness(1.015)' },
    { transform: 'scale(0.997)', filter: 'brightness(0.995)' },
    { transform: 'scale(1.008)', filter: 'brightness(1.01)' },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], { 
    duration: 800, // Quick bass pulse rhythm
    iterations: Infinity,
    easing: 'ease-in-out',
  });
  
  // Halo stays static - no animation
}

/**
 * Stop music animation - graceful transition back to rest
 */
export function feedbackStopDancing(): void {
  if (!isDancing) return;
  isDancing = false;
  
  // Cancel running animations
  if (dancingAnimation) {
    dancingAnimation.cancel();
    dancingAnimation = null;
  }
  
  if (dancingRingAnimation) {
    dancingRingAnimation.cancel();
    dancingRingAnimation = null;
  }
  
  // Gracefully return avatar to normal (reset scale and brightness)
  if (avatar) {
    avatar.getAnimations().forEach(a => a.cancel());
    avatar.animate([
      { transform: 'scale(1)', filter: 'brightness(1) saturate(1)' },
    ], { duration: 400, easing: 'ease-out', fill: 'forwards' });
  }
  
  // Remove all music classes
  if (avatarContainer) {
    avatarContainer.classList.remove('is-listening-music');
    avatarContainer.classList.remove('is-fading-music');
    avatarContainer.classList.remove('is-ducking-music');
  }
}

/**
 * DJ-style fade out - the human touch.
 * The bass speaker slows down as the track fades.
 */
export function feedbackFading(): void {
  if (!avatarContainer || !avatar) return;
  if (!isDancing) return; // Only fade if we were dancing
  
  // Cancel current avatar animation
  if (dancingAnimation) {
    dancingAnimation.cancel();
    dancingAnimation = null;
  }
  
  // Avatar: Slow, diminishing pulse - the speaker winding down
  dancingAnimation = avatar.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.005)', filter: 'brightness(1.008)' },
    { transform: 'scale(1)', filter: 'brightness(0.99)' },
  ], { 
    duration: 2000, // Slower rhythm as track fades
    iterations: 2, // Just a couple more gentle pulses
    easing: 'ease-out',
  });
  
  // Add a subtle class for CSS hooks
  avatarContainer.classList.add('is-fading-music');
}

/**
 * DJ ducking - agent speaking over music.
 * The bass pulse becomes barely perceptible.
 */
export function feedbackDucking(): void {
  if (!avatarContainer || !avatar) return;
  if (!isDancing) return; // Only duck if music was playing
  
  // Cancel current avatar animation
  if (dancingAnimation) {
    dancingAnimation.cancel();
    dancingAnimation = null;
  }
  
  // Avatar: Very subtle pulse - music in background, focus on voice
  dancingAnimation = avatar.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.003)', filter: 'brightness(1.005)' },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], { 
    duration: 1200, // Slower, calmer
    iterations: Infinity,
    easing: 'ease-in-out',
  });
  
  // Add class for CSS hooks
  avatarContainer.classList.add('is-ducking-music');
}

/**
 * Restore full music presence after ducking ends.
 */
export function feedbackUnduck(): void {
  if (!avatarContainer || !avatar) return;
  if (!isDancing) return;
  
  // Remove ducking class
  avatarContainer?.classList.remove('is-ducking-music');
  
  // Cancel current animation
  if (dancingAnimation) {
    dancingAnimation.cancel();
    dancingAnimation = null;
  }
  
  // Restore full bass pulse
  dancingAnimation = avatar.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.012)', filter: 'brightness(1.015)' },
    { transform: 'scale(0.997)', filter: 'brightness(0.995)' },
    { transform: 'scale(1.008)', filter: 'brightness(1.01)' },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], { 
    duration: 800,
    iterations: Infinity,
    easing: 'ease-in-out',
  });
}

/**
 * Check if avatar is currently dancing
 */
export function isAvatarDancing(): boolean {
  return isDancing;
}

// ============================================================================
// 🎉 FUN MICRO-REACTIONS - Delightful avatar moments
// ============================================================================

type ReactionType = 'happy' | 'curious' | 'empathy' | 'laugh' | 'surprise';

/**
 * Trigger a fun micro-reaction on the avatar.
 * These are short, delightful animations for special moments.
 * 
 * Usage:
 * - 'happy': Good news, celebrations, achievements
 * - 'curious': "Tell me more", interest shown
 * - 'empathy': Understanding, compassion, validation
 * - 'laugh': Humor detected, jokes, playful moments
 * - 'surprise': Unexpected good news, "wow!" moments
 * 
 * @param reaction - The type of reaction to trigger
 */
export function triggerReaction(reaction: ReactionType): void {
  const coach = document.getElementById('coach');
  if (!coach) return;
  
  // Remove any existing reaction classes
  coach.classList.remove(
    'reaction-happy', 
    'reaction-curious', 
    'reaction-empathy', 
    'reaction-laugh', 
    'reaction-surprise'
  );
  
  // Force reflow to restart animation
  void coach.offsetWidth;
  
  // Add the new reaction class
  coach.classList.add(`reaction-${reaction}`);
  
  log.debug(`🎭 Avatar reaction: ${reaction}`);
  
  // Remove class after animation completes (longest is 0.8s)
  setTimeout(() => {
    coach.classList.remove(`reaction-${reaction}`);
  }, 850);
}

/**
 * Trigger a random fun reaction (for testing or random delight moments)
 */
export function triggerRandomReaction(): void {
  const reactions: ReactionType[] = ['happy', 'curious', 'empathy', 'laugh', 'surprise'];
  const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
  if (randomReaction) {
    triggerReaction(randomReaction);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  // Stop all animations
  stopPersonaIdleBehaviors();
  feedbackStopDancing();
  feedbackStopConnecting();
  feedbackStopThinking();
  hideStatusWhisper();
  
  // Clear references
  avatar = null;
  avatarContainer = null;
  avatarRing = null;
  statusWhisperElement = null;
  
  // 🎬 FIX: Reset entrance state
  entranceComplete = false;
  pendingIdleStart = false;
}

// ============================================================================
// 🍴 EATING ANIMATION - Fun interaction for removing agents
// ============================================================================

let isEating = false;
let dropZoneElement: HTMLElement | null = null;

/**
 * Setup the avatar as a drop zone for agent "eating"
 * Uses the full coach element (#coach) for a larger hit area
 */
export function setupAvatarDropZone(onAgentDropped: (agentId: string) => void): void {
  // Use the entire coach section as drop zone for bigger hitbox
  dropZoneElement = document.getElementById('coach');
  if (!dropZoneElement) {
    log.warn('🍴 Drop zone element #coach not found');
    return;
  }
  
  // Prevent default drag behaviors on the entire drop zone
  dropZoneElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isEating && avatarContainer) {
      avatarContainer.classList.add('avatar-hungry');
      // Anticipation animation - avatar opens into a donut
      if (avatar && !avatar.classList.contains('avatar-anticipating')) {
        avatar.classList.add('avatar-anticipating');
        startHungryAnimation();
      }
    }
  });
  
  dropZoneElement.addEventListener('dragleave', (e) => {
    // Only trigger if leaving the entire drop zone, not children
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && dropZoneElement?.contains(relatedTarget)) return;
    
    e.preventDefault();
    cancelHungryAnimation();
  });
  
  dropZoneElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const agentId = e.dataTransfer?.getData('text/plain');
    cancelHungryAnimation();
    
    if (!agentId || isEating) return;
    
    // Play eating animation
    await playEatingAnimation();
    
    // Notify callback to actually uninstall
    onAgentDropped(agentId);
  });
  
  log.debug('🍴 Avatar drop zone initialized');
}

/**
 * Start the "hungry" anticipation animation - avatar becomes a donut
 */
function startHungryAnimation(): void {
  if (!avatar || !avatarRing) return;
  
  // Avatar grows and opens up like a donut (hole in center)
  avatar.animate([
    { transform: 'scale(1)', boxShadow: 'inset 0 0 0 0 rgba(0,0,0,0)' },
    { transform: 'scale(1.2)', boxShadow: 'inset 0 0 0 20px var(--color-bg-primary, #1a1612)' },
  ], {
    duration: 300,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fill: 'forwards',
  });
  
  // Ring pulses invitingly
  avatarRing.animate([
    { transform: 'scale(1)', opacity: '0.3' },
    { transform: 'scale(1.15)', opacity: '0.8' },
  ], {
    duration: 300,
    easing: 'ease-out',
    fill: 'forwards',
  });
}

/**
 * Cancel the hungry animation and return to normal
 */
function cancelHungryAnimation(): void {
  avatarContainer?.classList.remove('avatar-hungry');
  
  if (avatar) {
    avatar.classList.remove('avatar-anticipating');
    // Animate back to normal circle
    avatar.animate([
      { transform: 'scale(1.2)', boxShadow: 'inset 0 0 0 20px var(--color-bg-primary, #1a1612)' },
      { transform: 'scale(1)', boxShadow: 'inset 0 0 0 0 rgba(0,0,0,0)' },
    ], {
      duration: 200,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }
  
  if (avatarRing) {
    avatarRing.animate([
      { transform: 'scale(1.15)', opacity: '0.8' },
      { transform: 'scale(1)', opacity: '0.3' },
    ], {
      duration: 200,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }
}

/**
 * Play the satisfying eating animation
 * The avatar "swallows" the dropped agent through its donut hole
 */
async function playEatingAnimation(): Promise<void> {
  if (!avatar || !avatarContainer || !avatarRing || isEating) return;
  
  isEating = true;
  avatar.classList.remove('avatar-anticipating');
  avatarContainer.classList.add('avatar-eating');
  
  // Phase 1: Quick close of the donut hole (gulp!)
  await avatar.animate([
    { transform: 'scale(1.2)', boxShadow: 'inset 0 0 0 20px var(--color-bg-primary, #1a1612)' },
    { transform: 'scale(1.25)', boxShadow: 'inset 0 0 0 0 rgba(0,0,0,0)' },
  ], {
    duration: 150,
    easing: 'ease-in',
    fill: 'forwards',
  }).finished;
  
  // Phase 2: Digest - gentle pulse outward then settle
  await avatar.animate([
    { transform: 'scale(1.25)' },
    { transform: 'scale(1.1)' },
    { transform: 'scale(1.15)' },
    { transform: 'scale(1)' },
  ], {
    duration: 400,
    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    fill: 'forwards',
  }).finished;
  
  // Ring settles back
  avatarRing.animate([
    { transform: 'scale(1.15)', opacity: '0.8' },
    { transform: 'scale(1)', opacity: '0.3' },
  ], {
    duration: 300,
    easing: 'ease-out',
    fill: 'forwards',
  });
  
  // Phase 3: Satisfied little bounce
  await avatar.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.05)' },
    { transform: 'scale(0.98)' },
    { transform: 'scale(1)' },
  ], {
    duration: 250,
    easing: 'ease-in-out',
    fill: 'forwards',
  }).finished;
  
  // Ensure we're back to exact original state
  avatar.style.transform = 'scale(1)';
  avatar.style.boxShadow = '';
  
  avatarContainer.classList.remove('avatar-eating');
  isEating = false;
  
  // Show a playful whisper
  whisperStatus('Nom nom!', 'success', 1500);
}

/**
 * Check if avatar is currently eating
 */
export function isAvatarEating(): boolean {
  return isEating;
}

// ============================================================================
// UNIFIED API
// ============================================================================

export const avatarFeedback = {
  init: initAvatarFeedback,
  dispose,
  // 🆕 Persona management
  setPersona,
  // 🎬 FIX: Entrance animation coordination
  setEntranceComplete,
  // Core feedback states
  success: feedbackSuccess,
  error: feedbackError,
  warning: feedbackWarning,
  info: feedbackInfo,
  connecting: feedbackConnecting,
  stopConnecting: feedbackStopConnecting,
  disconnected: feedbackDisconnected,
  listening: feedbackListening,
  thinking: feedbackThinking,
  stopThinking: feedbackStopThinking,
  // Music animations (the avatar is the speaker)
  dancing: feedbackDancing,
  ducking: feedbackDucking,
  unduck: feedbackUnduck,
  fading: feedbackFading,
  stopDancing: feedbackStopDancing,
  isDancing: isAvatarDancing,
  // 🆕 Status whisper for subtle text feedback
  whisper: whisperStatus,
  hideWhisper: hideStatusWhisper,
  // 🍴 Eating animation for agent removal
  setupDropZone: setupAvatarDropZone,
  isEating: isAvatarEating,
  // 🎉 Fun micro-reactions for delightful moments
  react: triggerReaction,
  reactRandom: triggerRandomReaction,
};

export default avatarFeedback;

