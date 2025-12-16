/**
 * Avatar Luxo UI - The Spirit of the Pixar Lamp
 *
 * Building on avatar-lamp.ui.ts, this module adds the higher-level behaviors
 * that make Luxo Jr. so magical:
 *
 * 1. INVESTIGATIVE CURIOSITY - Ferni investigates interesting moments
 * 2. PLAYFUL AUTONOMY - Occasional spontaneous delights
 * 3. EMOTIONAL ARCS - Multi-beat emotional sequences
 * 4. WEIGHT & MOMENTUM - Movements feel like they have mass
 * 5. SHADOW PLAY - The avatar casts a dynamic shadow
 * 6. RELATIONSHIP-AWARE EXPRESSIVENESS - Animation scales with relationship depth
 * 7. TIME-AWARE PRESENCE - Softer at night, energetic in morning
 * 8. SPECIAL MOMENTS - Welcome back, setback support, humor response
 *
 * LUXO JR. REFERENCE MOMENTS:
 * - Discovering the ball: Curious approach → Investigate → Pounce
 * - Bouncing on the ball: Joy → Surprise (deflates) → Confusion
 * - The "I" moment: Hop → Land → Squash
 * - Parent lamp watching: Gentle observant presence
 *
 * @module avatar-luxo.ui.ts
 */

import { gsap } from '../utils/gsap-setup.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { avatarLamp } from './avatar-lamp.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import type { RelationshipStage } from '../services/relationship-stage.service.js';

const log = createLogger('AvatarLuxo');

const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// RELATIONSHIP-AWARE ANIMATION SCALING
// ============================================================================

/**
 * Animation expressiveness scales with relationship depth.
 * First meeting: More tentative, curious, respectful
 * Deep partnership: Full expressiveness, playful, comfortable
 */
interface RelationshipAnimationProfile {
  /** How large movements are (0.5 = half size, 1.5 = 1.5x size) */
  movementScale: number;
  /** How fast animations are (0.7 = slower, 1.3 = faster) */
  speedScale: number;
  /** How bouncy/elastic (0.5 = subtle, 1.0 = full bounce) */
  elasticity: number;
  /** How often spontaneous actions happen (0-1) */
  spontaneityChance: number;
  /** Whether to use playful/insider animations */
  allowPlayful: boolean;
}

const RELATIONSHIP_PROFILES: Record<RelationshipStage, RelationshipAnimationProfile> = {
  'first-meeting': {
    movementScale: 0.6,
    speedScale: 0.85,
    elasticity: 0.4,
    spontaneityChance: 0.03,
    allowPlayful: false,
  },
  'getting-started': {
    movementScale: 0.75,
    speedScale: 0.9,
    elasticity: 0.6,
    spontaneityChance: 0.06,
    allowPlayful: false,
  },
  'building-trust': {
    movementScale: 0.9,
    speedScale: 0.95,
    elasticity: 0.8,
    spontaneityChance: 0.08,
    allowPlayful: true,
  },
  'established': {
    movementScale: 1.0,
    speedScale: 1.0,
    elasticity: 1.0,
    spontaneityChance: 0.1,
    allowPlayful: true,
  },
  'deep-partnership': {
    movementScale: 1.15,
    speedScale: 1.05,
    elasticity: 1.0,
    spontaneityChance: 0.12,
    allowPlayful: true,
  },
};

// ============================================================================
// TIME-AWARE PRESENCE - Late night softness
// ============================================================================

/**
 * Animation intensity scales with time of day.
 * Same warmth, different energy.
 */
interface TimeAnimationProfile {
  /** Overall intensity multiplier */
  intensity: number;
  /** Speed modifier */
  speedModifier: number;
  /** Quality of movement */
  quality: 'soft' | 'normal' | 'energetic';
}

