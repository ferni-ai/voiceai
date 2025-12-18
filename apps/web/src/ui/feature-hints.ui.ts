/**
 * Feature Discovery Hints
 *
 * Contextual hints that help users discover newly unlocked features.
 * Instead of making users stumble upon features, we gently guide them.
 *
 * DESIGN PHILOSOPHY:
 * - Non-intrusive - hints appear near relevant UI elements
 * - Dismissible and remembers what's been seen
 * - Appears at the right time (after feature unlocks)
 * - Warm, inviting language ("Want to try?", not "Click here")
 *
 * HINT TYPES:
 * - Tooltip hints: Appear near a specific element
 * - Spotlight hints: Highlight an element with a pulsing ring
 * - Card hints: Small floating cards with more context
 *
 * BRAND COMPLIANCE:
 * - Ferni's sage green for accent
 * - Warm, human copy
 * - Subtle animations
 * - Lucide icons
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import {
  relationshipStageService,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('FeatureHints');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export type HintType = 'tooltip' | 'spotlight' | 'card';

export interface FeatureHint {
  id: string;
  type: HintType;
  targetSelector: string;
  title: string;
  message: string;
  ctaText?: string;
  ctaAction?: () => void;
  minStage?: RelationshipStage;
  showAfterDelay?: number;
  showOnce?: boolean;
  priority?: number;
}

interface ActiveHint {
  hint: FeatureHint;
  element: HTMLElement;
  targetElement: Element | null;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  lightbulb: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
};

// ============================================================================
// PREDEFINED HINTS
// ============================================================================

export const FEATURE_HINTS: FeatureHint[] = [
  // Team Huddle hint - unlocks at building-trust
  {
    id: 'team-huddle-intro',
    type: 'spotlight',
    targetSelector: '[data-feature="team-huddle"], .engagement-trigger',
    title: 'Team Huddles are here!',
    message: 'Now that we know each other better, you can hear from multiple team members at once.',
    ctaText: 'Try a huddle',
    minStage: 'building-trust',
    showOnce: true,
    priority: 10,
  },

  // Custom rituals hint - unlocks at getting-started
  {
    id: 'custom-rituals-intro',
    type: 'card',
    targetSelector: '[data-feature="rituals"], .ritual-builder-trigger',
    title: 'Create your own rituals',
    message: 'You can now create custom daily practices. What small habit would help you most?',
    ctaText: 'Create a ritual',
    minStage: 'getting-started',
    showOnce: true,
    showAfterDelay: 2000,
    priority: 8,
  },

  // Memory timeline hint - unlocks at building-trust
  {
    id: 'memory-timeline-intro',
    type: 'tooltip',
    targetSelector: '[data-feature="journey"], .journey-trigger, .relationship-progress',
    title: 'See our journey',
    message: "Tap here to see the meaningful moments we've shared.",
    minStage: 'building-trust',
    showOnce: true,
    priority: 7,
  },

  // Trust journey hint - unlocks at established
  {
    id: 'trust-journey-intro',
    type: 'spotlight',
    targetSelector: '[data-feature="trust-journey"]',
    title: 'Your Trust Journey',
    message:
      "See how our relationship has grown - your growth moments, boundaries I've respected, and wins we've celebrated.",
    ctaText: 'Explore',
    minStage: 'established',
    showOnce: true,
    priority: 9,
  },

  // Settings hint for new users
  {
    id: 'settings-intro',
    type: 'tooltip',
    targetSelector: '.settings-trigger, [data-feature="settings"]',
    title: 'Customize your experience',
    message: 'Adjust themes, sounds, and more.',
    minStage: 'getting-started',
    showOnce: true,
    showAfterDelay: 5000,
    priority: 3,
  },

  // Spotify integration hint
  {
    id: 'spotify-intro',
    type: 'card',
    targetSelector: '[data-feature="spotify"], .spotify-trigger',
    title: 'Connect Spotify',
    message: 'Link your Spotify to set the mood during our conversations.',
    ctaText: 'Connect',
    minStage: 'getting-started',
    showOnce: true,
    priority: 5,
  },
];

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;
const activeHints: Map<string, ActiveHint> = new Map();
let dismissedHints: Set<string> = new Set();
const registeredHints: FeatureHint[] = [...FEATURE_HINTS];
let checkInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the feature hints system.
 */
