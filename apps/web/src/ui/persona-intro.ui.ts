/**
 * Persona Introduction Flow
 *
 * A beautiful, 3-screen guided introduction when a new team member unlocks.
 * This isn't just "content unlocked" - it's Ferni introducing you to a friend.
 *
 * FLOW:
 * 1. The Introduction - Ferni introduces the persona
 * 2. Their Specialty - What they're uniquely good at
 * 3. Getting Started - First conversation prompt
 *
 * DESIGN PHILOSOPHY:
 * - Feels like meeting a friend-of-a-friend
 * - Each persona has their own personality in the intro
 * - Builds anticipation for the first conversation
 * - Optional - user can skip to talk immediately
 *
 * BRAND COMPLIANCE:
 * - Centered floating modal with backdrop blur
 * - Lucide SVG icons only
 * - Each persona's signature color
 * - Plus Jakarta Sans display, Inter body
 * - Warm, human copy
 */

import { DURATION, EASING, STAGGER, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import {
  type TeamMemberConfig,
  TEAM_MEMBERS,
  teamUnlockService,
} from '../services/team-unlock.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('PersonaIntro');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

interface IntroStep {
  eyebrowKey: string;
  titleKey: string;
  bodyKey: string;
  buttonTextKey: string;
}

interface PersonaIntroData {
  persona: TeamMemberConfig;
  steps: IntroStep[];
  firstConversationPromptKey: string;
  funFactKey: string;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  messageCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
};

// ============================================================================
// PERSONA COLORS
// ============================================================================

// Default Ferni colors (fallback)
const DEFAULT_PERSONA_COLORS = {
  primary: 'var(--persona-primary, #4a6741)',
  secondary: 'var(--persona-secondary, #3d5a35)',
  tint: 'var(--persona-tint, rgba(74, 103, 65, 0.06))',
};

// Persona colors - use CSS variables from data-persona attribute
// See design-system/tokens/colors.json for source of truth
const PERSONA_COLORS: Record<string, typeof DEFAULT_PERSONA_COLORS> = {
  ferni: DEFAULT_PERSONA_COLORS,
  'maya-santos': {
    primary: 'var(--persona-primary, #a67a6a)',
    secondary: 'var(--persona-secondary, #8a635a)',
    tint: 'var(--persona-tint, rgba(166, 122, 106, 0.06))',
  },
  'peter-john': {
    primary: 'var(--persona-primary, #3a6b73)',
    secondary: 'var(--persona-secondary, #2d5359)',
    tint: 'var(--persona-tint, rgba(58, 107, 115, 0.06))',
  },
  'alex-chen': {
    primary: 'var(--persona-primary, #5a6b8a)',
    secondary: 'var(--persona-secondary, #4a5a73)',
    tint: 'var(--persona-tint, rgba(90, 107, 138, 0.06))',
  },
  'jordan-taylor': {
    primary: 'var(--persona-primary, #c4856a)',
    secondary: 'var(--persona-secondary, #a86d55)',
    tint: 'var(--persona-tint, rgba(196, 133, 106, 0.06))',
  },
  'nayan-patel': {
    primary: 'var(--persona-primary, #b8956a)',
    secondary: 'var(--persona-secondary, #9a7a52)',
    tint: 'var(--persona-tint, rgba(184, 149, 106, 0.06))',
  },
};

// ============================================================================
// PERSONA-SPECIFIC INTRO CONTENT
// ============================================================================

const PERSONA_INTROS: Record<string, Omit<PersonaIntroData, 'persona'>> = {
  'maya-santos': {
    steps: [
      {
        eyebrowKey: 'personaIntro.maya.step1.eyebrow',
        titleKey: 'personaIntro.maya.step1.title',
        bodyKey: 'personaIntro.maya.step1.body',
        buttonTextKey: 'personaIntro.maya.step1.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.maya.step2.eyebrow',
        titleKey: 'personaIntro.maya.step2.title',
        bodyKey: 'personaIntro.maya.step2.body',
        buttonTextKey: 'personaIntro.maya.step2.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.maya.step3.eyebrow',
        titleKey: 'personaIntro.maya.step3.title',
        bodyKey: 'personaIntro.maya.step3.body',
        buttonTextKey: 'personaIntro.maya.step3.buttonText',
      },
    ],
    firstConversationPromptKey: 'personaIntro.maya.firstConversationPrompt',
    funFactKey: 'personaIntro.maya.funFact',
  },

  'peter-john': {
    steps: [
      {
        eyebrowKey: 'personaIntro.peter.step1.eyebrow',
        titleKey: 'personaIntro.peter.step1.title',
        bodyKey: 'personaIntro.peter.step1.body',
        buttonTextKey: 'personaIntro.peter.step1.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.peter.step2.eyebrow',
        titleKey: 'personaIntro.peter.step2.title',
        bodyKey: 'personaIntro.peter.step2.body',
        buttonTextKey: 'personaIntro.peter.step2.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.peter.step3.eyebrow',
        titleKey: 'personaIntro.peter.step3.title',
        bodyKey: 'personaIntro.peter.step3.body',
        buttonTextKey: 'personaIntro.peter.step3.buttonText',
      },
    ],
    firstConversationPromptKey: 'personaIntro.peter.firstConversationPrompt',
    funFactKey: 'personaIntro.peter.funFact',
  },

  'alex-chen': {
    steps: [
      {
        eyebrowKey: 'personaIntro.alex.step1.eyebrow',
        titleKey: 'personaIntro.alex.step1.title',
        bodyKey: 'personaIntro.alex.step1.body',
        buttonTextKey: 'personaIntro.alex.step1.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.alex.step2.eyebrow',
        titleKey: 'personaIntro.alex.step2.title',
        bodyKey: 'personaIntro.alex.step2.body',
        buttonTextKey: 'personaIntro.alex.step2.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.alex.step3.eyebrow',
        titleKey: 'personaIntro.alex.step3.title',
        bodyKey: 'personaIntro.alex.step3.body',
        buttonTextKey: 'personaIntro.alex.step3.buttonText',
      },
    ],
    firstConversationPromptKey: 'personaIntro.alex.firstConversationPrompt',
    funFactKey: 'personaIntro.alex.funFact',
  },

  'jordan-taylor': {
    steps: [
      {
        eyebrowKey: 'personaIntro.jordan.step1.eyebrow',
        titleKey: 'personaIntro.jordan.step1.title',
        bodyKey: 'personaIntro.jordan.step1.body',
        buttonTextKey: 'personaIntro.jordan.step1.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.jordan.step2.eyebrow',
        titleKey: 'personaIntro.jordan.step2.title',
        bodyKey: 'personaIntro.jordan.step2.body',
        buttonTextKey: 'personaIntro.jordan.step2.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.jordan.step3.eyebrow',
        titleKey: 'personaIntro.jordan.step3.title',
        bodyKey: 'personaIntro.jordan.step3.body',
        buttonTextKey: 'personaIntro.jordan.step3.buttonText',
      },
    ],
    firstConversationPromptKey: 'personaIntro.jordan.firstConversationPrompt',
    funFactKey: 'personaIntro.jordan.funFact',
  },

  'nayan-patel': {
    steps: [
      {
        eyebrowKey: 'personaIntro.nayan.step1.eyebrow',
        titleKey: 'personaIntro.nayan.step1.title',
        bodyKey: 'personaIntro.nayan.step1.body',
        buttonTextKey: 'personaIntro.nayan.step1.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.nayan.step2.eyebrow',
        titleKey: 'personaIntro.nayan.step2.title',
        bodyKey: 'personaIntro.nayan.step2.body',
        buttonTextKey: 'personaIntro.nayan.step2.buttonText',
      },
      {
        eyebrowKey: 'personaIntro.nayan.step3.eyebrow',
        titleKey: 'personaIntro.nayan.step3.title',
        bodyKey: 'personaIntro.nayan.step3.body',
        buttonTextKey: 'personaIntro.nayan.step3.buttonText',
      },
    ],
    firstConversationPromptKey: 'personaIntro.nayan.firstConversationPrompt',
    funFactKey: 'personaIntro.nayan.funFact',
  },
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;
let currentStep = 0;
let currentPersona: TeamMemberConfig | null = null;
let currentIntroData: PersonaIntroData | null = null;
let introShownFor: Set<string> = new Set();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the persona introduction system.
 * Subscribes to team unlock events.
 */
export function initPersonaIntro(): void {
  if (isInitialized) return;

  cleanupOrphanedElements();
  injectStyles();
  loadShownIntros();

  // Subscribe to unlock events - gate through modal coordinator
  teamUnlockService.onUnlock((member) => {
    // Skip if already shown or no intro data
    if (introShownFor.has(member.id) || !PERSONA_INTROS[member.id]) {
      log.debug('Skipping persona intro - already shown or no data');
      return;
    }

    // Gate through modal coordinator - don't show during conversation
    // and respect cooldown between modals
    const canShow = modalCoordinator.request(
      `persona-intro-${member.id}`,
      'high',
      () => showPersonaIntroInternal(member.id),
      { requireMinConversations: 2 }
    );

    if (!canShow) {
      log.debug('Persona intro blocked by modal coordinator', { personaId: member.id });
    }
  });

  isInitialized = true;
  log.debug('Persona intro system initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.persona-intro-modal').forEach((el) => el.remove());
  document.querySelectorAll('#persona-intro-styles').forEach((el) => el.remove());
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the persona introduction flow.
 * Public API - goes through modal coordinator.
 */
export function showPersonaIntro(personaId: string): void {
  const canShow = modalCoordinator.request(
    `persona-intro-${personaId}`,
    'high',
    () => showPersonaIntroInternal(personaId),
    { requireMinConversations: 2 }
  );

  if (!canShow) {
    log.debug('Persona intro blocked by modal coordinator', { personaId });
  }
}

/**
 * Internal function to actually show the intro (called by modal coordinator).
 */
function showPersonaIntroInternal(personaId: string): void {
  const persona = TEAM_MEMBERS.find((m) => m.id === personaId);
  const introContent = PERSONA_INTROS[personaId];

  if (!persona || !introContent) {
    log.warn('No intro data for persona', { personaId });
    modalCoordinator.release(`persona-intro-${personaId}`);
    return;
  }

  currentPersona = persona;
  currentIntroData = { persona, ...introContent };
  currentStep = 0;

  if (modal) {
    modal.remove();
  }

  modal = createModal();
  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('persona-intro-modal--visible');
    renderStep();
  });

  log.info('Showing persona intro', { personaId });
}

/**
 * Hide the intro modal.
 */
export function hidePersonaIntro(): void {
  if (!modal) return;

  modal.classList.remove('persona-intro-modal--visible');

  // Release modal coordinator lock
  if (currentPersona) {
    modalCoordinator.release(`persona-intro-${currentPersona.id}`);
  }

  trackedTimeout(() => {
    modal?.remove();
    modal = null;
    currentPersona = null;
    currentIntroData = null;
    currentStep = 0;
  }, DURATION.SLOW);
}

/**
 * Go to next step or finish.
 */
export function nextStep(): void {
  if (!currentIntroData) return;

  if (currentStep < currentIntroData.steps.length - 1) {
    currentStep++;
    renderStep();
  } else {
    finishIntro();
  }
}

/**
 * Go to previous step.
 */
export function prevStep(): void {
  if (currentStep > 0) {
    currentStep--;
    renderStep();
  }
}

/**
 * Skip the intro and start talking.
 */
export function skipIntro(): void {
  markIntroShown();
  hidePersonaIntro();

  // Switch to the persona
  if (currentPersona) {
    window.dispatchEvent(
      new CustomEvent('ferni:switch-persona', {
        detail: { personaId: currentPersona.id },
      })
    );
  }
}

/**
 * Finish the intro and start the first conversation.
 */
function finishIntro(): void {
  markIntroShown();
  hidePersonaIntro();

  // Switch to the persona with the first conversation prompt
  if (currentPersona && currentIntroData) {
    window.dispatchEvent(
      new CustomEvent('ferni:switch-persona', {
        detail: {
          personaId: currentPersona.id,
          initialPrompt: t(currentIntroData.firstConversationPromptKey),
        },
      })
    );
  }
}

// ============================================================================
// MODAL CREATION & RENDERING
// ============================================================================

function createModal(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'persona-intro-modal';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'persona-intro-title');

  container.innerHTML = `
    <div class="persona-intro-backdrop"></div>
    <div class="persona-intro-card">
      <button class="persona-intro-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>
      <div class="persona-intro-content"></div>
    </div>
  `;

  // Event listeners
  const backdrop = container.querySelector('.persona-intro-backdrop');
  backdrop?.addEventListener('click', skipIntro);

  const closeBtn = container.querySelector('.persona-intro-close');
  closeBtn?.addEventListener('click', skipIntro);

  // Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      skipIntro();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  return container;
}