function getTimeProfile(): TimeAnimationProfile {
  const hour = new Date().getHours();
  
  // Late night (10pm - 5am): Soft, holding presence
  if (hour >= 22 || hour < 5) {
    return {
      intensity: 0.6,
      speedModifier: 0.7,
      quality: 'soft',
    };
  }
  
  // Early morning (5am - 8am): Gentle wake-up energy
  if (hour >= 5 && hour < 8) {
    return {
      intensity: 0.75,
      speedModifier: 0.85,
      quality: 'normal',
    };
  }
  
  // Morning (8am - 12pm): Full energy
  if (hour >= 8 && hour < 12) {
    return {
      intensity: 1.0,
      speedModifier: 1.05,
      quality: 'energetic',
    };
  }
  
  // Afternoon (12pm - 6pm): Normal energy
  if (hour >= 12 && hour < 18) {
    return {
      intensity: 1.0,
      speedModifier: 1.0,
      quality: 'normal',
    };
  }
  
  // Evening (6pm - 10pm): Winding down
  return {
    intensity: 0.85,
    speedModifier: 0.9,
    quality: 'normal',
  };
}

// ============================================================================
// STATE
// ============================================================================

interface LuxoState {
  isInitialized: boolean;
  isPerformingSequence: boolean;
  currentSequence: string | null;
  lastSpontaneousTime: number;
  shadowElement: HTMLElement | null;
  spontaneousEnabled: boolean;
  /** Current relationship stage */
  relationshipStage: RelationshipStage;
  /** Whether this is a comeback session (returning after time away) */
  isComeback: boolean;
  /** Has played welcome back animation this session */
  hasPlayedWelcomeBack: boolean;
}

const state: LuxoState = {
  isInitialized: false,
  isPerformingSequence: false,
  currentSequence: null,
  lastSpontaneousTime: 0,
  shadowElement: null,
  spontaneousEnabled: true,
  relationshipStage: 'first-meeting',
  isComeback: false,
  hasPlayedWelcomeBack: false,
};

let coachAvatar: HTMLElement | null = null;
let avatarContainer: HTMLElement | null = null;
let spontaneousInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// ANIMATION SCALING HELPERS
// ============================================================================

/**
 * Get current animation scale based on relationship + time of day.
 * This makes movements feel appropriate to the relationship depth and time.
 */
function getAnimationScale(): { movement: number; speed: number; elasticity: number } {
  const relationshipProfile = RELATIONSHIP_PROFILES[state.relationshipStage];
  const timeProfile = getTimeProfile();
  
  return {
    movement: relationshipProfile.movementScale * timeProfile.intensity,
    speed: relationshipProfile.speedScale * timeProfile.speedModifier,
    elasticity: relationshipProfile.elasticity * timeProfile.intensity,
  };
}

/**
 * Scale a movement value based on current context.
 */
function scaleMovement(baseValue: number): number {
  const scale = getAnimationScale();
  return baseValue * scale.movement;
}

/**
 * Scale a duration based on current context.
 * Slower at night, faster in morning.
 */
