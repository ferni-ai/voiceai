/**
 * Presence UI - Pixar-Inspired Avatar Life Effects
 * 
 * ✨ PIXAR'S 12 PRINCIPLES OF ANIMATION APPLIED:
 * 
 * 1. SQUASH & STRETCH - Avatar subtly compresses/extends during breathing
 * 2. ANTICIPATION - Slight "wind up" before reactions
 * 3. STAGING - Clear visual hierarchy, one action at a time
 * 4. FOLLOW-THROUGH - Overshoot and settle on movements
 * 5. SLOW IN/OUT - Easing on all movements (never linear)
 * 6. ARCS - Natural curved motion paths
 * 7. SECONDARY ACTION - Glow pulses slightly out of phase with breathing
 * 8. TIMING - Golden ratio timing for organic feel
 * 9. EXAGGERATION - Push movements just enough to feel alive
 * 10. SOLID DRAWING - Consistent transforms, proper origin
 * 11. APPEAL - Warm, inviting, curious like WALL-E
 * 12. STRAIGHT AHEAD - Continuous animation, always alive
 * 
 * Animation Architecture:
 * - Container handles breathing + squash/stretch (Web Animations API)
 * - Secondary glow animation slightly out of phase
 * - Eye-tracking for curiosity (like WALL-E examining something)
 * - No CSS animation conflicts - single source of truth
 * 
 * NOTE: Animation constants imported from @design-system/tokens
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('PresenceUI');

import {
  AVATAR_BREATH_TIMING,
  REACTION_PHASES,
  getAvatarParams,
  type AvatarSquashStretchParams,
  // Voice emotion glow
  type VoiceEmotion,
  type SpeakingIntensity,
  applyVoiceGlow,
  VOICE_GLOW_TRANSITIONS,
} from '@design-system/tokens';

import { DURATION, EASING, ANIMATION_PRESET } from '../config/animation-constants.js';

// ============================================================================
// TIMING CONSTANTS (derived from design system)
// ============================================================================

const TIMING = {
  breath: parseInt(AVATAR_BREATH_TIMING.idle),
  breathConnected: parseInt(AVATAR_BREATH_TIMING.connected),
  breathSpeaking: parseInt(AVATAR_BREATH_TIMING.speaking),
  breathListening: parseInt(AVATAR_BREATH_TIMING.listening),
  glowPhaseOffset: 0.23,  // Secondary action offset (slightly out of sync)
  reactionAnticipation: parseInt(REACTION_PHASES.anticipation),
  reactionFollow: parseInt(REACTION_PHASES.followThrough),
};

// ============================================================================
// STATE
// ============================================================================

let avatarElement: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
let isConnected = false;
let isSpeaking = false;
let isListening = false;
let breathingAnimation: Animation | null = null;
let glowAnimation: Animation | null = null; // Secondary action
let leanInAnimation: Animation | null = null; // 🎬 Pixar attentive lean-in
let lastMouseX = 0;
let lastMouseY = 0;

// Voice emotion glow state
let currentEmotion: VoiceEmotion = 'neutral';
let currentIntensity: SpeakingIntensity = 'normal';

// Eye tracking - WALL-E curious following
const EYE_TRACK_STRENGTH = 4;
const EYE_TRACK_SMOOTHING = 0.08;

// Current animation state
let currentOffsetX = 0;
let currentOffsetY = 0;
let eyeTrackingFrame: number | null = null;

// ============================================================================
// HUMAN-LIKE IDLE BEHAVIORS
// ============================================================================

// Blinking - Like a human, the avatar blinks periodically
let blinkTimeoutId: ReturnType<typeof setTimeout> | null = null;
const BLINK_DURATION = 150;       // How long the blink takes

// Micro-idle movements - Subtle random shifts that feel alive
let microIdleAnimation: Animation | null = null;
let microIdleTimeoutId: ReturnType<typeof setTimeout> | null = null;
const MICRO_IDLE_INTERVAL_MIN = 3000;  // Min time between micro-movements
const MICRO_IDLE_INTERVAL_MAX = 8000;  // Max time between micro-movements

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initPresenceUI(): void {
  avatarElement = document.getElementById('coachAvatar');
  avatarContainer = document.querySelector('.avatar-container');
  
  if (!avatarElement) {
    log.warn('Avatar element not found');
    return;
  }
  
  // Track mouse for subtle eye-tracking effect
  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  
  // Start breathing animation using Web Animations API
  startBreathingAnimation();
  
  // Start subtle eye tracking loop
  startEyeTracking();
  
  // 🆕 Human-like behaviors - makes avatar feel alive
  startBlinking();
  startMicroIdleMovements();
  
}

// ============================================================================
// MOUSE TRACKING
// ============================================================================

function handleMouseMove(e: MouseEvent): void {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
}

// ============================================================================
// PIXAR BREATHING ANIMATION (Squash & Stretch + Secondary Action)
// ============================================================================

/**
 * Get the current avatar state for animation parameters.
 */
