/**
 * Waveform UI - Expressive Bars Visualization
 *
 * 🎬 PIXAR PRINCIPLES APPLIED:
 * - SQUASH & STRETCH: Bars deform naturally with motion
 * - ANTICIPATION: Slight wind-up before peaks
 * - FOLLOW-THROUGH: Bars overshoot and settle
 * - SECONDARY ACTION: Shadows and glows add depth
 * - TIMING: Emotion-specific animation speeds
 * - EXAGGERATION: Emotion shapes are expressive
 * - APPEAL: Warm, organic movements
 *
 * Features:
 * - Bars that dance with audio and form emotion shapes
 * - Happy = smile curve, Sad = frown, Excited = bouncy peaks
 * - Mouth-like expressions through bar height patterns
 * - Persona-specific colors and energy
 * - 🆕 3D depth illusion with dynamic shadows
 * - 🆕 Ripple emanation on speech bursts
 * - 🆕 Particle celebrations on laugh detection
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import type { VoiceEmotion } from '../types/events.js';
import type { PersonaId } from '../types/persona.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('Waveform');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// CONFIGURATION
// ============================================================================

const BAR_COUNT = 9; // More bars for smoother curves
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 34; // Fits within 36px container with room for shadows

// ============================================================================
// EMOTION SHAPES - Bar height multipliers to form expressions
// Each array represents relative heights for bars (center = index 4)
// ============================================================================

interface EmotionShape {
  // Height multipliers for each bar position (0-1)
  curve: number[];
  // Animation style
  jitter: number; // Random movement (0-1)
  bounce: number; // Bounce intensity (0-1)
  speed: number; // Animation speed multiplier
}

const EMOTION_SHAPES: Record<VoiceEmotion | 'speaking', EmotionShape> = {
  // Neutral - gentle hill
  neutral: {
    curve: [0.3, 0.5, 0.7, 0.85, 1.0, 0.85, 0.7, 0.5, 0.3],
    jitter: 0,
    bounce: 0,
    speed: 1,
  },
  // Speaking - dynamic mouth-like movement
  speaking: {
    curve: [0.4, 0.6, 0.8, 0.95, 1.0, 0.95, 0.8, 0.6, 0.4],
    jitter: 0.15,
    bounce: 0.2,
    speed: 1,
  },
  // Happy - SMILE shape (edges up, slight dip in center)
  // Warm delight, not saccharine - subtle lift
  happy: {
    curve: [0.9, 0.7, 0.5, 0.4, 0.35, 0.4, 0.5, 0.7, 0.9],
    jitter: 0.06,
    bounce: 0.15,
    speed: 1.05,
  },
  // Excited - Joyful energy, but grounded not chaotic
  // "Subliminal over flashy" - warm enthusiasm
  excited: {
    curve: [0.85, 0.95, 1.0, 0.9, 1.0, 0.9, 1.0, 0.95, 0.85],
    jitter: 0.08,
    bounce: 0.2,
    speed: 1.15,
  },
  // Sad - FROWN shape (edges down, center up)
  // Present and acknowledging, not amplifying
  sad: {
    curve: [0.2, 0.35, 0.55, 0.75, 0.85, 0.75, 0.55, 0.35, 0.2],
    jitter: 0.03,
    bounce: 0,
    speed: 0.7,
  },
  // Anxious - GROUNDING response, NOT mirroring anxiety
  // "Grounded, not anxious" - Ferni stays calm when user is stressed
  anxious: {
    curve: [0.5, 0.55, 0.6, 0.65, 0.7, 0.65, 0.6, 0.55, 0.5],
    jitter: 0.02,
    bounce: 0.03,
    speed: 0.65,
  },
  // Frustrated - Steady, supportive presence
  // "Warm" - acknowledge without amplifying negativity
  frustrated: {
    curve: [0.45, 0.5, 0.6, 0.7, 0.75, 0.7, 0.6, 0.5, 0.45],
    jitter: 0.03,
    bounce: 0.05,
    speed: 0.75,
  },
  // Calm - GENTLE, even wave
  calm: {
    curve: [0.5, 0.6, 0.7, 0.75, 0.8, 0.75, 0.7, 0.6, 0.5],
    jitter: 0.02,
    bounce: 0.05,
    speed: 0.6,
  },
};

// Music listening shape - natural, reflective, NOT aggressive
// Like a gentle meditation visualization
const MUSIC_LISTENING_SHAPE: EmotionShape = {
  curve: [0.35, 0.45, 0.55, 0.65, 0.7, 0.65, 0.55, 0.45, 0.35], // Gentle hill
  jitter: 0.01, // Almost no random jitter - smooth and reflective
  bounce: 0.02, // Minimal bounce - natural breathing
  speed: 0.4, // Slow, meditative pace
};

// ============================================================================
// PERSONA CONFIGURATIONS
// Uses CSS variables from design system for colors
// ============================================================================

import { getWaveformProfile } from '@design-system/tokens';

/**
 * Get persona color from CSS variable (design system integration)
 * Falls back to accent color if persona not set
 * 
 * IMPORTANT: Reads from document.body because persona CSS variables
 * are set via [data-persona='...'] selectors on the body element.
 */
