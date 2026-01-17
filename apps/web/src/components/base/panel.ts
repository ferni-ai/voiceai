/**
 * Panel Component
 *
 * Reusable side panel component following Ferni brand guidelines.
 * Slides in from the right side of the screen.
 *
 * @module @ferni/components/base/panel
 */

import { DURATION, EASING } from '../../config/animation-constants.js';
import { BaseComponent, type ComponentOptions } from './component.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('Panel');

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const BACK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

// ============================================================================
// TYPES
// ============================================================================

export interface PanelConfig {
  /** Panel title */
  title: string;
  /** Panel content (HTML string) */
  content: string;
  /** Whether to show back button (for nested navigation) */
  showBackButton?: boolean;
  /** Callback when back button is clicked */
  onBack?: () => void;
  /** Callback when panel is closed */
  onClose?: () => void;
  /** Panel width */
  width?: string;
  /** Whether panel is full height */
  fullHeight?: boolean;
}

export interface PanelOptions extends ComponentOptions {
  /** Animation duration in ms */
  animationDuration?: number;
}

// ============================================================================
// PANEL COMPONENT
// ============================================================================

/**
 * Side panel component following Ferni brand guidelines.
 *
 * Features:
 * - Slides in from right
 * - Optional back button for navigation
 * - Escape key to close
 * - Backdrop click to close
 *
 * @example
 * ```typescript
 * const panel = new Panel({
 *   title: 'Settings',
 *   content: '<p>Panel content here...</p>',
 *   onClose: () => console.log('Panel closed'),
 * });
 *
 * panel.mount(document.body);
 * panel.open();
 * ```
 */
export class Panel extends BaseComponent {
  protected config: PanelConfig;
  protected panelOptions: PanelOptions;
  private isOpen = false;

  constructor(config: PanelConfig, options: PanelOptions = {}) {
    super({
      ...options,
      className: options.className || 'ferni-panel-wrapper',
    });
    this.config = {
      showBackButton: false,
      width: '400px',
      fullHeight: true,
      ...config,
    };
    this.panelOptions = {
      animationDuration: DURATION.SLOW,
      ...options,
    };
  }

  protected getClassName(): string {
    return 'ferni-panel-wrapper';
  }

  render(): string {
    const { title, content, showBackButton, width, fullHeight } = this.config;

    return `
      <div class="ferni-panel ${fullHeight ? 'ferni-panel--full-height' : ''}">
        <div class="ferni-panel__backdrop"></div>
        <div class="ferni-panel__container" style="width: ${width}">
          <header class="ferni-panel__header">
            ${showBackButton ? `
              <button class="ferni-panel__back" aria-label="Go back">
                ${BACK_ICON}
              </button>
            ` : ''}
            <h2 class="ferni-panel__title">${title}</h2>
            <button class="ferni-panel__close" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </header>
          <div class="ferni-panel__content">
            ${content}
          </div>
        </div>
      </div>
    `;
  }

