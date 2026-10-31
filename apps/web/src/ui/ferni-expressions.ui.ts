/**
 * Ferni Expressions UI - Character-Level Animation System
 * 
 * The expressive heart of Ferni's avatar - making AI genuinely human.
 * 
 * FERNI DESIGN PRINCIPLES:
 * ========================
 * 1. WARM, NOT SACCHARINE - Genuine care without being performative
 * 2. PRESENT, NOT FLASHY - Full attention, subtle expressiveness
 * 3. GROUNDED - Calm, stable, reliable presence
 * 4. HUMAN - Natural, organic, approachable
 * 
 * ANIMATION CAPABILITIES:
 * =======================
 * 1. EYE LID OVERLAY SYSTEM - Creates expressive "eyelid" shapes over the avatar
 *    - Happy: Squinted (gentle arc at top)
 *    - Surprised: Wide open (no lid visible)
 *    - Sleepy: Heavy lids (large curve covering top)
 *    - Skeptical: Asymmetric (one side raised)
 *    - Sad: Soft droop at corners
 *    - Worried: Angled brows
 * 
 * 2. CHARACTER REACTIONS
 *    - Realization: "Wait, what?" moment (look away → snap back)
 *    - Held poses: Peak emotion holds before settling
 *    - Contemplation: Eyes drift when thinking deeply
 *    - Noticing: Subtle awareness of emotional signals
 *    - Warmth sparkle: Eyes brighten with particles
 * 
 * 3. ELEGANT TEXT-TO-ICON MORPH
 *    - Text settles into a point
 *    - Gentle expansion outward
 *    - Icon forms gracefully
 *    - Settles with natural physics
 * 
 * BRAND PRINCIPLES APPLIED:
 * - Squash & Stretch on all transitions (but subtle)
 * - Anticipation before every action
 * - Follow-through and overlapping action
 * - Slow in / Slow out timing
 * - Arcs in motion paths
 * - Secondary action (sparkles, glows)
 * - Appropriate exaggeration for emotional impact
 * - Solid staging
 * - Appeal through warmth
 */

import { gsap } from '../utils/gsap-setup.js';
import { DURATION } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { expressionMotion, holdReturnTarget, noteExpressionSet } from './avatar-motion/expression-easing.js';
import { DOME_POSES, NEUTRAL_DOME_PATHS, domePaths, type DomePose } from './face/dome-poses.js';
import { handOffToFaceEngine } from './face/face-engine.js';

const log = createLogger('FerniExpressions');

const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Emotional expressions for Ferni's avatar.
 * Each creates distinct eye lid configurations.
 */
export type EmotionalExpression = 
  // Core expressions
  | 'neutral'      // Default - no lid
  | 'happy'        // Squinted, warm
  | 'delighted'    // Happy + warmth sparkle
  | 'surprised'    // Wide eyes
  | 'curious'      // Tilted, one brow up
  | 'skeptical'    // One brow raised
  | 'worried'      // Angled brows
  | 'sad'          // Droopy lids
  | 'sleepy'       // Heavy lids
  | 'thinking'     // Look away
  | 'empathetic'   // Soft, understanding
  | 'excited'      // Wide + sparkle (grounded, not over-the-top)
  | 'contemplative' // Deep thought (brand-aligned)
  | 'noticing'     // Picking up on something subtle
  | 'holdingSpace' // Emotional containment
  // Phase 1: Listening States
  | 'attentive'    // Active, engaged listening
  | 'absorbing'    // Taking in heavy content
  | 'receiving'    // Open, accepting vulnerability
  | 'curiousLean'  // Leaning in with interest
  // Phase 2: Warmth Gradient
  | 'warm'         // Baseline positive regard
  | 'pleased'      // Mild satisfaction
  | 'proud'        // Pride in user
  | 'celebrating'  // Full celebration
  // Phase 3: Presence States
  | 'present'      // Fully here, grounded
  | 'holding'      // Containing emotion
  | 'accompanying' // Walking alongside
  | 'waiting'      // Patient anticipation
  // Phase 4: Coaching Emotions
  | 'encouraging'  // Gentle support
  | 'challenging'  // Loving push
  | 'reflecting'   // Mirroring back
  | 'recognizing'  // "I see you" moment
  // Phase 5: Relational Moments
  | 'remembering'  // Callback moment
  | 'reconnecting' // "Welcome back" energy
  | 'insider'      // Shared history moment
  | 'growing'      // Noticing evolution
  // Phase 6: Transition States
  | 'processing'   // Taking it in
  | 'realizing'    // Connecting dots
  | 'shifting'     // Changing gears
  | 'settling'     // Coming to rest
  // Phase 7: Farewell States
  | 'farewell';    // Warm goodbye - gentle smile with slight melancholy

