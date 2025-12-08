/**
 * Pixar Emotions UI - Advanced Character Expressions
 * 
 * Takes Ferni's avatar to the next level with Pixar-quality emotional animation.
 * 
 * NEW CAPABILITIES:
 * =================
 * 1. EYE LID OVERLAY SYSTEM - Creates expressive "eyelid" shapes over the avatar
 *    - Happy: Squinted (gentle arc at top)
 *    - Surprised: Wide open (no lid visible)
 *    - Sleepy: Heavy lids (large curve covering top)
 *    - Skeptical: Asymmetric (one side raised)
 *    - Sad: Soft droop at corners
 *    - Worried: Angled brows
 * 
 * 2. ADVANCED REACTIONS
 *    - Double-take: Classic Pixar surprise (look away → snap back)
 *    - Held poses: Peak emotion holds before settling
 *    - Look-away thinking: Eyes drift when contemplating
 *    - Nervous energy: Micro-trembles and fidgeting
 *    - Delight sparkle: Eyes brighten with particles
 * 
 * 3. DRAMATIC TEXT-TO-ICON MORPH
 *    - Text squashes into a point
 *    - Point explodes outward
 *    - Icon forms from particles
 *    - Much more theatrical than simple fade
 * 
 * PIXAR PRINCIPLES APPLIED:
 * - Squash & Stretch on all transitions
 * - Anticipation before every action
 * - Follow-through and overlapping action
 * - Slow in / Slow out timing
 * - Arcs in motion paths
 * - Secondary action (sparkles, glows)
 * - Exaggeration for emotional impact
 * - Solid staging
 * - Appeal through warmth
 */

import gsap from 'gsap';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PixarEmotions');

// GSAP helper
const toSeconds = (ms: number) => ms / 1000;

// ============================================================================
// TYPES
// ============================================================================

export type EmotionalExpression = 
  | 'neutral'      // Default - no lid
  | 'happy'        // Squinted, warm
  | 'delighted'    // Happy + sparkle
  | 'surprised'    // Wide eyes
  | 'curious'      // Tilted, one brow up
  | 'skeptical'    // One brow raised
  | 'worried'      // Angled brows
  | 'sad'          // Droopy lids
  | 'sleepy'       // Heavy lids
  | 'thinking'     // Look away
  | 'empathetic'   // Soft, understanding
  | 'excited';     // Wide + sparkle

export type AdvancedReaction =
  | 'doubleTake'   // Look away → snap back
  | 'heldPose'     // Hold at peak
  | 'lookAway'     // Thinking drift
  | 'nervousEnergy'// Fidget
  | 'delightSparkle' // Eyes brighten
  | 'contemplation'; // Deep thought

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

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the Pixar emotions system.
 * Creates the eye lid overlay and sparkle container.
 */
