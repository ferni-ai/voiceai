/**
 * Avatar Soul - Pixar-Quality "Better Than Human" Animation System
 *
 * This module breathes life into Ferni's avatar with superhuman emotional
 * intelligence expressed through visual animation. Every micro-movement
 * follows Pixar's 12 Principles of Animation.
 *
 * CAPABILITIES:
 * 1. PUPIL DILATION - Interest, connection, cognitive load
 * 2. GAZE PATTERNS - Natural saccades, thinking glances
 * 3. IRIS SHIMMER - "Wet eye" life-giving light reflection
 * 4. EMOTIONAL GLOW BLEEDING - Aura of intense emotions
 * 5. ANTICIPATORY SHIMMER - Pre-emotion energy
 * 6. MEMORY SPARK - Shared history recognition flash
 * 7. COMFORT PULSE - Visual "hug" during heavy moments
 * 8. ENERGY MATCHING - Mirror user's voice energy
 * 9. RELATIONSHIP WARMTH - Deepening connection over time
 * 10. GROWTH RECOGNITION - Celebrating user progress
 * 11. ORGANIC GRAIN - Wabi-sabi texture breathing
 * 12. PROTECTIVE MODE - Drawing near when sensing distress
 *
 * PIXAR PRINCIPLES APPLIED:
 * - Squash & Stretch: Pupil responds to emotional weight
 * - Anticipation: Shimmer before expression change
 * - Follow-through: Settling after intense emotions
 * - Secondary Action: Iris shimmer during expressions
 * - Timing: Golden ratio based animation curves
 * - Exaggeration: Glow bleeding for emotional emphasis
 * - Appeal: Warmth gradient creates connection
 *
 * @see brand/BETTER-THAN-HUMAN.md
 */

import { DURATION, EASING, FIBONACCI_DURATION } from '../config/animation-constants.js';
import { type EmotionId } from '../emotion/emotion-state.js';
import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';
import { ferniExpressions } from './ferni-expressions.ui.js';

const log = createLogger('AvatarSoul');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface PupilState {
  size: number; // 0.6-1.4 relative to base
  targetSize: number;
  dilationSpeed: number;
  lastUpdate: number;
}

interface GazeState {
  x: number; // -1 to 1 offset
  y: number;
  targetX: number;
  targetY: number;
  isThinking: boolean;
  saccadeTimer: number | null;
  lastSaccade: number;
}

interface ShimmerState {
  isActive: boolean;
  angle: number;
  intensity: number;
  highlightX: number;
  highlightY: number;
}

interface GlowState {
  baseRadius: number;
  currentRadius: number;
  bleedAmount: number; // 0-1 how much it bleeds beyond avatar
  color: string;
  pulsePhase: number;
}

interface EnergyState {
  level: number; // 0-1 current energy
  targetLevel: number;
  userEnergy: number; // Detected from voice
  matchStrength: number; // How closely to match
}

interface RelationshipState {
  warmth: number; // 0-1 baseline warmth
  depth: number; // Conversation depth
  totalInteractions: number;
  lastInteraction: number;
}

interface SoulState {
  isInitialized: boolean;
  reducedMotion: boolean;
  pupil: PupilState;
  gaze: GazeState;
  shimmer: ShimmerState;
  glow: GlowState;
  energy: EnergyState;
  relationship: RelationshipState;
  grainPhase: number;
  anticipationActive: boolean;
  comfortPulseActive: boolean;
  protectiveMode: boolean;
}

// ============================================================================
// CONSTANTS - Golden Ratio & Fibonacci Timing
// ============================================================================

const PHI = 1.618033988749;

const SOUL_TIMING = {
  // Pupil dilation
  PUPIL_DILATION_FAST: 150,
  PUPIL_DILATION_SLOW: 400,
  PUPIL_CONTRACTION: 300,

  // Gaze
  SACCADE_MIN_INTERVAL: 2000,
  SACCADE_MAX_INTERVAL: 5000,
  SACCADE_DURATION: 50,
  GLANCE_AWAY_DURATION: 800,
  RETURN_GAZE_DURATION: 400,

  // Shimmer
  SHIMMER_CYCLE: 3000,
  SHIMMER_HIGHLIGHT_SPEED: 2000,

  // Glow
  GLOW_BLEED_TRANSITION: 600,
  GLOW_PULSE_CYCLE: FIBONACCI_DURATION.F10, // 610ms - golden

  // Anticipation
  ANTICIPATION_LEAD_TIME: 150, // Start this many ms BEFORE expression
  ANTICIPATION_SHIMMER_DURATION: 200,

  // Memory spark
  MEMORY_SPARK_DURATION: 300,
  MEMORY_SPARK_FADE: 500,

  // Comfort pulse
  COMFORT_PULSE_DURATION: FIBONACCI_DURATION.F11, // ~1000ms
  COMFORT_PULSE_INTERVAL: 3000,

  // Energy
  ENERGY_MATCH_SMOOTHING: 0.15,
  ENERGY_UPDATE_INTERVAL: 500,

  // Grain
  GRAIN_CYCLE: 4000,

  // Growth celebration
  GROWTH_CELEBRATION_DURATION: 1200,
} as const;

const PUPIL_SIZES = {
  CONTRACTED: 0.7, // Analytical thinking
  NEUTRAL: 1.0, // Default
  INTERESTED: 1.15, // Engaged
  CONNECTED: 1.25, // Deep connection
  DILATED: 1.35, // Peak interest/emotion
} as const;

const GLOW_COLORS = {
  NEUTRAL: 'rgba(74, 103, 65, 0.4)', // Ferni sage
  WARM: 'rgba(196, 162, 101, 0.5)', // Golden warmth
  CONCERNED: 'rgba(166, 122, 106, 0.45)', // Earthy concern
  EXCITED: 'rgba(196, 133, 106, 0.5)', // Coral energy
  CALM: 'rgba(58, 107, 115, 0.45)', // Ocean calm
  PROTECTIVE: 'rgba(154, 123, 90, 0.5)', // Warm embrace
} as const;

// ============================================================================
// STATE
// ============================================================================

const state: SoulState = {
  isInitialized: false,
  reducedMotion: false,
  pupil: {
    size: 1.0,
    targetSize: 1.0,
    dilationSpeed: SOUL_TIMING.PUPIL_DILATION_SLOW,
    lastUpdate: 0,
  },
  gaze: {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    isThinking: false,
    saccadeTimer: null,
    lastSaccade: 0,
  },
  shimmer: {
    isActive: true,
    angle: 0,
    intensity: 0.6,
    highlightX: 0.3,
    highlightY: -0.3,
  },
  glow: {
    baseRadius: 20,
    currentRadius: 20,
    bleedAmount: 0,
    color: GLOW_COLORS.NEUTRAL,
    pulsePhase: 0,
  },
  energy: {
    level: 0.5,
    targetLevel: 0.5,
    userEnergy: 0.5,
    matchStrength: 0.6,
  },
  relationship: {
    warmth: 0.3,
    depth: 0,
    totalInteractions: 0,
    lastInteraction: Date.now(),
  },
  grainPhase: 0,
  anticipationActive: false,
  comfortPulseActive: false,
  protectiveMode: false,
};