/**
 * Character-level reactions - how Ferni responds to moments.
 */
export type CharacterReaction =
  | 'realization'    // "Wait, what?" moment → snap back
  | 'heldPose'       // Hold at peak
  | 'contemplation'  // Thinking drift
  | 'noticing'       // Picking up on subtle signals
  | 'warmthSparkle'; // Eyes brighten with care

// ============================================================================
// STATE
// ============================================================================

/** Every expression's domes (face/dome-poses.ts); typed here so a missing pose fails typecheck. */
const EXPRESSION_DOMES: Readonly<Record<EmotionalExpression, DomePose>> = DOME_POSES;

let isInitialized = false;
let currentExpression: EmotionalExpression = 'neutral';
/** Target lid paths of the current expression (null until one is set); read by ferni:lid-blend. */
let currentLidBase: { top: string; bottom: string } | null = null;
let lidOverlay: HTMLElement | null = null;
let sparkleContainer: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;

// Animation state
let expressionTimeline: gsap.core.Timeline | null = null;
let reactionTimeline: gsap.core.Timeline | null = null;

// Track current icon element for proper sequencing
let currentIconElement: HTMLElement | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Ferni expressions system.
 * Creates the eye lid overlay and sparkle container.
 */
export function initFerniExpressions(): void {
  if (isInitialized) return;
  
  // HMR protection: Clean up any orphaned elements from previous hot reloads
  cleanupOrphanedElements();
  
  injectStyles();
  createLidOverlay();
  createSparkleContainer();
  
  isInitialized = true;
  log.info('Ferni expressions system initialized');
}

/**
 * Clean up orphaned elements from HMR hot reloads.
 * Prevents duplicate lid overlays and sparkle containers.
 */
function cleanupOrphanedElements(): void {
  // Remove any existing lid overlays (from HMR)
  document.querySelectorAll('#avatarLidOverlay').forEach(el => el.remove());
  document.querySelectorAll('.avatar-lid-overlay').forEach(el => el.remove());
  
  // Remove any existing sparkle containers (from HMR)
  document.querySelectorAll('#emotionSparkles').forEach(el => el.remove());
  document.querySelectorAll('.emotion-sparkles-container').forEach(el => el.remove());
  
  // Remove any orphaned icon containers
  document.querySelectorAll('.morph-icon-container').forEach(el => el.remove());
}

/**
 * Create the eye lid overlay element.
 * This SVG overlay creates the "eyelid" effect over the avatar.
 */