export function initPixarEmotions(): void {
  if (isInitialized) return;
  
  injectStyles();
  createLidOverlay();
  createSparkleContainer();
  
  isInitialized = true;
  log.info('Pixar emotions system initialized');
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
    <!-- Sparkle overlay for delight -->
    <div class="delight-sparkles"></div>
  `;
  
  // Insert into avatar
  coachAvatar.appendChild(lidOverlay);
  log.debug('Lid overlay created');
}

/**
 * Create sparkle container for delight effects.
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
 * Uses the lid overlay to create Pixar-quality expressions.
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
  const sparkles = lidOverlay.querySelector('.delight-sparkles') as HTMLElement;
  
  if (!lidTop || !lidBottom) return;
  
  // Expression configurations
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
      // Squinted - lids close in from top and bottom
      topPath: 'M 0,0 Q 50,25 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,85 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    delighted: {
      topPath: 'M 0,0 Q 50,30 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,80 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
    surprised: {
      // Wide open - lids pull back
      topPath: 'M 0,0 Q 50,-20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,120 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    curious: {
      // Tilted - one side more closed
      topPath: 'M 0,0 Q 50,15 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.3,
      browRightOpacity: 0,
      browLeftY: 12,
    },
    skeptical: {
      // One eyebrow raised
      topPath: 'M 0,0 Q 30,20 60,5 Q 80,-5 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.4,
      browRightOpacity: 0,
      browLeftY: 18,
    },
    worried: {
      // Angled brows - concern
      topPath: 'M 0,0 Q 25,25 50,15 Q 75,25 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,95 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.5,
      browRightOpacity: 0.5,
      browLeftY: 20,
      browRightY: 20,
    },
    sad: {
      // Droopy - soft curves
      topPath: 'M 0,0 Q 50,35 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,100 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0.2,
      browRightOpacity: 0.2,
      browLeftY: 25,
      browRightY: 25,
    },
    sleepy: {
      // Heavy lids - nearly closed
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
      // Soft, warm - gentle close
      topPath: 'M 0,0 Q 50,20 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,90 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
    },
    excited: {
      // Wide with sparkle
      topPath: 'M 0,0 Q 50,-15 100,0 L 100,0 L 0,0 Z',
      bottomPath: 'M 0,100 Q 50,115 100,100 L 100,100 L 0,100 Z',
      browLeftOpacity: 0,
      browRightOpacity: 0,
      sparkle: true,
    },
  };
  
  const config = expressions[expression];
  if (!config) return;
  
  // Create timeline with Pixar-style anticipation
  expressionTimeline = gsap.timeline();
  
  // Anticipation phase - slight opposite movement
  if (prevExpression !== 'neutral' || expression !== 'neutral') {
    expressionTimeline.to([lidTop, lidBottom], {
      scaleY: 0.95,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, 0);
  }
  
  // Main expression transition
  expressionTimeline.to(lidTop, {
    attr: { d: config.topPath },
    scaleY: 1,
    duration: toSeconds(duration),
    ease: 'elastic.out(1, 0.7)',
  }, toSeconds(DURATION.MICRO));
  
  expressionTimeline.to(lidBottom, {
    attr: { d: config.bottomPath },
    scaleY: 1,
    duration: toSeconds(duration),
    ease: 'elastic.out(1, 0.7)',
  }, toSeconds(DURATION.MICRO));
  
  // Brow animations (for asymmetric expressions)
  expressionTimeline.to(browLeft, {
    opacity: config.browLeftOpacity,
    y: config.browLeftY ?? 15,
    duration: toSeconds(duration * 0.8),
    ease: 'power2.out',
  }, toSeconds(DURATION.MICRO));
  
  expressionTimeline.to(browRight, {
    opacity: config.browRightOpacity,
    y: config.browRightY ?? 15,
    duration: toSeconds(duration * 0.8),
    ease: 'power2.out',
  }, toSeconds(DURATION.MICRO));
  
  // Sparkle effect for delighted/excited
  if (config.sparkle && sparkles) {
    triggerDelightSparkle();
  }
  
  // Return to neutral after hold
  if (hold > 0) {
    expressionTimeline.call(() => {
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
// ADVANCED REACTIONS - Pixar-Quality Character Moments
// ============================================================================

/**
 * Play a double-take reaction.
 * Classic Pixar: Character looks away, pauses, then SNAPS back with wide eyes.
 * Used when the AI hears something surprising.
 */
export function playDoubleTake(): void {
  const coachAvatar = document.getElementById('coachAvatar');
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!coachAvatar || !avatarContainer) return;
  
  // Cancel any existing reaction
  if (reactionTimeline) reactionTimeline.kill();
  
  reactionTimeline = gsap.timeline();
  
  // Phase 1: Quick look away (like "wait, what?")
  reactionTimeline
    .to(avatarContainer, {
      rotation: -8,
      x: -5,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    })
    // Phase 2: Brief pause (processing)
    .to(avatarContainer, {
      rotation: -8,
      duration: toSeconds(DURATION.NORMAL),
    })
    // Phase 3: SNAP back with wide eyes
    .call(() => setExpression('surprised', DURATION.FAST), [], '<+=50%')
    .to(avatarContainer, {
      rotation: 0,
      x: 0,
      scale: 1.05,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(2)',
    })
    // Phase 4: Hold with wide eyes (the "moment")
    .to(avatarContainer, {
      scale: 1.05,
      duration: toSeconds(DURATION.SLOW),
    })
    // Phase 5: Settle back
    .to(avatarContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.5)',
    })
    .call(() => setExpression('curious', DURATION.SLOW, DURATION.CELEBRATION), []);
  
  log.debug('Double-take reaction played');
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
  
  reactionTimeline = gsap.timeline();
  
  // Anticipation squash
  reactionTimeline
    .to(avatarContainer, {
      scaleY: 0.92,
      scaleX: 1.05,
      y: 3,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.in',
    })
    // Launch to peak with stretch
    .to(avatarContainer, {
      scaleY: 1.08,
      scaleX: 0.95,
      y: -8,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    })
    .call(() => setExpression(peakExpression, DURATION.FAST), [], '<')
    // HOLD at peak - this is the Pixar magic
    .to(avatarContainer, {
      scaleY: 1.06,
      scaleX: 0.96,
      y: -7,
      duration: toSeconds(holdDuration),
      ease: 'power1.inOut',
    })
    // Settle back with overshoot
    .to(avatarContainer, {
      scaleY: 0.98,
      scaleX: 1.01,
      y: 2,
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
 * Play look-away thinking.
 * Eyes drift up and to the side when contemplating.
 * Like a person thinking "Hmm, let me consider that..."
 */
export function playLookAwayThinking(duration: number = 2000): void {
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!avatarContainer) return;
  
  if (reactionTimeline) reactionTimeline.kill();
  
  // Set thinking expression
  setExpression('thinking', DURATION.NORMAL);
  
  reactionTimeline = gsap.timeline();
  
  // Drift up and to the right (thinking pose)
  reactionTimeline
    .to(avatarContainer, {
      rotation: 5,
      x: 3,
      y: -2,
      duration: toSeconds(DURATION.MODERATE),
      ease: 'power2.out',
    })
    // Subtle wander while thinking
    .to(avatarContainer, {
      rotation: 3,
      x: 5,
      duration: toSeconds(duration * 0.4),
      ease: 'sine.inOut',
    })
    .to(avatarContainer, {
      rotation: 7,
      x: 2,
      duration: toSeconds(duration * 0.3),
      ease: 'sine.inOut',
    })
    // Return with "aha!" moment
    .to(avatarContainer, {
      rotation: 0,
      x: 0,
      y: 0,
      scale: 1.03,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(1.5)',
    })
    .call(() => setExpression('happy', DURATION.FAST, DURATION.SLOW), [])
    .to(avatarContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.7)',
    });
  
  log.debug('Look-away thinking played');
}

/**
 * Play nervous energy.
 * Subtle micro-trembles and fidgeting.
 * Used when the AI senses user anxiety.
 */
export function playNervousEnergy(duration: number = 1500): void {
  const avatarContainer = document.querySelector('.avatar-container') as HTMLElement;
  if (!avatarContainer) return;
  
  if (reactionTimeline) reactionTimeline.kill();
  
  setExpression('worried', DURATION.FAST);
  
  reactionTimeline = gsap.timeline();
  
  // Rapid small trembles
  const trembleCount = Math.floor(duration / 100);
  for (let i = 0; i < trembleCount; i++) {
    const offsetX = (Math.random() - 0.5) * 2;
    const offsetY = (Math.random() - 0.5) * 1.5;
    reactionTimeline.to(avatarContainer, {
      x: offsetX,
      y: offsetY,
      duration: 0.05,
      ease: 'none',
    });
  }
  
  // Settle back
  reactionTimeline
    .to(avatarContainer, {
      x: 0,
      y: 0,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'power2.out',
    })
    .call(() => setExpression('neutral', DURATION.SLOW), []);
  
  log.debug('Nervous energy played');
}

/**
 * Trigger delight sparkle effect.
 * Eyes brighten with particle sparkles.
 */
export function triggerDelightSparkle(): void {
  if (!sparkleContainer) return;
  
  // Clear existing sparkles
  sparkleContainer.innerHTML = '';
  
  // Create sparkle particles
  const sparkleCount = 8;
  for (let i = 0; i < sparkleCount; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'emotion-sparkle';
    
    // Random position around avatar
    const angle = (i / sparkleCount) * Math.PI * 2;
    const distance = 40 + Math.random() * 20;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const size = 4 + Math.random() * 4;
    const delay = i * 0.05;
    
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
    
    // Animate sparkle
    gsap.timeline()
      .to(sparkle, {
        x,
        y,
        opacity: 1,
        scale: 1.5,
        duration: toSeconds(DURATION.FAST),
        delay,
        ease: 'back.out(2)',
      })
      .to(sparkle, {
        opacity: 0,
        scale: 0.5,
        duration: toSeconds(DURATION.NORMAL),
        ease: 'power2.in',
        onComplete: () => sparkle.remove(),
      });
  }
  
  log.debug('Delight sparkle triggered');
}

// ============================================================================
// DRAMATIC TEXT-TO-ICON MORPH
// ============================================================================

/**
 * Perform a dramatic Pixar-style morph from text to icon.
 * Much more theatrical than a simple fade:
 * 
 * 1. Text squashes down into a point
 * 2. Point explodes outward
 * 3. Icon forms from the explosion
 * 4. Icon settles with spring physics
 * 
 * @param iconSvg - The SVG string for the icon
 * @param duration - Total duration
 * @returns Promise that resolves when morph is complete
 */
export async function morphTextToIcon(iconSvg: string, duration: number = 800): Promise<HTMLElement | null> {
  const avatarText = document.getElementById('avatarText');
  const coachAvatar = document.getElementById('coachAvatar');
  
  if (!avatarText || !coachAvatar) return null;
  
  return new Promise((resolve) => {
    const tl = gsap.timeline();
    
    // Store original state
    const originalText = avatarText.textContent;
    
    // Create icon element (hidden initially)
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
      color: var(--persona-primary, #4a6741);
    `;
    const svg = iconContainer.querySelector('svg');
    if (svg) {
      svg.style.width = '100%';
      svg.style.height = '100%';
    }
    avatarText.parentElement?.appendChild(iconContainer);
    
    // Phase 1: Text squash with anticipation
    tl.to(coachAvatar, {
      scaleY: 0.95,
      scaleX: 1.03,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, 0);
    
    tl.to(avatarText, {
      scale: 0.5,
      opacity: 0.5,
      y: 3,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.in',
    }, 0);
    
    // Phase 2: Text collapses to point
    tl.to(avatarText, {
      scale: 0,
      opacity: 0,
      duration: toSeconds(DURATION.FAST),
      ease: 'power4.in',
    });
    
    // Phase 3: Avatar bounce + icon explosion
    tl.to(coachAvatar, {
      scaleY: 1.06,
      scaleX: 0.96,
      duration: toSeconds(DURATION.FAST),
      ease: 'power2.out',
    }, `-=${toSeconds(DURATION.MICRO)}`);
    
    tl.to(iconContainer, {
      scale: 1.3,
      opacity: 1,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(3)',
    }, `-=${toSeconds(DURATION.MICRO)}`);
    
    // Phase 4: Icon settles with spring
    tl.to(iconContainer, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.5)',
    });
    
    tl.to(coachAvatar, {
      scaleY: 1,
      scaleX: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.6)',
    }, '<');
    
    tl.call(() => {
      // Hide original text, keep icon visible
      avatarText.style.opacity = '0';
      avatarText.style.transform = 'scale(0)';
      resolve(iconContainer);
    });
  });
}