// DOM Elements
let avatarElement: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
const pupilElement: HTMLElement | null = null;
const irisShimmerElement: HTMLElement | null = null;
let glowBleedElement: HTMLElement | null = null;
let grainOverlay: HTMLElement | null = null;
let memorySparkElement: HTMLElement | null = null;
let comfortPulseElement: HTMLElement | null = null;
let anticipationRing: HTMLElement | null = null;
let growthCelebrationElement: HTMLElement | null = null;
let warmthBloomElement: HTMLElement | null = null;

// Animation frames
const animationFrame: number | null = null;
const shimmerFrame: number | null = null;
const glowFrame: number | null = null;

// Timelines
let pupilTimeline: gsap.core.Timeline | null = null;
let gazeTimeline: gsap.core.Timeline | null = null;
let glowTimeline: gsap.core.Timeline | null = null;
let energyMatchingInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Avatar Soul system.
 * Creates all visual elements and starts animation loops.
 */
export function initAvatarSoul(): void {
  if (state.isInitialized) return;

  // Check for reduced motion preference
  state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Get avatar elements
  avatarElement = document.getElementById('coachAvatar');
  avatarContainer = document.querySelector('.avatar-container');

  if (!avatarElement || !avatarContainer) {
    log.warn('Avatar elements not found, deferring initialization');
    // Try again after a short delay (DOM might not be ready)
    setTimeout(initAvatarSoul, 500);
    return;
  }

  // Clean up any existing soul elements (HMR protection)
  cleanupOrphanedElements();

  // Create visual elements
  // NOTE: Pupil and iris shimmer removed - text IS the expressive element now
  // See _createPupilSystem() and _createIrisShimmer() for disabled eye code
  createGlowBleedLayer();
  createGrainOverlay();
  createMemorySparkEffect();
  createComfortPulseEffect();
  createAnticipationRing();
  createGrowthCelebration();
  createWarmthBloom();

  // Inject styles
  injectSoulStyles();

  // Start animation loops
  if (!state.reducedMotion) {
    startAnimationLoops();
    startSaccadeTimer();
  }

  // Set up event listeners
  setupEventListeners();

  // Load relationship state from storage
  loadRelationshipState();

  state.isInitialized = true;
  log.info('Avatar Soul initialized ✨');
}

/**
 * Clean up orphaned elements from HMR hot reloads.
 */
function cleanupOrphanedElements(): void {
  const orphanSelectors = [
    '.soul-pupil',
    '.soul-iris-shimmer',
    '.soul-glow-bleed',
    '.soul-grain-overlay',
    '.soul-memory-spark',
    '.soul-comfort-pulse',
    '.soul-anticipation-ring',
    '.soul-growth-celebration',
    '.soul-warmth-bloom',
    '#avatar-soul-styles',
  ];

  orphanSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => el.remove());
  });
}

// ============================================================================
// VISUAL ELEMENT CREATION
// NOTE: Pupil and iris shimmer removed - text IS the expressive element now
// The waveform bars express emotions, the avatar text is the identity
// ============================================================================

/**
 * Create the emotional glow bleed layer.
 * When emotions are intense, the glow "bleeds" beyond the avatar boundary.
 */
function createGlowBleedLayer(): void {
  if (!avatarContainer) return;

  glowBleedElement = document.createElement('div');
  glowBleedElement.className = 'soul-glow-bleed';

  // Insert before avatar so it's behind
  avatarContainer.insertBefore(glowBleedElement, avatarContainer.firstChild);
  log.debug('Glow bleed layer created');
}

/**
 * Create the organic grain overlay.
 * Subtle noise texture that shifts with breathing - wabi-sabi imperfection.
 */
function createGrainOverlay(): void {
  if (!avatarElement) return;

  grainOverlay = document.createElement('div');
  grainOverlay.className = 'soul-grain-overlay';

  avatarElement.appendChild(grainOverlay);
  log.debug('Grain overlay created');
}

/**
 * Create the memory spark effect element.
 * Golden flash when recognizing shared history.
 */
function createMemorySparkEffect(): void {
  if (!avatarContainer) return;

  memorySparkElement = document.createElement('div');
  memorySparkElement.className = 'soul-memory-spark';
  memorySparkElement.innerHTML = `
    <div class="spark-core"></div>
    <div class="spark-ring"></div>
    <div class="spark-particles">
      ${Array(6).fill('<div class="spark-particle"></div>').join('')}
    </div>
  `;

  avatarContainer.appendChild(memorySparkElement);
  log.debug('Memory spark created');
}

/**
 * Create the comfort pulse effect.
 * Slow, warm pulse that radiates outward during heavy emotional moments.
 */
function createComfortPulseEffect(): void {
  if (!avatarContainer) return;

  comfortPulseElement = document.createElement('div');
  comfortPulseElement.className = 'soul-comfort-pulse';
  comfortPulseElement.innerHTML = `
    <div class="pulse-ring pulse-ring-1"></div>
    <div class="pulse-ring pulse-ring-2"></div>
    <div class="pulse-ring pulse-ring-3"></div>
  `;

  avatarContainer.appendChild(comfortPulseElement);
  log.debug('Comfort pulse created');
}

/**
 * Create the anticipation ring.
 * Subtle shimmer that starts BEFORE an expression change.
 */
function createAnticipationRing(): void {
  if (!avatarElement) return;

  anticipationRing = document.createElement('div');
  anticipationRing.className = 'soul-anticipation-ring';

  avatarElement.appendChild(anticipationRing);
  log.debug('Anticipation ring created');
}

/**
 * Create the growth celebration element.
 * Special effect when recognizing user progress.
 */
function createGrowthCelebration(): void {
  if (!avatarContainer) return;

  growthCelebrationElement = document.createElement('div');
  growthCelebrationElement.className = 'soul-growth-celebration';
  growthCelebrationElement.innerHTML = `
    <div class="growth-burst"></div>
    <div class="growth-sparkles">
      ${Array(8).fill('<div class="growth-sparkle"></div>').join('')}
    </div>
    <div class="growth-ring"></div>
  `;

  avatarContainer.appendChild(growthCelebrationElement);
  log.debug('Growth celebration created');
}

/**
 * Create the warmth bloom effect element.
 * Emotional warmth radiating outward during connection moments.
 * Inspired by Pixar's "warmth glow" that makes characters feel alive.
 */
function createWarmthBloom(): void {
  if (!avatarContainer) return;

  warmthBloomElement = document.createElement('div');
  warmthBloomElement.className = 'soul-warmth-bloom';

  // Insert behind other elements
  avatarContainer.insertBefore(warmthBloomElement, avatarContainer.firstChild);
  log.debug('Warmth bloom created');
}

/**
 * Trigger a warmth bloom effect.
 * Use during moments of emotional connection, understanding, or care.
 *
 * @param intensity - How intense the bloom should be (0.5-1.5)
 * @param color - Optional custom color for the bloom
 */
