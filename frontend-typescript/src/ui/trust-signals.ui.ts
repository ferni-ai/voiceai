/**
 * Trust Signals UI - "Ferni Noticed..."
 *
 * Surfaces the backend trust systems to users in a delightful, non-intrusive way.
 * Shows when Ferni notices something meaningful:
 * - Growth moments ("I noticed you handled that differently...")
 * - Boundaries respected ("I remember you said...")
 * - Callbacks to shared history ("Remember when...")
 * - Small wins celebrated ("You actually did it!")
 *
 * DESIGN PHILOSOPHY:
 * - Feels like a friend remembering something meaningful
 * - Non-intrusive - appears as floating cards, not modals
 * - Dismissible but memorable
 * - Progressive disclosure based on relationship stage
 *
 * BRAND COMPLIANCE:
 * - Warm, human messaging
 * - Lucide SVG icons only
 * - Ferni's sage green palette
 * - Subtle, organic animations
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import {
  relationshipStageService,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TrustSignals');

// ============================================================================
// TYPES
// ============================================================================

export type TrustSignalType =
  | 'growth' // Noticed personal growth
  | 'boundary' // Respecting a boundary
  | 'callback' // Shared history reference
  | 'small_win' // Celebrating effort
  | 'thinking_of_you' // Proactive care
  | 'reading_lines'; // Noticed unspoken emotion

export interface TrustSignal {
  id: string;
  type: TrustSignalType;
  title: string;
  message: string;
  timestamp: number;
  personaId?: string;
  dismissed?: boolean;
}

interface TrustSignalsConfig {
  maxVisible: number;
  autoHideAfter: number;
  minStage: RelationshipStage;
}

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  leaf: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
  messageHeart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.3-.4a2.5 2.5 0 0 0-3.5 0 2.5 2.5 0 0 0 0 3.5l3.8 3.8 3.8-3.8a2.5 2.5 0 0 0 0-3.5Z"/></svg>`,
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  heart: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`,
};

// ============================================================================
// SIGNAL TYPE CONFIG
// ============================================================================

const SIGNAL_CONFIG: Record<
  TrustSignalType,
  {
    icon: string;
    color: string;
    prefix: string;
  }
> = {
  growth: {
    icon: ICONS.leaf,
    color: 'var(--color-semantic-success, #4a8560)',
    prefix: 'Ferni noticed',
  },
  boundary: {
    icon: ICONS.shield,
    color: 'var(--persona-primary, #4a6741)',
    prefix: 'Ferni remembers',
  },
  callback: {
    icon: ICONS.messageHeart,
    color: 'var(--persona-peter-primary, #3a6b73)',
    prefix: 'Remember when',
  },
  small_win: {
    icon: ICONS.trophy,
    color: 'var(--color-semantic-warning, #c49a6c)',
    prefix: 'You did it',
  },
  thinking_of_you: {
    icon: ICONS.heart,
    color: 'var(--persona-maya-primary, #a67a6a)',
    prefix: 'Just thinking',
  },
  reading_lines: {
    icon: ICONS.eye,
    color: 'var(--persona-alex-primary, #5a6b8a)',
    prefix: 'Ferni senses',
  },
};

// ============================================================================
// DEFAULTS
// ============================================================================

const DEFAULT_CONFIG: TrustSignalsConfig = {
  maxVisible: 3,
  autoHideAfter: 8000,
  minStage: 'building-trust', // Only show after relationship develops
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;
let config = { ...DEFAULT_CONFIG };
let signalQueue: TrustSignal[] = [];
let visibleSignals: Map<string, HTMLElement> = new Map();
let dismissedSignals: Set<string> = new Set();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the trust signals UI.
 */
export function initTrustSignals(customConfig?: Partial<TrustSignalsConfig>): void {
  if (isInitialized) return;

  cleanupOrphanedElements();
  injectStyles();
  createContainer();

  if (customConfig) {
    config = { ...config, ...customConfig };
  }

  // Load dismissed signals from storage
  loadDismissedSignals();

  // Listen for trust signal events from backend
  window.addEventListener('ferni:trust-signal', handleTrustSignalEvent as EventListener);

  isInitialized = true;
  log.debug('Trust signals UI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.trust-signals-container').forEach((el) => el.remove());
  document.querySelectorAll('#trust-signals-styles').forEach((el) => el.remove());
}

function createContainer(): void {
  container = document.createElement('div');
  container.className = 'trust-signals-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-label', 'Ferni observations');
  document.body.appendChild(container);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show a trust signal to the user.
 * Gated on 5+ conversations - trust signals are for established relationships.
 */
