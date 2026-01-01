/**
 * Memory Feedback UI
 *
 * Subtle, non-intrusive feedback mechanism for surfaced memories.
 * Enables the learning engine to improve memory surfacing over time.
 *
 * DESIGN PHILOSOPHY:
 * - Appears subtly after Ferni surfaces a memory
 * - Quick single-tap feedback (helpful / not helpful)
 * - Fades automatically if not interacted with
 * - Collects data without disrupting conversation flow
 *
 * @module @ferni/memory-feedback
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './toast.ui.js';

const log = createLogger('MemoryFeedback');

// ============================================================================
// TYPES
// ============================================================================

export type FeedbackAction = 'helpful' | 'not_helpful' | 'dismiss';

export interface MemoryFeedbackConfig {
  memoryId: string;
  memoryContent: string;
  userId: string;
  sessionId?: string;
  personaId?: string;
}

interface ActiveFeedbackPrompt {
  id: string;
  element: HTMLElement;
  config: MemoryFeedbackConfig;
  timeout?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// ICONS (Lucide-style SVGs)
// ============================================================================

const ICON_THUMBS_UP = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;

const ICON_THUMBS_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`;

const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;

// ============================================================================
// MEMORY FEEDBACK MANAGER
// ============================================================================

export class MemoryFeedbackManager {
  private activePrompt: ActiveFeedbackPrompt | null = null;
  private idCounter = 0;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    this.cleanupOrphanedElements();
    this.injectStyles();
  }

  /**
   * Show feedback prompt for a surfaced memory
   */
  show(config: MemoryFeedbackConfig): void {
    // Don't stack prompts - replace existing one
    if (this.activePrompt) {
      this.dismiss();
    }

    const id = `memory-feedback-${++this.idCounter}`;
    const element = this.createElement(id, config);

    document.body.appendChild(element);

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('memory-feedback--visible');
    });

    // Auto-dismiss after 10 seconds if not interacted with
    const timeout = setTimeout(() => {
      this.dismiss();
    }, 10000);

    this.activePrompt = { id, element, config, timeout };

    log.debug({ memoryId: config.memoryId }, 'Memory feedback prompt shown');
  }

  /**
   * Submit feedback for the current memory
   */
  async submitFeedback(action: FeedbackAction): Promise<void> {
    if (!this.activePrompt) return;

    const { config } = this.activePrompt;

    // Close prompt immediately for responsive feel
    this.dismiss();

    // Only send API request for actual feedback (not dismiss)
    if (action !== 'dismiss') {
      try {
        await apiPost('/api/memory/feedback', {
          memoryId: config.memoryId,
          userId: config.userId,
          action,
          sessionId: config.sessionId,
          personaId: config.personaId,
          timestamp: new Date().toISOString(),
        });

        // Subtle acknowledgment
        if (action === 'helpful') {
          toast.success('Thanks!');
        }

        log.debug({ memoryId: config.memoryId, action }, 'Memory feedback submitted');
      } catch (error) {
        log.debug(
          { error: String(error), memoryId: config.memoryId },
          'Memory feedback submission failed (non-critical)'
        );
      }
    }
  }

  /**
   * Dismiss current prompt without sending feedback
   */
  dismiss(): void {
    if (!this.activePrompt) return;

    const { element, timeout } = this.activePrompt;

    if (timeout) {
      clearTimeout(timeout);
    }

    // Animate out
    element.classList.remove('memory-feedback--visible');
    element.classList.add('memory-feedback--exiting');

    setTimeout(() => {
      element.remove();
    }, DURATION.NORMAL);

    this.activePrompt = null;
  }

  /**
   * Check if a prompt is currently visible
   */
  isVisible(): boolean {
    return this.activePrompt !== null;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private createElement(id: string, config: MemoryFeedbackConfig): HTMLElement {
    const container = document.createElement('div');
    container.id = id;
    container.className = 'memory-feedback';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Was this memory helpful?');

    // Truncate content for display
    const truncatedContent =
      config.memoryContent.length > 60
        ? config.memoryContent.slice(0, 57) + '...'
        : config.memoryContent;

    container.innerHTML = `
      <div class="memory-feedback__content">
        <span class="memory-feedback__label">Was this helpful?</span>
        <span class="memory-feedback__preview">${this.escapeHtml(truncatedContent)}</span>
      </div>
      <div class="memory-feedback__actions">
        <button 
          class="memory-feedback__btn memory-feedback__btn--helpful" 
          aria-label="This memory was helpful"
          data-action="helpful"
        >
          ${ICON_THUMBS_UP}
        </button>
        <button 
          class="memory-feedback__btn memory-feedback__btn--not-helpful" 
          aria-label="This memory was not helpful"
          data-action="not_helpful"
        >
          ${ICON_THUMBS_DOWN}
        </button>
        <button 
          class="memory-feedback__btn memory-feedback__btn--dismiss" 
          aria-label="Dismiss"
          data-action="dismiss"
        >
          ${ICON_X}
        </button>
      </div>
    `;

    // Event delegation for buttons
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      if (button) {
        const action = button.dataset.action as FeedbackAction;
        if (action) {
          void this.submitFeedback(action);
        }
      }
    });

    return container;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.memory-feedback').forEach((el) => el.remove());
  }

  private injectStyles(): void {
    if (this.styleElement || document.getElementById('memory-feedback-styles')) {
      return;
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'memory-feedback-styles';
    this.styleElement.textContent = `
      .memory-feedback {
        position: fixed;
        bottom: calc(var(--space-xl, 42px) + 80px);
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: var(--color-bg-elevated, #2c2520);
        border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-sm, 8px) var(--space-md, 16px);
        display: flex;
        align-items: center;
        gap: var(--space-md, 16px);
        box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.3));
        opacity: 0;
        z-index: var(--z-notification, 3000);
        transition: 
          opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
          transform ${DURATION.NORMAL}ms ${EASING.STANDARD};
        max-width: 90vw;
      }

      .memory-feedback--visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .memory-feedback--exiting {
        opacity: 0;
        transform: translateX(-50%) translateY(10px);
      }

      .memory-feedback__content {
        display: flex;
        flex-direction: column;
        gap: var(--space-2xs, 2px);
        flex: 1;
        min-width: 0;
      }

      .memory-feedback__label {
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
        font-weight: 500;
      }

      .memory-feedback__preview {
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
      }

      .memory-feedback__actions {
        display: flex;
        gap: var(--space-xs, 4px);
      }

      .memory-feedback__btn {
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 8px);
        padding: var(--space-sm, 8px);
        cursor: pointer;
        color: var(--color-text-muted, rgba(255, 255, 255, 0.6));
        transition: 
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          color ${DURATION.FAST}ms ${EASING.STANDARD};
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .memory-feedback__btn:hover {
        background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      }

      .memory-feedback__btn:focus-visible {
        outline: 2px solid var(--color-accent-primary, #4a6741);
        outline-offset: 2px;
        background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.1));
      }

      .memory-feedback__btn--helpful:hover,
      .memory-feedback__btn--helpful:focus-visible {
        color: var(--color-semantic-success, #4a6741);
      }

      .memory-feedback__btn--not-helpful:hover,
      .memory-feedback__btn--not-helpful:focus-visible {
        color: var(--color-semantic-warning, #b8956a);
      }

      .memory-feedback__btn--dismiss:hover,
      .memory-feedback__btn--dismiss:focus-visible {
        color: var(--color-text-secondary, rgba(255, 255, 255, 0.8));
      }

      @media (prefers-reduced-motion: reduce) {
        .memory-feedback {
          transition: opacity ${DURATION.FAST}ms;
        }
      }

      @media (max-width: 480px) {
        .memory-feedback {
          bottom: calc(var(--space-lg, 26px) + 60px);
          padding: var(--space-xs, 4px) var(--space-sm, 8px);
          gap: var(--space-sm, 8px);
        }

        .memory-feedback__preview {
          max-width: 120px;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: MemoryFeedbackManager | null = null;

export function getMemoryFeedbackManager(): MemoryFeedbackManager {
  if (!instance) {
    instance = new MemoryFeedbackManager();
  }
  return instance;
}

export function resetMemoryFeedbackManager(): void {
  if (instance) {
    instance.dismiss();
  }
  instance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Show a memory feedback prompt
 *
 * @example
 * showMemoryFeedback({
 *   memoryId: 'mem_123',
 *   memoryContent: 'You mentioned wanting to exercise more',
 *   userId: 'user_456',
 * });
 */
export function showMemoryFeedback(config: MemoryFeedbackConfig): void {
  getMemoryFeedbackManager().show(config);
}

/**
 * Dismiss current memory feedback prompt
 */
export function dismissMemoryFeedback(): void {
  getMemoryFeedbackManager().dismiss();
}

export default {
  MemoryFeedbackManager,
  getMemoryFeedbackManager,
  resetMemoryFeedbackManager,
  showMemoryFeedback,
  dismissMemoryFeedback,
};
