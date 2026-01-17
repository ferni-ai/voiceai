/**
 * Modal Component
 *
 * Reusable modal component following Ferni brand guidelines.
 * Centered floating modal with backdrop blur.
 *
 * @module @ferni/components/base/modal
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { BaseComponent, type ComponentOptions } from './component.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('Modal');

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// ============================================================================
// TYPES
// ============================================================================

export interface ModalConfig {
  /** Unique identifier for the modal */
  id?: string;
  /** Eyebrow text (small uppercase label above title) */
  eyebrow?: string;
  /** Modal title */
  title: string;
  /** Tagline/subtitle (optional) */
  tagline?: string;
  /** Modal content (HTML string) - can be omitted if using buildContent() */
  content?: string;
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Callback when modal is closed */
  onClose?: () => void;
  /** Additional CSS class for the modal card */
  cardClassName?: string;
  /** Maximum width for the modal card */
  maxWidth?: string;
}

export interface ModalOptions extends ComponentOptions {
  /** Animation duration in ms */
  animationDuration?: number;
  /** Close modal when clicking backdrop (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close modal when pressing Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Maximum width override */
  maxWidth?: string;
}

// ============================================================================
// MODAL COMPONENT
// ============================================================================

/**
 * Modal component following Ferni brand guidelines.
 *
 * Features:
 * - Centered floating card with backdrop blur
 * - Scale/fade animation on open/close
 * - Escape key to close
 * - Click outside to close
 * - Accessible (role="dialog", aria-modal)
 *
 * @example
 * ```typescript
 * const modal = new Modal({
 *   eyebrow: 'YOUR JOURNEY',
 *   title: 'Growing Together',
 *   content: '<p>Modal content here...</p>',
 *   onClose: () => console.log('Modal closed'),
 * });
 *
 * modal.mount(document.body);
 * modal.open();
 * ```
 */
export class Modal extends BaseComponent {
  protected config: ModalConfig;
  protected modalOptions: ModalOptions;
  private isOpen = false;

  constructor(config: ModalConfig, options: ModalOptions = {}) {
    super({
      ...options,
      className: options.className || 'ferni-modal-wrapper',
    });
    this.config = {
      showCloseButton: true,
      maxWidth: options.maxWidth || '480px',
      ...config,
    };
    this.modalOptions = {
      animationDuration: DURATION.SLOW,
      closeOnBackdropClick: true,
      closeOnEscape: true,
      ...options,
    };
  }

  protected getClassName(): string {
    return 'ferni-modal-wrapper';
  }

  /**
   * Override this method in subclasses to dynamically build modal content.
   * If not overridden, uses the content from config.
   */
  protected buildContent(): string {
    return this.config.content || '';
  }

  render(): string {
    const { eyebrow, title, tagline, showCloseButton, cardClassName, maxWidth } = this.config;
    const content = this.buildContent();

    return `
      <div class="ferni-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="ferni-modal__backdrop"></div>
        <div class="ferni-modal__card ${cardClassName || ''}" style="max-width: ${maxWidth}">
          <header class="ferni-modal__header">
            ${eyebrow ? `<span class="ferni-modal__eyebrow">${eyebrow}</span>` : ''}
            <h2 id="modal-title" class="ferni-modal__title">${title}</h2>
            ${tagline ? `<p class="ferni-modal__tagline">${tagline}</p>` : ''}
            ${showCloseButton ? `
              <button class="ferni-modal__close" aria-label="Close">
                ${CLOSE_ICON}
              </button>
            ` : ''}
          </header>
          <div class="ferni-modal__content">
            ${content}
          </div>
        </div>
      </div>
    `;
  }

  protected override afterMount(): void {
    // Close button
    const closeBtn = this.querySelector<HTMLButtonElement>('.ferni-modal__close');
    if (closeBtn) {
      this.addListener(closeBtn, 'click', () => this.close());
    }

    // Backdrop click (if enabled)
    if (this.modalOptions.closeOnBackdropClick !== false) {
      const backdrop = this.querySelector<HTMLElement>('.ferni-modal__backdrop');
      if (backdrop) {
        this.addListener(backdrop, 'click', () => this.close());
      }
    }

    // Escape key (if enabled)
    if (this.modalOptions.closeOnEscape !== false) {
      this.addListener(document, 'keydown', ((e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.isOpen) {
          this.close();
        }
      }) as EventListener);
    }