/**
 * Morph icon back to text.
 * Reverse of morphTextToIcon with Pixar flair.
 * 
 * @param iconElement - The icon element to morph away
 */
export async function morphIconToText(iconElement: HTMLElement | null): Promise<void> {
  const avatarText = document.getElementById('avatarText');
  const coachAvatar = document.getElementById('coachAvatar');
  
  if (!avatarText || !coachAvatar) return;
  
  return new Promise((resolve) => {
    const tl = gsap.timeline();
    
    // Phase 1: Icon anticipation squash
    if (iconElement) {
      tl.to(iconElement, {
        scale: 1.2,
        duration: toSeconds(DURATION.MICRO),
        ease: 'power2.in',
      }, 0);
      
      // Phase 2: Icon shrinks to point
      tl.to(iconElement, {
        scale: 0,
        opacity: 0,
        y: -5,
        duration: toSeconds(DURATION.FAST),
        ease: 'power4.in',
      });
    }
    
    // Phase 3: Avatar squash before text return
    tl.to(coachAvatar, {
      scaleY: 0.96,
      scaleX: 1.02,
      duration: toSeconds(DURATION.MICRO),
      ease: 'power2.in',
    }, iconElement ? `-=${toSeconds(DURATION.MICRO)}` : 0);
    
    // Phase 4: Text explodes back with spring
    tl.to(avatarText, {
      scale: 1.15,
      opacity: 1,
      y: 0,
      duration: toSeconds(DURATION.FAST),
      ease: 'back.out(2)',
    });
    
    // Phase 5: Everything settles
    tl.to(avatarText, {
      scale: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.6)',
      clearProps: 'all',
    });
    
    tl.to(coachAvatar, {
      scaleY: 1,
      scaleX: 1,
      duration: toSeconds(DURATION.NORMAL),
      ease: 'elastic.out(1, 0.6)',
      clearProps: 'scaleX,scaleY',
    }, '<');
    
    tl.call(() => {
      // Clean up icon element
      iconElement?.remove();
      resolve();
    });
  });
}

