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
import { isToastRegionEnabled } from './overlay/toast-flag.js';
import { dismissToast, showToast } from './overlay/toast-region.js';
import { ICONS } from './proactive-outreach-icons.js';

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
// STATE
// ============================================================================

let container: HTMLElement | null = null;
let isInitialized = false;
let currentOutreach: ProactiveOutreachData | null = null;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;
/** The outreach's toast while the overlay host renders it. */
let currentToastId: string | null = null;

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

  if (isToastRegionEnabled()) {
    showOutreachToast(data);
    document.dispatchEvent(new CustomEvent('ferni:proactive-outreach', { detail: data }));
    return;
  }

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

/** Overlay host on: the outreach card becomes a toast in the shared region. */
function showOutreachToast(data: ProactiveOutreachData): void {
  const id = showToast({
    title: `${data.personaName || 'Ferni'} · ${outreachHeader(data)}`,
    message: data.context ? `${data.message} ${data.context}` : data.message,
    duration: data.priority === 'high' ? 25000 : 15000,
    dismissible: true,
    action: {
      label: t('proactiveOutreach.letsTalk'),
      callback: () => {
        document.dispatchEvent(
          new CustomEvent('ferni:outreach-respond', { detail: { outreachId: data.id, type: data.type } })
        );
      },
    },
    onDismiss: () => {
      if (currentToastId === id) {
        currentToastId = null;
        currentOutreach = null;
      }
    },
  });
  currentToastId = id;
}

/**
 * Dismiss the current outreach notification
 */
export function dismissOutreach(): void {
  if (currentToastId) {
    const id = currentToastId;
    currentToastId = null;
    dismissToast(id);
  }
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

/** Header line for an outreach type ("Thinking of you..."). */
function outreachHeader(data: ProactiveOutreachData): string {
  const headerKeys: Record<string, string> = {
    thinking_of_you: 'proactiveOutreach.header.thinkingOfYou',
    growth_reflection: 'proactiveOutreach.header.growthReflection',
    celebration: 'proactiveOutreach.header.celebration',
    life_event: 'proactiveOutreach.header.lifeEvent',
    random_warmth: 'proactiveOutreach.header.randomWarmth',
  };
  return t(headerKeys[data.type] || 'proactiveOutreach.header.default');
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

  const header = outreachHeader(data);

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
      <button class="proactive-outreach__action proactive-outreach__action--respond" type="button">
        ${t('proactiveOutreach.letsTalk')}
      </button>
      <button class="proactive-outreach__action proactive-outreach__action--later" type="button">
        ${t('accessibility.later')}
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
      z-index: var(--z-notification);
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
      color: var(--persona-text, #4a6741);
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