function createLidOverlay(): void {
  const coachAvatar = document.getElementById('coachAvatar');
  if (!coachAvatar) return;
  
  // Create container for lid
  lidOverlay = document.createElement('div');
  lidOverlay.id = 'avatarLidOverlay';
  lidOverlay.className = 'avatar-lid-overlay';
  
  // SVG lid shape - will be animated via CSS transforms
  // Includes dimples for warm expressions (delighted, happy, celebrating)
  lidOverlay.innerHTML = `
    <svg viewBox="0 0 100 100" class="lid-svg" preserveAspectRatio="none">
      <!-- Top lid -->
      <path class="lid-top" d="${NEUTRAL_DOME_PATHS.top}" fill="#ffffff"/>
      <!-- Bottom lid (for squinting) -->
      <path class="lid-bottom" d="${NEUTRAL_DOME_PATHS.bottom}" fill="#ffffff"/>
      <!-- Rim: a soft persona-colour edge so the white caps never fringe against the head -->
      <circle class="lid-rim" cx="50" cy="50" r="49.5" fill="none" vector-effect="non-scaling-stroke"/>
      <!-- Dimples - subtle shadows that appear during warm expressions -->
      <!-- Positioned below eyes (cy=47) in cheek area, styled as soft shadows -->
      <ellipse class="dimple dimple-left" cx="28" cy="68" rx="4" ry="3" opacity="0"/>
      <ellipse class="dimple dimple-right" cx="72" cy="68" rx="4" ry="3" opacity="0"/>
    </svg>
    <!-- Warmth sparkle overlay -->
    <div class="warmth-sparkles"></div>
  `;
  
  // Insert into avatar
  coachAvatar.appendChild(lidOverlay);
  log.debug('Lid overlay created');
}

/**
 * Create sparkle container for warmth effects.
 */
function createSparkleContainer(): void {
  const coach = document.getElementById('coach');
  if (!coach) return;
  
  sparkleContainer = document.createElement('div');
  sparkleContainer.id = 'emotionSparkles';
  sparkleContainer.className = 'emotion-sparkles-container';
  coach.appendChild(sparkleContainer);
}

// ============================================================================
// EXPRESSION SYSTEM - Eye Lids Create Emotion
// ============================================================================

/**
 * Set the avatar's emotional expression.
 * Uses the lid overlay to create character-quality expressions.
 * 
 * @param expression - The emotional expression to display
 * @param duration - How long to transition (ms)
 * @param hold - How long to hold before returning to neutral (0 = stay)
 */