// ============================================================================
// CONVENIENCE EXPRESSIONS
// ============================================================================

/** Quick happy squint */
export function expressHappy(hold: number = 0): void {
  setExpression('happy', DURATION.SLOW, hold);
}

/** Delighted with sparkles */
export function expressDelight(): void {
  setExpression('delighted', DURATION.SLOW, DURATION.CELEBRATION);
}

/** Surprised wide eyes */
export function expressSurprise(): void {
  playHeldPose('surprised', DURATION.MODERATE);
}

/** Curious head tilt */
export function expressCuriosity(): void {
  setExpression('curious', DURATION.SLOW, DURATION.SLOW);
}

/** Skeptical one-brow raise */
export function expressSkepticism(): void {
  setExpression('skeptical', DURATION.SLOW, DURATION.MODERATE);
}

/** Worried concern */
export function expressWorry(): void {
  playNervousEnergy();
}

/** Sad droop */
export function expressSadness(): void {
  setExpression('sad', DURATION.MODERATE, 0);
}

/** Sleepy heavy lids */
export function expressSleepy(): void {
  setExpression('sleepy', DURATION.GLACIAL, 0);
}

/** Empathetic understanding */
export function expressEmpathy(): void {
  setExpression('empathetic', DURATION.SLOW, DURATION.CELEBRATION);
}