function getCurrentState(): 'idle' | 'connected' | 'speaking' | 'listening' {
  if (isSpeaking) return 'speaking';
  if (isListening) return 'listening';
  if (isConnected) return 'connected';
  return 'idle';
}

/**
 * Get the Pixar animation parameters for current state.
 * Uses design system constants for consistency.
 */
function getPixarParams(): AvatarSquashStretchParams {
  return getAvatarParams(getCurrentState());
}

/**
 * Get breathing duration based on state.
 * Speaking = faster, more energetic breathing.
 * Uses design system constants for consistency.
 */
function getBreathingDuration(): number {
  const state = getCurrentState();
  switch (state) {
    case 'speaking': return TIMING.breathSpeaking;
    case 'listening': return TIMING.breathListening;
    case 'connected': return TIMING.breathConnected;
    default: return TIMING.breath;
  }
}

/**
 * Start the Pixar-inspired breathing animation.
 * 
 * This implements:
 * - SQUASH & STRETCH: scaleX/scaleY change inversely
 * - ARCS: translateY creates gentle lift
 * - SECONDARY ACTION: Slight rotation adds personality
 * - SLOW IN/OUT: Custom easing for organic feel
 * - FOLLOW-THROUGH: Asymmetric keyframes (inhale faster than exhale)
 */
function startBreathingAnimation(): void {
  if (!avatarContainer) return;
  
  // Cancel existing animations
  if (breathingAnimation) {
    breathingAnimation.cancel();
  }
  
  const p = getPixarParams();
  const duration = getBreathingDuration();
  
  // Pixar-style breathing with squash & stretch
  // Notice the ASYMMETRIC timing - inhale is quicker than exhale
  // This creates the "anticipation" feel
  const keyframes: Keyframe[] = [
    // Rest position
    { 
      transform: 'scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)',
      offset: 0,
    },
    // Quick inhale with anticipation (squash slightly first)
    {
      transform: `scale3d(1.003, 0.997, 1) translate3d(0, 0.5px, 0) rotate(${-p.rotate * 0.3}deg)`,
      offset: 0.08,
    },
    // Peak of inhale - stretch vertically, squash horizontally
    { 
      transform: `scale3d(${p.scaleX}, ${p.scaleY}, 1) translate3d(0, ${p.translateY}px, 0) rotate(${p.rotate}deg)`,
      offset: 0.35,
    },
    // Slight overshoot (follow-through principle)
    {
      transform: `scale3d(${p.scaleX * 0.998}, ${p.scaleY * 1.003}, 1) translate3d(0, ${p.translateY * 1.1}px, 0) rotate(${p.rotate * 1.1}deg)`,
      offset: 0.42,
    },
    // Begin slow exhale
    {
      transform: `scale3d(${p.scaleX * 1.001}, ${p.scaleY * 0.997}, 1) translate3d(0, ${p.translateY * 0.7}px, 0) rotate(${p.rotate * 0.6}deg)`,
      offset: 0.55,
    },
    // Continue exhale (slower, more relaxed)
    {
      transform: `scale3d(1.001, 1.001, 1) translate3d(0, ${p.translateY * 0.3}px, 0) rotate(${p.rotate * 0.2}deg)`,
      offset: 0.75,
    },
    // Settle back with slight undershoot
    {
      transform: 'scale3d(0.999, 1.001, 1) translate3d(0, 0.3px, 0) rotate(-0.1deg)',
      offset: 0.92,
    },
    // Return to rest (perfect origin)
    { 
      transform: 'scale3d(1, 1, 1) translate3d(0, 0, 0) rotate(0deg)',
      offset: 1,
    },
  ];
  
  breathingAnimation = avatarContainer.animate(keyframes, {
    duration,
    iterations: Infinity,
    easing: EASING.STANDARD, // Smooth ease-in-out
    fill: 'both',
  });
  
  // Start secondary glow animation (slightly out of phase)
  startGlowAnimation(duration);
}

/**
 * Secondary Action: Glow pulse slightly out of phase with breathing.
 * This creates the "alive" feeling - like a heartbeat underneath.
 */
function startGlowAnimation(breathDuration: number): void {
  if (!avatarElement) return;
  
  if (glowAnimation) {
    glowAnimation.cancel();
  }
  
  // Glow is slightly faster, creating a subtle "heartbeat" effect
  const glowDuration = breathDuration * 0.85;
  
  const glowKeyframes: Keyframe[] = [
    { 
      filter: 'brightness(1) saturate(1)',
      offset: 0,
    },
    {
      filter: 'brightness(1.03) saturate(1.05)',
      offset: 0.4,
    },
    {
      filter: 'brightness(1.05) saturate(1.08)',
      offset: 0.5,
    },
    {
      filter: 'brightness(1.02) saturate(1.03)',
      offset: 0.7,
    },
    { 
      filter: 'brightness(1) saturate(1)',
      offset: 1,
    },
  ];
  
  glowAnimation = avatarElement.animate(glowKeyframes, {
    duration: glowDuration,
    iterations: Infinity,
    easing: EASING.GENTLE,
    fill: 'both',
  });
}