function getPersonaColor(): string {
  // Read from body where persona-specific CSS variables are applied
  const style = getComputedStyle(document.body);
  const personaColor = style.getPropertyValue('--persona-primary').trim();
  if (personaColor) return personaColor;
  // Fallback to accent color (from documentElement since it's a global token)
  const rootStyle = getComputedStyle(document.documentElement);
  return rootStyle.getPropertyValue('--color-accent-primary').trim() || '#4a6741'; // Ferni sage green fallback
}

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let barsContainer: HTMLElement | null = null;
let bars: HTMLElement[] = [];
let emotionIndicator: HTMLElement | null = null;

let currentConfig = getWaveformProfile('ferni');
let currentEmotion: VoiceEmotion | 'neutral' = 'neutral';
let currentShape: EmotionShape = { ...EMOTION_SHAPES.neutral };
let targetShape: EmotionShape = { ...EMOTION_SHAPES.neutral };

let animationId: number | null = null;
let lastVolume = 0;
let smoothedVolume = 0;
let isSpeaking = false;
let isTransitioning = false; // True during agent handoff
let isListeningToMusic = false; // True when music is playing - gentle, reflective mode

// Per-bar state - use explicit initialization
const barHeights: number[] = [];
const barTargets: number[] = [];
const barVelocities: number[] = []; // 🎬 For spring physics
const barWidths: number[] = []; // 🎬 For squash & stretch
for (let i = 0; i < BAR_COUNT; i++) {
  barHeights[i] = MIN_BAR_HEIGHT;
  barTargets[i] = MIN_BAR_HEIGHT;
  barVelocities[i] = 0;
  barWidths[i] = 1; // Scale multiplier
}

// 🎬 Pixar effects state
let rippleElements: HTMLElement[] = [];
let particleContainer: HTMLElement | null = null;
let lastLaughTime = 0;
let peakVolume = 0; // Track volume peaks for ripples

// Animation timing
let lastTimestamp = 0;
let wavePhase = 0;

// Interpolated shape curve (for smooth transitions between emotions)
const interpolatedCurve: number[] = [];
for (let i = 0; i < BAR_COUNT; i++) {
  interpolatedCurve[i] = EMOTION_SHAPES.neutral.curve[i] ?? 0.5;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initWaveformUI(): void {
  container = document.getElementById('waveformContainer');

  if (!container) {
    log.warn('Waveform container not found');
    return;
  }

  // Find or create bars container
  barsContainer = container.querySelector('.waveform-bars');
  if (!barsContainer) {
    barsContainer = document.createElement('div');
    barsContainer.className = 'waveform-bars';
    container.innerHTML = '';
    container.appendChild(barsContainer);

    emotionIndicator = document.createElement('div');
    emotionIndicator.className = 'emotion-indicator';
    emotionIndicator.id = 'emotionIndicator';
    container.appendChild(emotionIndicator);
  }

  emotionIndicator = container.querySelector('.emotion-indicator');
  createBars();
  updateBarsStyle();
}

function createBars(): void {
  if (!barsContainer) return;

  barsContainer.innerHTML = '';
  bars = [];

  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.setProperty('--bar-index', String(i));
    bar.style.height = `${MIN_BAR_HEIGHT}px`;
    // 🎬 Add 3D depth shadow
    bar.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2)';
    bar.style.transform = 'scaleX(1)';
    // NOTE: translateZ(0) and willChange removed - causes visible box bug in Safari
    barsContainer.appendChild(bar);
    bars.push(bar);
  }

  // 🎬 Create particle container for celebrations
  createParticleContainer();
}