export function setExpression(
  expression: EmotionalExpression, 
  duration: number = DURATION.SLOW,
  hold: number = 0
): void {
  if (handOffToFaceEngine(expression, 'reaction', hold)) return;
  if (!isInitialized) initFerniExpressions();
  if (!lidOverlay || expression === currentExpression) return;
  // Cancel any existing expression animation
  if (expressionTimeline) {
    expressionTimeline.kill();
  }
  const prevExpression = currentExpression;
  currentExpression = expression;
  
  // Get lid elements and dimples
  const lidTop = lidOverlay.querySelector('.lid-top') as SVGPathElement;
  const lidBottom = lidOverlay.querySelector('.lid-bottom') as SVGPathElement;
  const dimpleLeft = lidOverlay.querySelector('.dimple-left') as SVGEllipseElement;
  const dimpleRight = lidOverlay.querySelector('.dimple-right') as SVGEllipseElement;
  const sparkles = lidOverlay.querySelector('.warmth-sparkles') as HTMLElement;
  
  if (!lidTop || !lidBottom) return;
  
  const config = EXPRESSION_DOMES[expression];
  if (!config) return;
  const paths = domePaths(config);
  currentLidBase = paths;
  // Create timeline; weight-aware easing + reduced motion when ferni:weighted-easing is on
  const tl = gsap.timeline();
  expressionTimeline = tl;
  const motion = expressionMotion(expression, duration);
  // Anticipation phase - slight opposite movement
  if (motion.anticipate && (prevExpression !== 'neutral' || expression !== 'neutral')) {
    tl.to([lidTop, lidBottom], {
      scaleY: 0.95,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, 0);
  }
  
  // Main expression transition
  tl.to(lidTop, {
    attr: { d: paths.top },
    scaleY: 1,
    duration: toSeconds(motion.durationMs),
    ease: motion.ease,
  }, toSeconds(motion.delayMs));
  
  tl.to(lidBottom, {
    attr: { d: paths.bottom },
    scaleY: 1,
    duration: toSeconds(motion.durationMs),
    ease: motion.ease,
  }, toSeconds(motion.delayMs));
  
  // Dimple animations - subtle shadows that appear on warm expressions
  if (dimpleLeft && dimpleRight) {
    const dimpleOpacity = config.dimpleOpacity ?? 0;
    tl.to([dimpleLeft, dimpleRight], {
      opacity: dimpleOpacity,
      duration: toSeconds(motion.durationMs * 0.8),
      ease: dimpleOpacity > 0 ? 'power2.out' : 'power2.in',
    }, toSeconds(motion.delayMs));
  }
  
  // Warmth sparkle effect for delighted/excited
  if (config.sparkle && sparkles) {
    triggerWarmthSparkle();
  }
  
  noteExpressionSet(expression, hold); // resting moods become the hold-return baseline
  if (hold > 0) {
    tl.call(() => {
      setExpression(holdReturnTarget('neutral', EXPRESSION_DOMES), DURATION.SLOW);
    }, [], `+=${toSeconds(hold)}`);
  }
  
  log.debug('Expression set:', expression);
}

/** Get current expression. */
export function getExpression(): EmotionalExpression {
  return currentExpression;
}

/** The current expression's lid paths, so the speaking lid can open from them (ferni:lid-blend). */
export function getLidBasePaths(): { top: string; bottom: string } | null {
  return currentLidBase;
}

// ============================================================================
// CHARACTER REACTIONS - Ferni-Quality Moments
// ============================================================================

/**
 * Play a realization reaction.
 * Character notices something - looks away, pauses, then returns with awareness.
 * Used when Ferni picks up on something the user said.
 */
export function playRealization(): void {
  const coachAvatar = document.getElementById('coachAvatar');
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!coachAvatar || !avatarContainer) return;
  
  // Cancel any existing reaction
  if (reactionTimeline) reactionTimeline.kill();
  
  const tl = gsap.timeline();
  reactionTimeline = tl;
  
  // Phase 1: Quick look away (processing)
  tl.to(avatarContainer, {
      rotation: -6,
      x: -4,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    })
    // Phase 2: Brief pause (understanding)
    .to(avatarContainer, {
      rotation: -6,
      duration: toSeconds(DURATION.NORMAL),
    })
    // Phase 3: Return with awareness
    .call(() => setExpression('noticing', DURATION.FAST), [], '<+=50%')
    .to(avatarContainer, {
      rotation: 0,
      x: 0,
      scale: 1.03,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(1.5)',
    })
    // Phase 4: Hold moment
    .to(avatarContainer, {
      scale: 1.03,
      duration: toSeconds(DURATION.SLOW),
    })
    // Phase 5: Settle back
    .to(avatarContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.5)',
    })
    .call(() => setExpression('curious', DURATION.SLOW, DURATION.CELEBRATION), []);
  
  log.debug('Realization reaction played');
}

/**
 * Play a held pose reaction.
 * Character hits peak emotion and HOLDS before settling.
 * 
 * @param peakExpression - The expression at the peak
 * @param holdDuration - How long to hold at peak
 */
export function playHeldPose(
  peakExpression: EmotionalExpression = 'happy',
  holdDuration: number = DURATION.SLOW
): void {
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!avatarContainer) return;
  
  if (reactionTimeline) reactionTimeline.kill();
  
  const tl = gsap.timeline();
  reactionTimeline = tl;
  
  // Anticipation squash
  tl.to(avatarContainer, {
      scaleY: 0.94,
      scaleX: 1.04,
      y: 2,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.in',
    })
    // Launch to peak with stretch
    .to(avatarContainer, {
      scaleY: 1.06,
      scaleX: 0.96,
      y: -6,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    })
    .call(() => setExpression(peakExpression, DURATION.FAST), [], '<')
    // HOLD at peak - the magic moment
    .to(avatarContainer, {
      scaleY: 1.04,
      scaleX: 0.97,
      y: -5,
      duration: toSeconds(holdDuration),
      ease: 'power1.inOut',
    })
    // Settle back with overshoot
    .to(avatarContainer, {
      scaleY: 0.98,
      scaleX: 1.01,
      y: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'power2.in',
    })
    .to(avatarContainer, {
      scaleY: 1,
      scaleX: 1,
      y: 0,
      duration: toSeconds(DURATION.SLOW),
      ease: 'elastic.out(1, 0.6)',
    })
    .call(() => setExpression('neutral', DURATION.SLOW), [], '-=0.2');
  
  log.debug('Held pose played:', peakExpression);
}