// ============================================================================
// 🎬 PIXAR ATTENTIVE LEAN-IN - When User Speaks
// ============================================================================

/**
 * Start the attentive lean-in animation when user begins speaking.
 * 
 * Like a character leaning forward to hear better, showing genuine interest.
 * 
 * Pixar Principles:
 * - ANTICIPATION: Slight pause/settle before leaning
 * - STAGING: Clear forward motion toward the "speaker"
 * - FOLLOW-THROUGH: Gentle overshoot then settle into attentive pose
 * - APPEAL: Shows the character cares and is engaged
 * - SECONDARY ACTION: Subtle side-to-side sway while listening
 */
function startAttentiveLeanIn(): void {
  if (!avatarContainer) return;
  
  // Cancel any existing lean-in
  if (leanInAnimation) {
    leanInAnimation.cancel();
  }
  
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Attentive lean-in keyframes - like leaning toward someone who's speaking
  const leanInKeyframes: Keyframe[] = [
    // Start: Natural position
    {
      transform: 'translateY(0) scale(1, 1) rotate(0deg)',
      offset: 0,
    },
    // Anticipation: Slight settle back (preparing to lean)
    {
      transform: 'translateY(1px) scale(1.002, 0.998) rotate(-0.3deg)',
      offset: 0.08,
    },
    // Quick lean forward with squash
    {
      transform: 'translateY(-4px) scale(0.997, 1.003) rotate(0.5deg)',
      offset: 0.25,
    },
    // Overshoot - lean a bit too far (follow-through)
    {
      transform: 'translateY(-5.5px) scale(0.996, 1.004) rotate(0.8deg)',
      offset: 0.35,
    },
    // Settle into attentive position
    {
      transform: 'translateY(-4.5px) scale(0.998, 1.002) rotate(0.5deg)',
      offset: 0.5,
    },
    // Begin subtle listening sway (secondary action)
    {
      transform: 'translateY(-4.2px) scale(0.998, 1.002) rotate(0.3deg)',
      offset: 0.65,
    },
    {
      transform: 'translateY(-4.8px) scale(0.998, 1.002) rotate(0.7deg)',
      offset: 0.8,
    },
    // Back to attentive position for smooth loop
    {
      transform: 'translateY(-4.5px) scale(0.998, 1.002) rotate(0.5deg)',
      offset: 1,
    },
  ];
  
  leanInAnimation = avatarContainer.animate(leanInKeyframes, {
    duration: DURATION.AMBIENT_FAST * 0.8, // Slow, gentle movement
    iterations: Infinity,
    easing: EASING.STANDARD,
    fill: 'forwards',
    composite: 'add', // Add to existing breathing animation
  });
}

/**
 * Stop the attentive lean-in with a smooth return to neutral.
 * Like settling back after the conversation partner finishes speaking.
 */
function stopAttentiveLeanIn(): void {
  if (!avatarContainer || !leanInAnimation) return;
  
  // Get current transform state
  const computedStyle = getComputedStyle(avatarContainer);
  const currentTransform = computedStyle.transform || 'none';
  
  // Cancel the looping animation
  leanInAnimation.cancel();
  leanInAnimation = null;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // Smooth return to neutral
  const settleBackKeyframes: Keyframe[] = [
    { transform: currentTransform, offset: 0 },
    // Slight overshoot past neutral
    { transform: 'translateY(1px) scale(1.001, 0.999) rotate(-0.2deg)', offset: 0.5 },
    // Settle to neutral
    { transform: 'translateY(0) scale(1, 1) rotate(0deg)', offset: 1 },
  ];
  
  const settleAnimation = avatarContainer.animate(settleBackKeyframes, {
    duration: DURATION.DELIBERATE,
    easing: EASING.STANDARD,
    fill: 'forwards',
    composite: 'add',
  });
  
  settleAnimation.onfinish = () => {
    // Animation complete, breathing handles the rest
  };
}

/**
 * Update breathing animation when state changes.
 * Preserves phase for seamless transition.
 */
function updateBreathingAnimation(): void {
  if (!avatarContainer) {
    startBreathingAnimation();
    return;
  }
  
  // Get current phase to preserve timing
  const currentPhase = breathingAnimation?.currentTime;
  const oldDuration = getBreathingDuration();
  
  // Restart with new parameters
  startBreathingAnimation();
  
  // Restore phase position (adjusted for new duration)
  if (breathingAnimation && currentPhase !== undefined) {
    const newDuration = getBreathingDuration();
    const phaseTime = Number(currentPhase);
    const phaseRatio = (phaseTime % oldDuration) / oldDuration;
    breathingAnimation.currentTime = phaseRatio * newDuration;
  }
}

