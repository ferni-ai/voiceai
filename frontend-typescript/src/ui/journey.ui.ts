/**
 * Your Journey - A Warm Scrapbook of Milestones
 *
 * A beautiful modal showing the user's relationship progress with Ferni.
 * Feels like flipping through a photo album of meaningful moments.
 *
 * DESIGN:
 * - Centered floating modal (per brand guidelines)
 * - Category sections with progress indicators
 * - Warm, personal copy for each milestone
 * - Unlocked milestones glow softly
 * - Locked milestones shown as mysteries to discover
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { soundUI } from './sound.ui.js';
import {
  getMilestones,
  getProgress,
  getCelebratedCount,
  getTotalMilestonesCount,
} from './ferni-milestones.ui.js';

const log = createLogger('JourneyUI');

// ============================================================================
// STATE
// ============================================================================

let journeyModal: HTMLElement | null = null;
let isOpen = false;

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`,
  team: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  conversation: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  discovery: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,
  sweet: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>
  </svg>`,
  close: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`,
  lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
};

const CATEGORY_META: Record<string, { icon: string; title: string; color: string }> = {
  relationship: {
    icon: ICONS.heart,
    title: 'Our Relationship',
    color: 'var(--persona-primary, #4a6741)',
  },
  team: {
    icon: ICONS.team,
    title: 'Team Connection',
    color: 'var(--color-peter, #3a6b73)',
  },
  conversation: {
    icon: ICONS.conversation,
    title: 'Our Conversations',
    color: 'var(--color-alex, #5a6b8a)',
  },
  discovery: {
    icon: ICONS.discovery,
    title: 'Hidden Discoveries',
    color: 'var(--color-maya, #a67a6a)',
  },
  sweet: {
    icon: ICONS.sweet,
    title: 'Sweet Moments',
    color: 'var(--color-nayan, #b8956a)',
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

export function openJourney(): void {
  if (isOpen) return;

  soundUI.play('open');
  createModal();
  isOpen = true;

  log.info('Journey opened');
}

export function closeJourney(): void {
  if (!isOpen || !journeyModal) return;

  soundUI.play('close');
  animateOut(journeyModal).then(() => {
    journeyModal?.remove();
    journeyModal = null;
    isOpen = false;
  });

  log.info('Journey closed');
}

export function toggleJourney(): void {
  if (isOpen) {
    closeJourney();
  } else {
    openJourney();
  }
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(): void {
  // Clean up any existing
  document.querySelector('.journey-modal')?.remove();

  const milestones = getMilestones();
  const progress = getProgress();
  const celebrated = getCelebratedCount();
  const total = getTotalMilestonesCount();

  // Group milestones by category
  const grouped: Record<string, typeof milestones> = {};
  for (const m of milestones) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category]!.push(m);
  }

  // Calculate streak info
  const streak = progress.currentStreak;
  const totalDays = progress.conversationDays.length;

  journeyModal = document.createElement('div');
  journeyModal.className = 'journey-modal';
  journeyModal.setAttribute('role', 'dialog');
  journeyModal.setAttribute('aria-label', 'Your Journey with Ferni');

  journeyModal.innerHTML = `
    <div class="journey-backdrop"></div>
    <div class="journey-content">
      <header class="journey-header">
        <div class="journey-header__text">
          <span class="journey-eyebrow">YOUR JOURNEY</span>
          <h2 class="journey-title">Our Story So Far</h2>
          <p class="journey-subtitle">
            ${celebrated}/${total} moments celebrated
            ${streak > 1 ? ` • ${streak} day streak 🔥` : ''}
            ${totalDays > 0 ? ` • ${totalDays} days together` : ''}
          </p>
        </div>
        <button class="journey-close" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>

      <div class="journey-body">
        ${Object.entries(grouped)
          .map(([category, items]) => renderCategory(category, items))
          .join('')}
      </div>

      <footer class="journey-footer">
        <p>Every moment matters. Keep going. 💚</p>
      </footer>
    </div>
  `;

  // Inject styles
  injectStyles();

  // Add event listeners
  journeyModal.querySelector('.journey-backdrop')?.addEventListener('click', closeJourney);
  journeyModal.querySelector('.journey-close')?.addEventListener('click', closeJourney);

  // Escape key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeJourney();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(journeyModal);
  animateIn(journeyModal);
}

function renderCategory(
  category: string,
  items: ReturnType<typeof getMilestones>
): string {
  const meta = CATEGORY_META[category] || CATEGORY_META.relationship;
  const celebratedInCategory = items.filter((m) => m.celebrated).length;

  return `
    <section class="journey-category">
      <header class="journey-category__header">
        <span class="journey-category__icon" style="color: ${meta.color}">
          ${meta.icon}
        </span>
        <h3 class="journey-category__title">${meta.title}</h3>
        <span class="journey-category__count">${celebratedInCategory}/${items.length}</span>
      </header>
      <div class="journey-category__items">
        ${items.map((m) => renderMilestone(m, meta.color)).join('')}
      </div>
    </section>
  `;
}

function renderMilestone(
  milestone: ReturnType<typeof getMilestones>[0],
  color: string
): string {
  const isCelebrated = milestone.celebrated;
  const hasProgress = milestone.target && milestone.progress !== undefined;
  const progressPercent = hasProgress
    ? Math.min(100, Math.round(((milestone.progress ?? 0) / (milestone.target ?? 1)) * 100))
    : 0;

  // Format celebration date
  let dateStr = '';
  if (isCelebrated && milestone.celebratedAt) {
    const date = new Date(milestone.celebratedAt);
    dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return `
    <div class="journey-milestone ${isCelebrated ? 'journey-milestone--celebrated' : 'journey-milestone--locked'}" 
         style="--milestone-color: ${color}">
      <div class="journey-milestone__status">
        ${isCelebrated ? ICONS.check : ICONS.lock}
      </div>
      <div class="journey-milestone__content">
        <h4 class="journey-milestone__name">
          ${isCelebrated ? milestone.name : '???'}
        </h4>
        <p class="journey-milestone__message">
          ${isCelebrated ? milestone.message : milestone.subtitle || 'Keep exploring...'}
        </p>
        ${
          hasProgress && !isCelebrated
            ? `
          <div class="journey-milestone__progress">
            <div class="journey-milestone__progress-bar" style="width: ${progressPercent}%"></div>
            <span class="journey-milestone__progress-text">${milestone.progress}/${milestone.target}</span>
          </div>
        `
            : ''
        }
        ${
          dateStr
            ? `<span class="journey-milestone__date">${dateStr}</span>`
            : ''
        }
      </div>
    </div>
  `;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modal: HTMLElement): Promise<void> {
  const backdrop = modal.querySelector('.journey-backdrop') as HTMLElement;
  const content = modal.querySelector('.journey-content') as HTMLElement;

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
}

async function animateOut(modal: HTMLElement): Promise<void> {
  const backdrop = modal.querySelector('.journey-backdrop') as HTMLElement;
  const content = modal.querySelector('.journey-content') as HTMLElement;

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
  if (document.getElementById('journey-ui-styles')) return;

  const style = document.createElement('style');
  style.id = 'journey-ui-styles';
  style.textContent = `
    .journey-modal {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 10000);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
    }

    .journey-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .journey-content {
      position: relative;
      background: var(--color-background-elevated, #faf8f5);
      border-radius: var(--radius-2xl, 20px);
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      max-width: 600px;
      width: 100%;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .journey-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    }

    .journey-header__text {
      flex: 1;
    }

    .journey-eyebrow {
      display: block;
      font-size: var(--text-xs, 0.75rem);
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 4px);
    }

    .journey-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 1.5rem);
      font-weight: 700;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
      line-height: 1.2;
    }

    .journey-subtitle {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: var(--space-2, 8px) 0 0;
    }

    .journey-close {
      background: none;
      border: none;
      padding: var(--space-2, 8px);
      margin: calc(var(--space-2, 8px) * -1);
      cursor: pointer;
      color: var(--color-text-muted, #70605a);
      border-radius: var(--radius-full, 9999px);
      transition: all 0.2s ease;
    }

    .journey-close:hover {
      background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      color: var(--color-text-primary, #2c2520);
    }

    .journey-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4, 16px) var(--space-6, 24px);
    }

    .journey-category {
      margin-bottom: var(--space-6, 24px);
    }

    .journey-category:last-child {
      margin-bottom: 0;
    }

    .journey-category__header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
    }

    .journey-category__icon {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .journey-category__title {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
      flex: 1;
    }

    .journey-category__count {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.05));
      padding: var(--space-1, 4px) var(--space-2, 8px);
      border-radius: var(--radius-full, 9999px);
    }

    .journey-category__items {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }

    .journey-milestone {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.02));
      border-radius: var(--radius-lg, 12px);
      transition: all 0.2s ease;
    }

    .journey-milestone--celebrated {
      background: linear-gradient(
        135deg,
        rgba(74, 103, 65, 0.08) 0%,
        rgba(74, 103, 65, 0.02) 100%
      );
      border: 1px solid rgba(74, 103, 65, 0.15);
    }

    .journey-milestone--locked {
      opacity: 0.7;
    }

    .journey-milestone__status {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-background-elevated, #fff);
      border: 2px solid var(--milestone-color, var(--persona-primary));
      color: var(--milestone-color, var(--persona-primary));
    }

    .journey-milestone--locked .journey-milestone__status {
      border-color: var(--color-text-muted, #70605a);
      color: var(--color-text-muted, #70605a);
      opacity: 0.5;
    }

    .journey-milestone__content {
      flex: 1;
      min-width: 0;
    }

    .journey-milestone__name {
      font-size: var(--text-sm, 0.875rem);
      font-weight: 600;
      color: var(--color-text-primary, #2c2520);
      margin: 0;
    }

    .journey-milestone--locked .journey-milestone__name {
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__message {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-secondary, #5a4d47);
      margin: var(--space-1, 4px) 0 0;
      line-height: 1.4;
    }

    .journey-milestone--locked .journey-milestone__message {
      font-style: italic;
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__progress {
      position: relative;
      height: 4px;
      background: var(--color-background-subtle, rgba(0, 0, 0, 0.1));
      border-radius: var(--radius-full, 9999px);
      margin-top: var(--space-2, 8px);
      overflow: hidden;
    }

    .journey-milestone__progress-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: var(--milestone-color, var(--persona-primary));
      border-radius: var(--radius-full, 9999px);
      transition: width 0.3s ease;
    }

    .journey-milestone__progress-text {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
    }

    .journey-milestone__date {
      display: block;
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-text-muted, #70605a);
      margin-top: var(--space-2, 8px);
    }

    .journey-footer {
      padding: var(--space-4, 16px) var(--space-6, 24px);
      border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
      text-align: center;
    }

    .journey-footer p {
      font-size: var(--text-sm, 0.875rem);
      color: var(--color-text-muted, #70605a);
      margin: 0;
    }

    /* Dark theme */
    [data-theme="midnight"] .journey-backdrop {
      background: rgba(8, 8, 12, 0.8);
    }

    [data-theme="midnight"] .journey-content {
      background: var(--color-background-elevated, #1a1a1f);
    }

    [data-theme="midnight"] .journey-title {
      color: var(--color-text-primary, #faf6f0);
    }

    [data-theme="midnight"] .journey-milestone--celebrated {
      background: linear-gradient(
        135deg,
        rgba(74, 103, 65, 0.15) 0%,
        rgba(74, 103, 65, 0.05) 100%
      );
    }

    /* Mobile */
    @media (max-width: 640px) {
      .journey-modal {
        padding: 0;
        align-items: flex-end;
      }

      .journey-content {
        max-height: 90vh;
        border-radius: var(--radius-2xl, 20px) var(--radius-2xl, 20px) 0 0;
      }

      .journey-header {
        padding: var(--space-4, 16px);
      }

      .journey-body {
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .journey-milestone {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const journeyUI = {
  open: openJourney,
  close: closeJourney,
  toggle: toggleJourney,
  isOpen: () => isOpen,
};

export default journeyUI;
