/**
 * Celebration Service
 * 
 * Triggers celebration animations for milestones and achievements.
 * Uses the Web Animations API with Ferni expressions.
 * 
 * BRAND PHILOSOPHY:
 * - Warm celebrations, not flashy
 * - Grounded joy, not over-the-top
 * - Celebrate progress, not perfection
 */

import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CelebrationService');

// ============================================================================
// TYPES
// ============================================================================

export type CelebrationType =
  | 'small-win'      // Daily wins, completed tasks
  | 'big-win'        // Major milestones
  | 'streak'         // Consistency achievements
  | 'sparkle'        // Quick delight
  | 'relationship'   // Stage advancement
  | 'courage'        // Brave moment recognition
  | 'thinking-of-you'; // Proactive reach-out

// ============================================================================
// STATE
// ============================================================================

let avatarElement: HTMLElement | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the celebration service.
 * Call this after the avatar is mounted.
 */
export function initCelebrationService(): void {
  if (isInitialized) return;
  
  avatarElement = document.getElementById('coachAvatar');
  if (!avatarElement) {
    log.warn('Avatar element not found - celebrations will be limited');
  }
  
  isInitialized = true;
  log.info('Celebration service initialized');
}

// ============================================================================
// CELEBRATION TRIGGERS
// ============================================================================

/**
 * Trigger a celebration.
 * Plays the appropriate animation and expression.
 */
export async function celebrate(type: CelebrationType): Promise<void> {
  if (!isInitialized) {
    initCelebrationService();
  }
  
  log.debug('Celebration triggered:', type);
  
  // Get the element to animate (avatar or container)
  const element = avatarElement ?? document.querySelector('.avatar-container') as HTMLElement;
  if (!element) {
    log.warn('No element found for celebration animation');
    return;
  }
  
  switch (type) {
    case 'small-win':
      // Warm happy expression + subtle animation
      ferniExpressions.happy(800);
      await animateSmallWin(element);
      break;
      
    case 'big-win':
      // Excited expression + full celebration
      ferniExpressions.delight();
      ferniExpressions.warmthSparkle();
      await animateBigWin(element);
      break;
      
    case 'streak':
      // Happy expression + streak-specific animation
      ferniExpressions.happy(1000);
      await animateStreak(element);
      break;
      
    case 'sparkle':
      // Quick delight sparkle
      ferniExpressions.warmthSparkle();
      await animateSparkle(element);
      break;
      
    case 'relationship':
      // Deep warmth for relationship milestone
      ferniExpressions.delight();
      ferniExpressions.warmthSparkle();
      await animateRelationship(element);
      break;
      
    case 'courage':
      // Empathetic acknowledgment of bravery
      ferniExpressions.empathy();
      await animateCourage(element);
      ferniExpressions.happy(600);
      break;
      
    case 'thinking-of-you':
      // Warm, present, reaching out
      ferniExpressions.notice();
      await animateThinkingOfYou(element);
      ferniExpressions.empathy();
      break;
  }
  
  // Always return to neutral after celebrations
  setTimeout(() => {
    ferniExpressions.setExpression('neutral', 400);
  }, 1500);
}

// ============================================================================
// ANIMATION IMPLEMENTATIONS
// ============================================================================

async function animateSmallWin(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(61, 122, 82, 0)' },
    { transform: 'scale(0.95)', offset: 0.12 },
    { transform: 'scale(1.08)', boxShadow: '0 0 30px 8px rgba(61, 122, 82, 0.25)', offset: 0.5 },
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(61, 122, 82, 0)' },
  ], {
    duration: DURATION.CELEBRATION,
    easing: EASING.SPRING,
  }).finished;
}

async function animateBigWin(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(196, 162, 101, 0)' },
    { transform: 'scale(0.9)', offset: 0.12 },
    { transform: 'scale(1.15)', boxShadow: '0 0 50px 15px rgba(196, 162, 101, 0.4)', offset: 0.4 },
    { transform: 'scale(0.95)', offset: 0.7 },
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(196, 162, 101, 0)' },
  ], {
    duration: DURATION.CELEBRATION + DURATION.MODERATE,
    easing: EASING.SPRING,
  }).finished;
}

async function animateStreak(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.04)', offset: 0.2 },
    { transform: 'scale(0.98)', offset: 0.4 },
    { transform: 'scale(1.06)', offset: 0.6 },
    { transform: 'scale(0.99)', offset: 0.8 },
    { transform: 'scale(1)' },
  ], {
    duration: DURATION.CELEBRATION + DURATION.NORMAL,
    easing: EASING.GENTLE,
  }).finished;
}

async function animateSparkle(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.03)', filter: 'brightness(1.1)', offset: 0.3 },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], {
    duration: DURATION.DELIBERATE,
    easing: EASING.SPRING,
  }).finished;
}

async function animateRelationship(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(74, 103, 65, 0)' },
    { transform: 'scale(0.95)', offset: 0.1 },
    { transform: 'scale(1.12)', boxShadow: '0 0 40px 12px rgba(74, 103, 65, 0.35)', offset: 0.35 },
    { transform: 'scale(1.02)', offset: 0.65 },
    { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(74, 103, 65, 0)' },
  ], {
    duration: DURATION.CELEBRATION + DURATION.SLOW,
    easing: EASING.SPRING,
  }).finished;
}

async function animateCourage(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(1.02)', offset: 0.3 },
    { transform: 'scale(1.05)', offset: 0.5 },
    { transform: 'scale(1.02)', offset: 0.7 },
    { transform: 'scale(1)' },
  ], {
    duration: DURATION.CELEBRATION,
    easing: EASING.GENTLE,
  }).finished;
}

async function animateThinkingOfYou(element: HTMLElement): Promise<void> {
  await element.animate([
    { transform: 'scale(1)', filter: 'brightness(1)' },
    { transform: 'scale(1.02)', filter: 'brightness(1.05)', offset: 0.4 },
    { transform: 'scale(1.01)', filter: 'brightness(1.02)', offset: 0.7 },
    { transform: 'scale(1)', filter: 'brightness(1)' },
  ], {
    duration: DURATION.DELIBERATE + DURATION.SLOW,
    easing: EASING.GENTLE,
  }).finished;
}

/**
 * Celebrate a small win (shortcut).
 */
export function celebrateSmallWin(): Promise<void> {
  return celebrate('small-win');
}

/**
 * Celebrate a big win (shortcut).
 */
export function celebrateBigWin(): Promise<void> {
  return celebrate('big-win');
}

/**
 * Celebrate a streak milestone (shortcut).
 */
export function celebrateStreak(): Promise<void> {
  return celebrate('streak');
}

/**
 * Quick sparkle celebration (shortcut).
 */
export function sparkle(): Promise<void> {
  return celebrate('sparkle');
}

/**
 * Celebrate relationship stage advancement (shortcut).
 */
export function celebrateRelationship(): Promise<void> {
  return celebrate('relationship');
}

/**
 * Acknowledge a courage moment (shortcut).
 */
export function acknowledgeCourage(): Promise<void> {
  return celebrate('courage');
}

/**
 * "Thinking of you" proactive moment (shortcut).
 */
export function thinkingOfYou(): Promise<void> {
  return celebrate('thinking-of-you');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const celebrationService = {
  init: initCelebrationService,
  celebrate,
  smallWin: celebrateSmallWin,
  bigWin: celebrateBigWin,
  streak: celebrateStreak,
  sparkle,
  relationship: celebrateRelationship,
  courage: acknowledgeCourage,
  thinkingOfYou,
};

export default celebrationService;