// ============================================================================
// ZEN BLINKING - Context-aware, not random
// ============================================================================

// Track last blink time to prevent rapid blinking
let lastBlinkTime = 0;
const MIN_BLINK_INTERVAL = 1500; // At least 1.5s between blinks

/**
 * Perform a zen blink animation.
 * The whole avatar squashes vertically - like closing eyes.
 * 
 * Called at natural pause points:
 * - When agent stops speaking (thinking pause)
 * - When starting to listen (acknowledgment)
 * 
 * NOT random intervals - intentional and meaningful.
 */
function performBlink(): void {
  if (!avatarElement || !avatarContainer) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  // Don't blink while speaking (looks unnatural)
  if (isSpeaking) return;
  
  // Prevent rapid blinking
  const now = Date.now();
  if (now - lastBlinkTime < MIN_BLINK_INTERVAL) return;
  lastBlinkTime = now;
  
  // Zen blink - whole avatar squashes flat then springs back
  avatarElement.animate([
    { transform: 'scaleY(1) scaleX(1)' },
    { transform: 'scaleY(0.15) scaleX(1.08)', offset: 0.4 },  // Quick close
    { transform: 'scaleY(1.02) scaleX(0.99)', offset: 0.85 }, // Slight overshoot
    { transform: 'scaleY(1) scaleX(1)' },
  ], {
    duration: BLINK_DURATION,
    easing: EASING.GENTLE,
  });
}

// Deprecated - no longer using random interval blinking
function startBlinking(): void {
  // Now context-aware - blinks triggered by state changes
}

function stopBlinking(): void {
  if (blinkTimeoutId) {
    clearTimeout(blinkTimeoutId);
    blinkTimeoutId = null;
  }
}

/**
 * Trigger an immediate blink (for manual testing or reactions).
 */
export function blink(): void {
  performBlink();
}

// ============================================================================
// MICRO-IDLE MOVEMENTS - Subtle life when waiting
// ============================================================================

/**
 * Start subtle micro-movements when idle.
 * 
 * Like a person standing still - they still shift weight,
 * look around, have small movements that show they're alive.
 * 
 * Brand alignment: "Present" - always attentive, never static
 */
function startMicroIdleMovements(): void {
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  
  const scheduleMicroMovement = () => {
    const delay = MICRO_IDLE_INTERVAL_MIN + Math.random() * (MICRO_IDLE_INTERVAL_MAX - MICRO_IDLE_INTERVAL_MIN);
    
    microIdleTimeoutId = setTimeout(() => {
      performMicroIdleMovement();
      scheduleMicroMovement();
    }, delay);
  };
  
  scheduleMicroMovement();
}

/**
 * Perform a subtle micro-movement.
 * Like someone shifting weight or slightly turning head.
 */
function performMicroIdleMovement(): void {
  if (!avatarContainer) return;
  
  // Don't do micro-movements while actively doing something
  if (isSpeaking || isListening || microIdleAnimation) return;
  
  // Random movement type
  const movementType = Math.floor(Math.random() * 4);
  
  let keyframes: Keyframe[];
  
  switch (movementType) {
    case 0: // Slight head tilt
      keyframes = [
        { transform: 'rotate(0deg)' },
        { transform: `rotate(${(Math.random() - 0.5) * 3}deg)` },
        { transform: 'rotate(0deg)' },
      ];
      break;
    case 1: // Subtle weight shift
      keyframes = [
        { transform: 'translateX(0)' },
        { transform: `translateX(${(Math.random() - 0.5) * 2}px)` },
        { transform: 'translateX(0)' },
      ];
      break;
    case 2: // Tiny settle
      keyframes = [
        { transform: 'translateY(0)' },
        { transform: 'translateY(0.5px)' },
        { transform: 'translateY(-0.3px)' },
        { transform: 'translateY(0)' },
      ];
      break;
    case 3: // Curious head turn
    default:
      const direction = Math.random() > 0.5 ? 1 : -1;
      keyframes = [
        { transform: 'rotate(0deg) translateX(0)' },
        { transform: `rotate(${direction * 1.5}deg) translateX(${direction * 1}px)` },
        { transform: 'rotate(0deg) translateX(0)' },
      ];
      break;
  }
  
  microIdleAnimation = avatarContainer.animate(keyframes, {
    duration: DURATION.CELEBRATION + Math.random() * DURATION.SLOW,
    easing: EASING.GENTLE,
    composite: 'add',
  });
  
  microIdleAnimation.onfinish = () => {
    microIdleAnimation = null;
  };
}

function stopMicroIdleMovements(): void {
  if (microIdleTimeoutId) {
    clearTimeout(microIdleTimeoutId);
    microIdleTimeoutId = null;
  }
  if (microIdleAnimation) {
    microIdleAnimation.cancel();
    microIdleAnimation = null;
  }
}

// ============================================================================
// EYE TRACKING - WALL-E Curious Gaze
// ============================================================================

