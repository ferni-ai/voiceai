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

const log = createLogger('FerniExpressions');

// GSAP helper
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

let isInitialized = false;
let currentExpression: EmotionalExpression = 'neutral';
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
  lidOverlay.innerHTML = `
    <svg viewBox="0 0 100 100" class="lid-svg" preserveAspectRatio="none">
      <!-- Top lid -->
      <path class="lid-top" d="M 0,0 Q 50,-10 100,0 L 100,0 L 0,0 Z" fill="var(--color-background-primary, #1a1612)"/>
      <!-- Bottom lid (for squinting) -->
      <path class="lid-bottom" d="M 0,100 Q 50,110 100,100 L 100,100 L 0,100 Z" fill="var(--color-background-primary, #1a1612)"/>
      <!-- Left brow accent (for asymmetric expressions) -->
      <ellipse class="brow-left" cx="30" cy="15" rx="20" ry="8" fill="var(--color-background-primary, #1a1612)" opacity="0"/>
      <!-- Right brow accent -->
      <ellipse class="brow-right" cx="70" cy="15" rx="20" ry="8" fill="var(--color-background-primary, #1a1612)" opacity="0"/>
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
  // Auto-initialize if needed
  if (!isInitialized) {
    initFerniExpressions();
  }
  
  if (!lidOverlay || expression === currentExpression) return;
  
  // Cancel any existing expression animation
  if (expressionTimeline) {
    expressionTimeline.kill();
  }
  
  const prevExpression = currentExpression;
  currentExpression = expression;
  
  // Get the lid elements
  const lidTop = lidOverlay.querySelector('.lid-top') as SVGPathElement;
  const lidBottom = lidOverlay.querySelector('.lid-bottom') as SVGPathElement;
  const browLeft = lidOverlay.querySelector('.brow-left') as SVGEllipseElement;
  const browRight = lidOverlay.querySelector('.brow-right') as SVGEllipseElement;
  const sparkles = lidOverlay.querySelector('.warmth-sparkles') as HTMLElement;
  
  if (!lidTop || !lidBottom) return;
  
  // Expression configurations - Brand-aligned emotional range
  const expressions: Record<EmotionalExpression, {
    topPath: string;
    bottomPath: string;
    browLeftOpacity: number;
    browRightOpacity: number;
    browLeftY?: number;
    browRightY?: number;
    sparkle?: boolean;
  }> = {
    neutral: {
      topPath: 'M 0,0 Q 50,-10 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,110 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    happy: {
      // Squinted - lids close in from top and bottom (warm, genuine)
      topPath: 'M 0,0 Q 50,25 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,85 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    delighted: {
      // Happy + warmth sparkle (genuine joy, not over-the-top)
      topPath: 'M 0,0 Q 50,28 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,82 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    surprised: {
      // Wide open - present and attentive
      topPath: 'M 0,0 Q 50,-18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,118 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    curious: {
      // Tilted - genuinely interested, not performative
      topPath: 'M 0,0 Q 50,15 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.3,
      browRightOpacity: 0,
      browLeftY: 12,
    },
    skeptical: {
      // One eyebrow raised - direct but caring
      topPath: 'M 0,0 Q 30,20 60,5 Q 80,-5 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.4,
      browRightOpacity: 0,
      browLeftY: 18,
    },
    worried: {
      // Angled brows - genuine concern
      topPath: 'M 0,0 Q 25,25 50,15 Q 75,25 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.5,
      browRightOpacity: 0.5,
      browLeftY: 20,
      browRightY: 20,
    },
    sad: {
      // Droopy - empathetic presence
      topPath: 'M 0,0 Q 50,35 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.2,
      browRightOpacity: 0.2,
      browLeftY: 25,
      browRightY: 25,
    },
    sleepy: {
      // Heavy lids - winding down
      topPath: 'M 0,0 Q 50,55 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,70 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    thinking: {
      // Slight squint, looking up/away
      topPath: 'M 0,0 Q 50,12 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    empathetic: {
      // Soft, warm - "I hear you"
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    excited: {
      // Wide but GROUNDED - not over-the-top (brand-aligned)
      topPath: 'M 0,0 Q 50,-12 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,112 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    // NEW: Brand-aligned states
    contemplative: {
      // Deep thought - wise, measured (like Jack Bogle)
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,92 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.15,
      browRightOpacity: 0.15,
      browLeftY: 22,
      browRightY: 22,
    },
    noticing: {
      // Picking up on something subtle - perceptive
      topPath: 'M 0,0 Q 50,8 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.2,
      browRightOpacity: 0,
      browLeftY: 10,
    },
    holdingSpace: {
      // Emotional containment - present, grounded
      topPath: 'M 0,0 Q 50,22 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,88 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    
    // =====================================================================
    // PHASE 1: LISTENING STATES - Ferni's superpower
    // =====================================================================
    
    attentive: {
      // Active, engaged listening - user is speaking
      topPath: 'M 0,0 Q 50,5 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,105 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.1,
      browRightOpacity: 0.1,
      browLeftY: 12,
      browRightY: 12,
    },
    absorbing: {
      // Taking in heavy content - deep, slow breathing
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,92 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.15,
      browRightOpacity: 0.15,
      browLeftY: 18,
      browRightY: 18,
    },
    receiving: {
      // Open, accepting vulnerability - soft and safe
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    curiousLean: {
      // Leaning in with interest - one brow raised
      topPath: 'M 0,0 Q 50,10 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,102 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.35,
      browRightOpacity: 0,
      browLeftY: 10,
    },
    
    // =====================================================================
    // PHASE 2: WARMTH GRADIENT - Nuanced positive emotions
    // =====================================================================
    
    warm: {
      // Baseline positive regard - soft, open
      topPath: 'M 0,0 Q 50,12 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    pleased: {
      // Mild satisfaction - subtle smile shape
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    proud: {
      // Pride in user - warm, beaming
      topPath: 'M 0,0 Q 50,22 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,88 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    celebrating: {
      // Full celebration - joyful, bright
      topPath: 'M 0,0 Q 50,26 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,84 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    
    // =====================================================================
    // PHASE 3: PRESENCE STATES - Quality of "being with"
    // =====================================================================
    
    present: {
      // Fully here, grounded - open and steady
      topPath: 'M 0,0 Q 50,10 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,98 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    holding: {
      // Containing emotion - steady, supportive
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    accompanying: {
      // Walking alongside - empathetic presence
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,92 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    waiting: {
      // Patient anticipation - soft, open
      topPath: 'M 0,0 Q 50,15 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    
    // =====================================================================
    // PHASE 4: COACHING EMOTIONS - Active guidance
    // =====================================================================
    
    encouraging: {
      // Gentle support - warm, uplifting
      topPath: 'M 0,0 Q 50,15 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,92 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    challenging: {
      // Loving push - direct but caring
      topPath: 'M 0,0 Q 50,10 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,98 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.2,
      browRightOpacity: 0.2,
      browLeftY: 14,
      browRightY: 14,
    },
    reflecting: {
      // Mirroring back - thoughtful, measured
      topPath: 'M 0,0 Q 50,14 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.1,
      browRightOpacity: 0.1,
      browLeftY: 16,
      browRightY: 16,
    },
    recognizing: {
      // "I see you" moment - warm, knowing
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    
    // =====================================================================
    // PHASE 5: RELATIONAL MOMENTS - Connection depth
    // =====================================================================
    
    remembering: {
      // Callback moment - nostalgic, warm
      topPath: 'M 0,0 Q 50,16 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,94 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.1,
      browRightOpacity: 0,
      browLeftY: 14,
    },
    reconnecting: {
      // "Welcome back" energy - warm, genuine
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,88 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    insider: {
      // Shared history moment - playful, knowing
      topPath: 'M 0,0 Q 50,22 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,86 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.15,
      browRightOpacity: 0,
      browLeftY: 12,
    },
    growing: {
      // Noticing evolution - proud, warm
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,88 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    
    // =====================================================================
    // PHASE 6: TRANSITION STATES - Smooth emotional flow
    // =====================================================================
    
    processing: {
      // Taking it in - slightly closed, contemplative
      topPath: 'M 0,0 Q 50,18 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,94 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.1,
      browRightOpacity: 0.1,
      browLeftY: 16,
      browRightY: 16,
    },
    realizing: {
      // Connecting dots - widening with understanding
      topPath: 'M 0,0 Q 50,-8 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,108 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.2,
      browRightOpacity: 0.2,
      browLeftY: 10,
      browRightY: 10,
    },
    shifting: {
      // Changing gears - neutral transition
      topPath: 'M 0,0 Q 50,8 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    settling: {
      // Coming to rest - soft, peaceful
      topPath: 'M 0,0 Q 50,14 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,96 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    // ========================================
    // FAREWELL STATE - Superhuman goodbye
    // ========================================
    farewell: {
      // Warm goodbye - gentle smile with slight melancholy
      // Soft squint (happy but tender), slight sparkle for warmth
      topPath: 'M 0,0 Q 50,22 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,88 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.1,
      browRightOpacity: 0.1,
      browLeftY: 8,
      browRightY: 8,
      sparkle: true, // Warm farewell sparkle
    },
  };
  
  const config = expressions[expression];
  if (!config) return;
  
  // Create timeline with anticipation
  const tl = gsap.timeline();
  expressionTimeline = tl;
  
  // Anticipation phase - slight opposite movement
  if (prevExpression !== 'neutral' || expression !== 'neutral') {
    tl.to([lidTop, lidBottom], {
      scaleY: 0.95,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, 0);
  }
  
  // Main expression transition
  tl.to(lidTop, {
    attr: { d: config.topPath },
    scaleY: 1,
    duration: toSeconds(duration),
    ease: 'elastic.out(1, 0.7)',
  }, toSeconds(DURATION.MICRO));
  
  tl.to(lidBottom, {
    attr: { d: config.bottomPath },
    scaleY: 1,
    duration: toSeconds(duration),
    ease: 'elastic.out(1, 0.7)',
  }, toSeconds(DURATION.MICRO));
  
  // Brow animations (for asymmetric expressions)
  tl.to(browLeft, {
    opacity: config.browLeftOpacity,
    y: config.browLeftY ?? 15,
    duration: toSeconds(duration * 0.8),
    ease: 'power2.out',
  }, toSeconds(DURATION.MICRO));
  
  tl.to(browRight, {
    opacity: config.browRightOpacity,
    y: config.browRightY ?? 15,
    duration: toSeconds(duration * 0.8),
    ease: 'power2.out',
  }, toSeconds(DURATION.MICRO));
  
  // Warmth sparkle effect for delighted/excited
  if (config.sparkle && sparkles) {
    triggerWarmthSparkle();
  }
  
  // Return to neutral after hold
  if (hold > 0) {
    tl.call(() => {
      setExpression('neutral', DURATION.SLOW);
    }, [], `+=${toSeconds(hold)}`);
  }
  
  log.debug('Expression set:', expression);
}

/**
 * Get current expression.
 */
export function getExpression(): EmotionalExpression {
  return currentExpression;
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
    /* Avatar Lid Overlay - Creates "eyelid" effect */
    .avatar-lid-overlay {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      overflow: hidden;
      pointer-events: none;
      z-index: var(--z-docked);
    }
    
    .lid-svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    
    /* Lid paths - use theme-aware background color */
    .lid-top, .lid-bottom {
      transition: d 0.3s ease;
      /* Match the page background for the "eyelid" effect */
      fill: var(--color-bg-primary, var(--color-background-primary, #1a1612));
    }
    
    /* Light theme support */
    [data-theme="light"] .lid-top,
    [data-theme="light"] .lid-bottom {
      fill: var(--color-bg-primary, #faf6f0);
    }
    
    .brow-left, .brow-right {
      transform-origin: center;
      fill: var(--color-bg-primary, var(--color-background-primary, #1a1612));
    }
    
    [data-theme="light"] .brow-left,
    [data-theme="light"] .brow-right {
      fill: var(--color-bg-primary, #faf6f0);
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