  protected override afterMount(): void {
    // Close button
    const closeBtn = this.querySelector<HTMLButtonElement>('.ferni-panel__close');
    if (closeBtn) {
      this.addListener(closeBtn, 'click', () => this.close());
    }

    // Back button
    const backBtn = this.querySelector<HTMLButtonElement>('.ferni-panel__back');
    if (backBtn) {
      this.addListener(backBtn, 'click', () => {
        this.config.onBack?.();
      });
    }

    // Backdrop click
    const backdrop = this.querySelector<HTMLElement>('.ferni-panel__backdrop');
    if (backdrop) {
      this.addListener(backdrop, 'click', () => this.close());
    }

    // Escape key
    this.addListener(document, 'keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    }) as EventListener);

    // Initially hidden
    this.hide();
  }

  /**
   * Open the panel with animation.
   */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const panel = this.querySelector<HTMLElement>('.ferni-panel');
    const container = this.querySelector<HTMLElement>('.ferni-panel__container');

    this.show();

    if (panel && container) {
      // Backdrop fade in
      panel.animate(
        [
          { opacity: 0 },
          { opacity: 1 },
        ],
        {
          duration: this.panelOptions.animationDuration,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Container slide in
      container.animate(
        [
          { transform: 'translateX(100%)' },
          { transform: 'translateX(0)' },
        ],
        {
          duration: this.panelOptions.animationDuration,
          easing: EASING.SPRING,
          fill: 'forwards',
        }
      );
    }

    log.debug('Panel opened');
  }

  /**
   * Close the panel with animation.
   */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    const panel = this.querySelector<HTMLElement>('.ferni-panel');
    const container = this.querySelector<HTMLElement>('.ferni-panel__container');

    if (panel && container) {
      // Backdrop fade out
      panel.animate(
        [
          { opacity: 1 },
          { opacity: 0 },
        ],
        {
          duration: this.panelOptions.animationDuration! * 0.75,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Container slide out
      container.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(100%)' },
        ],
        {
          duration: this.panelOptions.animationDuration! * 0.75,
          easing: EASING.STANDARD,
          fill: 'forwards',
        }
      );

      // Hide after animation
      setTimeout(() => {
        this.hide();
      }, this.panelOptions.animationDuration! * 0.75);
    }

    // Call onClose callback
    this.config.onClose?.();

    log.debug('Panel closed');
  }

  /**
   * Toggle panel visibility.
   */
  override toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Update panel content dynamically.
   */
  updateContent(content: string): void {
    const contentEl = this.querySelector<HTMLElement>('.ferni-panel__content');
    if (contentEl) {
      contentEl.innerHTML = content;
    }
  }

  /**
   * Update panel title dynamically.
   */
  updateTitle(title: string): void {
    const titleEl = this.querySelector<HTMLElement>('.ferni-panel__title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  /**
   * Check if panel is currently open.
   */
  getIsOpen(): boolean {
    return this.isOpen;
  }
}

// ============================================================================
// CSS STYLES
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _show = Panel.prototype.show;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _hide = Panel.prototype.hide;

/**
 * Inject panel styles into the document.
 * Call this once during app initialization.
 */
export function injectPanelStyles(): void {
  if (document.getElementById('ferni-panel-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'ferni-panel-styles';
  styles.textContent = `
    .ferni-panel-wrapper {
      position: fixed;
      inset: 0;
      z-index: var(--z-panel, 900);
    }

    .ferni-panel {
      position: absolute;
      inset: 0;
      display: flex;
      justify-content: flex-end;
    }

    .ferni-panel__backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-overlay, rgba(44, 37, 32, 0.3));
    }

    .ferni-panel__container {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--color-background-elevated, #FFFDFB);
      box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
    }

    .ferni-panel--full-height .ferni-panel__container {
      min-height: 100vh;
    }

    .ferni-panel__header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-4, 16px) var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
    }

    .ferni-panel__back,
    .ferni-panel__close {
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

    .ferni-panel__back:hover,
    .ferni-panel__close:hover {
      background: var(--color-background-hover, rgba(44, 37, 32, 0.05));
      color: var(--color-text-primary, #2C2520);
    }

    .ferni-panel__back:focus-visible,
    .ferni-panel__close:focus-visible {
      outline: 2px solid var(--color-accent, #3D5A45);
      outline-offset: 2px;
    }

    .ferni-panel__title {
      flex: 1;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }

    .ferni-panel__close {
      margin-left: auto;
    }

    .ferni-panel__content {
      flex: 1;
      padding: var(--space-6, 24px);
      overflow-y: auto;
    }

    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .ferni-panel__container {
        background: var(--color-background-elevated-dark, #3a3330);
      }

      .ferni-panel__header {
        border-bottom-color: var(--color-border-subtle-dark, rgba(250, 246, 240, 0.1));
      }

      .ferni-panel__title {
        color: var(--color-text-primary-dark, #faf6f0);
      }

      .ferni-panel__back,
      .ferni-panel__close {
        color: var(--color-text-muted-dark, rgba(250, 246, 240, 0.5));
      }

      .ferni-panel__back:hover,
      .ferni-panel__close:hover {
        background: rgba(250, 246, 240, 0.1);
        color: var(--color-text-primary-dark, #faf6f0);
      }
    }

    /* Mobile */
    @media (max-width: 768px) {
      .ferni-panel__container {
        width: 100% !important;
        max-width: 100%;
      }
    }
  `;
  document.head.appendChild(styles);
}