/**
 * Start WALL-E style eye tracking.
 * 
 * Like WALL-E examining something interesting:
 * - Smooth, curious following
 * - Slight "lag" that feels organic
 * - Gentle return to center when mouse is far
 */
function startEyeTracking(): void {
  if (eyeTrackingFrame !== null) return;
  
  let lastTime = performance.now();
  
  const trackEyes = (currentTime: number) => {
    const deltaTime = Math.min(currentTime - lastTime, 50);
    lastTime = currentTime;
    
    if (avatarElement && avatarContainer) {
      const rect = avatarElement.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const dx = lastMouseX - centerX;
      const dy = lastMouseY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      let targetOffsetX = 0;
      let targetOffsetY = 0;
      
      if (distance > 10) {
        // Normalize and apply curious "interest" falloff
        const maxDistance = 500;
        const normalizedDistance = Math.min(distance / maxDistance, 1);
        
        // WALL-E style: more interested in closer things
        // Uses inverse square for natural attention falloff
        const interestFactor = 1 - (normalizedDistance * normalizedDistance * 0.5);
        
        targetOffsetX = (dx / distance) * EYE_TRACK_STRENGTH * interestFactor;
        targetOffsetY = (dy / distance) * EYE_TRACK_STRENGTH * interestFactor * 0.6;
      }
      
      // Smooth organic transition (faster when moving toward, slower returning)
      const movingToward = Math.abs(targetOffsetX) > Math.abs(currentOffsetX);
      const smoothing = movingToward ? EYE_TRACK_SMOOTHING * 1.5 : EYE_TRACK_SMOOTHING * 0.8;
      const timeAdjusted = smoothing * (deltaTime / 16.67);
      
      currentOffsetX += (targetOffsetX - currentOffsetX) * Math.min(timeAdjusted, 0.3);
      currentOffsetY += (targetOffsetY - currentOffsetY) * Math.min(timeAdjusted, 0.3);
      
      // Apply via CSS custom properties (for CSS to use if needed)
      avatarContainer.style.setProperty('--eye-offset-x', `${currentOffsetX.toFixed(2)}px`);
      avatarContainer.style.setProperty('--eye-offset-y', `${currentOffsetY.toFixed(2)}px`);
    }
    
    eyeTrackingFrame = requestAnimationFrame(trackEyes);
  };
  
  eyeTrackingFrame = requestAnimationFrame(trackEyes);
}

function stopEyeTracking(): void {
  if (eyeTrackingFrame !== null) {
    cancelAnimationFrame(eyeTrackingFrame);
    eyeTrackingFrame = null;
  }
}

// ============================================================================
// STATE UPDATES
// ============================================================================

export function setConnected(connected: boolean): void {
  const wasConnected = isConnected;
  isConnected = connected;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-connected', connected);
  }
  
  // Update breathing intensity when connection state changes
  if (wasConnected !== connected) {
    updateBreathingAnimation();
  }
}

export function setSpeaking(speaking: boolean): void {
  const wasSpeaking = isSpeaking;
  isSpeaking = speaking;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-speaking', speaking);
  }
  
  // Update breathing intensity when speaking state changes
  if (wasSpeaking !== speaking) {
    updateBreathingAnimation();
    
    // 🎬 Zen blink when stopping speaking (natural pause moment)
    if (wasSpeaking && !speaking) {
      // Small delay so it feels like end of thought, not interruption
      setTimeout(() => performBlink(), 200);
    }
  }
  
  // Update glow state
  updateVoiceGlowState();
}

export function setListening(listening: boolean): void {
  const wasListening = isListening;
  isListening = listening;
  
  if (avatarElement) {
    avatarElement.classList.toggle('presence-listening', listening);
  }
  
  // Update breathing intensity when listening state changes
  if (wasListening !== listening) {
    updateBreathingAnimation();
    
    // 🎬 Zen blink when starting to listen (acknowledging user)
    if (!wasListening && listening) {
      performBlink();
    }
    
    // 🎬 Pixar attentive lean-in when user starts speaking
    if (listening) {
      startAttentiveLeanIn();
    } else {
      stopAttentiveLeanIn();
    }
  }
  
  // Update glow state
  updateVoiceGlowState();
}

// ============================================================================
// VOICE EMOTION GLOW - Avatar responds to speaking tone
// ============================================================================

/**
 * Set the current voice emotion.
 * This changes the avatar's glow color and animation to reflect the tone.
 * 
 * @param emotion - The emotion to display (happy, calm, excited, etc.)
 * @param animate - Whether to animate the transition (default: true)
 */
