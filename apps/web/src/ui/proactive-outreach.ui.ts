/**
 * Proactive Outreach UI
 * 
 * "Better than Human" - Ferni thinks of you even when you're not talking.
 * 
 * This service displays proactive outreach notifications from Ferni:
 * - "Thinking of you" moments
 * - Growth reflections
 * - Small win celebrations
 * - Life event follow-ups
 * 
 * Philosophy: The most meaningful check-ins aren't triggered by actions -
 * they're the random "I was thinking about you" moments that show someone
 * genuinely cares.
 * 
 * @module ProactiveOutreachUI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('ProactiveOutreachUI');

// ============================================================================
// TYPES
// ============================================================================

export interface ProactiveOutreachData {
  /** Unique identifier for this outreach */
  id: string;
  /** Type of outreach */
  type: 'thinking_of_you' | 'growth_reflection' | 'celebration' | 'life_event' | 'random_warmth';
  /** The message to display */
  message: string;
  /** SSML version (for voice playback) */
  ssml?: string;
  /** Persona sending the outreach */
  personaId?: string;
  personaName?: string;
  /** Optional context about what triggered this */
  context?: string;
  /** Priority affects visual treatment */
  priority?: 'high' | 'medium' | 'low';
}

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  thoughtBubble: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`,
  sprout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 20h10"/>
    <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
    <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/>
    <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>
  </svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
  </svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </svg>`,
};

// ============================================================================
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isInitialized = false;
let currentOutreach: ProactiveOutreachData | null = null;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

// ============================================================================
// OUTREACH DISPLAY
// ============================================================================

/**
 * Show a proactive outreach notification
 */
export function showOutreach(data: ProactiveOutreachData): void {
  if (!isInitialized) {
    log.warn('ProactiveOutreachUI not initialized');
    return;
  }

  // If there's already an outreach showing, queue this one
  if (currentOutreach) {
    log.debug('Outreach already showing, dismissing previous');
    dismissOutreach();
  }

  currentOutreach = data;
  log.info({ type: data.type, personaId: data.personaId }, '💭 Showing proactive outreach');

  // Create the notification element
  const notification = createNotificationElement(data);
  container?.appendChild(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.classList.add('proactive-outreach--visible');
  });

  // Auto-dismiss after 15 seconds (unless high priority)
  const autoDismissMs = data.priority === 'high' ? 25000 : 15000;
  dismissTimeout = setTimeout(() => {
    dismissOutreach();
  }, autoDismissMs);

  // Dispatch event for other systems (e.g., to play voice)
  document.dispatchEvent(new CustomEvent('ferni:proactive-outreach', {
    detail: data
  }));
}

/**
 * Dismiss the current outreach notification
 */
export function dismissOutreach(): void {
  if (dismissTimeout) {
    clearTimeout(dismissTimeout);
    dismissTimeout = null;
  }

  const notification = container?.querySelector('.proactive-outreach');
  if (notification) {
    notification.classList.remove('proactive-outreach--visible');
    notification.classList.add('proactive-outreach--dismissing');
    
    setTimeout(() => {
      notification.remove();
    }, DURATION.SLOW);
  }

  currentOutreach = null;
}

/**
 * Create the notification DOM element
 */
