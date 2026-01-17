/**
 * Base Component
 *
 * Abstract base class for vanilla TypeScript UI components.
 * Provides lifecycle management, event tracking, and HMR protection.
 *
 * @module @ferni/components/base/component
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('BaseComponent');

// ============================================================================
// TYPES
// ============================================================================

export interface TrackedListener {
  el: EventTarget;
  event: string;
  handler: EventListener;
}

export interface ComponentOptions {
  /** CSS class name for the component container */
  className?: string;
  /** Whether to clean up orphaned elements on mount (HMR protection) */
  cleanupOrphans?: boolean;
}

// ============================================================================
// BASE COMPONENT
// ============================================================================

/**
 * Abstract base class for UI components.
 *
 * Features:
 * - Automatic event listener cleanup on dispose
 * - HMR protection via orphaned element cleanup
 * - Consistent lifecycle (mount, afterMount, dispose)
 * - Template rendering via `render()` method
 *
 * @example
 * ```typescript
 * class MyButton extends BaseComponent {
 *   private clicks = 0;
 *
 *   protected getClassName(): string {
 *     return 'my-button';
 *   }
 *
 *   render(): string {
 *     return `<button class="my-button__btn">Click me (${this.clicks})</button>`;
 *   }
 *
 *   protected afterMount(): void {
 *     const btn = this.container?.querySelector('.my-button__btn');
 *     if (btn) {
 *       this.addListener(btn, 'click', () => {
 *         this.clicks++;
 *         this.rerender();
 *       });
 *     }
 *   }
 * }
 * ```
 */
export abstract class BaseComponent {
  /** The component's container element */
  protected container: HTMLElement | null = null;

  /** Tracked event listeners for automatic cleanup */
  protected listeners: TrackedListener[] = [];

  /** Component options */
  protected options: ComponentOptions;

  constructor(options: ComponentOptions = {}) {
    this.options = {
      cleanupOrphans: true,
      ...options,
    };
  }

  // =========================================================================
  // ABSTRACT METHODS
  // =========================================================================

  /**
   * Return the HTML content for this component.
   * Override this in subclasses.
   */
  abstract render(): string;

  /**
   * Return the CSS class name for this component's container.
   * Used for HMR cleanup.
   */
  protected abstract getClassName(): string;

  // =========================================================================
  // LIFECYCLE METHODS
  // =========================================================================

  /**
   * Mount the component into a parent element.
   */
  mount(parent: HTMLElement): void {
    // HMR protection - clean up any orphaned instances
    if (this.options.cleanupOrphans) {
      this.cleanupOrphanedElements();
    }

    // Create container
    this.container = document.createElement('div');
    this.container.className = this.getClassName();
    this.container.innerHTML = this.render();
    parent.appendChild(this.container);

    // Call lifecycle hook
    this.afterMount();

    log.debug(`Mounted ${this.getClassName()}`);
  }

  /**
   * Called after the component is mounted.
   * Override this to add event listeners and initialize state.
   */
  protected afterMount(): void {
    // Override in subclasses
  }

  /**
   * Re-render the component content without unmounting.
   */
  protected rerender(): void {
    if (!this.container) return;

    // Remove existing listeners (they'll be re-added in afterMount)
    this.removeAllListeners();

    // Re-render content
    this.container.innerHTML = this.render();

    // Re-add listeners
    this.afterMount();
  }

  /**
   * Dispose the component and clean up resources.
   */
  dispose(): void {
    this.removeAllListeners();
    this.container?.remove();
    this.container = null;
    log.debug(`Disposed ${this.getClassName()}`);
  }

  // =========================================================================
  // EVENT LISTENER MANAGEMENT
  // =========================================================================

  /**
   * Add an event listener and track it for cleanup.
   */
  protected addListener(el: EventTarget, event: string, handler: EventListener): void {
    el.addEventListener(event, handler);
    this.listeners.push({ el, event, handler });
  }

  /**
   * Remove all tracked listeners.
   */
  protected removeAllListeners(): void {
    this.listeners.forEach(({ el, event, handler }) => {
      el.removeEventListener(event, handler);
    });
    this.listeners = [];
  }

  // =========================================================================
  // HMR PROTECTION
  // =========================================================================

  /**
   * Clean up orphaned elements from previous HMR instances.
   */
  protected cleanupOrphanedElements(): void {
    const className = this.getClassName();
    const existing = document.querySelectorAll(`.${className}`);
    existing.forEach((el) => el.remove());
    if (existing.length > 0) {
      log.debug(`Cleaned up ${existing.length} orphaned ${className} elements (HMR)`);
    }
  }

  // =========================================================================
  // UTILITY METHODS
  // =========================================================================

  /**
   * Query a single element within the container.
   */
  protected querySelector<T extends Element>(selector: string): T | null {
    return this.container?.querySelector<T>(selector) ?? null;
  }

  /**
   * Query all elements within the container.
   */
  protected querySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
    return this.container?.querySelectorAll<T>(selector) ?? ([] as unknown as NodeListOf<T>);
  }

  /**
   * Check if the component is mounted.
   */
  protected isMounted(): boolean {
    return this.container !== null && this.container.isConnected;
  }

  /**
   * Show the component (set display to default).
   */
  show(): void {
    if (this.container) {
      this.container.style.display = '';
    }
  }

  /**
   * Hide the component (set display to none).
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  /**
   * Toggle component visibility.
   */
  toggle(): void {
    if (this.container) {
      if (this.container.style.display === 'none') {
        this.show();
      } else {
        this.hide();
      }
    }
  }
}
