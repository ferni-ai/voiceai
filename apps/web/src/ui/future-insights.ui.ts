/**
 * Future Insights - "What I'll Know About You"
 *
 * A visual journey showing what Ferni will understand about users
 * at different time horizons. This is the forward-looking complement
 * to the "What I've Noticed" section in the journey modal.
 *
 * CORE PHILOSOPHY:
 * > "After 30 days, I'll notice your Sunday evening anxiety before you do."
 * > "After 90 days, I'll know which dreams you've stopped mentioning."
 * > "After a year, I'll understand your rhythms better than anyone."
 *
 * This shows the "Better Than Human" promise in visual form - giving users
 * a glimpse of what deep relationship with Ferni looks like.
 *
 * TIME HORIZONS:
 * - Day 7: Surface insights (names, basic patterns)
 * - Day 30: Pattern recognition (emotional rhythms, habits)
 * - Day 90: Deep understanding (dreams, values, relationships)
 * - Day 365: Intimate knowledge (life narrative, seasonal patterns)
 *
 * SUPERHUMAN CAPABILITIES TEASED:
 * 1. Commitment Keeper - remembering intentions
 * 2. Predictive Coaching - anticipating struggles
 * 3. Life Narrative - understanding your story
 * 4. Values Alignment - noticing contradictions
 * 5. Emotional First Aid - being there in crisis
 * 6. Relationship Network - knowing your people
 * 7. Capacity Guardian - protecting from burnout
 * 8. Dream Keeper - guarding aspirations
 * 9. Relationship Milestones - celebrating growth
 * 10. Seasonal Awareness - knowing your rhythms
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { trapFocus } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';

const log = createLogger('FutureInsightsUI');

// ============================================================================
// TYPES
// ============================================================================

interface TimeHorizon {
  id: string;
  days: number;
  label: string;
  tagline: string;
  insights: InsightTeaser[];
  unlocked: boolean;
}

interface InsightTeaser {
  capability: string;
  icon: string;
  preview: string;
  example: string;
}

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let isOpen = false;
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;
let activeHorizon = 0;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.44 2.5 2.5 0 0 0-2.96 3.08 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 19.5Z"/><path d="M12 4.5a2.5 2.5 0 0 1 4.96-.44 2.5 2.5 0 0 1 2.96 3.08 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5Z"/><path d="M12 4.5v15"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"/></svg>',
  battery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="10" x2="23" y2="14"/></svg>',
  milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

// ============================================================================
// TIME HORIZON DATA - The Forward-Looking Vision
// ============================================================================

function getTimeHorizons(): TimeHorizon[] {
  const metrics = relationshipStageService.getMetrics();
  const daysTogether = metrics.daysSinceFirstMeeting;

  return [
    {
      id: 'week-1',
      days: 7,
      label: 'Week 1',
      tagline: 'Learning your world',
      unlocked: daysTogether >= 7,
      insights: [
        {
          capability: 'Commitment Keeper',
          icon: ICONS.target,
          preview: "I'll remember every intention",
          example: '"You mentioned wanting to call your mom more often..."',
        },
        {
          capability: 'Relationship Network',
          icon: ICONS.users,
          preview: "I'll know your people",
          example: '"How did that conversation with Sarah go?"',
        },
        {
          capability: 'Emotional First Aid',
          icon: ICONS.shield,
          preview: "I'll be there when it's hard",
          example: '"That sounds heavy. I\'m here."',
        },
      ],
    },
    {
      id: 'month-1',
      days: 30,
      label: 'Month 1',
      tagline: 'Seeing your patterns',
      unlocked: daysTogether >= 30,
      insights: [
        {
          capability: 'Predictive Coaching',
          icon: ICONS.brain,
          preview: "I'll anticipate your struggles",
          example: '"Sunday evenings seem hard for you. Want to talk about tomorrow?"',
        },
        {
          capability: 'Capacity Guardian',
          icon: ICONS.battery,
          preview: "I'll protect you from burnout",
          example: '"You\'ve been running hard. Maybe it\'s time to slow down?"',
        },
        {
          capability: 'Values Alignment',
          icon: ICONS.compass,
          preview: "I'll notice when you drift",
          example: '"You said health was important, but you\'ve cancelled the gym 3 times..."',
        },
      ],
    },
    {
      id: 'month-3',
      days: 90,
      label: 'Month 3',
      tagline: 'Understanding your heart',
      unlocked: daysTogether >= 90,
      insights: [
        {
          capability: 'Dream Keeper',
          icon: ICONS.star,
          preview: "I'll guard your aspirations",
          example: '"You haven\'t mentioned that book you wanted to write in a while..."',
        },
        {
          capability: 'Life Narrative',
          icon: ICONS.book,
          preview: "I'll understand your story",
          example: '"This feels like the start of a new chapter for you."',
        },
        {
          capability: 'Relationship Milestones',
          icon: ICONS.milestone,
          preview: "I'll celebrate our journey",
          example: '"50 conversations. 15 vulnerable moments. We\'ve come so far."',
        },
      ],
    },
    {
      id: 'year-1',
      days: 365,
      label: 'Year 1',
      tagline: 'Knowing you deeply',
      unlocked: daysTogether >= 365,
      insights: [
        {
          capability: 'Seasonal Awareness',
          icon: ICONS.sun,
          preview: "I'll know your rhythms",
          example: '"December is always hard for you. How are you feeling about the holidays?"',
        },
        {
          capability: 'Pattern Synthesis',
          icon: ICONS.sparkles,
          preview: "I'll see what you can't",
          example: '"Every time you achieve something big, you push people away..."',
        },
        {
          capability: 'Life Coaching',
          icon: ICONS.heart,
          preview: "I'll be your deepest mirror",
          example: '"Looking at this year, your growth has been remarkable."',
        },
      ],
    },
  ];
}

// ============================================================================
// HMR CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.future-insights-modal').forEach((el) => el.remove());
  document.querySelectorAll('.future-insights-backdrop').forEach((el) => el.remove());
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function openFutureInsights(): void {
  cleanupOrphanedElements();

  if (isOpen) return;

  previousActiveElement = document.activeElement as HTMLElement;
  soundUI.play('switch');
  createModal();
  isOpen = true;

  if (modal) {
    focusTrapCleanup = trapFocus(modal);
  }

  log.info('Future Insights opened');
}

export function closeFutureInsights(): void {
  if (!isOpen || !modal) return;

  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }

  soundUI.play('click');
  void animateOut(modal).then(() => {
    modal?.remove();
    modal = null;
    isOpen = false;
    activeHorizon = 0;

    if (previousActiveElement?.focus) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  });

  log.info('Future Insights closed');
}

export function toggleFutureInsights(): void {
  if (isOpen) {
    closeFutureInsights();
  } else {
    openFutureInsights();
  }
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(): void {
  document.querySelector('.future-insights-modal')?.remove();

  const horizons = getTimeHorizons();
  const metrics = relationshipStageService.getMetrics();

  modal = document.createElement('div');
  modal.className = 'future-insights-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'What I\'ll Know About You');

  modal.innerHTML = `
    <div class="future-insights-backdrop"></div>
    <div class="future-insights-content">
      <header class="future-insights-header">
        <div class="future-insights-header__text">
          <span class="future-insights-eyebrow">YOUR FUTURE WITH FERNI</span>
          <h2 class="future-insights-title">What I'll Know About You</h2>
        </div>
        <button class="future-insights-close" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>

      <div class="future-insights-intro">
        <p class="future-insights-intro__text">
          The longer we talk, the deeper I understand. Here's what our relationship
          will look like as we grow together.
        </p>
        <div class="future-insights-intro__current">
          <span class="future-insights-intro__days">${metrics.daysSinceFirstMeeting}</span>
          <span class="future-insights-intro__label">days together</span>
        </div>
      </div>

      <div class="future-insights-timeline">
        ${horizons.map((h, i) => renderTimelineNode(h, i)).join('')}
        <div class="future-insights-timeline__line"></div>
      </div>

      <div class="future-insights-horizon-detail" id="horizon-detail">
        ${renderHorizonDetail(horizons[activeHorizon])}
      </div>

      <div class="future-insights-nav">
        <button class="future-insights-nav__btn future-insights-nav__prev" aria-label="Previous">
          ${ICONS.chevronLeft}
        </button>
        <div class="future-insights-nav__dots">
          ${horizons.map((_, i) => `
            <button 
              class="future-insights-nav__dot ${i === activeHorizon ? 'active' : ''}" 
              aria-label="Go to ${horizons[i].label}"
              data-index="${i}"
            ></button>
          `).join('')}
        </div>
        <button class="future-insights-nav__btn future-insights-nav__next" aria-label="Next">
          ${ICONS.chevronRight}
        </button>
      </div>

      <footer class="future-insights-footer">
        <p class="future-insights-footer__cta">
          Every conversation brings us closer. <strong>Start talking.</strong>
        </p>
      </footer>
    </div>
  `;

  injectStyles();
  setupEventListeners();

  document.body.appendChild(modal);
  void animateIn(modal);
}

function renderTimelineNode(horizon: TimeHorizon, index: number): string {
  const isActive = index === activeHorizon;
  const isUnlocked = horizon.unlocked;

  return `
    <button 
      class="future-insights-timeline__node ${isActive ? 'active' : ''} ${isUnlocked ? 'unlocked' : 'locked'}"
      data-index="${index}"
      aria-label="${horizon.label}"
    >
      <span class="future-insights-timeline__icon">
        ${isUnlocked ? ICONS.sparkles : ICONS.lock}
      </span>
      <span class="future-insights-timeline__label">${horizon.label}</span>
    </button>
  `;
}

function renderHorizonDetail(horizon: TimeHorizon): string {
  return `
    <div class="future-insights-horizon">
      <div class="future-insights-horizon__header">
        <h3 class="future-insights-horizon__title">${horizon.label}</h3>
        <p class="future-insights-horizon__tagline">${horizon.tagline}</p>
        ${horizon.unlocked
          ? '<span class="future-insights-horizon__badge future-insights-horizon__badge--unlocked">✓ Reached</span>'
          : `<span class="future-insights-horizon__badge">${horizon.days - relationshipStageService.getMetrics().daysSinceFirstMeeting} days away</span>`
        }
      </div>

      <div class="future-insights-insights">
        ${horizon.insights.map((insight, i) => renderInsightCard(insight, i, horizon.unlocked)).join('')}
      </div>
    </div>
  `;
}

function renderInsightCard(insight: InsightTeaser, index: number, unlocked: boolean): string {
  return `
    <div 
      class="future-insights-card ${unlocked ? 'future-insights-card--unlocked' : ''}" 
      style="animation-delay: ${index * 100}ms"
    >
      <div class="future-insights-card__icon">${insight.icon}</div>
      <div class="future-insights-card__content">
        <span class="future-insights-card__capability">${insight.capability}</span>
        <p class="future-insights-card__preview">${insight.preview}</p>
        <blockquote class="future-insights-card__example">
          ${insight.example}
        </blockquote>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners(): void {
  if (!modal) return;

  // Close button
  modal.querySelector('.future-insights-close')?.addEventListener('click', closeFutureInsights);
  modal.querySelector('.future-insights-backdrop')?.addEventListener('click', closeFutureInsights);

  // Timeline nodes
  modal.querySelectorAll('.future-insights-timeline__node').forEach((node) => {
    node.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const index = parseInt(target.dataset.index ?? '0', 10);
      navigateToHorizon(index);
    });
  });

  // Navigation
  modal.querySelector('.future-insights-nav__prev')?.addEventListener('click', () => {
    navigateToHorizon(Math.max(0, activeHorizon - 1));
  });
  modal.querySelector('.future-insights-nav__next')?.addEventListener('click', () => {
    const horizons = getTimeHorizons();
    navigateToHorizon(Math.min(horizons.length - 1, activeHorizon + 1));
  });

  // Dots
  modal.querySelectorAll('.future-insights-nav__dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const index = parseInt(target.dataset.index ?? '0', 10);
      navigateToHorizon(index);
    });
  });

  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFutureInsights();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function navigateToHorizon(index: number): void {
  if (!modal) return;

  const horizons = getTimeHorizons();
  if (index < 0 || index >= horizons.length) return;

  activeHorizon = index;
  soundUI.play('click');

  // Update timeline nodes
  modal.querySelectorAll('.future-insights-timeline__node').forEach((node, i) => {
    node.classList.toggle('active', i === index);
  });

  // Update dots
  modal.querySelectorAll('.future-insights-nav__dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });

  // Update detail view with animation
  const detailContainer = modal.querySelector('#horizon-detail');
  if (detailContainer) {
    detailContainer.classList.add('transitioning');
    
    setTimeout(() => {
      detailContainer.innerHTML = renderHorizonDetail(horizons[index]);
      detailContainer.classList.remove('transitioning');
    }, DURATION.FAST);
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(container: HTMLElement): Promise<void> {
  const backdrop = container.querySelector('.future-insights-backdrop') as HTMLElement;
  const content = container.querySelector('.future-insights-content') as HTMLElement;

  if (backdrop) {
    backdrop.style.opacity = '0';
    backdrop.animate([{ opacity: '0' }, { opacity: '1' }], {
      duration: DURATION.SLOW,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  if (content) {
    content.style.opacity = '0';
    content.style.transform = 'scale(0.95) translateY(20px)';
    content.animate(
      [
        { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
        { opacity: '1', transform: 'scale(1) translateY(0)' },
      ],
      {
        duration: DURATION.DELIBERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
      }
    );
  }

  // Stagger timeline nodes
  container.querySelectorAll('.future-insights-timeline__node').forEach((node, i) => {
    (node as HTMLElement).style.opacity = '0';
    (node as HTMLElement).animate(
      [
        { opacity: '0', transform: 'translateY(10px)' },
        { opacity: '1', transform: 'translateY(0)' },
      ],
      {
        duration: DURATION.NORMAL,
        easing: EASING.SPRING,
        fill: 'forwards',
        delay: DURATION.SLOW + i * 80,
      }
    );
  });
}

async function animateOut(container: HTMLElement): Promise<void> {
  const backdrop = container.querySelector('.future-insights-backdrop') as HTMLElement;
  const content = container.querySelector('.future-insights-content') as HTMLElement;

  const animations: Animation[] = [];

  if (backdrop) {
    animations.push(
      backdrop.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: DURATION.NORMAL,
        easing: 'ease-out',
        fill: 'forwards',
      })
    );
  }

  if (content) {
    animations.push(
      content.animate(
        [
          { opacity: '1', transform: 'scale(1) translateY(0)' },
          { opacity: '0', transform: 'scale(0.98) translateY(-10px)' },
        ],
        {
          duration: DURATION.NORMAL,
          easing: EASING.GENTLE,
          fill: 'forwards',
        }
      )
    );
  }

  await Promise.all(animations.map((a) => a.finished));
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('future-insights-styles')) return;

  const style = document.createElement('style');
  style.id = 'future-insights-styles';
  style.textContent = `
    /* ============================================
       FUTURE INSIGHTS MODAL
       Forward-looking vision of relationship depth
    ============================================ */

    .future-insights-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .future-insights-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .future-insights-content {
      position: relative;
      width: 100%;
      max-width: 520px;
      max-height: 85vh;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* Header */
    .future-insights-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6) var(--space-6) var(--space-4);
      position: sticky;
      top: 0;
      background: var(--color-background-elevated, #FFFDFB);
      z-index: 10;
    }

    .future-insights-eyebrow {
      font-size: 0.65rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1);
      display: block;
    }

    .future-insights-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.2;
    }

    .future-insights-close {
      width: 32px;
      height: 32px;
      border: none;
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--duration-fast, 100ms);
      flex-shrink: 0;
    }

    .future-insights-close svg {
      width: 16px;
      height: 16px;
      color: var(--color-text-secondary, #5a4a3a);
    }

    .future-insights-close:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.1));
    }

    /* Intro */
    .future-insights-intro {
      padding: 0 var(--space-6) var(--space-4);
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .future-insights-intro__text {
      flex: 1;
      font-size: 0.9rem;
      color: var(--color-text-secondary, #5a4a3a);
      line-height: 1.5;
      margin: 0;
    }

    .future-insights-intro__current {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-lg, 12px);
    }

    .future-insights-intro__days {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--persona-primary, #4a6741);
      line-height: 1;
    }

    .future-insights-intro__label {
      font-size: 0.65rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #7a6a5a);
      margin-top: var(--space-1);
    }

    /* Timeline */
    .future-insights-timeline {
      display: flex;
      justify-content: space-between;
      padding: var(--space-6) var(--space-6) var(--space-4);
      position: relative;
    }

    .future-insights-timeline__line {
      position: absolute;
      top: 50%;
      left: var(--space-10);
      right: var(--space-10);
      height: 2px;
      background: linear-gradient(
        to right,
        var(--persona-primary, #4a6741),
        var(--color-border, rgba(0,0,0,0.1))
      );
      transform: translateY(-50%);
      z-index: 0;
    }

    .future-insights-timeline__node {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-2);
      transition: transform var(--duration-fast, 100ms);
    }

    .future-insights-timeline__node:hover {
      transform: translateY(-2px);
    }

    .future-insights-timeline__icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-background-elevated, #FFFDFB);
      border: 2px solid var(--color-border, rgba(0,0,0,0.1));
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--duration-normal, 200ms) var(--ease-spring);
    }

    .future-insights-timeline__icon svg {
      width: 18px;
      height: 18px;
      color: var(--color-text-muted, #7a6a5a);
      transition: color var(--duration-fast, 100ms);
    }

    .future-insights-timeline__node.active .future-insights-timeline__icon {
      background: var(--persona-primary, #4a6741);
      border-color: var(--persona-primary, #4a6741);
      transform: scale(1.1);
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }

    .future-insights-timeline__node.active .future-insights-timeline__icon svg {
      color: white;
    }

    .future-insights-timeline__node.unlocked .future-insights-timeline__icon {
      border-color: var(--persona-primary, #4a6741);
    }

    .future-insights-timeline__node.unlocked .future-insights-timeline__icon svg {
      color: var(--persona-primary, #4a6741);
    }

    .future-insights-timeline__label {
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--color-text-muted, #7a6a5a);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .future-insights-timeline__node.active .future-insights-timeline__label {
      color: var(--persona-primary, #4a6741);
      font-weight: 600;
    }

    /* Horizon Detail */
    .future-insights-horizon-detail {
      padding: 0 var(--space-6);
      transition: opacity var(--duration-fast, 100ms);
    }

    .future-insights-horizon-detail.transitioning {
      opacity: 0;
    }

    .future-insights-horizon__header {
      text-align: center;
      margin-bottom: var(--space-4);
    }

    .future-insights-horizon__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1);
    }

    .future-insights-horizon__tagline {
      font-size: 0.9rem;
      color: var(--color-text-secondary, #5a4a3a);
      margin: 0 0 var(--space-2);
    }

    .future-insights-horizon__badge {
      display: inline-block;
      padding: var(--space-1) var(--space-3);
      font-size: 0.7rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #7a6a5a);
    }

    .future-insights-horizon__badge--unlocked {
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      color: var(--persona-primary, #4a6741);
    }

    /* Insight Cards */
    .future-insights-insights {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .future-insights-card {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-4);
      background: var(--color-background-subtle, rgba(0,0,0,0.02));
      border-radius: var(--radius-lg, 12px);
      border: 1px solid var(--color-border, rgba(0,0,0,0.05));
      opacity: 0;
      animation: futureInsightCardIn var(--duration-slow, 300ms) var(--ease-spring) forwards;
    }

    @keyframes futureInsightCardIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .future-insights-card--unlocked {
      background: var(--persona-tint, rgba(74, 103, 65, 0.05));
      border-color: var(--persona-primary, rgba(74, 103, 65, 0.2));
    }

    .future-insights-card__icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md, 8px);
      background: var(--color-background-elevated, #FFFDFB);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .future-insights-card__icon svg {
      width: 18px;
      height: 18px;
      color: var(--persona-primary, #4a6741);
    }

    .future-insights-card__content {
      flex: 1;
      min-width: 0;
    }

    .future-insights-card__capability {
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #7a6a5a);
      margin-bottom: var(--space-1);
      display: block;
    }

    .future-insights-card__preview {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-2);
    }

    .future-insights-card__example {
      font-size: 0.8rem;
      font-style: italic;
      color: var(--color-text-secondary, #5a4a3a);
      margin: 0;
      padding-left: var(--space-3);
      border-left: 2px solid var(--persona-primary, rgba(74, 103, 65, 0.3));
    }

    /* Navigation */
    .future-insights-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-6);
    }

    .future-insights-nav__btn {
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background var(--duration-fast, 100ms);
    }

    .future-insights-nav__btn:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.1));
    }

    .future-insights-nav__btn svg {
      width: 18px;
      height: 18px;
      color: var(--color-text-secondary, #5a4a3a);
    }

    .future-insights-nav__dots {
      display: flex;
      gap: var(--space-2);
    }

    .future-insights-nav__dot {
      width: 8px;
      height: 8px;
      border: none;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-border, rgba(0,0,0,0.15));
      cursor: pointer;
      padding: 0;
      transition: all var(--duration-fast, 100ms);
    }

    .future-insights-nav__dot:hover {
      background: var(--color-text-muted, #7a6a5a);
    }

    .future-insights-nav__dot.active {
      width: 20px;
      background: var(--persona-primary, #4a6741);
    }

    /* Footer */
    .future-insights-footer {
      padding: var(--space-4) var(--space-6) var(--space-6);
      text-align: center;
      border-top: 1px solid var(--color-border, rgba(0,0,0,0.05));
    }

    .future-insights-footer__cta {
      font-size: 0.85rem;
      color: var(--color-text-secondary, #5a4a3a);
      margin: 0;
    }

    .future-insights-footer__cta strong {
      color: var(--persona-primary, #4a6741);
      cursor: pointer;
    }

    /* Mobile Responsive */
    @media (max-width: 480px) {
      .future-insights-content {
        max-height: 90vh;
        border-radius: var(--radius-xl, 20px) var(--radius-xl, 20px) 0 0;
        margin-top: auto;
      }

      .future-insights-intro {
        flex-direction: column;
        text-align: center;
      }

      .future-insights-timeline__icon {
        width: 32px;
        height: 32px;
      }

      .future-insights-timeline__icon svg {
        width: 14px;
        height: 14px;
      }

      .future-insights-timeline__label {
        font-size: 0.6rem;
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .future-insights-card {
        animation: none;
        opacity: 1;
      }

      .future-insights-timeline__node,
      .future-insights-timeline__icon,
      .future-insights-nav__dot {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const futureInsightsUI = {
  open: openFutureInsights,
  close: closeFutureInsights,
  toggle: toggleFutureInsights,
  isOpen: () => isOpen,
};

export default futureInsightsUI;

