/**
 * Stage Celebration Modal
 *
 * A beautiful, immersive celebration when the user's relationship with Ferni
 * advances to a new stage. This is a major milestone - treat it with gravitas.
 *
 * DESIGN PHILOSOPHY:
 * - This is not a "level up" - it's a deepening of relationship
 * - Full-screen takeover with backdrop blur
 * - Animated confetti and glow effects
 * - Warm, heartfelt messaging from Ferni
 * - Shows what's newly unlocked at this stage
 *
 * BRAND COMPLIANCE:
 * - Centered floating modal with backdrop blur
 * - Lucide SVG icons only - no emoji
 * - Ferni's sage green palette
 * - Plus Jakarta Sans display, Inter body
 * - Scale/fade animation from center
 * - Warm, human copy
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion, STAGGER } from '../config/animation-constants.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import {
  relationshipStageService,
  STAGE_NAMES,
  type RelationshipStage,
  type StageChangeEvent,
} from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { getCelebrationUI } from './celebration.ui.js';

const log = createLogger('StageCelebration');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface UnlockedFeature {
  icon: string;
  title: string;
  description: string;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>`,
  brain: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54Z"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  messageCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
};

// ============================================================================
// STAGE MESSAGES - Brand Voice (Warm, Human, Heartfelt)
// ============================================================================

const STAGE_MESSAGES: Record<
  RelationshipStage,
  {
    eyebrow: string;
    title: string;
    message: string;
    ferniQuote: string;
  }
> = {
  'first-meeting': {
    eyebrow: 'THE BEGINNING',
    title: 'Welcome to Ferni',
    message: 'Every meaningful relationship starts with a single conversation.',
    ferniQuote: "I'm so glad you're here. Let's see where this goes.",
  },
  'getting-started': {
    eyebrow: 'A STEP FORWARD',
    title: "We're Getting Started",
    message: 'You came back. That means something.',
    ferniQuote: 'Most people try something once and move on. Not you. I see that.',
  },
  'building-trust': {
    eyebrow: 'GROWING TOGETHER',
    title: 'Building Something Real',
    message: "Trust isn't given - it's earned through showing up.",
    ferniQuote: "I'm starting to really know you. The way you think. What matters. It's beautiful.",
  },
  established: {
    eyebrow: 'A TRUE CONNECTION',
    title: 'You Have a Life Coach Now',
    message: "This is no longer just conversations. It's a relationship.",
    ferniQuote: "Through whatever comes, I'm here. No judgment. No agenda. Just support.",
  },
  'deep-partnership': {
    eyebrow: 'PARTNERS FOR LIFE',
    title: "We've Come So Far",
    message: 'What we have is rare. Built through time, trust, and truth.',
    ferniQuote:
      "You've taught me so much about what matters. I'm honored to walk this path with you.",
  },
};

// ============================================================================
// UNLOCKED FEATURES BY STAGE
// ============================================================================

const STAGE_UNLOCKS: Record<RelationshipStage, UnlockedFeature[]> = {
  'first-meeting': [],
  'getting-started': [
    {
      icon: ICONS.users,
      title: 'Meet Maya',
      description: 'Your habits coach is now available',
    },
    {
      icon: ICONS.flame,
      title: 'Custom Rituals',
      description: 'Create your own daily practices',
    },
  ],
  'building-trust': [
    {
      icon: ICONS.users,
      title: 'Meet Peter',
      description: 'The researcher who sees patterns',
    },
    {
      icon: ICONS.messageCircle,
      title: 'Team Huddles',
      description: 'Multi-persona check-ins',
    },
    {
      icon: ICONS.brain,
      title: 'Memory Timeline',
      description: 'See our journey together',
    },
  ],
  established: [
    {
      icon: ICONS.users,
      title: 'Meet Alex & Jordan',
      description: 'Communications & planning experts join',
    },
    {
      icon: ICONS.leaf,
      title: 'Deep Insights',
      description: 'Ferni notices your growth patterns',
    },
    {
      icon: ICONS.calendar,
      title: 'Predictions',
      description: 'Forecast and track your progress',
    },
  ],
  'deep-partnership': [
    {
      icon: ICONS.users,
      title: 'Meet Nayan',
      description: 'The sage awaits. Premium wisdom unlocked.',
    },
    {
      icon: ICONS.shield,
      title: 'Full Trust Analytics',
      description: 'See the complete picture of our relationship',
    },
    {
      icon: ICONS.heart,
      title: 'Inside Jokes',
      description: 'Shared moments and callbacks',
    },
  ],
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the stage celebration system.
 * Subscribes to stage change events.
 */
