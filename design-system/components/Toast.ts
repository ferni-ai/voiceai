/**
 * Ferni Toast Component
 *
 * Brand-compliant toast notifications - small, centered pills
 * with warm, human messaging.
 *
 * Features:
 * - Centered pill design (not corner-positioned)
 * - Brand-compliant warm styling
 * - Auto-dismiss with configurable duration
 * - Queue management for multiple toasts
 * - Accessible (role="status", aria-live="polite")
 */

// ============================================================================
// Types
// ============================================================================

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  /** Toast message */
  message: string;
  /** Toast type determines styling */
  type?: ToastType;
  /** Duration in ms before auto-dismiss (0 = persist) */
  duration?: number;
  /** Show close button */
  dismissible?: boolean;
  /** Callback when toast is dismissed */
  onDismiss?: () => void;
}

interface ToastInstance {
  id: string;
  element: HTMLElement;
  options: ToastOptions;
  timeout?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  info: 2500,
  success: 2500,
  warning: 2500,
  error: 4000,
};

const TYPE_COLORS: Record<ToastType, { bg: string; text: string }> = {
  info: { bg: '#2C2520', text: '#FAF6F0' },
  success: { bg: '#4a6741', text: '#FAF6F0' },
  warning: { bg: '#b8956a', text: '#2C2520' },
  error: { bg: '#8a4a4a', text: '#FAF6F0' },
};

// ============================================================================
// Toast Manager (Singleton)
// ============================================================================

class ToastManager {
  private container: HTMLElement | null = null;
  private queue: ToastInstance[] = [];
  private idCounter = 0;

  constructor() {
    // Defer container creation until first use
  }

  private ensureContainer(): HTMLElement {
    if (this.container && document.body.contains(this.container)) {
      return this.container;
    }

    // Remove any orphaned containers (HMR cleanup)
    document.querySelectorAll('.ferni-toast-container').forEach((el) => el.remove());

    this.container = document.createElement('div');
    this.container.className = 'ferni-toast-container';
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      pointerEvents: 'none',
    });

    document.body.appendChild(this.container);
    return this.container;
  }

  show(options: ToastOptions | string): string {
    // Handle string shorthand
    if (typeof options === 'string') {
      options = { message: options };
    }

    const opts: ToastOptions = {
      type: 'info',
      dismissible: false,
      ...options,
      duration: options.duration ?? DEFAULT_DURATIONS[options.type || 'info'],
    };

    const id = `toast-${++this.idCounter}`;
    const container = this.ensureContainer();

    // Create toast element
    const element = this.createToastElement(id, opts);
    container.appendChild(element);

    // Animate in
    requestAnimationFrame(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });

    // Create instance
    const instance: ToastInstance = { id, element, options: opts };

    // Set auto-dismiss
    if (opts.duration && opts.duration > 0) {
      instance.timeout = window.setTimeout(() => {
        this.dismiss(id);
      }, opts.duration);
    }

    this.queue.push(instance);
    return id;
  }

  private createToastElement(id: string, options: ToastOptions): HTMLElement {
    const colors = TYPE_COLORS[options.type || 'info'];

    const el = document.createElement('div');
    el.id = id;
    el.className = 'ferni-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    Object.assign(el.style, {
      background: colors.bg,
      color: colors.text,
      padding: '12px 24px',
      borderRadius: '9999px',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      opacity: '0',
      transform: 'translateY(16px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: '400px',
    });

    // Message
    const messageEl = document.createElement('span');
    messageEl.textContent = options.message;
    el.appendChild(messageEl);

    // Close button (if dismissible)
    if (options.dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', 'Dismiss');
      Object.assign(closeBtn.style, {
        background: 'transparent',
        border: 'none',
        color: 'inherit',
        fontSize: '18px',
        cursor: 'pointer',
        padding: '0 0 0 8px',
        opacity: '0.7',
        transition: 'opacity 0.15s ease',
      });
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.opacity = '1';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.opacity = '0.7';
      });
      closeBtn.addEventListener('click', () => {
        this.dismiss(id);
      });
      el.appendChild(closeBtn);
    }

    return el;
  }

  dismiss(id: string): void {
    const index = this.queue.findIndex((t) => t.id === id);
    if (index === -1) return;

    const instance = this.queue[index];
    if (!instance) return;

    // Clear timeout
    if (instance.timeout) {
      clearTimeout(instance.timeout);
    }

    // Animate out
    instance.element.style.opacity = '0';
    instance.element.style.transform = 'translateY(-8px)';

    // Remove after animation
    setTimeout(() => {
      instance.element.remove();
      instance.options.onDismiss?.();
    }, 300);

    // Remove from queue
    this.queue.splice(index, 1);
  }

  dismissAll(): void {
    const ids = this.queue.map((t) => t.id);
    ids.forEach((id) => this.dismiss(id));
  }

  // Convenience methods
  info(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: 'info' });
  }

  success(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: 'success' });
  }

  warning(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: 'warning' });
  }

  error(message: string, options?: Partial<ToastOptions>): string {
    return this.show({ ...options, message, type: 'error' });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const toast = new ToastManager();

// Also export class for testing
export { ToastManager };

export default toast;