/**
 * 🎬 Create particle container for burst effects
 */
function createParticleContainer(): void {
  if (particleContainer || !container) return;

  particleContainer = document.createElement('div');
  particleContainer.className = 'waveform-particles';
  particleContainer.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: var(--z-docked);
  `;
  container.appendChild(particleContainer);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function start(): void {
  if (!container) return;
  container.classList.add('active');
  startAnimation();
}

export function stop(): void {
  if (!container) return;
  container.classList.remove('active', 'speaking', 'listening', 'thinking', 'has-emotion');
  container.removeAttribute('data-emotion');
  stopAnimation();
  isSpeaking = false;
  currentEmotion = 'neutral';
  targetShape = EMOTION_SHAPES.neutral;
  resetBarsToIdle();
}

export function setSpeaking(speaking: boolean): void {
  if (!container) return;

  isSpeaking = speaking;

  if (speaking) {
    container.classList.add('speaking');
    container.classList.remove('listening', 'thinking');
    // Use speaking shape, or emotion shape if one is active
    targetShape =
      currentEmotion !== 'neutral' ? EMOTION_SHAPES[currentEmotion] : EMOTION_SHAPES.speaking;
    startAnimation();
    // Reset the volume timer to give the audio visualization time to attach
    // (attachAudioVisualization is async, so there's a race condition)
    lastNonZeroVolumeTime = Date.now();
    volumeDropWarningLogged = false;
  } else {
    container.classList.remove('speaking');
    targetShape =
      currentEmotion !== 'neutral' ? EMOTION_SHAPES[currentEmotion] : EMOTION_SHAPES.neutral;
    smoothWindDown();
  }
}

export function setListening(listening: boolean): void {
  if (!container) return;

  if (listening) {
    container.classList.add('listening');
    container.classList.remove('speaking', 'thinking');
    startAnimation();
  } else {
    container.classList.remove('listening');
  }
}

export function setThinking(thinking: boolean): void {
  if (!container) return;

  if (thinking) {
    container.classList.add('thinking');
    container.classList.remove('speaking', 'listening');
    startAnimation();
  } else {
    container.classList.remove('thinking');
  }
}

// Track last time we received non-zero volume for debugging
let lastNonZeroVolumeTime = 0;
let volumeDropWarningLogged = false;

export function setVolume(volume: number): void {
  lastVolume = Math.max(0, Math.min(1, volume));
  
  // Debug: Track volume drops after handoff
  if (volume > 0.01) {
    lastNonZeroVolumeTime = Date.now();
    volumeDropWarningLogged = false;
  } else if (isSpeaking && Date.now() - lastNonZeroVolumeTime > 2000 && !volumeDropWarningLogged) {
    // No volume for 2+ seconds while we think we're speaking
    log.warn('⚠️ No volume received for 2s while speaking - audio visualization may be disconnected');
    volumeDropWarningLogged = true;
  }
}

export function setPersona(personaId: PersonaId): void {
  currentConfig = getWaveformProfile(personaId);
  // Color is read from CSS --persona-primary variable (set by design system)
  // Use requestAnimationFrame to ensure CSS has updated
  requestAnimationFrame(() => updateBarsStyle());
}

export function setEmotion(emotion: VoiceEmotion, intensity: number = 1): void {
  if (!container) return;

  currentEmotion = emotion;

  // Set target shape based on emotion
  const emotionShape = EMOTION_SHAPES[emotion] || EMOTION_SHAPES.neutral;
  targetShape = emotionShape;

  // Update UI classes
  container.classList.add('has-emotion');
  container.setAttribute('data-emotion', emotion);

  // Emotion indicator - pure color, no emojis (Apple-clean aesthetic)
  if (emotionIndicator) {
    emotionIndicator.textContent = ''; // No emojis - emotions shown through waveform shape/color
    emotionIndicator.style.opacity = String(intensity);
  }

  // Start animation to morph into shape
  startAnimation();

  // Clear emotion after duration
  trackedTimeout(() => {
    if (currentEmotion === emotion) {
      container?.classList.remove('has-emotion');
      container?.removeAttribute('data-emotion');
      currentEmotion = 'neutral';
      targetShape = isSpeaking ? EMOTION_SHAPES.speaking : EMOTION_SHAPES.neutral;
      if (emotionIndicator) emotionIndicator.textContent = '';
    }
  }, 4000);
}

export function celebrate(): void {
  setEmotion('excited', 1);
  container?.classList.add('celebrating');
  trackedTimeout(() => container?.classList.remove('celebrating'), 1000);
}

export function thinkPulse(): void {
  container?.classList.add('think-pulse');
  trackedTimeout(() => container?.classList.remove('think-pulse'), 600);
}

/**
 * Set transitioning state during agent handoffs.
 * Creates a shimmer/loading effect.
 */
export function setTransitioning(transitioning: boolean): void {
  isTransitioning = transitioning;
  if (!container) return;

  if (transitioning) {
    container.classList.add('transitioning');
    // Set a gentle shimmer shape
    targetShape = {
      curve: [0.3, 0.4, 0.5, 0.6, 0.7, 0.6, 0.5, 0.4, 0.3],
      jitter: 0.05,
      bounce: 0,
      speed: 0.5,
    };
  } else {
    container.classList.remove('transitioning');
    // Return to speaking or neutral
    targetShape = isSpeaking ? EMOTION_SHAPES.speaking : EMOTION_SHAPES.neutral;
  }
}

/**
 * Set music listening mode - natural, reflective, calm visualization.
 * Not aggressive - like gentle waves responding to the music's mood.
 *
 * @param listening - Whether music is playing
 */
export function setMusicPlaying(listening: boolean): void {
  isListeningToMusic = listening;
  if (!container) return;

  if (listening) {
    container.classList.add('music-playing');
    container.classList.remove('speaking', 'thinking');
    // Use the gentle music-listening shape
    targetShape = MUSIC_LISTENING_SHAPE;
    startAnimation();
  } else {
    container.classList.remove('music-playing');
    // Return to neutral or speaking
    targetShape = isSpeaking ? EMOTION_SHAPES.speaking : EMOTION_SHAPES.neutral;
  }
}

// ============================================================================
// ANIMATION ENGINE
// ============================================================================

function startAnimation(): void {
  if (animationId !== null) return;

  lastTimestamp = performance.now();

  const animate = (timestamp: number) => {
    const deltaTime = Math.min(timestamp - lastTimestamp, 50);
    lastTimestamp = timestamp;

    // Update phase
    const shapeSpeed = targetShape.speed * currentConfig.speed;
    wavePhase += deltaTime * 0.004 * shapeSpeed;

    // Smooth volume - use faster response for more reactive feel
    // Higher factor = faster response (less smoothing)
    const smoothingFactor = Math.max(0.3, 1 - currentConfig.smoothing * 0.7);
    smoothedVolume += (lastVolume - smoothedVolume) * smoothingFactor;

    // Interpolate shape curve toward target
    interpolateShape();

    // Update bars
    updateBars();

    animationId = requestAnimationFrame(animate);
  };

  animationId = requestAnimationFrame(animate);
}

function stopAnimation(): void {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function interpolateShape(): void {
  // Smoothly morph between current shape and target shape
  const lerpFactor = 0.08;

  for (let i = 0; i < BAR_COUNT; i++) {
    const target = targetShape.curve[i] ?? 0.5;
    const current = interpolatedCurve[i] ?? 0.5;
    interpolatedCurve[i] = current + (target - current) * lerpFactor;
  }

  // Also interpolate shape properties
  currentShape = {
    curve: [...interpolatedCurve],
    jitter: currentShape.jitter + (targetShape.jitter - currentShape.jitter) * lerpFactor,
    bounce: currentShape.bounce + (targetShape.bounce - currentShape.bounce) * lerpFactor,
    speed: currentShape.speed + (targetShape.speed - currentShape.speed) * lerpFactor,
  };
}

function updateBars(): void {
  const isThinking = container?.classList.contains('thinking');
  const isListening = container?.classList.contains('listening');

  for (let i = 0; i < BAR_COUNT; i++) {
    const shapeCurve = currentShape.curve[i] ?? 0.5;
    let targetHeight: number;

    if (isTransitioning) {
      // Shimmer effect during handoff - gentle wave that travels across bars
      const shimmerWave = Math.sin(wavePhase * 2 + i * 0.4) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + shimmerWave * MAX_BAR_HEIGHT * 0.4;
    } else if (isListeningToMusic) {
      // MUSIC LISTENING: Responsive to actual audio, but still gentle and meditative
      // Blends real volume data with organic wave motion

      // Check if we have real audio volume from the music track
      const hasRealMusicVolume = smoothedVolume > 0.01;

      if (hasRealMusicVolume) {
        // 🎵 Real music volume - responsive but smooth visualization
        // Less aggressive than speaking mode, more natural/flowing

        // Primary rhythm wave - gives bars different phases for visual interest
        const rhythmWave = Math.sin(wavePhase * 1.5 + i * 0.35) * 0.3 + 0.7;

        // Volume factor - gentler curve than speaking mode (0.5 power = softer response)
        const volumeFactor = Math.pow(smoothedVolume, 0.5) * 0.8;

        // Base height from volume * shape curve * rhythm
        const baseHeight = shapeCurve * MAX_BAR_HEIGHT * volumeFactor * rhythmWave;

        // Subtle bounce for musicality
        const bounce = Math.sin(wavePhase * 2.5 + i * 0.4) * currentShape.bounce * 4;

        targetHeight = MIN_BAR_HEIGHT + baseHeight + bounce;
      } else {
        // Fallback: gentle breathing animation when no volume data
        // (keeps waveform alive during audio initialization)
        const breathWave = Math.sin(wavePhase * 0.6 + i * 0.25) * 0.5 + 0.5;
        const harmonic = Math.sin(wavePhase * 1.2 + i * 0.5) * 0.15 + 0.5;
        const combined = breathWave * 0.7 + harmonic * 0.3;
        const musicEnergy = shapeCurve * 0.4 * combined;
        targetHeight = MIN_BAR_HEIGHT + MAX_BAR_HEIGHT * musicEnergy;
      }
    } else if (isSpeaking) {
      // Lower threshold - even small volume should be detected
      const hasRealVolume = smoothedVolume > 0.005;

      if (hasRealVolume) {
        // Real volume + shape curve - boost the volume effect
        const volumeFactor = Math.pow(smoothedVolume, 0.7) * currentConfig.energy * 1.5;
        const baseHeight = shapeCurve * MAX_BAR_HEIGHT * Math.min(1, volumeFactor);

        // Add wave motion
        const wave = Math.sin(wavePhase * 3 + i * 0.5) * currentShape.bounce * 8;

        // Add jitter
        const jitter = (Math.random() - 0.5) * currentShape.jitter * 15;

        targetHeight = MIN_BAR_HEIGHT + baseHeight + wave + jitter;
      } else {
        // Simulated speech with shape
        const talkMotion = Math.sin(wavePhase * 4 + i * 0.4) * 0.5 + 0.5;
        const variation = Math.sin(wavePhase * 7 + i * 0.8) * 0.3;

        const baseHeight = shapeCurve * MAX_BAR_HEIGHT * currentConfig.energy;
        const motionHeight = baseHeight * (0.3 + talkMotion * 0.5 + variation * 0.2);

        // Add bounce
        const bounce = Math.sin(wavePhase * 5 + i * 0.6) * currentShape.bounce * 6;

        // Add jitter
        const jitter = (Math.random() - 0.5) * currentShape.jitter * 10;

        targetHeight = MIN_BAR_HEIGHT + motionHeight + bounce + jitter;
      }
    } else if (isThinking) {
      // Thinking wave with shape influence
      const thinkWave = Math.sin(wavePhase * 2 + i * 0.6) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + MAX_BAR_HEIGHT * 0.25 * shapeCurve * thinkWave;
    } else if (isListening) {
      // Listening breath with shape
      const breathe = Math.sin(wavePhase * 0.8) * 0.5 + 0.5;
      targetHeight = MIN_BAR_HEIGHT + MAX_BAR_HEIGHT * 0.15 * shapeCurve * breathe;
    } else {
      // Idle - visible "breathing" presence that shows Ferni is alive
      // Increased from 0.08 to 0.12 for more noticeable ambient life
      const breathPhase = wavePhase * 0.4; // Slower, more meditative
      const primaryBreath = Math.sin(breathPhase + i * 0.25) * 0.5 + 0.5;
      // Add subtle secondary wave for organic variation
      const secondaryRipple = Math.sin(breathPhase * 1.8 + i * 0.5) * 0.15 + 0.5;
      const combinedBreath = primaryBreath * 0.8 + secondaryRipple * 0.2;
      targetHeight = MIN_BAR_HEIGHT + MAX_BAR_HEIGHT * 0.14 * shapeCurve * combinedBreath;
    }

    barTargets[i] = Math.max(MIN_BAR_HEIGHT, Math.min(MAX_BAR_HEIGHT, targetHeight));
  }

  // 🎬 Spring physics interpolation with squash & stretch
  const springStiffness = 0.15;
  const springDamping = 0.75;

  for (let i = 0; i < BAR_COUNT; i++) {
    const currentHeight = barHeights[i] ?? MIN_BAR_HEIGHT;
    const targetHeight = barTargets[i] ?? MIN_BAR_HEIGHT;
    const velocity = barVelocities[i] ?? 0;

    // Spring physics for natural motion
    const force = (targetHeight - currentHeight) * springStiffness;
    const newVelocity = (velocity + force) * springDamping;
    const newHeight = currentHeight + newVelocity;

    barVelocities[i] = newVelocity;
    barHeights[i] = Math.max(MIN_BAR_HEIGHT, Math.min(MAX_BAR_HEIGHT, newHeight));

    // 🎬 Squash & stretch: wider when short, narrower when tall
    const currentBarHeight = barHeights[i] ?? MIN_BAR_HEIGHT;
    const heightRatio = (currentBarHeight - MIN_BAR_HEIGHT) / (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
    const squashStretch = 1 + (0.5 - heightRatio) * 0.15; // Inverse relationship
    barWidths[i] = squashStretch;

    const bar = bars[i];
    if (bar) {
      bar.style.height = `${currentBarHeight}px`;

      // 🎬 Apply squash & stretch transform (no translateZ - Safari bug)
      const currentBarWidth = barWidths[i] ?? 1;
      bar.style.transform = `scaleX(${currentBarWidth})`;

      // 🎬 Dynamic shadows based on height (3D depth illusion)
      const shadowIntensity = heightRatio * 0.3;
      const shadowBlur = 2 + heightRatio * 8;
      const shadowY = 2 + heightRatio * 6;
      bar.style.boxShadow = `
        0 ${shadowY}px ${shadowBlur}px rgba(0,0,0,${shadowIntensity}),
        inset 0 ${1 + heightRatio * 2}px 0 rgba(255,255,255,${0.15 + heightRatio * 0.1})
      `;
    }
  }

  // 🎬 Volume peak tracking (ripple effects disabled for cleaner look)
  // The waveform bars provide enough visual feedback without extra circles
  if (smoothedVolume > peakVolume * 1.3) {
    peakVolume = smoothedVolume;
    // Ripple effect removed - waveform bars are expressive enough
  }
  peakVolume *= 0.95; // Decay peak tracker

  // 🎬 Detect laugh patterns (rapid high-volume bursts)
  // Skip during music - maintain reflective mood
  if (!isListeningToMusic && isSpeaking && smoothedVolume > 0.4 && currentEmotion === 'excited') {
    const now = performance.now();
    if (now - lastLaughTime > 1500) {
      lastLaughTime = now;
      createParticleBurst();
    }
  }
}

function smoothWindDown(): void {
  const windDown = () => {
    let allSettled = true;

    for (let i = 0; i < BAR_COUNT; i++) {
      barTargets[i] = MIN_BAR_HEIGHT;
      const height = barHeights[i] ?? MIN_BAR_HEIGHT;
      if (height > MIN_BAR_HEIGHT + 1) {
        allSettled = false;
      }
    }

    if (!allSettled && !isSpeaking) {
      requestAnimationFrame(windDown);
    }
  };

  windDown();
}

function resetBarsToIdle(): void {
  for (let i = 0; i < BAR_COUNT; i++) {
    barHeights[i] = MIN_BAR_HEIGHT;
    barTargets[i] = MIN_BAR_HEIGHT;
    interpolatedCurve[i] = EMOTION_SHAPES.neutral.curve[i] ?? 0.5;
    const bar = bars[i];
    if (bar) {
      bar.style.height = `${MIN_BAR_HEIGHT}px`;
    }
  }
}

function updateBarsStyle(): void {
  if (!container) return;

  // Get color from CSS variable (design system integration)
  const color = getPersonaColor();
  container.style.setProperty('--waveform-color', color);

  bars.forEach((bar) => {
    bar.style.setProperty('--bar-color', color);
  });
}

// ============================================================================
// 🎬 PIXAR RIPPLE EFFECT - Sound emanation visualization
// ============================================================================

/**
 * Create a ripple emanating from the waveform.
 * Like sound waves spreading outward.
 */
function createRipple(): void {
  if (!container || !barsContainer) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Limit active ripples
  if (rippleElements.length >= 3) {
    const oldRipple = rippleElements.shift();
    oldRipple?.remove();
  }

  const ripple = document.createElement('div');
  ripple.className = 'waveform-ripple';

  const color = getPersonaColor();
  const rect = barsContainer.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  // Position at center of waveform
  const centerX = rect.left - containerRect.left + rect.width / 2;
  const centerY = rect.top - containerRect.top + rect.height / 2;

  ripple.style.cssText = `
    position: absolute;
    left: ${centerX}px;
    top: ${centerY}px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid ${color};
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(1);
    pointer-events: none;
  `;

  container.appendChild(ripple);
  rippleElements.push(ripple);

  // Animate ripple expansion
  ripple.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.6 },
      { transform: 'translate(-50%, -50%) scale(4)', opacity: 0 },
    ],
    {
      duration: DURATION.CELEBRATION,
      easing: EASING.STANDARD,
    }
  ).onfinish = () => {
    const index = rippleElements.indexOf(ripple);
    if (index > -1) rippleElements.splice(index, 1);
    ripple.remove();
  };
}

// ============================================================================
// 🎬 PIXAR PARTICLE BURST - Celebration effect
// ============================================================================

/**
 * Create a burst of particles for laugh/celebration moments.
 * Like confetti or joy bubbles!
 */
function createParticleBurst(): void {
  if (!particleContainer || !barsContainer) return;

  // Check for reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const color = getPersonaColor();
  const rect = barsContainer.getBoundingClientRect();
  const containerRect = particleContainer.getBoundingClientRect();

  // Spawn point at top center of waveform
  const spawnX = rect.left - containerRect.left + rect.width / 2;
  const spawnY = rect.top - containerRect.top;

  const particleCount = 8 + Math.floor(Math.random() * 6);

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    const size = 4 + Math.random() * 6;
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
    const velocity = 30 + Math.random() * 50;
    const rotation = Math.random() * 720 - 360;

    // Random shapes: circles and rounded squares
    const isCircle = Math.random() > 0.3;

    particle.style.cssText = `
      position: absolute;
      left: ${spawnX}px;
      top: ${spawnY}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${isCircle ? '50%' : '2px'};
      opacity: 0.9;
      pointer-events: none;
    `;

    particleContainer.appendChild(particle);

    // Calculate trajectory
    const endX = Math.cos(angle) * velocity;
    const endY = Math.sin(angle) * velocity - 60; // Arc upward

    // Animate with physics-like motion
    const animation = particle.animate(
      [
        {
          transform: 'translate(0, 0) rotate(0deg) scale(1)',
          opacity: 0.9,
          offset: 0,
        },
        {
          transform: `translate(${endX * 0.5}px, ${endY * 0.3 - 30}px) rotate(${rotation * 0.5}deg) scale(1.2)`,
          opacity: 0.8,
          offset: 0.3,
        },
        {
          transform: `translate(${endX}px, ${endY + 40}px) rotate(${rotation}deg) scale(0.3)`,
          opacity: 0,
          offset: 1,
        },
      ],
      {
        duration: DURATION.DRAMATIC + Math.random() * DURATION.SLOW, // 600-900ms varied
        easing: EASING.GENTLE, // Organic particle movement
      }
    );

    animation.onfinish = () => particle.remove();
  }
}

/**
 * 🎬 Trigger a manual celebration burst
 */
export function burstCelebration(): void {
  createParticleBurst();
  createRipple();
}

// ============================================================================
// CLEANUP & EXPORTS
// ============================================================================

export function dispose(): void {
  stopAnimation();

  // 🎬 Clean up ripples and particles
  rippleElements.forEach((r) => r.remove());
  rippleElements = [];

  if (particleContainer?.parentNode) {
    particleContainer.parentNode.removeChild(particleContainer);
    particleContainer = null;
  }

  container = null;
  barsContainer = null;
  bars = [];
  emotionIndicator = null;
}

export const waveformUI = {
  init: initWaveformUI,
  start,
  stop,
  setSpeaking,
  setListening,
  setThinking,
  setTransitioning,
  setMusicPlaying, // Gentle, reflective music visualization
  setPersona,
  setEmotion,
  setVolume,
  celebrate,
  thinkPulse,
  burstCelebration, // 🎬 Pixar particle burst
  dispose,
};