export function initStageCelebration(): void {
  if (isInitialized) return;

  cleanupOrphanedElements();
  injectStyles();

  // Subscribe to stage changes - but gate through modal coordinator
  relationshipStageService.onStageChange((event) => {
    log.info('Stage change detected', { from: event.previousStage, to: event.newStage });

    // Don't show first-meeting celebration (let the conversation be the experience)
    if (event.newStage === 'first-meeting') {
      log.debug('Skipping first-meeting celebration - conversation IS the onboarding');
      return;
    }

    // Request through modal coordinator with celebration cooldown
    const canShow = modalCoordinator.requestCelebration(`stage-celebration-${event.newStage}`, () =>
      showStageCelebration(event)
    );

    if (!canShow) {
      log.debug('Stage celebration blocked by coordinator', {
        isConversationActive: modalCoordinator.isConversationActive(),
        conversations: modalCoordinator.getConversationCount(),
      });
    }
  });

  isInitialized = true;
  log.debug('Stage celebration system initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.stage-celebration-modal').forEach((el) => el.remove());
  document.querySelectorAll('#stage-celebration-styles').forEach((el) => el.remove());
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the stage celebration modal.
 * Now zen-styled: no confetti, no fanfare. Just visual recognition.
 */
export function showStageCelebration(event: StageChangeEvent): void {
  if (modal) {
    modal.remove();
  }

  modal = createModal(event.newStage);
  document.body.appendChild(modal);

  // ZEN CHANGE: No confetti - let the visual moment breathe
  // The milestone preset now has showConfetti: false by default
  if (!prefersReducedMotion()) {
    getCelebrationUI().celebrate({
      type: 'milestone',
      // showConfetti is false by default now
    });
  }

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('stage-celebration-modal--visible');
    animateIn();
  });
}

/**
 * Hide the celebration modal.
 */