export function initFeatureHints(): void {
  if (isInitialized) return;

  cleanupOrphanedElements();
  injectStyles();
  createContainer();
  loadDismissedHints();

  // Start checking for hint opportunities
  checkInterval = setInterval(checkForHintOpportunities, 2000);

  // Also check on stage changes
  relationshipStageService.onStageChange(() => {
    trackedTimeout(checkForHintOpportunities, 1000);
  });

  // Initial check
  trackedTimeout(checkForHintOpportunities, 1000);

  isInitialized = true;
  log.debug('Feature hints system initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.feature-hints-container').forEach((el) => el.remove());
  document.querySelectorAll('.feature-hint').forEach((el) => el.remove());
  document.querySelectorAll('.feature-spotlight').forEach((el) => el.remove());
  document.querySelectorAll('#feature-hints-styles').forEach((el) => el.remove());
}

function createContainer(): void {
  container = document.createElement('div');
  container.className = 'feature-hints-container';
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register a custom hint.
 */
export function registerHint(hint: FeatureHint): void {
  const exists = registeredHints.some((h) => h.id === hint.id);
  if (!exists) {
    registeredHints.push(hint);
    log.debug('Hint registered', { id: hint.id });
  }
}

/**
 * Show a specific hint by ID.
 */
export function showHint(hintId: string): void {
  const hint = registeredHints.find((h) => h.id === hintId);
  if (!hint) {
    log.warn('Hint not found', { hintId });
    return;
  }

  displayHint(hint);
}

/**
 * Dismiss a hint.
 */
export function dismissHint(hintId: string): void {
  const active = activeHints.get(hintId);
  if (!active) return;

  // Release modal coordinator lock
  modalCoordinator.release(`hint-${hintId}`);

  animateOut(active.element).then(() => {
    active.element.remove();

    // Remove spotlight if any
    document
      .querySelectorAll(`.feature-spotlight[data-hint-id="${hintId}"]`)
      .forEach((el) => el.remove());

    activeHints.delete(hintId);

    // Mark as dismissed if showOnce
    const hint = registeredHints.find((h) => h.id === hintId);
    if (hint?.showOnce) {
      dismissedHints.add(hintId);
      saveDismissedHints();
    }
  });
}

/**
 * Dismiss all active hints.
 */
export function dismissAllHints(): void {
  activeHints.forEach((_, hintId) => dismissHint(hintId));
}

/**
 * Reset dismissed hints (for testing).
 */
export function resetDismissedHints(): void {
  dismissedHints.clear();
  localStorage.removeItem('ferni_dismissed_hints');
  log.debug('Dismissed hints reset');
}

// ============================================================================
// HINT CHECKING
// ============================================================================

function checkForHintOpportunities(): void {
  // FIRST CONVERSATION IS ONBOARDING - no hints until 2+ conversations
  if (!modalCoordinator.hasMinimumConversations(2)) {
    return;
  }

  // Don't show hints during active conversation
  if (modalCoordinator.isConversationActive()) {
    return;
  }

  const currentStage = relationshipStageService.getStage();

  // Find hints that should be shown
  for (const hint of registeredHints) {
    // Skip if already showing or dismissed
    if (activeHints.has(hint.id) || dismissedHints.has(hint.id)) {
      continue;
    }

    // Check stage requirement
    if (hint.minStage && !isStageAtOrBeyond(currentStage, hint.minStage)) {
      continue;
    }

    // Check if target element exists and is visible
    const target = document.querySelector(hint.targetSelector);
    if (!target || !isElementVisible(target)) {
      continue;
    }

    // Limit concurrent hints
    if (activeHints.size >= 1) {
      continue;
    }

    // Show after delay if specified
    if (hint.showAfterDelay) {
      trackedTimeout(() => {
        if (!activeHints.has(hint.id) && !dismissedHints.has(hint.id)) {
          displayHint(hint);
        }
      }, hint.showAfterDelay);
    } else {
      displayHint(hint);
    }

    // Only show one hint per check cycle
    break;
  }
}

// ============================================================================
// HINT DISPLAY
// ============================================================================

function displayHint(hint: FeatureHint): void {
  const target = document.querySelector(hint.targetSelector);
  if (!target) return;

  // Request permission from modal coordinator (includes hint cooldown)
  const canShow = modalCoordinator.requestHint(`hint-${hint.id}`, () =>
    showHintElement(hint, target)
  );

  if (!canShow) {
    log.debug('Hint blocked by modal coordinator', { id: hint.id });
    return;
  }
}

function showHintElement(hint: FeatureHint, target: Element): void {
  let element: HTMLElement;

  switch (hint.type) {
    case 'spotlight':
      element = createSpotlightHint(hint, target);
      addSpotlight(hint.id, target);
      break;
    case 'card':
      element = createCardHint(hint, target);
      break;
    case 'tooltip':
    default:
      element = createTooltipHint(hint, target);
      break;
  }

  document.body.appendChild(element);

  activeHints.set(hint.id, { hint, element, targetElement: target });

  // Position the hint
  positionHint(element, target, hint.type);

  // Animate in
  animateIn(element);

  // Auto-dismiss after 15 seconds for non-spotlight hints
  if (hint.type !== 'spotlight') {
    trackedTimeout(() => {
      if (activeHints.has(hint.id)) {
        dismissHint(hint.id);
      }
    }, 15000);
  }

  log.info('Hint displayed', { id: hint.id, type: hint.type });
}

function createTooltipHint(hint: FeatureHint, _target: Element): HTMLElement {
  const element = document.createElement('div');
  element.className = 'feature-hint feature-hint--tooltip';
  element.setAttribute('role', 'tooltip');
  element.setAttribute('data-hint-id', hint.id);

  element.innerHTML = `
    <div class="hint-arrow"></div>
    <div class="hint-content">
      <button class="hint-close" aria-label="${t('accessibility.dismiss')}">
        ${ICONS.close}
      </button>
      <p class="hint-title">${hint.title}</p>
      <p class="hint-message">${hint.message}</p>
    </div>
  `;

  const closeBtn = element.querySelector('.hint-close');
  closeBtn?.addEventListener('click', () => dismissHint(hint.id));

  return element;
}

function createCardHint(hint: FeatureHint, _target: Element): HTMLElement {
  const element = document.createElement('div');
  element.className = 'feature-hint feature-hint--card';
  element.setAttribute('role', 'dialog');
  element.setAttribute('data-hint-id', hint.id);

  element.innerHTML = `
    <div class="hint-content">
      <button class="hint-close" aria-label="${t('accessibility.dismiss')}">
        ${ICONS.close}
      </button>
      <div class="hint-icon">
        ${ICONS.lightbulb}
      </div>
      <p class="hint-title">${hint.title}</p>
      <p class="hint-message">${hint.message}</p>
      ${
        hint.ctaText
          ? `
        <button class="hint-cta">
          <span>${hint.ctaText}</span>
          ${ICONS.arrowRight}
        </button>
      `
          : ''
      }
    </div>
  `;

  const closeBtn = element.querySelector('.hint-close');
  closeBtn?.addEventListener('click', () => dismissHint(hint.id));

  const ctaBtn = element.querySelector('.hint-cta');
  if (ctaBtn && hint.ctaAction) {
    ctaBtn.addEventListener('click', () => {
      dismissHint(hint.id);
      hint.ctaAction?.();
    });
  } else if (ctaBtn) {
    // Default: click the target element
    ctaBtn.addEventListener('click', () => {
      dismissHint(hint.id);
      const target = document.querySelector(hint.targetSelector);
      if (target instanceof HTMLElement) {
        target.click();
      }
    });
  }

  return element;
}

function createSpotlightHint(hint: FeatureHint, _target: Element): HTMLElement {
  const element = document.createElement('div');
  element.className = 'feature-hint feature-hint--spotlight-card';
  element.setAttribute('role', 'dialog');
  element.setAttribute('data-hint-id', hint.id);

  element.innerHTML = `
    <div class="hint-content">
      <button class="hint-close" aria-label="${t('accessibility.dismiss')}">
        ${ICONS.close}
      </button>
      <div class="hint-icon">
        ${ICONS.sparkles}
      </div>
      <p class="hint-title">${hint.title}</p>
      <p class="hint-message">${hint.message}</p>
      ${
        hint.ctaText
          ? `
        <button class="hint-cta">
          <span>${hint.ctaText}</span>
          ${ICONS.arrowRight}
        </button>
      `
          : ''
      }
      <button class="hint-dismiss-text">Maybe later</button>
    </div>
  `;

  const closeBtn = element.querySelector('.hint-close');
  closeBtn?.addEventListener('click', () => dismissHint(hint.id));

  const dismissBtn = element.querySelector('.hint-dismiss-text');
  dismissBtn?.addEventListener('click', () => dismissHint(hint.id));

  const ctaBtn = element.querySelector('.hint-cta');
  if (ctaBtn && hint.ctaAction) {
    ctaBtn.addEventListener('click', () => {
      dismissHint(hint.id);
      hint.ctaAction?.();
    });
  } else if (ctaBtn) {
    ctaBtn.addEventListener('click', () => {
      dismissHint(hint.id);
      const target = document.querySelector(hint.targetSelector);
      if (target instanceof HTMLElement) {
        target.click();
      }
    });
  }

  return element;
}

function addSpotlight(hintId: string, target: Element): void {
  const rect = target.getBoundingClientRect();

  const spotlight = document.createElement('div');
  spotlight.className = 'feature-spotlight';
  spotlight.setAttribute('data-hint-id', hintId);

  Object.assign(spotlight.style, {
    position: 'fixed',
    top: `${rect.top - 8}px`,
    left: `${rect.left - 8}px`,
    width: `${rect.width + 16}px`,
    height: `${rect.height + 16}px`,
    borderRadius: 'var(--radius-lg, 12px)',
    pointerEvents: 'none',
    zIndex: 'var(--z-dropdown, 7000)',
  });

  document.body.appendChild(spotlight);
}

// ============================================================================
// POSITIONING
// ============================================================================

function positionHint(element: HTMLElement, target: Element, type: HintType): void {
  const targetRect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // For card/spotlight types, position below or to the side
  if (type === 'card' || type === 'spotlight') {
    // Prefer positioning to the right of the target
    const rightSpace = viewportWidth - targetRect.right;
    const bottomSpace = viewportHeight - targetRect.bottom;

    if (rightSpace > 300) {
      element.style.left = `${targetRect.right + 16}px`;
      element.style.top = `${targetRect.top}px`;
    } else if (bottomSpace > 200) {
      element.style.left = `${Math.max(16, targetRect.left)}px`;
      element.style.top = `${targetRect.bottom + 16}px`;
    } else {
      // Center in viewport
      element.style.left = '50%';
      element.style.top = '50%';
      element.style.transform = 'translate(-50%, -50%)';
    }
  } else {
    // Tooltip: position above or below
    const topSpace = targetRect.top;
    const bottomSpace = viewportHeight - targetRect.bottom;

    if (bottomSpace > 100) {
      element.style.left = `${targetRect.left + targetRect.width / 2}px`;
      element.style.top = `${targetRect.bottom + 12}px`;
      element.style.transform = 'translateX(-50%)';
      element.classList.add('feature-hint--below');
    } else if (topSpace > 100) {
      element.style.left = `${targetRect.left + targetRect.width / 2}px`;
      element.style.bottom = `${viewportHeight - targetRect.top + 12}px`;
      element.style.transform = 'translateX(-50%)';
      element.classList.add('feature-hint--above');
    }
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateIn(element: HTMLElement): void {
  if (prefersReducedMotion()) {
    element.style.opacity = '1';
    return;
  }

  element.animate(
    [
      { opacity: 0, transform: element.style.transform + ' scale(0.9)' },
      { opacity: 1, transform: element.style.transform + ' scale(1)' },
    ],
    {
      duration: DURATION.DELIBERATE,
      easing: EASING.SPRING,
      fill: 'forwards',
    }
  );
}

async function animateOut(element: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) {
    return;
  }

  return new Promise((resolve) => {
    const animation = element.animate(
      [
        { opacity: 1, transform: element.style.transform + ' scale(1)' },
        { opacity: 0, transform: element.style.transform + ' scale(0.95)' },
      ],
      {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }
    );

    animation.onfinish = () => resolve();
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function isStageAtOrBeyond(current: RelationshipStage, target: RelationshipStage): boolean {
  const stages: RelationshipStage[] = [
    'first-meeting',
    'getting-started',
    'building-trust',
    'established',
    'deep-partnership',
  ];
  return stages.indexOf(current) >= stages.indexOf(target);
}

function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth &&
    rect.width > 0 &&
    rect.height > 0
  );
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'ferni_dismissed_hints';

function loadDismissedHints(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      dismissedHints = new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore
  }
}

function saveDismissedHints(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(dismissedHints)));
  } catch {
    // Ignore
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('feature-hints-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'feature-hints-styles';
  styleElement.textContent = `
    /* ========================================================================
       FEATURE HINTS CONTAINER
       ======================================================================== */
    .feature-hints-container {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: var(--z-dropdown, 7000);
      pointer-events: none;
    }
    
    /* ========================================================================
       BASE HINT STYLES
       ======================================================================== */
    .feature-hint {
      position: fixed;
      pointer-events: auto;
      opacity: 0;
      z-index: var(--z-dropdown, 7000);
    }
    
    .hint-content {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-xl, 16px);
      box-shadow: 
        0 8px 24px rgba(44, 37, 32, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.8);
      padding: var(--space-4, 16px);
    }
    
    .hint-close {
      position: absolute;
      top: var(--space-2, 8px);
      right: var(--space-2, 8px);
      width: 24px;
      height: 24px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
      cursor: pointer;
      opacity: 0.5;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .hint-close:hover {
      opacity: 1;
      background: var(--color-background-secondary, #F5F1E8);
    }
    
    .hint-close svg {
      width: 14px;
      height: 14px;
    }
    
    .hint-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      margin: 0 auto var(--space-3, 12px);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      border-radius: var(--radius-full, 9999px);
      color: var(--persona-primary, #4a6741);
    }
    
    .hint-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .hint-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
      text-align: center;
    }
    
    .hint-message {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-3, 12px);
      line-height: var(--leading-relaxed, 1.5);
      text-align: center;
    }
    
    .hint-cta {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      width: 100%;
      padding: var(--space-3, 12px);
      background: var(--persona-primary, #4a6741);
      color: white;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-sm, 14px);
      font-weight: var(--font-weight-semibold, 600);
      border: none;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .hint-cta:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }
    
    .hint-cta svg {
      width: 16px;
      height: 16px;
    }
    
    .hint-dismiss-text {
      display: block;
      width: 100%;
      margin-top: var(--space-2, 8px);
      padding: var(--space-2, 8px);
      background: none;
      border: none;
      color: var(--color-text-muted, #756A5E);
      font-size: var(--text-xs, 12px);
      cursor: pointer;
      transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .hint-dismiss-text:hover {
      color: var(--color-text-secondary, #5C544A);
    }
    
    /* ========================================================================
       TOOLTIP HINT
       ======================================================================== */
    .feature-hint--tooltip .hint-content {
      max-width: 260px;
      padding: var(--space-3, 12px);
    }
    
    .feature-hint--tooltip .hint-title {
      font-size: var(--text-sm, 14px);
      text-align: left;
      padding-right: var(--space-4, 16px);
    }
    
    .feature-hint--tooltip .hint-message {
      font-size: var(--text-xs, 12px);
      text-align: left;
      margin-bottom: 0;
    }
    
    .hint-arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--color-background-elevated, #FFFDFB);
      transform: rotate(45deg);
    }
    
    .feature-hint--below .hint-arrow {
      top: -6px;
      left: calc(50% - 6px);
      box-shadow: -1px -1px 1px rgba(44, 37, 32, 0.05);
    }
    
    .feature-hint--above .hint-arrow {
      bottom: -6px;
      left: calc(50% - 6px);
      box-shadow: 1px 1px 1px rgba(44, 37, 32, 0.05);
    }
    
    /* ========================================================================
       CARD HINT
       ======================================================================== */
    .feature-hint--card .hint-content {
      max-width: 280px;
    }
    
    /* ========================================================================
       SPOTLIGHT
       ======================================================================== */
    .feature-spotlight {
      box-shadow: 
        0 0 0 4px var(--persona-primary, #4a6741),
        0 0 0 8px rgba(74, 103, 65, 0.2),
        0 0 30px rgba(74, 103, 65, 0.3);
      animation: spotlight-pulse 2s ease-in-out infinite;
    }
    
    @keyframes spotlight-pulse {
      0%, 100% {
        box-shadow: 
          0 0 0 4px var(--persona-primary, #4a6741),
          0 0 0 8px rgba(74, 103, 65, 0.2),
          0 0 30px rgba(74, 103, 65, 0.3);
      }
      50% {
        box-shadow: 
          0 0 0 4px var(--persona-primary, #4a6741),
          0 0 0 12px rgba(74, 103, 65, 0.1),
          0 0 40px rgba(74, 103, 65, 0.2);
      }
    }
    
    .feature-hint--spotlight-card .hint-content {
      max-width: 300px;
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .hint-content {
      background: var(--color-background-elevated, #70605a);
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.1);
    }
    
    [data-theme="midnight"] .hint-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .hint-message {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .hint-arrow {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .hint-close:hover {
      background: var(--color-background-secondary, #60504a);
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .feature-spotlight {
        animation: none;
      }
    }
    
    /* ========================================================================
       MOBILE
       ======================================================================== */
    @media (max-width: 480px) {
      .feature-hint--card .hint-content,
      .feature-hint--spotlight-card .hint-content {
        max-width: calc(100vw - var(--space-8, 32px));
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function destroyFeatureHints(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }

  dismissAllHints();
  container?.remove();
  styleElement?.remove();
  container = null;
  styleElement = null;
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const featureHints = {
  init: initFeatureHints,
  register: registerHint,
  show: showHint,
  dismiss: dismissHint,
  dismissAll: dismissAllHints,
  reset: resetDismissedHints,
  destroy: destroyFeatureHints,
};

export default featureHints;