    // Initially hidden
    this.hide();
  }

  /**
   * Open the modal with animation.
   */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const modal = this.querySelector<HTMLElement>('.ferni-modal');
    const card = this.querySelector<HTMLElement>('.ferni-modal__card');

    this.show();

    if (modal && card) {
      // Backdrop fade in
      modal.animate(
        [
          { opacity: 0 },
          { opacity: 1 },
        ],
        {
          duration: this.modalOptions.animationDuration,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Card scale in
      card.animate(
        [
          { opacity: 0, transform: 'scale(0.95) translateY(10px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ],
        {
          duration: this.modalOptions.animationDuration,
          easing: EASING.SPRING,
          fill: 'forwards',
        }
      );
    }

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    log.debug('Modal opened');
  }

  /**
   * Close the modal with animation.
   */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    const modal = this.querySelector<HTMLElement>('.ferni-modal');
    const card = this.querySelector<HTMLElement>('.ferni-modal__card');

    if (modal && card) {
      // Backdrop fade out
      modal.animate(
        [
          { opacity: 1 },
          { opacity: 0 },
        ],
        {
          duration: this.modalOptions.animationDuration! * 0.75,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Card scale out
      card.animate(
        [
          { opacity: 1, transform: 'scale(1) translateY(0)' },
          { opacity: 0, transform: 'scale(0.95) translateY(10px)' },
        ],
        {
          duration: this.modalOptions.animationDuration! * 0.75,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Hide after animation
      setTimeout(() => {
        this.hide();
      }, this.modalOptions.animationDuration! * 0.75);
    }

    // Restore body scroll
    document.body.style.overflow = '';

    // Call onClose callback
    this.config.onClose?.();

    log.debug('Modal closed');
  }

  /**
   * Toggle modal visibility.
   */
  override toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Update modal content dynamically.
   */
  updateContent(content: string): void {
    const contentEl = this.querySelector<HTMLElement>('.ferni-modal__content');
    if (contentEl) {
      contentEl.innerHTML = content;
    }
  }

  /**
   * Update modal title dynamically.
   */
  updateTitle(title: string): void {
    const titleEl = this.querySelector<HTMLElement>('.ferni-modal__title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  /**
   * Check if modal is currently open.
   */
  getIsOpen(): boolean {
    return this.isOpen;
  }
}

// ============================================================================
// CSS STYLES
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _show = Modal.prototype.show;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _hide = Modal.prototype.hide;

/**
 * Inject modal styles into the document.
 * Call this once during app initialization.
 */
export function injectModalStyles(): void {
  if (document.getElementById('ferni-modal-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'ferni-modal-styles';
  styles.textContent = `
    .ferni-modal-wrapper {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 1000);
    }

    .ferni-modal {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
    }

    .ferni-modal__backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-overlay, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .ferni-modal__card {
      position: relative;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
    }

    .ferni-modal__header {
      position: relative;
      padding: var(--space-6, 24px) var(--space-6, 24px) var(--space-4, 16px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .ferni-modal__eyebrow {
      display: block;
      font-family: var(--font-body, Inter, sans-serif);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-accent, #3D5A45);
      margin-bottom: var(--space-1, 4px);
    }

    .ferni-modal__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 24px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
      line-height: 1.3;
    }

    .ferni-modal__tagline {
      font-family: var(--font-body, Inter, sans-serif);
      font-size: 14px;
      color: var(--color-text-secondary, rgba(44, 37, 32, 0.7));
      margin: var(--space-2, 8px) 0 0;
    }

    .ferni-modal__close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      color: var(--color-text-muted, rgba(44, 37, 32, 0.5));
      transition: all 0.15s ease;
    }

    .ferni-modal__close:hover {
      background: var(--color-background-hover, rgba(44, 37, 32, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .ferni-modal__close:focus-visible {
      outline: 2px solid var(--color-accent, #3D5A45);
      outline-offset: 2px;
    }

    .ferni-modal__content {
      padding: var(--space-6, 24px);
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .ferni-modal__card {
        background: var(--color-background-elevated-dark, #3a3330);
      }

      .ferni-modal__header {
        border-bottom-color: var(--color-border-subtle-dark, rgba(250, 246, 240, 0.1));
      }

      .ferni-modal__title {
        color: var(--color-text-primary-dark, #faf6f0);
      }

      .ferni-modal__tagline {
        color: var(--color-text-secondary-dark, rgba(250, 246, 240, 0.7));
      }

      .ferni-modal__close {
        color: var(--color-text-muted-dark, rgba(250, 246, 240, 0.5));
      }

      .ferni-modal__close:hover {
        background: rgba(250, 246, 240, 0.1);
        color: var(--color-text-primary-dark, #faf6f0);
      }
    }
  `;
  document.head.appendChild(styles);
}