export function setVoiceEmotion(emotion: VoiceEmotion, animate: boolean = true): void {
  if (currentEmotion === emotion) return;
  
  currentEmotion = emotion;
  
  if (avatarContainer) {
    // Add transition class for smooth emotion change
    if (animate) {
      avatarContainer.classList.add('transitioning');
      avatarContainer.style.setProperty('--glow-transition', VOICE_GLOW_TRANSITIONS.emotionChange);
    }
    
    // Set the emotion data attribute (CSS handles the glow colors)
    avatarContainer.setAttribute('data-emotion', emotion);
    
    // Also apply via JS for more control
    applyVoiceGlow(avatarContainer, emotion, currentIntensity);
    
    // Remove transition class after animation
    if (animate) {
      setTimeout(() => {
        avatarContainer?.classList.remove('transitioning');
      }, 800);
    }
  }
}

/**
 * Set the speaking intensity.
 * This affects the glow spread and brightness.
 * 
 * @param intensity - whisper, normal, emphasis, or exclamation
 */
export function setSpeakingIntensity(intensity: SpeakingIntensity): void {
  if (currentIntensity === intensity) return;
  
  currentIntensity = intensity;
  
  if (avatarContainer) {
    avatarContainer.setAttribute('data-intensity', intensity);
    applyVoiceGlow(avatarContainer, currentEmotion, intensity);
  }
}

/**
 * Update the voice glow state based on speaking/listening.
 */
function updateVoiceGlowState(): void {
  if (!avatarContainer) return;
  
  // Remove all state classes
  avatarContainer.classList.remove('speaking', 'listening', 'idle');
  
  // Add the appropriate state class
  if (isSpeaking) {
    avatarContainer.classList.add('voice-glow', 'speaking');
  } else if (isListening) {
    avatarContainer.classList.add('voice-glow', 'listening');
  } else {
    avatarContainer.classList.add('voice-glow', 'idle');
  }
}

/**
 * Get the current voice emotion.
 */
export function getVoiceEmotion(): VoiceEmotion {
  return currentEmotion;
}

/**
 * Quick flash of emotion (for reactions).
 * Shows the emotion briefly then returns to previous.
 */
export function flashEmotion(emotion: VoiceEmotion, durationMs: number = 600): void {
  const previousEmotion = currentEmotion;
  
  setVoiceEmotion(emotion, false);
  
  // Quick glow reaction
  if (avatarContainer) {
    avatarContainer.style.setProperty('--glow-transition', VOICE_GLOW_TRANSITIONS.speakingStart);
  }
  
  setTimeout(() => {
    setVoiceEmotion(previousEmotion, true);
  }, durationMs);
}

// ============================================================================
// PIXAR REACTIONS - Anticipation + Action + Follow-Through
// ============================================================================

/**
 * Play a Pixar-style reaction with anticipation.
 * 
 * 🎬 Pixar's principle: Every action has three parts:
 * 1. ANTICIPATION - Small "wind up" in opposite direction
 * 2. ACTION - The main movement with SQUASH & STRETCH
 * 3. FOLLOW-THROUGH - Overshoot and settle
 * 
 * Now using Web Animations API for proper squash/stretch deformation!
 */