/**
 * Play contemplation - eyes drift when thinking deeply.
 * Like a wise friend considering your question carefully.
 */
export function playContemplation(duration: number = 2000): void {
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!avatarContainer) return;
  
  if (reactionTimeline) reactionTimeline.kill();
  
  // Set contemplative expression
  setExpression('contemplative', DURATION.NORMAL);
  
  const tl = gsap.timeline();
  reactionTimeline = tl;
  
  // Drift up and to the side (thinking pose)
  tl.to(avatarContainer, {
      rotation: 4,
      x: 2,
      y: -1,
      duration: toSeconds(DURATION.MODERATE),
      ease: 'power2.out',
    })
    // Subtle wander while thinking
    .to(avatarContainer, {
      rotation: 2,
      x: 4,
      duration: toSeconds(duration * 0.4),
      ease: 'sine.inOut',
    })
    .to(avatarContainer, {
      rotation: 5,
      x: 1,
      duration: toSeconds(duration * 0.3),
      ease: 'sine.inOut',
    })
    // Return with clarity
    .to(avatarContainer, {
      rotation: 0,
      x: 0,
      y: 0,
      scale: 1.02,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(1.5)',
    })
    .call(() => setExpression('happy', DURATION.FAST, DURATION.SLOW), [])
    .to(avatarContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.7)',
    });
  
  log.debug('Contemplation played');
}

/**
 * Play noticing - subtle awareness of emotional signals.
 * Used when Ferni picks up on what's NOT being said.
 */
export function playNoticing(duration: number = 1200): void {
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!avatarContainer) return;
  
  if (reactionTimeline) reactionTimeline.kill();
  
  setExpression('noticing', DURATION.FAST);
  
  const tl = gsap.timeline();
  reactionTimeline = tl;
  
  // Subtle attentive shift
  tl.to(avatarContainer, {
      rotation: -2,
      x: -1,
      scale: 1.015,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'power2.out',
    })
    // Hold attention
    .to(avatarContainer, {
      duration: toSeconds(duration * 0.5),
    })
    // Gentle return
    .to(avatarContainer, {
      rotation: 0,
      x: 0,
      scale: 1,
      duration: toSeconds(DURATION.SLOW),
      ease: 'power2.out',
    })
    .call(() => setExpression('empathetic', DURATION.SLOW, DURATION.SLOW), []);
  
  log.debug('Noticing played');
}

/**
 * Trigger warmth sparkle effect.
 * Eyes brighten with particle sparkles - genuine, not performative.
 */
export function triggerWarmthSparkle(): void {
  if (!sparkleContainer) return;
  
  // Clear existing sparkles
  sparkleContainer.innerHTML = '';
  
  // Create sparkle particles - fewer than before, more elegant
  const sparkleCount = 6;
  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'emotion-sparkle';
    
    // Random position around avatar
    const angle = (i / sparkleCount) * Math.PI * 2;
    const distance = 35 + Math.random() * 15;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const size = 3 + Math.random() * 3;
    const delay = i * 0.06;
    
    sparkle.style.cssText = `
      position: absolute;
      left: 50%;
      top: 50%;
      width: ${size}px;
      height: ${size}px;
      background: var(--color-semantic-warning, #b8956a);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
    `;
    
    sparkleContainer.appendChild(sparkle);
    
    // Animate sparkle - more gentle than before
    gsap.timeline()
      .to(sparkle, {
        x,
        y,
        opacity: 0.8,
        scale: 1.3,
        duration: toSeconds(DURATION.NORMAL),
        delay,
        ease: 'back.out(1.5)',
      })
      .to(sparkle, {
        opacity: 0,
        scale: 0.5,
        duration: toSeconds(DURATION.SLOW),
        ease: 'power2.in',
        onComplete: () => sparkle.remove(),
      });
  }
  
  log.debug('Warmth sparkle triggered');
}