function createNotificationElement(data: ProactiveOutreachData): HTMLElement {
  const notification = document.createElement('div');
  notification.className = 'proactive-outreach';
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');

  // Icon based on type (Lucide SVG icons)
  const icons: Record<string, string> = {
    thinking_of_you: ICONS.thoughtBubble,
    growth_reflection: ICONS.sprout,
    celebration: ICONS.sparkles,
    life_event: ICONS.calendar,
    random_warmth: ICONS.heart,
  };
  const icon = icons[data.type] || ICONS.thoughtBubble;

  // Header based on type
  const headers: Record<string, string> = {
    thinking_of_you: 'Thinking of you...',
    growth_reflection: 'I noticed something...',
    celebration: 'Hey, quick thing!',
    life_event: 'Checking in...',
    random_warmth: 'Just wanted to say...',
  };
  const header = headers[data.type] || 'Hey...';

  notification.innerHTML = `
    <div class="proactive-outreach__icon">${icon}</div>
    <div class="proactive-outreach__content">
      <div class="proactive-outreach__header">
        <span class="proactive-outreach__persona">${data.personaName || 'Ferni'}</span>
        <span class="proactive-outreach__title">${header}</span>
      </div>
      <p class="proactive-outreach__message">${escapeHtml(data.message)}</p>
      ${data.context ? `<p class="proactive-outreach__context">${escapeHtml(data.context)}</p>` : ''}
    </div>
    <button class="proactive-outreach__dismiss" aria-label="${t('accessibility.dismiss')}" type="button">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
    <div class="proactive-outreach__actions" role="button" tabindex="0">
      <button aria-label="${t('accessibility.letSTalk')}" class="proactive-outreach__action proactive-outreach__action--respond" type="button">
        Let's talk
      </button>
      <button aria-label="${t('accessibility.later')}" class="proactive-outreach__action proactive-outreach__action--later" type="button">
        Later
      </button>
    </div>
  `;

  // Event handlers
  notification.querySelector('.proactive-outreach__dismiss')?.addEventListener('click', () => {
    dismissOutreach();
  });

  notification.querySelector('.proactive-outreach__action--respond')?.addEventListener('click', () => {
    // Start a conversation about this outreach
    document.dispatchEvent(new CustomEvent('ferni:outreach-respond', {
      detail: { outreachId: data.id, type: data.type }
    }));
    dismissOutreach();
  });

  notification.querySelector('.proactive-outreach__action--later')?.addEventListener('click', () => {
    dismissOutreach();
  });

  return notification;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('proactive-outreach-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'proactive-outreach-styles';
  styles.textContent = `
    .proactive-outreach-container {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: var(--z-notification, 3000);
      max-width: min(360px, 100%);
      pointer-events: none;
    }

    .proactive-outreach {
      background: var(--color-bg-elevated, #2a2520);
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-md, 16px);
      box-shadow: var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.3));
      opacity: 0;
      transform: translateX(100%);
      transition: 
        opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
        transform ${DURATION.SLOW}ms ${EASING.SPRING};
      pointer-events: auto;
      border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
    }

    .proactive-outreach--visible {
      opacity: 1;
      transform: translateX(0);
    }

    .proactive-outreach--dismissing {
      opacity: 0;
      transform: translateX(100%);
    }

    .proactive-outreach__icon {
      position: absolute;
      top: var(--space-md, 16px);
      left: var(--space-md, 16px);
      width: 24px;
      height: 24px;
      color: var(--persona-primary, #4a6741);
    }

    .proactive-outreach__icon svg {
      width: 100%;
      height: 100%;
    }

    .proactive-outreach__content {
      margin-left: 40px;
      margin-right: 24px;
    }

    .proactive-outreach__header {
      display: flex;
      align-items: baseline;
      gap: var(--space-xs, 4px);
      margin-bottom: var(--space-xs, 4px);
    }

    .proactive-outreach__persona {
      font-weight: 600;
      color: var(--persona-primary, #4a6741);
      font-size: 14px;
    }

    .proactive-outreach__title {
      font-size: 13px;
      color: var(--color-text-muted, #a09080);
    }

    .proactive-outreach__message {
      color: var(--color-text-primary, #f5f1e8);
      font-size: 15px;
      line-height: 1.5;
      margin: 0 0 var(--space-xs, 4px);
    }

    .proactive-outreach__context {
      font-size: 12px;
      color: var(--color-text-dimmed, #807060);
      margin: 0;
      font-style: italic;
    }

    .proactive-outreach__dismiss {
      position: absolute;
      top: var(--space-sm, 8px);
      right: var(--space-sm, 8px);
      background: none;
      border: none;
      color: var(--color-text-muted, #a09080);
      cursor: pointer;
      padding: 4px;
      border-radius: var(--radius-sm, 4px);
      transition: color ${DURATION.FAST}ms, background ${DURATION.FAST}ms;
    }

    .proactive-outreach__dismiss:hover,
    .proactive-outreach__dismiss:focus-visible {
      color: var(--color-text-primary, #f5f1e8);
      background: rgba(255,255,255,0.1);
    }

    .proactive-outreach__actions {
      display: flex;
      gap: var(--space-sm, 8px);
      margin-top: var(--space-md, 16px);
    }

    .proactive-outreach__action {
      flex: 1;
      padding: var(--space-sm, 8px) var(--space-md, 16px);
      border-radius: var(--radius-full, 9999px);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
    }

    .proactive-outreach__action--respond {
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
    }

    .proactive-outreach__action--respond:hover,
    .proactive-outreach__action--respond:focus-visible {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }

    .proactive-outreach__action--later {
      background: transparent;
      color: var(--color-text-secondary, #d0c8c0);
      border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
    }

    .proactive-outreach__action--later:hover,
    .proactive-outreach__action--later:focus-visible {
      background: rgba(255,255,255,0.05);
      border-color: rgba(255,255,255,0.2);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .proactive-outreach {
        transition: opacity ${DURATION.SLOW}ms;
        transform: none;
      }
      .proactive-outreach--visible {
        transform: none;
      }
    }
  `;

  document.head.appendChild(styles);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the proactive outreach UI
 */
export function initProactiveOutreachUI(): void {
  if (isInitialized) return;

  // Inject styles
  injectStyles();

  // Create container
  container = document.createElement('div');
  container.className = 'proactive-outreach-container';
  document.body.appendChild(container);

  // Listen for outreach data messages
  document.addEventListener('ferni:data-message', ((event: CustomEvent) => {
    const message = event.detail;
    if (message?.type === 'proactive_outreach') {
      showOutreach(message.data as ProactiveOutreachData);
    }
  }) as EventListener);

  isInitialized = true;
  log.info('💭 Proactive outreach UI initialized');
}

/**
 * Dispose the proactive outreach UI
 */
export function disposeProactiveOutreachUI(): void {
  dismissOutreach();
  container?.remove();
  container = null;
  isInitialized = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const proactiveOutreachUI = {
  init: initProactiveOutreachUI,
  dispose: disposeProactiveOutreachUI,
  show: showOutreach,
  dismiss: dismissOutreach,
};

export default proactiveOutreachUI;