export function react(type: 'nod' | 'shake' | 'bounce' | 'pulse'): void {
  if (!avatarContainer) return;
  
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  
  // 🎬 Pixar-quality keyframes with proper squash & stretch
  const reactionKeyframes: Record<string, Keyframe[]> = {
    // NOD - Like WALL-E acknowledging understanding
    'nod': [
      // Anticipation: slight rise and squash
      { transform: 'translateY(-2px) scaleY(0.97) scaleX(1.02)', offset: 0 },
      { transform: 'translateY(-3px) scaleY(0.96) scaleX(1.03)', offset: 0.1 },
      // Main nod down with stretch
      { transform: 'translateY(6px) scaleY(1.04) scaleX(0.97)', offset: 0.25 },
      // Impact squash
      { transform: 'translateY(8px) scaleY(0.94) scaleX(1.04)', offset: 0.35 },
      // Recovery with stretch
      { transform: 'translateY(2px) scaleY(1.02) scaleX(0.99)', offset: 0.5 },
      // Second smaller nod
      { transform: 'translateY(4px) scaleY(1.01) scaleX(0.99)', offset: 0.65 },
      // Settle with squash
      { transform: 'translateY(3px) scaleY(0.99) scaleX(1.01)', offset: 0.75 },
      // Return to neutral
      { transform: 'translateY(0) scaleY(1) scaleX(1)', offset: 1 },
    ],
    // SHAKE - Gentle disagreement with personality
    'shake': [
      // Anticipation: slight rotate opposite
      { transform: 'rotate(1deg) scaleX(0.99)', offset: 0 },
      { transform: 'rotate(2deg) scaleX(0.98)', offset: 0.08 },
      // First shake with stretch
      { transform: 'rotate(-5deg) scaleX(1.02) skewX(-1deg)', offset: 0.2 },
      // Cross center with squash
      { transform: 'rotate(0deg) scaleX(0.98)', offset: 0.3 },
      // Second shake
      { transform: 'rotate(4deg) scaleX(1.01) skewX(0.5deg)', offset: 0.4 },
      // Cross center
      { transform: 'rotate(0deg) scaleX(0.99)', offset: 0.5 },
      // Third smaller shake
      { transform: 'rotate(-2.5deg) scaleX(1.005)', offset: 0.6 },
      // Settle
      { transform: 'rotate(1deg) scaleX(0.998)', offset: 0.75 },
      { transform: 'rotate(-0.5deg)', offset: 0.88 },
      // Return to neutral
      { transform: 'rotate(0deg) scaleX(1) skewX(0deg)', offset: 1 },
    ],
    // BOUNCE - Luxo Jr. excited hop!
    'bounce': [
      // Anticipation: squash down
      { transform: 'translateY(3px) scaleY(0.92) scaleX(1.06)', offset: 0 },
      { transform: 'translateY(5px) scaleY(0.88) scaleX(1.08)', offset: 0.12 },
      // Launch with stretch
      { transform: 'translateY(-12px) scaleY(1.12) scaleX(0.92)', offset: 0.3 },
      // Peak - slight hang
      { transform: 'translateY(-15px) scaleY(1.08) scaleX(0.94)', offset: 0.4 },
      { transform: 'translateY(-14px) scaleY(1.06) scaleX(0.95)', offset: 0.45 },
      // Coming down with stretch
      { transform: 'translateY(-6px) scaleY(1.1) scaleX(0.93)', offset: 0.55 },
      // Landing squash
      { transform: 'translateY(4px) scaleY(0.86) scaleX(1.1)', offset: 0.65 },
      // Recovery bounce
      { transform: 'translateY(-4px) scaleY(1.04) scaleX(0.97)', offset: 0.75 },
      // Settle squash
      { transform: 'translateY(2px) scaleY(0.97) scaleX(1.02)', offset: 0.85 },
      // Return to neutral
      { transform: 'translateY(0) scaleY(1) scaleX(1)', offset: 1 },
    ],
    // PULSE - Attention/acknowledgment with warmth
    'pulse': [
      // Quick expand
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(1.08)', offset: 0.15 },
      // Peak with slight overshoot
      { transform: 'scale(1.12)', offset: 0.25 },
      // Contract with squash
      { transform: 'scale(0.96)', offset: 0.45 },
      // Small recovery
      { transform: 'scale(1.03)', offset: 0.6 },
      // Settle
      { transform: 'scale(0.99)', offset: 0.8 },
      // Return to neutral
      { transform: 'scale(1)', offset: 1 },
    ],
  };
  
  const keyframes = reactionKeyframes[type];
  if (!keyframes) return;
  
  // Duration varies by reaction type for natural feel
  const durations: Record<string, number> = {
    'nod': ANIMATION_PRESET.REACTION_DELIBERATE.duration + DURATION.MICRO,
    'shake': ANIMATION_PRESET.REACTION_DRAMATIC.duration,
    'bounce': ANIMATION_PRESET.REACTION_DRAMATIC.duration + DURATION.FAST,
    'pulse': ANIMATION_PRESET.REACTION_QUICK.duration + DURATION.MICRO,
  };
  
  // Play the animation
  const animation = avatarContainer.animate(keyframes, {
    duration: durations[type] ?? DURATION.DELIBERATE,
    easing: EASING.SPRING, // Bouncy spring
    fill: 'forwards',
    composite: 'add', // Layer on top of breathing
  });
  
  // Clean up on finish
  animation.onfinish = () => {
    // Animation complete
  };
}

/**
 * Nod animation (agreement) - Like WALL-E acknowledging
 */
export function nod(): void {
  react('nod');
}

/**
 * Shake animation (gentle disagreement)
 */
export function shake(): void {
  react('shake');
}

/**
 * Bounce animation (Luxo Jr. excited hop!)
 */
export function bounce(): void {
  react('bounce');
}

/**
 * Pulse animation (attention/acknowledgment)
 */
export function pulse(): void {
  react('pulse');
}

/**
 * WALL-E curious tilt - examining something interesting
 */
export function curiousTilt(): void {
  if (!avatarContainer) return;
  
  avatarContainer.animate([
    { transform: 'rotate(0deg)', offset: 0 },
    { transform: 'rotate(-4deg) translateX(-2px)', offset: 0.3 },
    { transform: 'rotate(3deg) translateX(1px)', offset: 0.6 },
    { transform: 'rotate(0deg)', offset: 1 },
  ], {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  });
}

/**
 * Joy expression - warm, happy glow
 */
export function joy(): void {
  if (!avatarContainer || !avatarElement) return;
  
  // Quick brightening pulse
  avatarElement.animate([
    { filter: 'brightness(1) saturate(1)', offset: 0 },
    { filter: 'brightness(1.15) saturate(1.2)', offset: 0.3 },
    { filter: 'brightness(1.1) saturate(1.15)', offset: 0.5 },
    { filter: 'brightness(1)', offset: 1 },
  ], {
    duration: DURATION.DRAMATIC,
    easing: EASING.SPRING,
  });
  
  bounce();
}