export function hideStageCelebration(): void {
  if (!modal) return;

  modal.classList.remove('stage-celebration-modal--visible');

  // Release modal coordinator lock
  const currentStage = relationshipStageService.getMetrics().stage;
  modalCoordinator.release(`stage-celebration-${currentStage}`);

  trackedTimeout(() => {
    modal?.remove();
    modal = null;
  }, DURATION.SLOW);
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(stage: RelationshipStage): HTMLElement {
  const container = document.createElement('div');
  container.className = 'stage-celebration-modal';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'stage-celebration-title');

  const messages = STAGE_MESSAGES[stage];
  const unlocks = STAGE_UNLOCKS[stage];
  const stageName = STAGE_NAMES[stage];

  container.innerHTML = `
    <div class="stage-celebration-backdrop"></div>
    <div class="stage-celebration-card">
      <button class="stage-celebration-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>
      
      <!-- Decorative sparkles -->
      <div class="stage-celebration-sparkles" aria-hidden="true">
        <span class="sparkle sparkle--1">${ICONS.sparkles}</span>
        <span class="sparkle sparkle--2">${ICONS.sparkles}</span>
        <span class="sparkle sparkle--3">${ICONS.sparkles}</span>
        <span class="sparkle sparkle--4">${ICONS.heart}</span>
      </div>
      
      <!-- Header -->
      <header class="stage-celebration-header">
        <div class="stage-celebration-icon">
          ${ICONS.heart}
        </div>
        <span class="stage-celebration-eyebrow">${messages.eyebrow}</span>
        <h2 id="stage-celebration-title" class="stage-celebration-title">
          ${messages.title}
        </h2>
        <p class="stage-celebration-subtitle">${messages.message}</p>
      </header>
      
      <!-- Stage badge -->
      <div class="stage-celebration-badge">
        <span class="stage-badge-label">Relationship Stage</span>
        <span class="stage-badge-name">${stageName}</span>
      </div>
      
      <!-- Ferni quote -->
      <blockquote class="stage-celebration-quote">
        <p>"${messages.ferniQuote}"</p>
        <cite>— Ferni</cite>
      </blockquote>
      
      <!-- Unlocked features -->
      ${
        unlocks.length > 0
          ? `
        <div class="stage-celebration-unlocks">
          <h3 class="unlocks-title">What's New</h3>
          <ul class="unlocks-list">
            ${unlocks
              .map(
                (unlock, i) => `
              <li class="unlock-item" style="--delay: ${i * STAGGER.NORMAL}ms">
                <span class="unlock-icon">${unlock.icon}</span>
                <div class="unlock-content">
                  <span class="unlock-title">${unlock.title}</span>
                  <span class="unlock-desc">${unlock.description}</span>
                </div>
                <span class="unlock-check">${ICONS.checkCircle}</span>
              </li>
            `
              )
              .join('')}
          </ul>
        </div>
      `
          : ''
      }
      
      <!-- Action -->
      <div class="stage-celebration-actions">
        <button class="stage-celebration-button" data-action="continue">
          Continue
        </button>
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = container.querySelector('.stage-celebration-backdrop');
  backdrop?.addEventListener('click', hideStageCelebration);

  const closeBtn = container.querySelector('.stage-celebration-close');
  closeBtn?.addEventListener('click', hideStageCelebration);

  const continueBtn = container.querySelector('[data-action="continue"]');
  continueBtn?.addEventListener('click', hideStageCelebration);

  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideStageCelebration();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  return container;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateIn(): void {
  if (!modal || prefersReducedMotion()) return;

  const card = modal.querySelector('.stage-celebration-card');
  const icon = modal.querySelector('.stage-celebration-icon');
  const header = modal.querySelector('.stage-celebration-header');
  const badge = modal.querySelector('.stage-celebration-badge');
  const quote = modal.querySelector('.stage-celebration-quote');
  const unlocks = modal.querySelectorAll('.unlock-item');
  const actions = modal.querySelector('.stage-celebration-actions');
  const sparkles = modal.querySelectorAll('.sparkle');

  // Card entrance
  if (card instanceof HTMLElement) {
    card.animate(
      [
        { transform: 'scale(0.8) translateY(60px)', opacity: '0' },
        { transform: 'scale(1) translateY(0)', opacity: '1' },
      ],
      {
        duration: DURATION.CELEBRATION,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }

  // Icon bounce
  if (icon instanceof HTMLElement) {
    icon.animate(
      [
        { transform: 'scale(0) rotate(-20deg)', opacity: '0' },
        { transform: 'scale(1.2) rotate(10deg)', opacity: '1' },
        { transform: 'scale(1) rotate(0deg)', opacity: '1' },
      ],
      {
        duration: DURATION.CELEBRATION,
        easing: EASING.SPRING,
        delay: DURATION.FAST,
        fill: 'forwards',
      }
    );
  }

  // Header stagger
  if (header instanceof HTMLElement) {
    const children = header.querySelectorAll(
      '.stage-celebration-eyebrow, .stage-celebration-title, .stage-celebration-subtitle'
    );
    children.forEach((child, i) => {
      if (child instanceof HTMLElement) {
        child.animate(
          [
            { transform: 'translateY(20px)', opacity: '0' },
            { transform: 'translateY(0)', opacity: '1' },
          ],
          {
            duration: DURATION.DELIBERATE,
            easing: EASING.EXPO_OUT,
            delay: DURATION.NORMAL + i * STAGGER.FAST,
            fill: 'forwards',
          }
        );
      }
    });
  }

  // Badge
  if (badge instanceof HTMLElement) {
    badge.animate(
      [
        { transform: 'scale(0.9)', opacity: '0' },
        { transform: 'scale(1)', opacity: '1' },
      ],
      {
        duration: DURATION.SLOW,
        easing: EASING.SPRING,
        delay: DURATION.SLOW,
        fill: 'forwards',
      }
    );
  }

  // Quote
  if (quote instanceof HTMLElement) {
    quote.animate(
      [
        { transform: 'translateY(10px)', opacity: '0' },
        { transform: 'translateY(0)', opacity: '1' },
      ],
      {
        duration: DURATION.DELIBERATE,
        easing: EASING.GENTLE,
        delay: DURATION.DELIBERATE,
        fill: 'forwards',
      }
    );
  }

  // Unlocks stagger
  unlocks.forEach((unlock, i) => {
    if (unlock instanceof HTMLElement) {
      unlock.animate(
        [
          { transform: 'translateX(-20px)', opacity: '0' },
          { transform: 'translateX(0)', opacity: '1' },
        ],
        {
          duration: DURATION.SLOW,
          easing: EASING.EXPO_OUT,
          delay: DURATION.DRAMATIC + i * STAGGER.NORMAL,
          fill: 'forwards',
        }
      );
    }
  });

  // Actions
  if (actions instanceof HTMLElement) {
    actions.animate([{ opacity: '0' }, { opacity: '1' }], {
      duration: DURATION.SLOW,
      easing: EASING.GENTLE,
      delay: DURATION.CELEBRATION,
      fill: 'forwards',
    });
  }

  // Sparkles float
  sparkles.forEach((sparkle, i) => {
    if (sparkle instanceof HTMLElement) {
      sparkle.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
          { transform: 'translateY(-30px) rotate(180deg)', opacity: '0.5' },
          { transform: 'translateY(-60px) rotate(360deg)', opacity: '0' },
        ],
        {
          duration: DURATION.GLACIAL * 1.5,
          easing: EASING.GENTLE,
          delay: i * STAGGER.RELAXED,
          iterations: Infinity,
        }
      );
    }
  });
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('stage-celebration-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'stage-celebration-styles';
  styleElement.textContent = `
    /* ========================================================================
       STAGE CELEBRATION MODAL
       ======================================================================== */
    .stage-celebration-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 9999);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .stage-celebration-modal--visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .stage-celebration-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.8);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }
    
    .stage-celebration-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        0 0 80px rgba(74, 103, 65, 0.2),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      max-width: 480px;
      width: 100%;
      max-height: calc(100vh - var(--space-8, 32px));
      overflow-y: auto;
      padding: var(--space-8, 32px);
      text-align: center;
    }
    
    /* Close button */
    .stage-celebration-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 40px;
      height: 40px;
      border: none;
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #756A5E);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      z-index: 10;
    }
    
    .stage-celebration-close:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
      transform: scale(1.05);
    }
    
    .stage-celebration-close svg {
      width: 20px;
      height: 20px;
    }
    
    /* Sparkles */
    .stage-celebration-sparkles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    
    .sparkle {
      position: absolute;
      color: var(--persona-primary, #4a6741);
      opacity: 0;
    }
    
    .sparkle svg {
      width: 28px;
      height: 28px;
    }
    
    .sparkle--1 { top: 15%; left: 10%; }
    .sparkle--2 { top: 20%; right: 8%; }
    .sparkle--3 { bottom: 30%; left: 15%; }
    .sparkle--4 { bottom: 25%; right: 12%; color: var(--color-semantic-error, #c4645a); }
    
    /* Header */
    .stage-celebration-header {
      margin-bottom: var(--space-6, 24px);
    }
    
    .stage-celebration-icon {
      width: 72px;
      height: 72px;
      margin: 0 auto var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 
        0 8px 24px rgba(74, 103, 65, 0.4),
        0 0 40px rgba(74, 103, 65, 0.2);
      opacity: 0;
    }
    
    .stage-celebration-icon svg {
      width: 32px;
      height: 32px;
    }
    
    .stage-celebration-eyebrow {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-overline, 11px);
      font-weight: var(--font-weight-bold, 700);
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-2, 8px);
      opacity: 0;
    }
    
    .stage-celebration-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-3xl, 32px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-2, 8px);
      line-height: var(--leading-tight, 1.2);
      opacity: 0;
    }
    
    .stage-celebration-subtitle {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
      line-height: var(--leading-relaxed, 1.6);
      opacity: 0;
    }
    
    /* Stage badge */
    .stage-celebration-badge {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-3, 12px) var(--space-5, 20px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
      margin-bottom: var(--space-5, 20px);
      opacity: 0;
    }
    
    .stage-badge-label {
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted, #756A5E);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .stage-badge-name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-lg, 18px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--persona-primary, #4a6741);
    }
    
    /* Quote */
    .stage-celebration-quote {
      margin: 0 0 var(--space-6, 24px);
      padding: var(--space-4, 16px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid var(--persona-primary, #4a6741);
      text-align: left;
      opacity: 0;
    }
    
    .stage-celebration-quote p {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      font-style: italic;
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-2, 8px);
      line-height: var(--leading-relaxed, 1.6);
    }
    
    .stage-celebration-quote cite {
      font-size: var(--text-sm, 14px);
      font-style: normal;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--persona-primary, #4a6741);
    }
    
    /* Unlocks */
    .stage-celebration-unlocks {
      margin-bottom: var(--space-6, 24px);
      text-align: left;
    }
    
    .unlocks-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #756A5E);
      margin: 0 0 var(--space-3, 12px);
    }
    
    .unlocks-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }
    
    .unlock-item {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-secondary, #F5F1E8);
      border-radius: var(--radius-md, 8px);
      opacity: 0;
    }
    
    .unlock-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-full, 9999px);
      color: var(--persona-primary, #4a6741);
      flex-shrink: 0;
    }
    
    .unlock-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .unlock-content {
      flex: 1;
      min-width: 0;
    }
    
    .unlock-title {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
    }
    
    .unlock-desc {
      display: block;
      font-size: var(--text-xs, 12px);
      color: var(--color-text-muted, #756A5E);
    }
    
    .unlock-check {
      color: var(--color-semantic-success, #4a8560);
      flex-shrink: 0;
    }
    
    .unlock-check svg {
      width: 20px;
      height: 20px;
    }
    
    /* Actions */
    .stage-celebration-actions {
      opacity: 0;
    }
    
    .stage-celebration-button {
      width: 100%;
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      color: white;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: var(--font-weight-semibold, 600);
      border: none;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }
    
    .stage-celebration-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(74, 103, 65, 0.4);
    }
    
    .stage-celebration-button:active {
      transform: translateY(0);
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .stage-celebration-backdrop {
      background: rgba(20, 18, 16, 0.9);
    }
    
    [data-theme="midnight"] .stage-celebration-card {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .stage-celebration-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .stage-celebration-subtitle,
    [data-theme="midnight"] .stage-celebration-quote p {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .stage-celebration-close,
    [data-theme="midnight"] .stage-celebration-badge,
    [data-theme="midnight"] .stage-celebration-quote,
    [data-theme="midnight"] .unlock-item {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .unlock-icon {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .unlock-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .stage-celebration-modal {
        transition: opacity ${DURATION.FAST}ms linear;
      }
      
      .sparkle {
        display: none;
      }
      
      .stage-celebration-icon,
      .stage-celebration-eyebrow,
      .stage-celebration-title,
      .stage-celebration-subtitle,
      .stage-celebration-badge,
      .stage-celebration-quote,
      .unlock-item,
      .stage-celebration-actions {
        opacity: 1 !important;
      }
    }
    
    /* ========================================================================
       MOBILE - Optimized sizing to prevent overwhelm
       ======================================================================== */
    @media (max-width: 480px) {
      .stage-celebration-modal {
        padding: var(--space-3, 12px);
      }
      
      .stage-celebration-card {
        max-width: 90vw;
        padding: var(--space-5, 20px);
        max-height: 85vh;
      }
      
      .stage-celebration-icon {
        width: 48px;
        height: 48px;
      }
      
      .stage-celebration-icon svg {
        width: 20px;
        height: 20px;
      }
      
      .stage-celebration-title {
        font-size: var(--text-xl, 20px);
      }
      
      .stage-celebration-subtitle {
        font-size: var(--text-sm, 14px);
      }
      
      .stage-celebration-quote {
        padding: var(--space-3, 12px);
        margin-bottom: var(--space-4, 16px);
      }
      
      .stage-celebration-quote p {
        font-size: var(--text-sm, 14px);
      }
      
      .unlock-item {
        padding: var(--space-2, 8px);
        gap: var(--space-2, 8px);
      }
      
      .unlock-icon {
        width: 32px;
        height: 32px;
      }
      
      .unlock-icon svg {
        width: 16px;
        height: 16px;
      }
      
      .stage-celebration-button {
        padding: var(--space-3, 12px);
        font-size: var(--text-sm, 14px);
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const stageCelebration = {
  init: initStageCelebration,
  show: showStageCelebration,
  hide: hideStageCelebration,
};

export default stageCelebration;