/** Excited wide eyes with sparkle */
export function expressExcitement(): void {
  playHeldPose('excited', DURATION.MODERATE);
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (styleElement) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'pixar-emotions-styles';
  styleElement.textContent = `
    /* Avatar Lid Overlay */
    .avatar-lid-overlay {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      overflow: hidden;
      pointer-events: none;
      z-index: 10;
    }
    
    .lid-svg {
      width: 100%;
      height: 100%;
    }
    
    .lid-top, .lid-bottom {
      transition: d 0.3s ease;
    }
    
    .brow-left, .brow-right {
      transform-origin: center;
    }
    
    /* Delight sparkles */
    .delight-sparkles {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    
    /* Emotion sparkles container */
    .emotion-sparkles-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 15;
    }
    
    .emotion-sparkle {
      box-shadow: 
        0 0 4px var(--color-semantic-warning, #b8956a),
        0 0 8px var(--color-semantic-warning, #b8956a);
    }
    
    /* Morph icon container */
    .morph-icon-container {
      z-index: 5;
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
  
  lidOverlay = null;
  sparkleContainer = null;
  styleElement = null;
  currentExpression = 'neutral';
  isInitialized = false;
  
  log.debug('Pixar emotions disposed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const pixarEmotions = {
  init: initPixarEmotions,
  dispose,
  
  // Expression system
  setExpression,
  getExpression,
  
  // Advanced reactions
  doubleTake: playDoubleTake,
  heldPose: playHeldPose,
  lookAwayThinking: playLookAwayThinking,
  nervousEnergy: playNervousEnergy,
  delightSparkle: triggerDelightSparkle,
  
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
};

export default pixarEmotions;