// ============================================================================
// ELEGANT TEXT-TO-ICON MORPH - Apple/Ferni Quality Sequencing
// ============================================================================

/**
 * Perform an elegant morph from text to icon.
 * Proper Apple/Ferni sequencing - NO overlap.
 * 
 * SEQUENCE:
 * 1. Text settles and fades (completes fully)
 * 2. Brief pause (breathing room)
 * 3. Icon appears and settles
 * 
 * @param iconSvg - The SVG string for the icon
 * @param duration - Total duration
 * @returns Promise that resolves when morph is complete
 */
export async function morphTextToIcon(iconSvg: string, _duration: number = 600): Promise<HTMLElement | null> {
  const avatarText = document.getElementById('avatarText');
  const coachAvatar = document.getElementById('coachAvatar');
  
  if (!avatarText || !coachAvatar) return null;
  
  // Clean up any existing icon first
  if (currentIconElement) {
    currentIconElement.remove();
    currentIconElement = null;
  }
  
  return new Promise((resolve) => {
    const tl = gsap.timeline();
    
    // Create icon element (completely hidden initially)
    const iconContainer = document.createElement('div');
    iconContainer.className = 'morph-icon-container';
    iconContainer.innerHTML = iconSvg;
    iconContainer.style.cssText = `
      position: absolute;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transform: scale(0);
      color: var(--color-text-secondary);
      pointer-events: none;
    `;
    const svg = iconContainer.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
    }
    
    // Store reference
    currentIconElement = iconContainer;
    
    // ========================================
    // PHASE 1: Text exits completely (no overlap)
    // ========================================
    
    // Subtle avatar anticipation
    tl.to(coachAvatar, {
      scaleY: 0.97,
      scaleX: 1.02,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, 0);
    
    // Text shrinks and fades
    tl.to(avatarText, {
      scale: 0.7,
      opacity: 0.6,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.in',
    }, 0);
    
    // Text collapses completely
    tl.to(avatarText, {
      scale: 0,
      opacity: 0,
      duration: toSeconds(DURATION.FAST),
      ease: 'power3.in',
    });
    
    // ========================================
    // PHASE 2: Breathing room (clear separation)
    // ========================================
    
    tl.call(() => {
      // Now safe to add icon - text is completely gone
      avatarText.parentElement?.appendChild(iconContainer);
      avatarText.style.visibility = 'hidden';
    });
    
    // Brief pause - the Apple touch
    tl.to({}, { duration: toSeconds(DURATION.MICRO * 1.5) });
    
    // ========================================
    // PHASE 3: Icon enters gracefully
    // ========================================
    
    // Avatar bounce for emphasis
    tl.to(coachAvatar, {
      scaleY: 1.04,
      scaleX: 0.97,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    });
    
    // Icon appears with spring
    tl.to(iconContainer, {
      scale: 1.15,
      opacity: 1,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(2)',
    }, '<');
    
    // ========================================
    // PHASE 4: Everything settles
    // ========================================
    
    // Icon settles to final size
    tl.to(iconContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.6)',
    });
    
    // Avatar settles
    tl.to(coachAvatar, {
      scaleY: 1,
      scaleX: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.7)',
    }, '<');
    
    tl.call(() => {
      resolve(iconContainer);
    });
  });
}

/**
 * Morph icon back to text.
 * Proper sequencing - icon fully exits before text returns.
 * 
 * @param iconElement - The icon element to morph away (optional, uses tracked element)
 */