export function showTrustSignal(signal: Omit<TrustSignal, 'id' | 'timestamp'>): void {
  // FIRST CONVERSATION IS ONBOARDING - no trust signals until 5+ conversations
  if (!modalCoordinator.hasMinimumConversations(5)) {
    log.debug('Trust signal hidden - need 5+ conversations first');
    return;
  }

  // Don't show during active conversation
  if (modalCoordinator.isConversationActive()) {
    log.debug('Trust signal hidden - conversation active');
    return;
  }

  // Check relationship stage
  const currentStage = relationshipStageService.getStage();
  if (!isStageAtOrBeyond(currentStage, config.minStage)) {
    log.debug('Trust signal hidden - relationship not yet at required stage');
    return;
  }

  // Generate ID
  const fullSignal: TrustSignal = {
    ...signal,
    id: `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
  };

  // Check if already dismissed (same type + similar message)
  const signalKey = `${signal.type}:${signal.title}`;
  if (dismissedSignals.has(signalKey)) {
    log.debug('Trust signal already dismissed by user');
    return;
  }

  // Add to queue
  signalQueue.push(fullSignal);
  processQueue();

  log.info('Trust signal shown', { type: signal.type, title: signal.title });
}

/**
 * Dismiss a specific signal.
 */
export function dismissSignal(signalId: string): void {
  const element = visibleSignals.get(signalId);
  if (!element) return;

  animateOut(element).then(() => {
    element.remove();
    visibleSignals.delete(signalId);

    // Find and mark as dismissed
    const signal = signalQueue.find((s) => s.id === signalId);
    if (signal) {
      const signalKey = `${signal.type}:${signal.title}`;
      dismissedSignals.add(signalKey);
      saveDismissedSignals();
    }

    processQueue();
  });
}

/**
 * Dismiss all visible signals.
 */
export function dismissAllSignals(): void {
  visibleSignals.forEach((element, id) => {
    dismissSignal(id);
  });
}

/**
 * Manually trigger common trust signals for testing.
 */
export const trustSignalHelpers = {
  growthMoment: (observation: string) =>
    showTrustSignal({
      type: 'growth',
      title: 'Something different',
      message: observation,
    }),

  boundaryRespected: (boundary: string) =>
    showTrustSignal({
      type: 'boundary',
      title: "I won't forget",
      message: boundary,
    }),

  sharedMemory: (memory: string) =>
    showTrustSignal({
      type: 'callback',
      title: 'A shared moment',
      message: memory,
    }),

  smallWin: (win: string) =>
    showTrustSignal({
      type: 'small_win',
      title: 'Look at you',
      message: win,
    }),

  thinkingOfYou: (thought: string) =>
    showTrustSignal({
      type: 'thinking_of_you',
      title: 'About you',
      message: thought,
    }),

  readingBetweenLines: (observation: string) =>
    showTrustSignal({
      type: 'reading_lines',
      title: "What I'm hearing",
      message: observation,
    }),
};

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleTrustSignalEvent(event: CustomEvent<TrustSignal>): void {
  if (event.detail) {
    showTrustSignal(event.detail);
  }
}

// ============================================================================
// QUEUE PROCESSING
// ============================================================================

function processQueue(): void {
  // Remove any that are already visible
  signalQueue = signalQueue.filter((s) => !visibleSignals.has(s.id));

  // Show signals up to max
  while (signalQueue.length > 0 && visibleSignals.size < config.maxVisible) {
    const signal = signalQueue.shift();
    if (signal) {
      displaySignal(signal);
    }
  }
}

function displaySignal(signal: TrustSignal): void {
  if (!container) return;

  const element = createSignalElement(signal);
  container.appendChild(element);
  visibleSignals.set(signal.id, element);

  // Animate in
  animateIn(element);

  // Auto-hide after delay
  setTimeout(() => {
    if (visibleSignals.has(signal.id)) {
      dismissSignal(signal.id);
    }
  }, config.autoHideAfter);
}

// ============================================================================
// ELEMENT CREATION
// ============================================================================

function createSignalElement(signal: TrustSignal): HTMLElement {
  const signalConfig = SIGNAL_CONFIG[signal.type];

  const element = document.createElement('div');
  element.className = `trust-signal trust-signal--${signal.type}`;
  element.setAttribute('role', 'status');
  element.setAttribute('data-signal-id', signal.id);

  element.innerHTML = `
    <div class="trust-signal-icon" style="background: ${signalConfig.color}">
      ${signalConfig.icon}
    </div>
    <div class="trust-signal-content">
      <span class="trust-signal-prefix">${signalConfig.prefix}</span>
      <p class="trust-signal-title">${escapeHtml(signal.title)}</p>
      <p class="trust-signal-message">${escapeHtml(signal.message)}</p>
    </div>
    <button class="trust-signal-close" aria-label="${t('accessibility.dismiss')}">
      ${ICONS.close}
    </button>
  `;

  // Close button handler
  const closeBtn = element.querySelector('.trust-signal-close');
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissSignal(signal.id);
  });

  return element;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateIn(element: HTMLElement): void {
  if (prefersReducedMotion()) {
    element.style.opacity = '1';
    element.style.transform = 'translateX(0)';
    return;
  }

  element.animate(
    [
      { opacity: 0, transform: 'translateX(100%)' },
      { opacity: 1, transform: 'translateX(0)' },
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
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(100%)' },
      ],
      {
        duration: DURATION.SLOW,
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const STORAGE_KEY = 'ferni_dismissed_trust_signals';

function loadDismissedSignals(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      dismissedSignals = new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore storage errors
  }
}

function saveDismissedSignals(): void {
  try {
    // Only keep last 100 dismissed signals
    const arr = Array.from(dismissedSignals).slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage errors
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('trust-signals-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'trust-signals-styles';
  styleElement.textContent = `
    /* ========================================================================
       TRUST SIGNALS CONTAINER
       ======================================================================== */
    .trust-signals-container {
      position: fixed;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      z-index: var(--z-toast, 8000);
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      max-width: 380px;
      width: calc(100vw - var(--space-8, 32px));
      pointer-events: none;
    }
    
    /* ========================================================================
       TRUST SIGNAL CARD
       ======================================================================== */
    .trust-signal {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3, 12px);
      padding: var(--space-4, 16px);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-xl, 16px);
      box-shadow: 
        0 8px 24px rgba(44, 37, 32, 0.15),
        0 2px 8px rgba(44, 37, 32, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.8);
      pointer-events: auto;
      opacity: 0;
      transform: translateX(100%);
    }
    
    /* Icon */
    .trust-signal-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full, 9999px);
      color: white;
      flex-shrink: 0;
    }
    
    .trust-signal-icon svg {
      width: 20px;
      height: 20px;
    }
    
    /* Content */
    .trust-signal-content {
      flex: 1;
      min-width: 0;
    }
    
    .trust-signal-prefix {
      display: block;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-xs, 12px);
      font-weight: var(--font-weight-bold, 700);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted, #756A5E);
      margin-bottom: var(--space-1, 4px);
    }
    
    .trust-signal-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: var(--text-base, 16px);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
      line-height: var(--leading-tight, 1.3);
    }
    
    .trust-signal-message {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: var(--text-sm, 14px);
      color: var(--color-text-secondary, #5C544A);
      margin: 0;
      line-height: var(--leading-relaxed, 1.5);
    }
    
    /* Close button */
    .trust-signal-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 9999px);
      color: var(--color-text-muted, #756A5E);
      cursor: pointer;
      flex-shrink: 0;
      opacity: 0.5;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .trust-signal-close:hover {
      background: var(--color-background-secondary, #F5F1E8);
      color: var(--color-text-primary, #2C2520);
      opacity: 1;
    }
    
    .trust-signal-close svg {
      width: 16px;
      height: 16px;
    }
    
    /* Type-specific accents */
    .trust-signal--growth {
      border-left: 3px solid var(--color-semantic-success, #4a8560);
    }
    
    .trust-signal--boundary {
      border-left: 3px solid var(--persona-primary, #4a6741);
    }
    
    .trust-signal--callback {
      border-left: 3px solid var(--persona-peter-primary, #3a6b73);
    }
    
    .trust-signal--small_win {
      border-left: 3px solid var(--color-semantic-warning, #c49a6c);
    }
    
    .trust-signal--thinking_of_you {
      border-left: 3px solid var(--persona-maya-primary, #a67a6a);
    }
    
    .trust-signal--reading_lines {
      border-left: 3px solid var(--persona-alex-primary, #5a6b8a);
    }
    
    /* ========================================================================
       DARK THEME
       ======================================================================== */
    [data-theme="midnight"] .trust-signal {
      background: var(--color-background-elevated, #70605a);
      box-shadow: 
        0 8px 24px rgba(0, 0, 0, 0.3),
        0 2px 8px rgba(0, 0, 0, 0.2),
        0 0 0 1px rgba(255, 255, 255, 0.1);
    }
    
    [data-theme="midnight"] .trust-signal-title {
      color: var(--color-text-primary, #faf6f0);
    }
    
    [data-theme="midnight"] .trust-signal-message {
      color: var(--color-text-secondary, #f0ebe4);
    }
    
    [data-theme="midnight"] .trust-signal-close:hover {
      background: var(--color-background-secondary, #60504a);
    }
    
    /* ========================================================================
       REDUCED MOTION
       ======================================================================== */
    @media (prefers-reduced-motion: reduce) {
      .trust-signal {
        opacity: 1;
        transform: none;
      }
    }
    
    /* ========================================================================
       MOBILE
       ======================================================================== */
    @media (max-width: 480px) {
      .trust-signals-container {
        top: auto;
        bottom: var(--space-20, 80px);
        right: var(--space-3, 12px);
        left: var(--space-3, 12px);
        max-width: none;
        width: auto;
      }
      
      .trust-signal {
        padding: var(--space-3, 12px);
      }
      
      .trust-signal-icon {
        width: 36px;
        height: 36px;
      }
      
      .trust-signal-icon svg {
        width: 18px;
        height: 18px;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// CLEANUP
// ============================================================================

export function destroyTrustSignals(): void {
  window.removeEventListener('ferni:trust-signal', handleTrustSignalEvent as EventListener);
  container?.remove();
  styleElement?.remove();
  container = null;
  styleElement = null;
  isInitialized = false;
  signalQueue = [];
  visibleSignals.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trustSignalsUI = {
  init: initTrustSignals,
  show: showTrustSignal,
  dismiss: dismissSignal,
  dismissAll: dismissAllSignals,
  helpers: trustSignalHelpers,
  destroy: destroyTrustSignals,
};

export default trustSignalsUI;