/**
 * Attentive lean - like WALL-E focusing on something
 */
export function attentiveLean(): void {
  if (!avatarContainer) return;
  
  avatarContainer.animate([
    { transform: 'scale(1) translateY(0)', offset: 0 },
    { transform: 'scale(1.02) translateY(-2px) rotate(2deg)', offset: 0.4 },
    { transform: 'scale(1.015) translateY(-1px) rotate(1deg)', offset: 0.7 },
    { transform: 'scale(1) translateY(0) rotate(0deg)', offset: 1 },
  ], {
    duration: DURATION.DELIBERATE,
    easing: EASING.SPRING,
  });
}

// ============================================================================
// 🌅 FAREWELL ANIMATION - Warm goodbye
// ============================================================================

/**
 * Farewell animation - warm, gentle goodbye motion.
 * 
 * Like a friend giving you a warm smile and nod before parting.
 * Combines a gentle bow/nod with a warm glow that lingers.
 * 
 * Pixar Principles:
 * - ANTICIPATION: Slight pause before the farewell
 * - STAGING: Clear, warm gesture
 * - APPEAL: Leaves user with positive feeling
 */
export function farewell(): void {
  if (!avatarContainer || !avatarElement) return;
  
  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Just do a simple glow for reduced motion users
    avatarElement.animate([
      { filter: 'brightness(1)', offset: 0 },
      { filter: 'brightness(1.1)', offset: 0.5 },
      { filter: 'brightness(1)', offset: 1 },
    ], {
      duration: DURATION.CELEBRATION,
      easing: EASING.GENTLE,
    });
    return;
  }
  
  // Warm farewell gesture - like a gentle bow/nod of acknowledgment
  const farewellKeyframes: Keyframe[] = [
    // Start position
    { transform: 'translateY(0) scale(1) rotate(0deg)', offset: 0 },
    // Anticipation - slight rise (like taking a breath)
    { transform: 'translateY(-2px) scale(1.02) rotate(0deg)', offset: 0.1 },
    // Gentle bow with warmth
    { transform: 'translateY(4px) scale(0.98) rotate(2deg)', offset: 0.3 },
    // Hold the bow briefly
    { transform: 'translateY(3px) scale(0.985) rotate(1.5deg)', offset: 0.45 },
    // Begin rising with grace
    { transform: 'translateY(0) scale(1) rotate(0.5deg)', offset: 0.7 },
    // Settle with warmth
    { transform: 'translateY(-1px) scale(1.01) rotate(0deg)', offset: 0.85 },
    // Return to neutral
    { transform: 'translateY(0) scale(1) rotate(0deg)', offset: 1 },
  ];
  
  avatarContainer.animate(farewellKeyframes, {
    duration: DURATION.CELEBRATION + DURATION.SLOW, // ~1100ms - deliberate and warm
    easing: EASING.GENTLE,
    fill: 'forwards',
    composite: 'add',
  });
  
  // Warm golden glow that lingers
  avatarElement.animate([
    { filter: 'brightness(1) saturate(1)', offset: 0 },
    { filter: 'brightness(1.12) saturate(1.15)', offset: 0.3 },
    { filter: 'brightness(1.15) saturate(1.2)', offset: 0.5 },
    { filter: 'brightness(1.1) saturate(1.1)', offset: 0.75 },
    { filter: 'brightness(1.05) saturate(1.05)', offset: 1 },
  ], {
    duration: DURATION.CELEBRATION + DURATION.SLOW,
    easing: EASING.GENTLE,
    fill: 'forwards',
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  // Stop all animations
  stopEyeTracking();
  stopBlinking();
  stopMicroIdleMovements();
  
  if (breathingAnimation) {
    breathingAnimation.cancel();
    breathingAnimation = null;
  }
  
  if (glowAnimation) {
    glowAnimation.cancel();
    glowAnimation = null;
  }
  
  document.removeEventListener('mousemove', handleMouseMove);
  
  // Reset custom properties and transforms
  if (avatarContainer) {
    avatarContainer.style.removeProperty('--eye-offset-x');
    avatarContainer.style.removeProperty('--eye-offset-y');
    avatarContainer.style.transform = '';
    avatarContainer.style.transition = '';
  }
  
  avatarElement = null;
  avatarContainer = null;
  currentOffsetX = 0;
  currentOffsetY = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const presenceUI = {
  init: initPresenceUI,
  setConnected,
  setSpeaking,
  setListening,
  // Voice emotion glow
  setVoiceEmotion,
  setSpeakingIntensity,
  getVoiceEmotion,
  flashEmotion,
  // Basic reactions
  react,
  nod,
  shake,
  bounce,
  pulse,
  // Pixar expressions
  curiousTilt,
  joy,
  attentiveLean,
  // 🌅 Farewell
  farewell,
  // 🆕 Human-like behaviors
  blink,
  // Cleanup
  dispose,
};