export async function morphIconToText(iconElement?: HTMLElement | null): Promise<void> {
  const avatarText = document.getElementById('avatarText');
  const coachAvatar = document.getElementById('coachAvatar');
  
  if (!avatarText || !coachAvatar) return;
  
  // Use provided element or tracked element
  const icon = iconElement || currentIconElement;
  
  return new Promise((resolve) => {
    const tl = gsap.timeline();
    
    // ========================================
    // PHASE 1: Icon exits completely
    // ========================================
    
    if (icon) {
      // Icon anticipation
      tl.to(icon, {
        scale: 1.1,
        duration: toSeconds(DURATION.MICRO),
        ease: 'power2.in',
      }, 0);
      
      // Icon shrinks and fades
      tl.to(icon, {
        scale: 0,
        opacity: 0,
        duration: toSeconds(DURATION.FAST),
        ease: 'power3.in',
      });
      
      // Remove icon from DOM
      tl.call(() => {
        icon.remove();
        currentIconElement = null;
      });
    }
    
    // ========================================
    // PHASE 2: Breathing room
    // ========================================
    
    tl.to({}, { duration: toSeconds(DURATION.MICRO) });
    
    // ========================================
    // PHASE 3: Text returns gracefully
    // ========================================
    
    // Make text visible again
    tl.call(() => {
      avatarText.style.visibility = 'visible';
    });
    
    // Avatar anticipation
    tl.to(coachAvatar, {
      scaleY: 0.97,
      scaleX: 1.02,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    });
    
    // Text springs back
    tl.to(avatarText, {
      scale: 1.1,
      opacity: 1,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(2)',
    });
    
    // ========================================
    // PHASE 4: Everything settles
    // ========================================
    
    // Text settles
    tl.to(avatarText, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.6)',
      clearProps: 'all',
    });
    
    // Avatar settles
    tl.to(coachAvatar, {
      scaleY: 1,
      scaleX: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.7)',
      clearProps: 'scaleX,scaleY',
    }, '<');
    
    tl.call(() => {
      resolve();
    });
  });
}

// ============================================================================
// CONVENIENCE EXPRESSIONS - Brand-Aligned Helpers
// ============================================================================

/** Warm, genuine happiness */
export function expressHappy(hold: number = 0): void {
  setExpression('happy', DURATION.SLOW, hold);
}

/** Genuine joy with warmth sparkle */
export function expressDelight(): void {
  setExpression('delighted', DURATION.SLOW, DURATION.CELEBRATION);
}

/** Attentive, present surprise */
export function expressSurprise(): void {
  playHeldPose('surprised', DURATION.MODERATE);
}

/** Genuine interest */
export function expressCuriosity(): void {
  setExpression('curious', DURATION.SLOW, DURATION.SLOW);
}

/** Healthy skepticism (direct but caring) */
export function expressSkepticism(): void {
  setExpression('skeptical', DURATION.SLOW, DURATION.MODERATE);
}

/** Genuine concern */
export function expressWorry(): void {
  playNoticing();
}

/** Empathetic presence */
export function expressSadness(): void {
  setExpression('sad', DURATION.MODERATE, 0);
}

/** Winding down */
export function expressSleepy(): void {
  setExpression('sleepy', DURATION.GLACIAL, 0);
}

/** "I hear you" warmth */
export function expressEmpathy(): void {
  setExpression('empathetic', DURATION.SLOW, DURATION.CELEBRATION);
}

/** Grounded excitement (not over-the-top) */
export function expressExcitement(): void {
  playHeldPose('excited', DURATION.MODERATE);
}

/** Deep thought (brand-aligned) */
export function expressContemplation(): void {
  playContemplation();
}

/** Noticing something subtle */
export function expressNoticing(): void {
  playNoticing();
}

/** Holding space for emotions */
export function expressHoldingSpace(): void {
  setExpression('holdingSpace', DURATION.MODERATE, 0);
}