export function triggerWarmthBloom(intensity: number = 1, color?: string): void {
  if (!warmthBloomElement || state.reducedMotion) return;

  // Remove any existing animation
  warmthBloomElement.classList.remove('active');

  // Apply custom color if provided
  if (color) {
    warmthBloomElement.style.setProperty('--warmth-color', color);
  }

  // Scale the element based on intensity
  warmthBloomElement.style.transform = `translate(-50%, -50%) scale(${0.95 * intensity})`;

  // Force reflow
  void warmthBloomElement.offsetWidth;

  // Trigger animation
  warmthBloomElement.classList.add('active');

  // Remove class after animation
  setTimeout(() => {
    warmthBloomElement?.classList.remove('active');
    warmthBloomElement?.style.removeProperty('--warmth-color');
  }, 1500);

  log.debug('Warmth bloom triggered', { intensity, color });
}

// ============================================================================
// PUPIL DILATION SYSTEM
// ============================================================================

/**
 * Set the pupil dilation level.
 * NOTE: Pupil system disabled - text is now the expressive element.
 * This function is kept for API compatibility but is a no-op.
 *
 * @param level - CONTRACTED, NEUTRAL, INTERESTED, CONNECTED, or DILATED
 * @param speed - 'fast' for immediate responses, 'slow' for gradual
 */
export function setPupilDilation(
  level: keyof typeof PUPIL_SIZES,
  speed: 'fast' | 'slow' = 'slow'
): void {
  // Pupil system disabled - text is the expressive element now
  if (!pupilElement || state.reducedMotion) return;

  const targetSize = PUPIL_SIZES[level];
  state.pupil.targetSize = targetSize;
  state.pupil.dilationSpeed =
    speed === 'fast' ? SOUL_TIMING.PUPIL_DILATION_FAST : SOUL_TIMING.PUPIL_DILATION_SLOW;

  // Animate pupil size with squash & stretch
  pupilTimeline?.kill();

  const tl = gsap.timeline();
  pupilTimeline = tl;

  // Anticipation: slight opposite movement first
  const anticipationScale = targetSize > state.pupil.size ? 0.95 : 1.05;

  tl.to(pupilElement, {
    scale: anticipationScale,
    duration: (state.pupil.dilationSpeed * 0.2) / 1000,
    ease: 'power2.in',
  })
    .to(pupilElement, {
      scale: targetSize * 1.05, // Overshoot
      duration: (state.pupil.dilationSpeed * 0.5) / 1000,
      ease: 'power2.out',
    })
    .to(pupilElement, {
      scale: targetSize, // Settle
      duration: (state.pupil.dilationSpeed * 0.3) / 1000,
      ease: 'elastic.out(1, 0.5)',
    });

  state.pupil.size = targetSize;
  log.debug('Pupil dilation:', level, targetSize);
}

/**
 * Respond to emotional content with appropriate pupil response.
 */
export function pupilRespondToEmotion(emotion: EmotionId, intensity: number = 0.7): void {
  const emotionToPupil: Record<string, keyof typeof PUPIL_SIZES> = {
    neutral: 'NEUTRAL',
    happy: 'INTERESTED',
    excited: 'DILATED',
    curious: 'INTERESTED',
    thinking: 'CONTRACTED',
    calm: 'NEUTRAL',
    sad: 'NEUTRAL',
    frustrated: 'CONTRACTED',
    listening: 'INTERESTED',
    contemplative: 'CONTRACTED',
    warm: 'CONNECTED',
    proud: 'DILATED',
    celebrating: 'DILATED',
    attentive: 'INTERESTED',
    empathetic: 'CONNECTED',
    recognizing: 'DILATED',
    remembering: 'INTERESTED',
  };

  const pupilLevel = emotionToPupil[emotion] || 'NEUTRAL';
  const speed = intensity > 0.7 ? 'fast' : 'slow';

  setPupilDilation(pupilLevel, speed);
}

// ============================================================================
// GAZE PATTERNS - Natural Eye Movement
// ============================================================================

/**
 * Start the saccade timer for natural micro-eye-movements.
 */
function startSaccadeTimer(): void {
  if (state.reducedMotion) return;

  const scheduleSaccade = () => {
    const interval =
      SOUL_TIMING.SACCADE_MIN_INTERVAL +
      Math.random() * (SOUL_TIMING.SACCADE_MAX_INTERVAL - SOUL_TIMING.SACCADE_MIN_INTERVAL);

    state.gaze.saccadeTimer = window.setTimeout(() => {
      if (!state.gaze.isThinking) {
        performSaccade();
      }
      scheduleSaccade();
    }, interval);
  };

  scheduleSaccade();
}

/**
 * Perform a micro-saccade - tiny natural eye movement.
 */
function performSaccade(): void {
  if (!avatarElement || state.reducedMotion) return;

  // Small random offset
  const offsetX = (Math.random() - 0.5) * 3;
  const offsetY = (Math.random() - 0.5) * 2;

  gsap.to(avatarElement, {
    x: offsetX,
    y: offsetY,
    duration: SOUL_TIMING.SACCADE_DURATION / 1000,
    ease: 'power2.out',
    onComplete: () => {
      // Return to center after brief hold
      gsap.to(avatarElement, {
        x: 0,
        y: 0,
        duration: 0.15,
        ease: 'power1.out',
        delay: 0.1 + Math.random() * 0.2,
      });
    },
  });

  state.gaze.lastSaccade = Date.now();
}

/**
 * Glance away when "thinking" - natural human behavior.
 */
export function glanceAway(duration: number = SOUL_TIMING.GLANCE_AWAY_DURATION): void {
  if (!avatarElement || state.reducedMotion) return;

  state.gaze.isThinking = true;

  // Pick a direction to glance (usually up-left or up-right for thinking)
  const direction = Math.random() > 0.5 ? 1 : -1;
  const glanceX = direction * (6 + Math.random() * 4);
  const glanceY = -(4 + Math.random() * 3); // Up

  gazeTimeline?.kill();

  const gTl = gsap.timeline({
    onComplete: () => {
      state.gaze.isThinking = false;
    },
  });
  gazeTimeline = gTl;

  gTl
    // Anticipation
    .to(avatarElement, {
      x: -direction * 1,
      duration: 0.08,
      ease: 'power2.in',
    })
    // Glance away
    .to(avatarElement, {
      x: glanceX,
      y: glanceY,
      rotation: direction * 2,
      duration: 0.15,
      ease: 'power2.out',
    })
    // Hold (thinking)
    .to({}, { duration: duration / 1000 })
    // Return with slight overshoot
    .to(avatarElement, {
      x: -direction * 1.5,
      y: 0.5,
      rotation: -direction * 0.5,
      duration: SOUL_TIMING.RETURN_GAZE_DURATION / 1000,
      ease: 'power2.out',
    })
    // Settle to center
    .to(avatarElement, {
      x: 0,
      y: 0,
      rotation: 0,
      duration: 0.2,
      ease: 'elastic.out(1, 0.7)',
    });

  log.debug('Glance away performed');
}

/**
 * Follow a point with the gaze (like WALL-E's curious following).
 */