function scaleDuration(baseDuration: number): number {
  const scale = getAnimationScale();
  // Inverse relationship: lower speed scale = longer duration
  return baseDuration / scale.speed;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Luxo spirit enhancements.
 */
export function initAvatarLuxo(): void {
  if (state.isInitialized) return;

  coachAvatar = document.getElementById('coachAvatar');
  avatarContainer = document.querySelector('.avatar-container');

  if (!coachAvatar || !avatarContainer) {
    log.warn('Avatar elements not found, deferring initialization');
    trackedTimeout(initAvatarLuxo, 500);
    return;
  }

  // Create dynamic shadow
  createDynamicShadow();

  // Set up spontaneous delight timer
  setupSpontaneousBehavior();

  // Listen for interesting moments to investigate
  setupInvestigativeBehavior();
  
  // Listen for special moments
  setupSpecialMoments();
  
  // Listen for relationship stage changes
  document.addEventListener('ferni:relationship-stage-change', ((e: CustomEvent) => {
    const { stage, isComeback } = e.detail as { stage: RelationshipStage; isComeback?: boolean };
    setRelationshipStage(stage);
    if (isComeback) {
      state.isComeback = true;
    }
  }) as EventListener);

  state.isInitialized = true;
  log.info('🎬 Avatar Luxo initialized - Pixar spirit activated!');
}

/**
 * Set the current relationship stage for animation scaling.
 */
export function setRelationshipStage(stage: RelationshipStage): void {
  const oldStage = state.relationshipStage;
  state.relationshipStage = stage;
  
  if (oldStage !== stage) {
    log.info(`🎭 Relationship stage updated: ${oldStage} → ${stage}`);
  }
}

/**
 * Mark this session as a comeback (returning after time away).
 */
export function markAsComeback(): void {
  state.isComeback = true;
  log.info('🎬 Session marked as comeback');
}

/**
 * Dispose of the Luxo enhancements.
 */
export function disposeAvatarLuxo(): void {
  clearAllTimeouts();
  if (spontaneousInterval) {
    clearInterval(spontaneousInterval);
    spontaneousInterval = null;
  }
  state.shadowElement?.remove();
  state.isInitialized = false;
}

// ============================================================================
// DYNAMIC SHADOW - Grounds the avatar in space
// ============================================================================

/**
 * Create a dynamic shadow beneath the avatar that responds to movement.
 * This gives Ferni visual weight and presence.
 */
function createDynamicShadow(): void {
  if (!avatarContainer || state.shadowElement) return;

  const shadow = document.createElement('div');
  shadow.className = 'luxo-shadow';
  shadow.style.cssText = `
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 70%;
    height: 12px;
    background: radial-gradient(ellipse at center, 
      rgba(44, 37, 32, 0.15) 0%, 
      rgba(44, 37, 32, 0.08) 40%,
      transparent 70%
    );
    border-radius: 50%;
    pointer-events: none;
    z-index: -1;
    transition: transform 0.2s ease-out, opacity 0.2s ease-out;
  `;

  avatarContainer.appendChild(shadow);
  state.shadowElement = shadow;

  log.debug('Dynamic shadow created');
}

/**
 * Update shadow based on avatar position/state.
 * Shadow expands when avatar jumps (further from ground).
 */
export function updateShadow(heightOffset: number = 0, scale: number = 1): void {
  if (!state.shadowElement) return;

  // Shadow spreads and fades as avatar rises
  const shadowScale = 1 + (heightOffset / 100) * 0.3;
  const shadowOpacity = 1 - (heightOffset / 100) * 0.4;

  state.shadowElement.style.transform = `translateX(-50%) scale(${shadowScale * scale})`;
  state.shadowElement.style.opacity = String(Math.max(0.3, shadowOpacity));
}

// ============================================================================
// INVESTIGATIVE CURIOSITY - The Luxo Jr. investigation
// ============================================================================

/**
 * Perform the "investigate" sequence - Luxo Jr. discovering something interesting.
 *
 * 1. Notice: Quick perk up (ear prick)
 * 2. Approach: Lean forward with curiosity
 * 3. Inspect: Tilt and look
 * 4. React: Based on what was found
 */
export async function investigate(
  context: 'interesting' | 'surprising' | 'emotional' | 'celebratory' = 'interesting'
): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'investigate';

  try {
    // 1. NOTICE - Quick attention getter
    await playNotice();

    // Brief pause (Luxo Jr. processes what they saw)
    await wait(150);

    // 2. APPROACH - Lean in with curiosity
    await playApproach();

    // Brief pause
    await wait(100);

    // 3. INSPECT - Look closely
    await playInspect();

    // 4. REACT - Based on context
    await wait(200);
    switch (context) {
      case 'surprising':
        avatarLamp.perkUp();
        break;
      case 'emotional':
        avatarLamp.shrink(0.3);
        await wait(400);
        avatarLamp.nod(1, 'slow');
        break;
      case 'celebratory':
        avatarLamp.bounce(0.7, 2);
        break;
      case 'interesting':
      default:
        avatarLamp.nod(1, 'normal');
        break;
    }

    // 5. SETTLE - Return to neutral with grace
    await wait(600);
    avatarLamp.untilt();

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Investigation complete:', context);
}

async function playNotice(): Promise<void> {
  if (!coachAvatar) return;

  // Quick perk - like ears pricking up
  await gsap.to(coachAvatar, {
    scaleY: 1.06,
    scaleX: 0.96,
    y: -3,
    duration: 0.1,
    ease: 'power3.out',
  });

  await gsap.to(coachAvatar, {
    scaleY: 1.02,
    scaleX: 0.99,
    y: -1,
    duration: 0.08,
    ease: 'power2.out',
  });
}

async function playApproach(): Promise<void> {
  if (!coachAvatar) return;

  // Lean forward with interest - squash slightly as weight shifts forward
  await gsap.to(coachAvatar, {
    y: -5,
    scaleY: 0.98,
    scaleX: 1.02,
    rotation: 2,
    duration: 0.2,
    ease: 'power2.out',
  });
}

async function playInspect(): Promise<void> {
  if (!coachAvatar) return;

  // Curious tilt - like looking at something from different angles
  const tl = gsap.timeline();

  // First angle
  tl.to(coachAvatar, {
    rotation: 6,
    y: -4,
    duration: 0.15,
    ease: 'power2.out',
  });

  // Second angle (other side)
  tl.to(coachAvatar, {
    rotation: -4,
    duration: 0.2,
    ease: 'power2.inOut',
  });

  // Settle on curious pose
  tl.to(coachAvatar, {
    rotation: 3,
    duration: 0.15,
    ease: 'power2.out',
  });

  await tl;
}

// ============================================================================
// EMOTIONAL ARCS - Multi-beat sequences like Luxo Jr.
// ============================================================================

/**
 * The "discovery" arc - Finding something wonderful.
 * Mirrors Luxo Jr. discovering the ball for the first time.
 */
export async function playDiscoveryArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'discovery';

  try {
    // 1. Notice something
    avatarLamp.perkUp();
    await wait(400);

    // 2. Curious approach
    avatarLamp.tilt('forward', 0.6);
    await wait(300);

    // 3. Excitement builds
    avatarLamp.bounce(0.4, 1);
    await wait(300);

    // 4. Full joy
    avatarLamp.bounce(0.8, 2);
    avatarLamp.untilt();

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Discovery arc complete');
}

/**
 * The "realization" arc - Understanding something profound.
 * Like when Luxo Jr. figures out the ball bounces.
 */
export async function playRealizationArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'realization';

  try {
    // 1. Confusion/thinking
    avatarLamp.look('up');
    avatarLamp.tilt('left', 0.3);
    await wait(500);

    // 2. Processing...
    avatarLamp.tilt('right', 0.2);
    await wait(400);

    // 3. The "aha!" moment
    avatarLamp.perkUp();
    await wait(200);

    // 4. Excited understanding
    avatarLamp.bounce(0.5, 1);
    avatarLamp.untilt();
    avatarLamp.lookCenter();

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Realization arc complete');
}

/**
 * The "empathy" arc - Showing deep understanding.
 * Like the parent lamp watching Luxo Jr.
 */
export async function playEmpathyArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'empathy';

  try {
    // 1. Soften - becoming present
    avatarLamp.shrink(0.2);
    await wait(300);

    // 2. Lean in - showing care
    avatarLamp.tilt('forward', 0.4);
    await wait(400);

    // 3. Slow understanding nod
    avatarLamp.nod(1, 'slow');
    await wait(600);

    // 4. Gentle return - still present
    avatarLamp.untilt();
    await wait(200);
    avatarLamp.unshrink();

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Empathy arc complete');
}

/**
 * The "celebration" arc - Pure joy and excitement.
 * Like Luxo Jr. bouncing on the ball.
 */
export async function playCelebrationArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'celebration';

  const scale = getAnimationScale();

  try {
    // 1. Build up excitement
    avatarLamp.perkUp();
    await wait(scaleDuration(200));

    // 2. Little hop of anticipation
    avatarLamp.bounce(0.3 * scale.movement, 1);
    await wait(scaleDuration(200));

    // 3. THE BIG BOUNCE - pure Luxo Jr. joy!
    avatarLamp.bounce(0.95 * scale.movement, 3);
    await wait(scaleDuration(800));

    // 4. Happy shake (like wagging)
    avatarLamp.shake(0.4 * scale.movement);

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Celebration arc complete');
}

// ============================================================================
// SPECIAL MOMENTS - Welcome back, setback support, humor
// ============================================================================

/**
 * The "welcome back" arc - Recognizing a returning friend.
 * Like seeing someone you know walk through the door.
 * 
 * Principle alignment: Relationship Over Transaction
 * "Every interaction is part of an ongoing relationship"
 */
export async function playWelcomeBackArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;
  if (state.hasPlayedWelcomeBack) return; // Only once per session

  state.isPerformingSequence = true;
  state.currentSequence = 'welcome-back';
  state.hasPlayedWelcomeBack = true;

  const scale = getAnimationScale();

  try {
    // 1. Recognition - Quick perk of delighted surprise
    await gsap.to(coachAvatar, {
      scaleY: 1.08 * scale.movement,
      scaleX: 0.94,
      y: -4 * scale.movement,
      duration: scaleDuration(0.12),
      ease: 'power3.out',
    });

    await wait(scaleDuration(100));

    // 2. Warm approach - Lean forward with genuine happiness
    await gsap.to(coachAvatar, {
      scaleY: 1.02,
      scaleX: 1.0,
      y: -6 * scale.movement,
      rotation: 3 * scale.movement,
      duration: scaleDuration(0.2),
      ease: 'power2.out',
    });

    await wait(scaleDuration(200));

    // 3. Happy to see you - Little bounce of joy
    avatarLamp.bounce(0.4 * scale.movement, 2);
    await wait(scaleDuration(400));

    // 4. Settle into comfortable presence
    await gsap.to(coachAvatar, {
      scaleY: 1.0,
      scaleX: 1.0,
      y: 0,
      rotation: 0,
      duration: scaleDuration(0.3),
      ease: EASING.SPRING_GENTLE,
    });

    // 5. Warm nod of recognition
    avatarLamp.nod(1, 'slow');

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.info('🎬 Welcome back arc complete - old friend recognized!');
}

/**
 * The "setback support" arc - When user shares failure or struggle.
 * Not just empathy - grounding, "this is part of the journey" presence.
 * 
 * Principle alignment: Growth Through Gentleness
 * "Normalize setbacks as part of the journey"
 */
export async function playSetbackSupportArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'setback-support';

  const scale = getAnimationScale();
  const timeProfile = getTimeProfile();

  try {
    // 1. Receive - Open, accepting posture (no flinch)
    avatarLamp.shrink(0.15 * scale.movement);
    await wait(scaleDuration(300));

    // 2. Ground - Settle down, become stable anchor
    await gsap.to(coachAvatar, {
      y: 4 * scale.movement, // Slight settle down
      scaleY: 0.96,
      scaleX: 1.02,
      duration: scaleDuration(0.35),
      ease: 'power2.out',
    });

    // Shadow gets more solid (grounded)
    updateShadow(0, 1.15);
    await wait(scaleDuration(400));

    // 3. Present - Steady, patient presence
    if (timeProfile.quality === 'soft') {
      // Late night: Extra gentle
      avatarLamp.tilt('forward', 0.25 * scale.movement);
    } else {
      avatarLamp.tilt('forward', 0.35 * scale.movement);
    }
    await wait(scaleDuration(500));

    // 4. Acknowledge - Slow, understanding nod
    avatarLamp.nod(1, 'slow');
    await wait(scaleDuration(600));

    // 5. Steady return - Still rooted, but ready
    await gsap.to(coachAvatar, {
      y: 0,
      scaleY: 1.0,
      scaleX: 1.0,
      duration: scaleDuration(0.4),
      ease: EASING.GENTLE,
    });

    avatarLamp.untilt();
    avatarLamp.unshrink();
    updateShadow(0, 1.0);

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Setback support arc complete - grounded presence shown');
}

/**
 * The "humor response" arc - When user makes a joke.
 * Playful shake, delighted reaction - shared moment of levity.
 * 
 * Principle alignment: Authentic Personality
 * "We have opinions and preferences, use humor naturally"
 */
export async function playHumorResponseArc(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  // Only play if relationship allows playfulness
  const profile = RELATIONSHIP_PROFILES[state.relationshipStage];
  if (!profile.allowPlayful) {
    // More reserved response for new relationships
    avatarLamp.tilt('right', 0.2);
    await wait(400);
    avatarLamp.untilt();
    return;
  }

  state.isPerformingSequence = true;
  state.currentSequence = 'humor-response';

  const scale = getAnimationScale();

  try {
    // 1. Catch the humor - Slight perk of recognition
    await gsap.to(coachAvatar, {
      scaleY: 1.04 * scale.movement,
      y: -2 * scale.movement,
      duration: scaleDuration(0.1),
      ease: 'power2.out',
    });

    await wait(scaleDuration(80));

    // 2. The laugh - Playful shake (like can't contain it)
    const shakeTimeline = gsap.timeline();
    const shakeAmount = 4 * scale.movement;
    const shakeSpeed = scaleDuration(0.06);

    for (let i = 0; i < 3; i++) {
      shakeTimeline.to(coachAvatar, {
        rotation: shakeAmount,
        duration: shakeSpeed,
        ease: 'power2.inOut',
      });
      shakeTimeline.to(coachAvatar, {
        rotation: -shakeAmount * 0.8,
        duration: shakeSpeed,
        ease: 'power2.inOut',
      });
    }

    await shakeTimeline;

    // 3. Happy bounce - Shared delight
    avatarLamp.bounce(0.3 * scale.movement, 1);
    await wait(scaleDuration(300));

    // 4. Settle with warmth
    await gsap.to(coachAvatar, {
      scaleY: 1.0,
      scaleX: 1.0,
      y: 0,
      rotation: 0,
      duration: scaleDuration(0.25),
      ease: EASING.SPRING_GENTLE,
    });

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Humor response arc complete - shared laugh!');
}

/**
 * The "late night holding" presence.
 * Extra gentle, extra present. "2am gets the same warmth as noon."
 * Called when conversation starts at late night.
 */
export async function playLateNightPresence(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  const timeProfile = getTimeProfile();
  if (timeProfile.quality !== 'soft') return;

  state.isPerformingSequence = true;
  state.currentSequence = 'late-night-presence';

  try {
    // Extra gentle settling - "I'm here, no rush"
    await gsap.to(coachAvatar, {
      scaleY: 0.98,
      y: 2,
      duration: 0.5,
      ease: EASING.GENTLE,
    });

    await wait(300);

    // Soft, patient return
    await gsap.to(coachAvatar, {
      scaleY: 1.0,
      y: 0,
      duration: 0.8,
      ease: EASING.GENTLE,
    });

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.debug('Late night presence established');
}

/**
 * Set up listeners for special moments.
 */
function setupSpecialMoments(): void {
  // Welcome back when comeback detected
  document.addEventListener('ferni:conversation-start', () => {
    if (state.isComeback && !state.hasPlayedWelcomeBack) {
      // Delay slightly so it feels natural
      trackedTimeout(() => {
        playWelcomeBackArc();
      }, 800);
    }
    
    // Check for late night presence
    const timeProfile = getTimeProfile();
    if (timeProfile.quality === 'soft' && !state.isComeback) {
      trackedTimeout(() => {
        playLateNightPresence();
      }, 1200);
    }
  });

  // Setback support when user shares failure/struggle
  document.addEventListener('ferni:setback-shared', () => {
    if (!state.isPerformingSequence) {
      playSetbackSupportArc();
    }
  });

  // Humor response when user makes a joke
  document.addEventListener('ferni:humor-detected', () => {
    if (!state.isPerformingSequence) {
      playHumorResponseArc();
    }
  });
  
  // Inside joke recognition - special warmth for shared history
  document.addEventListener('ferni:inside-joke', () => {
    const profile = RELATIONSHIP_PROFILES[state.relationshipStage];
    if (profile.allowPlayful && !state.isPerformingSequence) {
      // Knowing glance + warm shake
      avatarLamp.tilt('right', 0.3);
      trackedTimeout(() => {
        avatarLamp.shake(0.25);
        trackedTimeout(() => {
          avatarLamp.untilt();
        }, 500);
      }, 200);
    }
  });
}

// ============================================================================
// SPONTANEOUS DELIGHT - Autonomous playful moments
// ============================================================================

/**
 * Set up spontaneous behaviors that happen on their own.
 * Like Luxo Jr. fidgeting or looking around curiously.
 * Frequency scales with relationship depth.
 */
function setupSpontaneousBehavior(): void {
  // Check every 30-60 seconds for spontaneous opportunity
  const checkSpontaneous = () => {
    if (!state.spontaneousEnabled || state.isPerformingSequence) return;

    // Only if been idle for a while
    const timeSinceLastActivity = Date.now() - state.lastSpontaneousTime;
    if (timeSinceLastActivity < 20000) return; // At least 20s between spontaneous acts

    // Chance scales with relationship depth
    const profile = RELATIONSHIP_PROFILES[state.relationshipStage];
    if (Math.random() < profile.spontaneityChance) {
      performSpontaneousAction();
    }
  };

  spontaneousInterval = setInterval(checkSpontaneous, 30000 + Math.random() * 30000);
}

/**
 * Perform a random spontaneous action.
 */
async function performSpontaneousAction(): Promise<void> {
  state.lastSpontaneousTime = Date.now();

  const actions = [
    // Curious look around
    async () => {
      avatarLamp.look('left');
      await wait(800);
      avatarLamp.look('right');
      await wait(600);
      avatarLamp.lookCenter();
    },
    // Tiny stretch
    async () => {
      avatarLamp.perkUp();
      await wait(400);
      avatarLamp.express('neutral');
    },
    // Curious tilt
    async () => {
      avatarLamp.tilt('right', 0.4);
      await wait(1000);
      avatarLamp.untilt();
    },
    // Settling in
    async () => {
      avatarLamp.shrink(0.15);
      await wait(800);
      avatarLamp.unshrink();
    },
  ];

  const action = actions[Math.floor(Math.random() * actions.length)];
  if (action) {
    await action();
  }

  log.debug('Spontaneous action performed');
}

/**
 * Enable or disable spontaneous behaviors.
 */
export function setSpontaneousEnabled(enabled: boolean): void {
  state.spontaneousEnabled = enabled;
}

// ============================================================================
// INVESTIGATIVE TRIGGERS - When to investigate
// ============================================================================

/**
 * Set up listeners for moments worth investigating.
 */
function setupInvestigativeBehavior(): void {
  // User shares something emotional
  document.addEventListener('ferni:emotional-content', () => {
    if (!state.isPerformingSequence) {
      investigate('emotional');
    }
  });

  // Something surprising/unexpected
  document.addEventListener('ferni:surprise-content', () => {
    if (!state.isPerformingSequence) {
      investigate('surprising');
    }
  });

  // User has a realization or insight
  document.addEventListener('ferni:user-insight', () => {
    if (!state.isPerformingSequence) {
      playRealizationArc();
    }
  });

  // Breakthrough from humanization bridge (maps to user insight)
  document.addEventListener('ferni:breakthrough', () => {
    if (!state.isPerformingSequence) {
      playRealizationArc();
    }
  });

  // Celebration moment
  document.addEventListener('ferni:celebration', () => {
    if (!state.isPerformingSequence) {
      playCelebrationArc();
    }
  });

  // Memory callback - recognition of shared history
  document.addEventListener('ferni:memory-callback', () => {
    if (!state.isPerformingSequence) {
      playDiscoveryArc();
    }
  });

  // User growth recognized
  document.addEventListener('ferni:growth-recognized', () => {
    if (!state.isPerformingSequence) {
      // Proud parent moment
      playRealizationArc().then(() => {
        avatarLamp.nod(2, 'slow');
      });
    }
  });
}

// ============================================================================
// THE SIGNATURE MOVE - The "I" Hop (Pixar Logo)
// ============================================================================

/**
 * The iconic Pixar "I" hop.
 * Ferni hops up and lands with a satisfying squash.
 *
 * Use for: Major celebrations, app launch, special moments
 */
export async function playPixarHop(): Promise<void> {
  if (!coachAvatar || state.isPerformingSequence) return;

  state.isPerformingSequence = true;
  state.currentSequence = 'pixar-hop';

  try {
    const tl = gsap.timeline();

    // 1. Wind up - deep anticipation squash
    tl.to(coachAvatar, {
      scaleY: 0.7,
      scaleX: 1.25,
      y: 8,
      duration: 0.2,
      ease: 'power2.in',
    });

    // Update shadow - compressed
    updateShadow(0, 1.2);

    // 2. LAUNCH - Maximum stretch
    tl.to(coachAvatar, {
      scaleY: 1.4,
      scaleX: 0.75,
      y: -60,
      duration: 0.25,
      ease: 'power3.out',
    });

    // Shadow spreads as avatar rises
    tl.call(() => updateShadow(60, 1.3), [], '<0.1');

    // 3. Peak - slight settle at top
    tl.to(coachAvatar, {
      scaleY: 1.15,
      scaleX: 0.9,
      duration: 0.08,
      ease: 'power2.out',
    });

    // 4. FALL - accelerating
    tl.to(coachAvatar, {
      scaleY: 1.3,
      scaleX: 0.8,
      y: 0,
      duration: 0.2,
      ease: 'power2.in',
    });

    // Shadow contracts as avatar falls
    tl.call(() => updateShadow(20, 1), [], '<0.1');

    // 5. IMPACT SQUASH - The signature Pixar moment!
    tl.to(coachAvatar, {
      scaleY: 0.6,
      scaleX: 1.4,
      y: 12,
      duration: 0.08,
      ease: 'power3.in',
    });

    // Shadow at impact
    tl.call(() => updateShadow(0, 1.5), [], '<');

    // 6. Bounce recover
    tl.to(coachAvatar, {
      scaleY: 1.1,
      scaleX: 0.95,
      y: -8,
      duration: 0.12,
      ease: 'power2.out',
    });

    tl.call(() => updateShadow(8, 1), [], '<');

    // 7. Small secondary bounce
    tl.to(coachAvatar, {
      scaleY: 0.95,
      scaleX: 1.03,
      y: 2,
      duration: 0.1,
      ease: 'power2.in',
    });

    tl.call(() => updateShadow(0, 1.1), [], '<');

    // 8. Final settle with elastic
    tl.to(coachAvatar, {
      scaleY: 1,
      scaleX: 1,
      y: 0,
      duration: 0.4,
      ease: 'elastic.out(1.2, 0.5)',
    });

    tl.call(() => updateShadow(0, 1), [], '<0.2');

    await tl;

  } finally {
    state.isPerformingSequence = false;
    state.currentSequence = null;
  }

  log.info('🎬 Pixar hop complete!');
}

// ============================================================================
// UTILITY
// ============================================================================

function wait(ms: number): Promise<void> {
  return new Promise(resolve => trackedTimeout(resolve, ms));
}

/**
 * Check if a sequence is currently playing.
 */
export function isPerformingSequence(): boolean {
  return state.isPerformingSequence;
}

/**
 * Get the current sequence name.
 */
export function getCurrentSequence(): string | null {
  return state.currentSequence;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const avatarLuxo = {
  // Lifecycle
  init: initAvatarLuxo,
  dispose: disposeAvatarLuxo,

  // Investigation
  investigate,

  // Emotional arcs
  playDiscoveryArc,
  playRealizationArc,
  playEmpathyArc,
  playCelebrationArc,

  // Special moments (principle-aligned)
  playWelcomeBackArc,      // Relationship Over Transaction
  playSetbackSupportArc,   // Growth Through Gentleness
  playHumorResponseArc,    // Authentic Personality
  playLateNightPresence,   // "2am gets same warmth as noon"

  // The signature move
  playPixarHop,

  // Shadow
  updateShadow,

  // Spontaneous
  setSpontaneousEnabled,

  // Relationship awareness
  setRelationshipStage,
  markAsComeback,

  // State
  isPerformingSequence,
  getCurrentSequence,
};

export default avatarLuxo;