/** Frustrated - healthy expression of frustration (not aggressive) */
export function expressFrustrated(): void {
  // Show worried with slight hold, then return to neutral
  setExpression('worried', DURATION.SLOW, DURATION.CELEBRATION);
}

/** Anxious - nervous energy, subtle expression */
export function expressAnxious(): void {
  // Quick noticing + worried blend effect
  setExpression('worried', DURATION.NORMAL, 0);
}

/** Listening attentively */
export function expressListening(): void {
  setExpression('curious', DURATION.NORMAL, 0);
}

/** Speaking/talking state */
export function expressSpeaking(): void {
  setExpression('neutral', DURATION.FAST, 0);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'ferni-expressions-styles';
  styleElement.textContent = `
    /* The lid overlay box, caps and rim live in inline-styles.css only; a copy here won the cascade. */
    .lid-svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    
    /* Lid colour lives in inline-styles.css only: the page colour, the light "cap" that carries
       the expression (Seth, 2026-10-11). A fill here outranked it in light mode. */
    
    /* Dimples - subtle shadow indents for warm expressions */
    .dimple {
      /* Semi-transparent dark creates shadow/indent effect */
      /* Works across all themes since it darkens the avatar color */
      fill: rgba(0, 0, 0, 0.12);
      transition: opacity 0.3s ease;
      filter: blur(0.5px);
    }
    
    /* Slightly softer dimples in light themes */
    [data-theme="light"] .dimple,
    [data-theme="zen"] .dimple {
      fill: rgba(0, 0, 0, 0.08);
    }
    
    /* Warmth sparkles */
    .warmth-sparkles {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    
    /* Emotion sparkles container */
    .emotion-sparkles-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: var(--z-dropdown);
    }
    
    .emotion-sparkle {
      box-shadow: 
        0 0 4px var(--color-semantic-warning, #b8956a),
        0 0 8px var(--color-semantic-warning, #b8956a);
    }
    
    /* Morph icon container */
    .morph-icon-container {
      z-index: var(--z-docked);
    }
    
    .morph-icon-container svg {
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15));
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .lid-top, .lid-bottom {
        transition: none;
      }
      
      .emotion-sparkle {
        display: none;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function dispose(): void {
  if (expressionTimeline) expressionTimeline.kill();
  if (reactionTimeline) reactionTimeline.kill();
  
  lidOverlay?.remove();
  sparkleContainer?.remove();
  styleElement?.remove();
  currentIconElement?.remove();
  
  lidOverlay = null;
  sparkleContainer = null;
  styleElement = null;
  currentIconElement = null;
  currentExpression = 'neutral';
  currentLidBase = null;
  isInitialized = false;
  log.debug('Ferni expressions disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const ferniExpressions = {
  init: initFerniExpressions,
  dispose,
  
  // Expression system
  setExpression,
  getExpression,
  
  // Character reactions
  realization: playRealization,
  heldPose: playHeldPose,
  contemplation: playContemplation,
  noticing: playNoticing,
  warmthSparkle: triggerWarmthSparkle,
  
  // Text-to-icon morph
  morphTextToIcon,
  morphIconToText,
  
  // Convenience expressions
  happy: expressHappy,
  delight: expressDelight,
  surprise: expressSurprise,
  curious: expressCuriosity,
  skeptical: expressSkepticism,
  worry: expressWorry,
  sad: expressSadness,
  sleepy: expressSleepy,
  empathy: expressEmpathy,
  excited: expressExcitement,
  contemplative: expressContemplation,
  notice: expressNoticing,
  holdSpace: expressHoldingSpace,
  // Additional convenience expressions
  frustrated: expressFrustrated,
  anxious: expressAnxious,
  listening: expressListening,
  speaking: expressSpeaking,
};

// Legacy alias for backward compatibility during migration
export const pixarEmotions = ferniExpressions;

// Export init function with legacy name for backward compatibility
export const initPixarEmotions = initFerniExpressions;

export default ferniExpressions;