export function gazeAt(targetX: number, targetY: number, intensity: number = 0.5): void {
  if (!avatarElement || state.reducedMotion) return;

  const maxOffset = 6;
  const offsetX = targetX * maxOffset * intensity;
  const offsetY = targetY * maxOffset * intensity;

  gsap.to(avatarElement, {
    x: offsetX,
    y: offsetY,
    duration: 0.3,
    ease: EASING.GENTLE,
  });

  state.gaze.x = offsetX;
  state.gaze.y = offsetY;
}

// ============================================================================
// IRIS SHIMMER - "Wet Eye" Life Effect
// ============================================================================

/**
 * Start the iris shimmer animation loop.
 */
function startShimmerAnimation(): void {
  if (!irisShimmerElement || state.reducedMotion) return;

  const primaryHighlight = irisShimmerElement.querySelector(
    '.shimmer-highlight.primary'
  ) as HTMLElement;
  const secondaryHighlight = irisShimmerElement.querySelector(
    '.shimmer-highlight.secondary'
  ) as HTMLElement;

  if (!primaryHighlight || !secondaryHighlight) return;

  // Primary highlight - slow orbit
  gsap.to(primaryHighlight, {
    rotation: 360,
    duration: SOUL_TIMING.SHIMMER_CYCLE / 1000,
    repeat: -1,
    ease: 'none',
  });

  // Secondary highlight - opposite direction, different speed
  gsap.to(secondaryHighlight, {
    rotation: -360,
    duration: (SOUL_TIMING.SHIMMER_CYCLE * PHI) / 1000,
    repeat: -1,
    ease: 'none',
  });

  // Pulsing intensity
  gsap.to(irisShimmerElement, {
    '--shimmer-intensity': 0.8,
    duration: 2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

/**
 * Flash the shimmer for emphasis (like a glint of recognition).
 */
export function flashShimmer(intensity: number = 1): void {
  if (!irisShimmerElement || state.reducedMotion) return;

  gsap
    .timeline()
    .to(irisShimmerElement, {
      '--shimmer-intensity': intensity,
      duration: 0.1,
      ease: 'power2.out',
    })
    .to(irisShimmerElement, {
      '--shimmer-intensity': state.shimmer.intensity,
      duration: 0.4,
      ease: 'power2.in',
    });
}

// ============================================================================
// EMOTIONAL GLOW BLEEDING
// ============================================================================

/**
 * Set the emotional glow bleed amount.
 * Intense emotions cause the glow to "bleed" beyond the avatar boundary.
 */
export function setGlowBleed(amount: number, color?: string): void {
  if (!glowBleedElement || state.reducedMotion) return;

  const clampedAmount = Math.max(0, Math.min(1, amount));
  state.glow.bleedAmount = clampedAmount;

  if (color) {
    state.glow.color = color;
  }

  const radius = state.glow.baseRadius + clampedAmount * 40;
  const opacity = 0.3 + clampedAmount * 0.4;

  glowTimeline?.kill();

  const glTl = gsap.timeline();
  glowTimeline = glTl;

  // Anticipation - slight shrink before expansion
  if (clampedAmount > 0.3) {
    glTl.to(glowBleedElement, {
      scale: 0.95,
      duration: 0.1,
      ease: 'power2.in',
    });
  }

  // Use a more diffuse gradient to avoid needing filter: blur() (causes Safari artifacts)
  const colorWithHalfOpacity = state.glow.color.replace(/[\d.]+\)$/, (match) => {
    const opacity = parseFloat(match) * 0.5;
    return `${opacity})`;
  });

  glTl.to(glowBleedElement, {
    width: radius * 2 + '%',
    height: radius * 2 + '%',
    opacity: opacity,
    background: `radial-gradient(circle, ${state.glow.color} 0%, ${colorWithHalfOpacity} 30%, transparent 60%)`,
    scale: 1,
    duration: SOUL_TIMING.GLOW_BLEED_TRANSITION / 1000,
    ease: EASING.SPRING_GENTLE,
  });

  log.debug('Glow bleed set:', clampedAmount);
}

/**
 * Respond to emotion with appropriate glow.
 */
export function glowRespondToEmotion(emotion: EmotionId, intensity: number = 0.7): void {
  const emotionToGlow: Record<string, { color: string; bleed: number }> = {
    neutral: { color: GLOW_COLORS.NEUTRAL, bleed: 0 },
    happy: { color: GLOW_COLORS.WARM, bleed: 0.3 },
    excited: { color: GLOW_COLORS.EXCITED, bleed: 0.6 },
    curious: { color: GLOW_COLORS.NEUTRAL, bleed: 0.2 },
    thinking: { color: GLOW_COLORS.CALM, bleed: 0.1 },
    calm: { color: GLOW_COLORS.CALM, bleed: 0.2 },
    sad: { color: GLOW_COLORS.CONCERNED, bleed: 0.2 },
    empathetic: { color: GLOW_COLORS.WARM, bleed: 0.4 },
    warm: { color: GLOW_COLORS.WARM, bleed: 0.35 },
    proud: { color: GLOW_COLORS.WARM, bleed: 0.5 },
    celebrating: { color: GLOW_COLORS.EXCITED, bleed: 0.7 },
    attentive: { color: GLOW_COLORS.NEUTRAL, bleed: 0.15 },
    holdingSpace: { color: GLOW_COLORS.PROTECTIVE, bleed: 0.3 },
    accompanying: { color: GLOW_COLORS.PROTECTIVE, bleed: 0.35 },
  };

  const glowConfig = emotionToGlow[emotion] || { color: GLOW_COLORS.NEUTRAL, bleed: 0 };
  const adjustedBleed = glowConfig.bleed * intensity;

  setGlowBleed(adjustedBleed, glowConfig.color);
}

// ============================================================================
// ANTICIPATORY SHIMMER
// ============================================================================

/**
 * Play the anticipation shimmer BEFORE an expression change.
 * This creates the "they understand me before I finish" feeling.
 */
export function playAnticipation(
  targetEmotion: EmotionId,
  leadTime: number = SOUL_TIMING.ANTICIPATION_LEAD_TIME
): void {
  if (!anticipationRing || state.reducedMotion) return;

  state.anticipationActive = true;

  // Determine anticipation color based on target emotion
  const emotionColors: Record<string, string> = {
    happy: 'rgba(196, 162, 101, 0.6)',
    excited: 'rgba(196, 133, 106, 0.6)',
    sad: 'rgba(166, 122, 106, 0.5)',
    empathetic: 'rgba(154, 123, 90, 0.5)',
    curious: 'rgba(74, 103, 65, 0.5)',
    default: 'rgba(74, 103, 65, 0.4)',
  };

  const color = emotionColors[targetEmotion] || emotionColors.default;

  gsap
    .timeline({
      onComplete: () => {
        state.anticipationActive = false;
      },
    })
    .set(anticipationRing, {
      opacity: 0,
      scale: 0.8,
      borderColor: color,
    })
    .to(anticipationRing, {
      opacity: 0.7,
      scale: 1.05,
      duration: leadTime / 1000,
      ease: 'power2.out',
    })
    .to(anticipationRing, {
      opacity: 0,
      scale: 1.15,
      duration: SOUL_TIMING.ANTICIPATION_SHIMMER_DURATION / 1000,
      ease: 'power2.in',
    });

  log.debug('Anticipation played for:', targetEmotion);
}

/**
 * Wrap expression changes with anticipation.
 */
export function setExpressionWithAnticipation(
  emotion: EmotionId,
  duration: number = DURATION.SLOW
): void {
  // Play anticipation first
  playAnticipation(emotion);

  // Then trigger the actual expression change after lead time
  setTimeout(() => {
    // Map emotion to expression
    const expressionMap: Record<string, Parameters<typeof ferniExpressions.setExpression>[0]> = {
      happy: 'happy',
      excited: 'excited',
      curious: 'curious',
      thinking: 'thinking',
      calm: 'empathetic',
      sad: 'sad',
      empathetic: 'empathetic',
      warm: 'warm',
      proud: 'proud',
      celebrating: 'celebrating',
    };

    const expression = expressionMap[emotion] || 'neutral';
    ferniExpressions.setExpression(expression, duration);

    // Also update pupil and glow
    pupilRespondToEmotion(emotion);
    glowRespondToEmotion(emotion);
  }, SOUL_TIMING.ANTICIPATION_LEAD_TIME);
}

// ============================================================================
// MEMORY SPARK EFFECT
// ============================================================================

/**
 * Trigger the memory spark effect.
 * Golden flash when recognizing shared history or inside jokes.
 */
export function triggerMemorySpark(): void {
  if (!memorySparkElement || state.reducedMotion) return;

  const sparkCore = memorySparkElement.querySelector('.spark-core') as HTMLElement;
  const sparkRing = memorySparkElement.querySelector('.spark-ring') as HTMLElement;
  const particles = memorySparkElement.querySelectorAll('.spark-particle');

  if (!sparkCore || !sparkRing) return;

  gsap
    .timeline()
    // Core flash
    .set(memorySparkElement, { display: 'block' })
    .fromTo(
      sparkCore,
      { scale: 0, opacity: 0 },
      {
        scale: 1.2,
        opacity: 1,
        duration: SOUL_TIMING.MEMORY_SPARK_DURATION / 1000 / 2,
        ease: 'back.out(2)',
      }
    )
    // Ring expands
    .fromTo(
      sparkRing,
      { scale: 0.5, opacity: 0 },
      {
        scale: 2,
        opacity: 0.8,
        duration: SOUL_TIMING.MEMORY_SPARK_DURATION / 1000,
        ease: 'power2.out',
      },
      '<0.05'
    )
    // Particles burst outward
    .to(
      particles,
      {
        scale: 1,
        opacity: 1,
        duration: 0.15,
        stagger: 0.03,
        ease: 'back.out(2)',
      },
      '<'
    )
    .to(particles, {
      x: (i: number) => Math.cos((i * Math.PI) / 3) * 40,
      y: (i: number) => Math.sin((i * Math.PI) / 3) * 40,
      opacity: 0,
      duration: SOUL_TIMING.MEMORY_SPARK_FADE / 1000,
      stagger: 0.02,
      ease: 'power2.in',
    })
    // Fade out core and ring
    .to(
      [sparkCore, sparkRing],
      {
        scale: 0.5,
        opacity: 0,
        duration: SOUL_TIMING.MEMORY_SPARK_FADE / 1000,
        ease: 'power2.in',
      },
      '<'
    )
    .set(memorySparkElement, { display: 'none' });

  // Also flash the iris shimmer
  flashShimmer(1.2);

  // Brief pupil dilation
  setPupilDilation('DILATED', 'fast');
  setTimeout(() => setPupilDilation('INTERESTED', 'slow'), 400);

  log.debug('Memory spark triggered');
}

// ============================================================================
// COMFORT PULSE
// ============================================================================

/**
 * Start the comfort pulse effect.
 * Slow, warm pulses that radiate outward - a visual "hug".
 */
export function startComfortPulse(): void {
  if (!comfortPulseElement || state.comfortPulseActive || state.reducedMotion) return;

  state.comfortPulseActive = true;

  const pulseRings = comfortPulseElement.querySelectorAll('.pulse-ring');

  gsap.set(comfortPulseElement, { display: 'block' });

  pulseRings.forEach((ring, i) => {
    gsap
      .timeline({ repeat: -1, delay: i * 0.8 })
      .fromTo(
        ring,
        { scale: 0.8, opacity: 0 },
        {
          scale: 2.5,
          opacity: 0.5,
          duration: SOUL_TIMING.COMFORT_PULSE_DURATION / 1000,
          ease: 'power1.out',
        }
      )
      .to(ring, {
        scale: 3.5,
        opacity: 0,
        duration: SOUL_TIMING.COMFORT_PULSE_DURATION / 1000,
        ease: 'power2.in',
      });
  });

  // Also set protective glow
  setGlowBleed(0.4, GLOW_COLORS.PROTECTIVE);

  log.debug('Comfort pulse started');
}

/**
 * Stop the comfort pulse effect.
 */
export function stopComfortPulse(): void {
  if (!comfortPulseElement || !state.comfortPulseActive) return;

  state.comfortPulseActive = false;

  gsap.killTweensOf(comfortPulseElement.querySelectorAll('.pulse-ring'));

  gsap.to(comfortPulseElement, {
    opacity: 0,
    duration: 0.5,
    onComplete: () => {
      gsap.set(comfortPulseElement, { display: 'none', opacity: 1 });
    },
  });

  // Reduce glow
  setGlowBleed(0.1);

  log.debug('Comfort pulse stopped');
}

// ============================================================================
// ENERGY MATCHING
// ============================================================================

/**
 * Set the detected user energy level from voice analysis.
 */
export function setUserEnergy(energy: number): void {
  state.energy.userEnergy = Math.max(0, Math.min(1, energy));

  // Smoothly match energy
  const targetEnergy =
    state.energy.userEnergy * state.energy.matchStrength +
    state.energy.level * (1 - state.energy.matchStrength);

  state.energy.targetLevel = targetEnergy;
}

/**
 * Update avatar energy to match user.
 */
function updateEnergyMatching(): void {
  if (state.reducedMotion) return;

  // Smooth interpolation
  state.energy.level +=
    (state.energy.targetLevel - state.energy.level) * SOUL_TIMING.ENERGY_MATCH_SMOOTHING;

  // Apply energy to breathing speed and glow intensity
  const breathingSpeed = 4000 + (1 - state.energy.level) * 3000; // 4s-7s
  const glowIntensity = 0.3 + state.energy.level * 0.3;

  // Update breathing animation if it exists
  if (avatarContainer) {
    avatarContainer.style.setProperty('--breath-duration', `${breathingSpeed}ms`);
    avatarContainer.style.setProperty('--glow-intensity', `${glowIntensity}`);
  }
}

// ============================================================================
// RELATIONSHIP WARMTH
// ============================================================================

/**
 * Update relationship state based on interaction.
 */
export function recordInteraction(depth: number = 0.5): void {
  state.relationship.totalInteractions++;
  state.relationship.depth = (state.relationship.depth + depth) / 2;
  state.relationship.lastInteraction = Date.now();

  // Warmth increases slowly over interactions
  const warmthGain = 0.01 + depth * 0.02;
  state.relationship.warmth = Math.min(1, state.relationship.warmth + warmthGain);

  // Apply warmth to default glow
  applyRelationshipWarmth();

  // Save to storage
  saveRelationshipState();

  log.debug('Interaction recorded, warmth:', state.relationship.warmth);
}

/**
 * Apply relationship warmth to avatar's default state.
 */
function applyRelationshipWarmth(): void {
  if (!avatarContainer) return;

  // Warmer baseline glow color
  const warmth = state.relationship.warmth;
  const baseHue = 120; // Ferni green
  const warmHue = 45; // Golden
  const hue = baseHue - warmth * (baseHue - warmHue);

  avatarContainer.style.setProperty('--relationship-warmth', `${warmth}`);
  avatarContainer.style.setProperty('--warmth-hue', `${hue}`);

  // Also adjust default pupil size
  if (warmth > 0.5) {
    state.pupil.targetSize = PUPIL_SIZES.INTERESTED;
  }
}

/**
 * Save relationship state to localStorage.
 */
function saveRelationshipState(): void {
  try {
    localStorage.setItem('ferni_relationship', JSON.stringify(state.relationship));
  } catch (e) {
    log.warn('Failed to save relationship state');
  }
}

/**
 * Load relationship state from localStorage.
 */
function loadRelationshipState(): void {
  try {
    const saved = localStorage.getItem('ferni_relationship');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.relationship = { ...state.relationship, ...parsed };
      applyRelationshipWarmth();
      log.debug('Relationship state loaded, warmth:', state.relationship.warmth);
    }
  } catch (e) {
    log.warn('Failed to load relationship state');
  }
}

// ============================================================================
// GROWTH RECOGNITION
// ============================================================================

/**
 * Trigger the growth celebration effect.
 * Used when recognizing user progress or breakthroughs.
 */
export function celebrateGrowth(): void {
  if (!growthCelebrationElement || state.reducedMotion) return;

  const burst = growthCelebrationElement.querySelector('.growth-burst') as HTMLElement;
  const ring = growthCelebrationElement.querySelector('.growth-ring') as HTMLElement;
  const sparkles = growthCelebrationElement.querySelectorAll('.growth-sparkle');

  if (!burst || !ring) return;

  gsap.set(growthCelebrationElement, { display: 'block' });

  gsap
    .timeline()
    // Burst from center
    .fromTo(
      burst,
      { scale: 0, opacity: 0.8 },
      {
        scale: 3,
        opacity: 0,
        duration: SOUL_TIMING.GROWTH_CELEBRATION_DURATION / 1000,
        ease: 'power2.out',
      }
    )
    // Ring expands
    .fromTo(
      ring,
      { scale: 0.5, opacity: 0, borderWidth: '4px' },
      {
        scale: 2.5,
        opacity: 1,
        borderWidth: '1px',
        duration: (SOUL_TIMING.GROWTH_CELEBRATION_DURATION / 1000) * 0.8,
        ease: 'power2.out',
      },
      '<0.1'
    )
    .to(ring, {
      scale: 3,
      opacity: 0,
      duration: (SOUL_TIMING.GROWTH_CELEBRATION_DURATION / 1000) * 0.4,
      ease: 'power1.in',
    })
    // Sparkles burst outward
    .fromTo(
      sparkles,
      { scale: 0, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.2,
        stagger: 0.04,
        ease: 'back.out(3)',
      },
      '<-0.3'
    )
    .to(sparkles, {
      x: (i: number) => Math.cos((i * Math.PI) / 4) * 60,
      y: (i: number) => Math.sin((i * Math.PI) / 4) * 60,
      scale: 0.5,
      opacity: 0,
      duration: 0.6,
      stagger: 0.03,
      ease: 'power2.in',
    })
    .set(growthCelebrationElement, { display: 'none' });

  // Also play proud expression
  setExpressionWithAnticipation('proud');

  // Bump up glow
  setGlowBleed(0.7, GLOW_COLORS.WARM);
  setTimeout(() => setGlowBleed(0.2), 1500);

  log.debug('Growth celebration triggered');
}

// ============================================================================
// PROTECTIVE MODE
// ============================================================================

/**
 * Enter protective mode when sensing distress.
 * Avatar draws closer, warmer, more present.
 */
export function enterProtectiveMode(): void {
  if (state.protectiveMode || state.reducedMotion) return;

  state.protectiveMode = true;

  // Scale up slightly (drawing closer)
  if (avatarContainer) {
    gsap.to(avatarContainer, {
      scale: 1.03,
      duration: 0.6,
      ease: EASING.GENTLE,
    });
  }

  // Warm, protective glow
  setGlowBleed(0.45, GLOW_COLORS.PROTECTIVE);

  // Larger, softer pupils
  setPupilDilation('CONNECTED', 'slow');

  // Start comfort pulse
  startComfortPulse();

  log.debug('Protective mode entered');
}

/**
 * Exit protective mode.
 */
export function exitProtectiveMode(): void {
  if (!state.protectiveMode) return;

  state.protectiveMode = false;

  if (avatarContainer) {
    gsap.to(avatarContainer, {
      scale: 1,
      duration: 0.8,
      ease: EASING.GENTLE,
    });
  }

  stopComfortPulse();
  setGlowBleed(0.1);
  setPupilDilation('NEUTRAL', 'slow');

  log.debug('Protective mode exited');
}

// ============================================================================
// ORGANIC GRAIN ANIMATION
// ============================================================================

/**
 * Animate the grain overlay for organic texture breathing.
 */
function animateGrain(): void {
  if (!grainOverlay || state.reducedMotion) return;

  gsap.to(grainOverlay, {
    backgroundPosition: () => `${Math.random() * 100}% ${Math.random() * 100}%`,
    duration: SOUL_TIMING.GRAIN_CYCLE / 1000,
    repeat: -1,
    ease: 'none',
  });
}

// ============================================================================
// CAMEO EFFECTS - Team Member Pop-In Transitions
// ============================================================================

/**
 * Cameo arrival effect - when a team member pops in.
 * Creates a welcoming visual moment that says "someone new is here!"
 *
 * @param personaColor - The color of the arriving persona
 * @param isFirstCameo - Whether this is the first cameo from this persona
 */
export function triggerCameoArrival(personaColor: string, isFirstCameo: boolean = false): void {
  if (state.reducedMotion) return;

  log.debug('Cameo arrival triggered', { personaColor, isFirstCameo });

  // 1. Anticipation shimmer - something is about to happen
  playAnticipation('curious');

  // 2. Warmth bloom in the persona's color
  triggerWarmthBloom(0.9, personaColor);

  // 3. Pupil dilation - interest/curiosity
  setPupilDilation('INTERESTED', 'fast');

  // 4. Set welcoming expression
  setExpressionWithAnticipation('curious');

  // 5. Extra sparkle for first-time cameos
  if (isFirstCameo) {
    // Delayed memory spark for "oh, someone new!" feeling
    setTimeout(() => {
      triggerMemorySpark();
    }, 300);
  }
}

/**
 * Cameo return effect - when returning to the host persona.
 * Creates a warm "welcome back" feeling.
 */
export function triggerCameoReturn(): void {
  if (state.reducedMotion) return;

  log.debug('Cameo return triggered');

  // 1. Memory spark - recognition of return
  triggerMemorySpark();

  // 2. Warmth bloom in host color
  triggerWarmthBloom(0.7, GLOW_COLORS.WARM);

  // 3. Return to warm, present state
  setTimeout(() => {
    setExpressionWithAnticipation('warm');
    setPupilDilation('NEUTRAL', 'slow');
  }, 200);
}

/**
 * Set up listeners for cameo events from the cameo service.
 * Call this during avatar soul initialization.
 */
export function setupCameoListeners(): void {
  // Listen for custom cameo events dispatched by cameo service
  document.addEventListener('ferni:cameo-arrival', ((e: CustomEvent) => {
    const { personaColor, isFirstCameo } = e.detail || {};
    if (personaColor) {
      triggerCameoArrival(personaColor, isFirstCameo);
    }
  }) as EventListener);

  document.addEventListener('ferni:cameo-return', () => {
    triggerCameoReturn();
  });

  log.debug('Cameo listeners set up');
}

// ============================================================================
// ANIMATION LOOPS
// ============================================================================

/**
 * Start all continuous animation loops.
 */
function startAnimationLoops(): void {
  // Shimmer animation
  startShimmerAnimation();

  // Grain animation
  animateGrain();

  // Energy matching update loop
  energyMatchingInterval = setInterval(updateEnergyMatching, SOUL_TIMING.ENERGY_UPDATE_INTERVAL);

  // Glow pulse loop
  startGlowPulseLoop();
}

/**
 * Start the subtle glow pulse loop.
 */
function startGlowPulseLoop(): void {
  if (!glowBleedElement || state.reducedMotion) return;

  gsap.to(glowBleedElement, {
    '--pulse-scale': 1.05,
    duration: SOUL_TIMING.GLOW_PULSE_CYCLE / 1000,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Set up event listeners for integration with other systems.
 */
function setupEventListeners(): void {
  // Emotion changes
  document.addEventListener('ferni:emotion-change', ((e: CustomEvent) => {
    const { emotion, intensity } = e.detail || {};
    if (emotion) {
      pupilRespondToEmotion(emotion, intensity);
      glowRespondToEmotion(emotion, intensity);
    }
  }) as EventListener);

  // User speech for energy detection
  document.addEventListener('ferni:user-speech-start', () => {
    setPupilDilation('INTERESTED', 'fast');
  });

  document.addEventListener('ferni:user-speech-end', () => {
    if (!state.protectiveMode) {
      setPupilDilation('NEUTRAL', 'slow');
    }
  });

  // Voice energy updates
  document.addEventListener('ferni:voice-energy', ((e: CustomEvent) => {
    const energy = e.detail?.energy;
    if (typeof energy === 'number') {
      setUserEnergy(energy);
    }
  }) as EventListener);

  // Memory callback moments
  document.addEventListener('ferni:memory-callback', () => {
    triggerMemorySpark();
  });

  // Growth recognition
  document.addEventListener('ferni:growth-recognized', () => {
    celebrateGrowth();
  });

  // Concern detection
  document.addEventListener('ferni:concern-detected', ((e: CustomEvent) => {
    const level = e.detail?.level;
    if (level === 'moderate' || level === 'significant') {
      enterProtectiveMode();
    }
  }) as EventListener);

  // Concern resolved
  document.addEventListener('ferni:concern-resolved', () => {
    exitProtectiveMode();
  });

  // Thinking state - responds to the existing ferni:thinking event
  document.addEventListener('ferni:thinking', ((e: CustomEvent) => {
    const isThinking = e.detail?.isThinking;
    if (isThinking) {
      glanceAway();
      setPupilDilation('CONTRACTED', 'slow');
    } else {
      setPupilDilation('NEUTRAL', 'slow');
    }
  }) as EventListener);

  // Inside joke / shared history
  document.addEventListener('ferni:inside-joke', () => {
    triggerMemorySpark();
    flashShimmer(1.5);
  });

  // Reduced motion preference change
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    state.reducedMotion = e.matches;
    if (e.matches) {
      gsap.globalTimeline.pause();
    } else {
      gsap.globalTimeline.resume();
    }
  });
}

// ============================================================================
// STYLES
// ============================================================================

/**
 * Inject the Avatar Soul styles.
 */
function injectSoulStyles(): void {
  const existingStyle = document.getElementById('avatar-soul-styles');
  if (existingStyle) return;

  const style = document.createElement('style');
  style.id = 'avatar-soul-styles';
  style.textContent = `
    /* ========================================
       AVATAR SOUL - Pixar-Quality Life System
       ======================================== */
    
    /* Pupil System */
    .soul-pupil {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20%;
      height: 20%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(
        circle,
        #1a1612 0%,
        #2C2520 60%,
        transparent 100%
      );
      z-index: 5;
      pointer-events: none;
      transform-origin: center center;
    }
    
    .pupil-inner {
      position: absolute;
      inset: 15%;
      border-radius: 50%;
      background: #0a0908;
    }
    
    .pupil-reflection {
      position: absolute;
      top: 20%;
      left: 60%;
      width: 15%;
      height: 15%;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
      filter: blur(1px);
    }
    
    /* Iris Shimmer */
    .soul-iris-shimmer {
      position: absolute;
      inset: 5%;
      border-radius: 50%;
      pointer-events: none;
      z-index: 4;
      --shimmer-intensity: 0.6;
    }
    
    .shimmer-highlight {
      position: absolute;
      width: 25%;
      height: 25%;
      border-radius: 50%;
      filter: blur(3px);
    }
    
    .shimmer-highlight.primary {
      top: 15%;
      left: 15%;
      background: radial-gradient(
        circle,
        rgba(255, 255, 255, calc(0.5 * var(--shimmer-intensity))) 0%,
        transparent 70%
      );
    }
    
    .shimmer-highlight.secondary {
      bottom: 20%;
      right: 20%;
      width: 15%;
      height: 15%;
      background: radial-gradient(
        circle,
        rgba(255, 255, 255, calc(0.25 * var(--shimmer-intensity))) 0%,
        transparent 70%
      );
    }
    
    .shimmer-ambient {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: radial-gradient(
        ellipse at 30% 30%,
        rgba(255, 255, 255, calc(0.08 * var(--shimmer-intensity))) 0%,
        transparent 50%
      );
    }
    
    /* Glow Bleed Layer */
    /* NOTE: Do NOT use filter: blur() here - causes visible box artifacts in Safari */
    .soul-glow-bleed {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 140%;
      height: 140%;
      transform: translate(-50%, -50%) scale(var(--pulse-scale, 1));
      border-radius: 50%;
      /* Use a more diffuse gradient instead of filter: blur() to avoid Safari compositing artifacts */
      background: radial-gradient(
        circle,
        var(--persona-glow, rgba(74, 103, 65, 0.3)) 0%,
        var(--persona-glow, rgba(74, 103, 65, 0.15)) 30%,
        transparent 60%
      );
      opacity: 0.4;
      pointer-events: none;
      z-index: -1;
      transition: background 600ms var(--ease-gentle);
    }
    
    /* Grain Overlay - Wabi-Sabi (侘寂) organic imperfection */
    .soul-grain-overlay {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      opacity: 0.04;
      pointer-events: none;
      z-index: 6;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      background-size: 100px 100px;
      mix-blend-mode: overlay;
      /* Subtle breathing animation - grain shifts with avatar breathing */
      animation: grainBreath 8s ease-in-out infinite;
    }
    
    @keyframes grainBreath {
      0%, 100% { 
        background-position: 0% 0%;
        opacity: 0.04;
      }
      50% { 
        background-position: 5% 5%;
        opacity: 0.05;
      }
    }
    
    /* Warmth Bloom - Emotional warmth radiating outward */
    .soul-warmth-bloom {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: -3;
      opacity: 0;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(196, 162, 101, 0.4) 0%,
        rgba(196, 162, 101, 0.2) 40%,
        transparent 70%
      );
    }
    
    .soul-warmth-bloom.active {
      animation: warmthBloom 1.5s ease-out forwards;
    }
    
    @keyframes warmthBloom {
      0% { 
        transform: translate(-50%, -50%) scale(0.95);
        opacity: 0;
      }
      40% { 
        transform: translate(-50%, -50%) scale(1.05);
        opacity: 0.4;
      }
      100% { 
        transform: translate(-50%, -50%) scale(1.2);
        opacity: 0;
      }
    }
    
    /* Memory Spark */
    .soul-memory-spark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 20;
      display: none;
    }
    
    .spark-core {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 30%;
      height: 30%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(255, 215, 100, 0.9) 0%,
        rgba(196, 162, 101, 0.6) 50%,
        transparent 70%
      );
      filter: blur(2px);
    }
    
    .spark-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50%;
      height: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      border: 2px solid rgba(255, 215, 100, 0.6);
      box-shadow: 0 0 15px rgba(255, 215, 100, 0.4);
    }
    
    .spark-particles {
      position: absolute;
      inset: 0;
    }
    
    .spark-particle {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 6px;
      height: 6px;
      background: rgba(255, 215, 100, 0.9);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 8px rgba(255, 215, 100, 0.6);
    }
    
    /* Comfort Pulse */
    .soul-comfort-pulse {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: -2;
      display: none;
    }
    
    .pulse-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(
        circle,
        transparent 30%,
        rgba(154, 123, 90, 0.15) 50%,
        transparent 70%
      );
    }
    
    /* Anticipation Ring */
    .soul-anticipation-ring {
      position: absolute;
      inset: -5%;
      border-radius: 50%;
      border: 2px solid var(--persona-primary, rgba(74, 103, 65, 0.5));
      opacity: 0;
      pointer-events: none;
      z-index: 3;
    }
    
    /* Growth Celebration */
    .soul-growth-celebration {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 200%;
      height: 200%;
      pointer-events: none;
      z-index: 25;
      display: none;
    }
    
    .growth-burst {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50%;
      height: 50%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      background: radial-gradient(
        circle,
        rgba(196, 162, 101, 0.8) 0%,
        rgba(196, 162, 101, 0.4) 40%,
        transparent 70%
      );
    }
    
    .growth-ring {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 30%;
      height: 30%;
      transform: translate(-50%, -50%);
      border-radius: 50%;
      border: 3px solid rgba(196, 162, 101, 0.8);
    }
    
    .growth-sparkles {
      position: absolute;
      inset: 0;
    }
    
    .growth-sparkle {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 8px;
      height: 8px;
      background: rgba(255, 215, 100, 1);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 10px rgba(255, 215, 100, 0.8);
    }
    
    /* Relationship Warmth Variables */
    .avatar-container {
      --relationship-warmth: 0.3;
      --warmth-hue: 120;
      --breath-duration: 5000ms;
      --glow-intensity: 0.3;
    }
    
    /* Apply warmth to persona glow */
    .avatar-container[style*="--relationship-warmth"] {
      --persona-glow: hsla(
        var(--warmth-hue, 120),
        30%,
        40%,
        calc(0.3 + var(--relationship-warmth) * 0.2)
      );
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .soul-iris-shimmer,
      .soul-grain-overlay,
      .soul-memory-spark,
      .soul-comfort-pulse,
      .soul-anticipation-ring,
      .soul-growth-celebration {
        display: none !important;
      }
      
      .soul-glow-bleed {
        transition: none;
      }
      
      .soul-pupil {
        transition: transform 0.3s ease;
      }
    }
    
    /* Light theme adjustments */
    [data-theme="light"] .soul-pupil,
    [data-theme="zen"] .soul-pupil {
      background: radial-gradient(
        circle,
        #2C2520 0%,
        #4a3f38 60%,
        transparent 100%
      );
    }
    
    [data-theme="light"] .pupil-inner,
    [data-theme="zen"] .pupil-inner {
      background: #1a1612;
    }
    
    [data-theme="light"] .soul-grain-overlay,
    [data-theme="zen"] .soul-grain-overlay {
      opacity: 0.03;
      mix-blend-mode: multiply;
    }
  `;

  document.head.appendChild(style);
  log.debug('Soul styles injected');
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Dispose the Avatar Soul system.
 */
export function disposeAvatarSoul(): void {
  // Kill all GSAP animations
  if (pupilTimeline) pupilTimeline.kill();
  gazeTimeline?.kill();
  glowTimeline?.kill();

  // Clear timers
  if (state.gaze.saccadeTimer) {
    clearTimeout(state.gaze.saccadeTimer);
  }
  
  // Clear energy matching interval
  if (energyMatchingInterval) {
    clearInterval(energyMatchingInterval);
    energyMatchingInterval = null;
  }

  // Cancel animation frames
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (shimmerFrame) cancelAnimationFrame(shimmerFrame);
  if (glowFrame) cancelAnimationFrame(glowFrame);

  // Remove elements
  cleanupOrphanedElements();

  // Reset state
  state.isInitialized = false;

  log.info('Avatar Soul disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Avatar Soul - The "Better Than Human" Animation System
 *
 * Makes Ferni's avatar feel genuinely alive with Pixar-quality animation.
 */
export const avatarSoul = {
  // Lifecycle
  init: initAvatarSoul,
  dispose: disposeAvatarSoul,

  // Pupil
  setPupilDilation,
  pupilRespondToEmotion,

  // Gaze
  glanceAway,
  gazeAt,

  // Shimmer
  flashShimmer,

  // Glow
  setGlowBleed,
  glowRespondToEmotion,

  // Anticipation
  playAnticipation,
  setExpressionWithAnticipation,

  // Memory
  triggerMemorySpark,

  // Comfort
  startComfortPulse,
  stopComfortPulse,

  // Energy
  setUserEnergy,

  // Relationship
  recordInteraction,

  // Growth
  celebrateGrowth,

  // Protective
  enterProtectiveMode,
  exitProtectiveMode,

  // Warmth
  triggerWarmthBloom,

  // Cameo - Team member pop-in effects
  triggerCameoArrival,
  triggerCameoReturn,
  setupCameoListeners,

  // State access
  getState: () => ({ ...state }),
};

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { __avatarSoul: typeof avatarSoul }).__avatarSoul = avatarSoul;
}

export default avatarSoul;