function renderStep(): void {
  if (!modal || !currentIntroData || !currentPersona) return;

  const content = modal.querySelector('.persona-intro-content');
  if (!content) return;

  const step = currentIntroData.steps[currentStep];
  if (!step) return;

  const colors = PERSONA_COLORS[currentPersona.id] ?? DEFAULT_PERSONA_COLORS;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === currentIntroData.steps.length - 1;
  const initials = getInitials(currentPersona.displayName);

  content.innerHTML = `
    <!-- Avatar -->
    <div class="persona-intro-avatar" style="background: ${colors.primary}">
      <span class="avatar-initials">${initials}</span>
      <div class="avatar-glow" style="background: ${colors.primary}"></div>
    </div>
    
    <!-- Step indicators -->
    <div class="persona-intro-steps">
      ${currentIntroData.steps
        .map(
          (_, i) => `
        <span class="step-dot ${i === currentStep ? 'step-dot--active' : ''} ${i < currentStep ? 'step-dot--complete' : ''}"
              style="--active-color: ${colors.primary}"></span>
      `
        )
        .join('')}
    </div>
    
    <!-- Content -->
    <span class="persona-intro-eyebrow" style="color: ${colors.primary}">${t(step.eyebrowKey)}</span>
    <h2 id="persona-intro-title" class="persona-intro-title">${t(step.titleKey)}</h2>
    <p class="persona-intro-body">${t(step.bodyKey)}</p>
    
    <!-- Fun fact on first step -->
    ${
      isFirstStep
        ? `
      <div class="persona-intro-funfact" style="background: ${colors.tint}; border-color: ${colors.primary}">
        <span class="funfact-icon">${ICONS.sparkles}</span>
        <p>${t(currentIntroData.funFactKey)}</p>
      </div>
    `
        : ''
    }
    
    <!-- Actions -->
    <div class="persona-intro-actions" role="button" tabindex="0">
      ${
        !isFirstStep
          ? `
        <button aria-label="${t('accessibility.back')}" class="persona-intro-btn persona-intro-btn--secondary" data-action="prev">
          Back
        </button>
      `
          : `
        <button aria-label="${t('accessibility.skipIntro')}" class="persona-intro-btn persona-intro-btn--secondary" data-action="skip">
          Skip intro
        </button>
      `
      }
      <button aria-label="${t('accessibility.goForward')}" class="persona-intro-btn persona-intro-btn--primary" data-action="next" style="background: ${colors.primary}">
        ${isLastStep ? ICONS.messageCircle : ''}
        <span>${t(step.buttonTextKey)}</span>
        ${!isLastStep ? ICONS.arrowRight : ''}
      </button>
    </div>
  `;

  // Event listeners
  const prevBtn = content.querySelector('[data-action="prev"]');
  prevBtn?.addEventListener('click', prevStep);

  const skipBtn = content.querySelector('[data-action="skip"]');
  skipBtn?.addEventListener('click', skipIntro);

  const nextBtn = content.querySelector('[data-action="next"]');
  nextBtn?.addEventListener('click', nextStep);

  // Animate
  animateStepIn(content);
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateStepIn(content: Element): void {
  if (prefersReducedMotion()) return;

  const avatar = content.querySelector('.persona-intro-avatar');
  const eyebrow = content.querySelector('.persona-intro-eyebrow');
  const title = content.querySelector('.persona-intro-title');
  const body = content.querySelector('.persona-intro-body');
  const funfact = content.querySelector('.persona-intro-funfact');
  const actions = content.querySelector('.persona-intro-actions');

  const elements = [avatar, eyebrow, title, body, funfact, actions].filter(Boolean);

  elements.forEach((el, i) => {
    if (el instanceof HTMLElement) {
      el.animate(
        [
          { opacity: 0, transform: 'translateY(20px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: DURATION.DELIBERATE,
          easing: EASING.EXPO_OUT,
          delay: i * STAGGER.TIGHT,
          fill: 'forwards',
        }
      );
    }
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function markIntroShown(): void {
  if (currentPersona) {
    introShownFor.add(currentPersona.id);
    saveShownIntros();
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'ferni_persona_intros_shown';

function loadShownIntros(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      introShownFor = new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore
  }
}

function saveShownIntros(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(introShownFor)));
  } catch {
    // Ignore
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('persona-intro-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'persona-intro-styles';
  styleElement.textContent = `
    /* ========================================================================
       PERSONA INTRO MODAL
       ======================================================================== */
    .persona-intro-modal {
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
    
    .persona-intro-modal--visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .persona-intro-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }

    .persona-intro-card {
      position: relative;
      background: var(--color-bg-elevated, #FFFDFB);
      border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      max-width: clamp(322px, 90vw, 460px);
      width: 100%;
      max-height: calc(100vh - var(--space-8, 32px));
      overflow-y: auto;
      padding: var(--space-8, 32px);
      text-align: center;
    }
    
    /* Close button */
    .persona-intro-close {
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
      z-index: var(--z-docked);
    }
    
    .persona-intro-close:hover {
      background: var(--color-background-tertiary, #E8E0D5);
      color: var(--color-text-primary, #2C2520);
    }
    
    .persona-intro-close svg {
      width: 20px;
      height: 20px;
    }
    
    /* Avatar */
    .persona-intro-avatar {
      position: relative;
      width: min(100px, 100%);
      height: 100px;
      margin: 0 auto var(--space-4, 16px);
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
    }
    
    .avatar-initials {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 2.5rem;
      font-weight: 700;
      color: white;
      letter-spacing: -0.02em;
      position: relative;
      z-index: var(--z-docked);
    }
    
    .avatar-glow {
      position: absolute;
      inset: -10px;
      border-radius: var(--radius-full, 9999px);
      opacity: 0.3;
      filter: blur(20px);
      animation: avatar-pulse 3s ease-in-out infinite;
    }
    
    @keyframes avatar-pulse {
      0%, 100% { transform: scale(1); opacity: 0.3; }
      50% { transform: scale(1.1); opacity: 0.5; }
    }
    
    /* Step indicators */
    .persona-intro-steps {
      display: flex;
      justify-content: center;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-4, 16px);
    }
    
    .step-dot {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 9999px);
      background: var(--color-border-medium, rgba(44, 37, 32, 0.15));
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .step-dot--active {
      width: 24px;
      background: var(--active-color, var(--persona-primary, #4a6741));
    }
    
    .step-dot--complete {
      background: var(--active-color, var(--persona-primary, #4a6741));
      opacity: 0.5;
    }
    
    /* Content */
    .persona-intro-eyebrow {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.15em;
      margin-bottom: var(--space-2, 8px);
      opacity: 0;
    }
    
    .persona-intro-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-2xl, 28px);
      font-weight: var(--font-weight-bold, 700);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-3, 12px);
      line-height: var(--leading-tight, 1.2);
      opacity: 0;
    }
    
    .persona-intro-body {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-base, 16px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0 0 var(--space-5, 20px);
      line-height: var(--leading-relaxed, 1.6);
      opacity: 0;
    }
    
    /* Fun fact */
    .persona-intro-funfact {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      border-radius: var(--radius-lg, 12px);
      border-left: 3px solid;
      text-align: left;
      margin-bottom: var(--space-5, 20px);
      opacity: 0;
    }
    
    .funfact-icon {
      flex-shrink: 0;
      color: inherit;
      opacity: 0.7;
    }
    
    .funfact-icon svg {
      width: 20px;
      height: 20px;
    }
    
    .persona-intro-funfact p {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
      line-height: var(--leading-relaxed, 1.5);
      font-style: italic;
    }
    
    /* Actions */
    .persona-intro-actions {
      display: flex;
      gap: var(--space-3, 12px);
      opacity: 0;
    }
    
    .persona-intro-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px);
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: var(--font-weight-semibold, 600);
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .persona-intro-btn svg {
      width: 18px;
      height: 18px;
    }
    
    .persona-intro-btn--primary {
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
    }
    
    .persona-intro-btn--primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(74, 103, 65, 0.4);
    }
    
    .persona-intro-btn--secondary {
      background: transparent;
      color: var(--color-text-secondary, #5C544A);
      border: 2px solid var(--color-border-medium, #d4d0c8);
    }
    
    .persona-intro-btn--secondary:hover {
      background: var(--color-background-secondary, #F5F1E8);
      border-color: var(--color-text-muted, #756A5E);
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .persona-intro-backdrop {
      background: rgba(20, 18, 16, 0.9);
    }
    
    [data-theme="midnight"] .persona-intro-card {
      background: var(--color-background-elevated, #70605a);
    }
    
    [data-theme="midnight"] .persona-intro-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .persona-intro-body,
    [data-theme="midnight"] .persona-intro-funfact p {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .persona-intro-close {
      background: var(--color-background-secondary, #60504a);
    }
    
    [data-theme="midnight"] .persona-intro-btn--secondary {
      color: var(--color-text-secondary, #f0ebe4);
      border-color: var(--color-border-medium, #80706a);
    }
    
    [data-theme="midnight"] .persona-intro-btn--secondary:hover {
      background: var(--color-background-secondary, #60504a);
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .persona-intro-modal {
        transition: opacity ${DURATION.FAST}ms linear;
      }
      
      .avatar-glow {
        animation: none;
      }
      
      .persona-intro-avatar,
      .persona-intro-eyebrow,
      .persona-intro-title,
      .persona-intro-body,
      .persona-intro-funfact,
      .persona-intro-actions {
        opacity: 1 !important;
      }
    }
    
    /* ========================================================================
       MOBILE
       ======================================================================== */
    @media (max-width: clamp(336px, 90vw, 480px)) {
      .persona-intro-card {
        padding: var(--space-6, 24px);
      }
      
      .persona-intro-avatar {
        width: 80px;
        height: 80px;
      }
      
      .avatar-initials {
        font-size: 2rem;
      }
      
      .persona-intro-title {
        font-size: var(--text-xl, 24px);
      }
      
      .persona-intro-actions {
        flex-direction: column-reverse;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const personaIntro = {
  init: initPersonaIntro,
  show: showPersonaIntro,
  hide: hidePersonaIntro,
  next: nextStep,
  prev: prevStep,
  skip: skipIntro,
};

export default personaIntro;
