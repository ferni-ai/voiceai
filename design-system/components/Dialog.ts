/**
 * Ferni Dialog Component
 *
 * Brand-compliant centered modal dialog with backdrop blur.
 * NEVER use side panels for content - always centered.
 *
 * Features:
 * - Centered positioning (never side panel)
 * - Backdrop blur (20px)
 * - Scale + fade animation
 * - Accessible (focus trap, escape to close)
 * - Proper eyebrow → title → content hierarchy
 */

// ============================================================================
// Types
// ============================================================================

export interface DialogOptions {
  /** Optional eyebrow text (uppercase, small) */
  eyebrow?: string;
  /** Dialog title */
  title: string;
  /** Dialog content (string or HTMLElement) */
  content: string | HTMLElement;
  /** Primary action button text */
  primaryAction?: string;
  /** Secondary action button text */
  secondaryAction?: string;
  /** Primary action callback */
  onPrimaryAction?: () => void | Promise<void>;
  /** Secondary action callback */
  onSecondaryAction?: () => void;
  /** Close callback */
  onClose?: () => void;
  /** Allow closing by clicking backdrop */
  closeOnBackdrop?: boolean;
  /** Allow closing with Escape key */
  closeOnEscape?: boolean;
  /** Dialog width */
  width?: number | string;
  /** Destructive action (colors primary button red) */
  destructive?: boolean;
}

// ============================================================================
// Dialog Component
// ============================================================================

export class Dialog {
  private overlay: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private options: DialogOptions;
  private previousActiveElement: HTMLElement | null = null;
  private isOpen = false;

  constructor(options: DialogOptions) {
    this.options = {
      closeOnBackdrop: true,
      closeOnEscape: true,
      width: 480,
      destructive: false,
      ...options,
    };
  }

  // ==========================================================================
  // DOM Creation
  // ==========================================================================

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'ferni-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ferni-dialog-title');

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '10000',
      opacity: '0',
      transition: 'opacity 0.3s ease',
    });

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'ferni-dialog-backdrop';
    Object.assign(backdrop.style, {
      position: 'absolute',
      inset: '0',
      background: 'rgba(44, 37, 32, 0.4)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    });

    if (this.options.closeOnBackdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    overlay.appendChild(backdrop);

    // Card
    this.card = this.createCard();
    overlay.appendChild(this.card);

    return overlay;
  }

  private createCard(): HTMLElement {
    const { eyebrow, title, content, primaryAction, secondaryAction, width, destructive } =
      this.options;

    const card = document.createElement('div');
    card.className = 'ferni-dialog-card';
    Object.assign(card.style, {
      position: 'relative',
      background: '#FFFDFB',
      borderRadius: '24px',
      boxShadow: '0 24px 48px rgba(44, 37, 32, 0.15)',
      width: typeof width === 'number' ? `${width}px` : width,
      maxWidth: 'calc(100vw - 48px)',
      maxHeight: 'calc(100vh - 96px)',
      overflow: 'hidden',
      transform: 'scale(0.9)',
      transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    });

    // Header
    const header = document.createElement('header');
    Object.assign(header.style, {
      padding: '24px 24px 16px',
      position: 'relative',
    });

    // Eyebrow
    if (eyebrow) {
      const eyebrowEl = document.createElement('p');
      eyebrowEl.className = 'ferni-dialog-eyebrow';
      eyebrowEl.textContent = eyebrow;
      Object.assign(eyebrowEl.style, {
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: '#4a6741',
        marginBottom: '8px',
      });
      header.appendChild(eyebrowEl);
    }

    // Title
    const titleEl = document.createElement('h2');
    titleEl.id = 'ferni-dialog-title';
    titleEl.className = 'ferni-dialog-title';
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
      fontSize: '24px',
      fontWeight: '600',
      color: '#2C2520',
      margin: '0',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    });
    header.appendChild(titleEl);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ferni-dialog-close';
    closeBtn.setAttribute('aria-label', 'Close dialog');
    closeBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      padding: '8px',
      borderRadius: '8px',
      color: '#756A5E',
      transition: 'background 0.15s ease, color 0.15s ease',
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(44, 37, 32, 0.05)';
      closeBtn.style.color = '#2C2520';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
      closeBtn.style.color = '#756A5E';
    });
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    card.appendChild(header);

    // Content
    const contentEl = document.createElement('div');
    contentEl.className = 'ferni-dialog-content';
    Object.assign(contentEl.style, {
      padding: '0 24px 24px',
      color: '#5C544A',
      fontSize: '15px',
      lineHeight: '1.6',
      overflowY: 'auto',
    });

    if (typeof content === 'string') {
      contentEl.innerHTML = content;
    } else {
      contentEl.appendChild(content);
    }

    card.appendChild(contentEl);

    // Footer (if actions)
    if (primaryAction || secondaryAction) {
      const footer = document.createElement('footer');
      Object.assign(footer.style, {
        padding: '16px 24px 24px',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
      });

      if (secondaryAction) {
        const secondaryBtn = this.createButton(secondaryAction, 'secondary');
        secondaryBtn.addEventListener('click', () => {
          this.options.onSecondaryAction?.();
          this.close();
        });
        footer.appendChild(secondaryBtn);
      }

      if (primaryAction) {
        const primaryBtn = this.createButton(
          primaryAction,
          destructive ? 'destructive' : 'primary'
        );
        primaryBtn.addEventListener('click', async () => {
          primaryBtn.disabled = true;
          try {
            await this.options.onPrimaryAction?.();
          } finally {
            primaryBtn.disabled = false;
          }
          this.close();
        });
        footer.appendChild(primaryBtn);
      }

      card.appendChild(footer);
    }

    return card;
  }

  private createButton(
    text: string,
    variant: 'primary' | 'secondary' | 'destructive'
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = `ferni-dialog-btn ferni-dialog-btn--${variant}`;

    const baseStyles = {
      padding: '12px 24px',
      borderRadius: '9999px',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    };

    const variantStyles = {
      primary: {
        background: '#4a6741',
        color: 'white',
        border: 'none',
      },
      secondary: {
        background: 'transparent',
        color: '#2C2520',
        border: '1.5px solid rgba(44, 37, 32, 0.2)',
      },
      destructive: {
        background: '#8a4a4a',
        color: 'white',
        border: 'none',
      },
    };

    Object.assign(btn.style, baseStyles, variantStyles[variant]);

    // Hover effects
    btn.addEventListener('mouseenter', () => {
      if (variant === 'primary') {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 4px 12px rgba(74, 103, 65, 0.3)';
      } else if (variant === 'destructive') {
        btn.style.transform = 'translateY(-2px)';
        btn.style.boxShadow = '0 4px 12px rgba(138, 74, 74, 0.3)';
      } else {
        btn.style.borderColor = '#2C2520';
      }
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
      btn.style.boxShadow = '';
      if (variant === 'secondary') {
        btn.style.borderColor = 'rgba(44, 37, 32, 0.2)';
      }
    });

    return btn;
  }

  // ==========================================================================
  // Open / Close
  // ==========================================================================

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    // Store focus
    this.previousActiveElement = document.activeElement as HTMLElement;

    // Create and append
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Escape key handler
    if (this.options.closeOnEscape) {
      document.addEventListener('keydown', this.handleEscape);
    }

    // Animate in
    requestAnimationFrame(() => {
      if (this.overlay) {
        this.overlay.style.opacity = '1';
      }
      if (this.card) {
        this.card.style.transform = 'scale(1)';
      }
    });

    // Focus first focusable element
    setTimeout(() => {
      const focusable = this.card?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }, 100);
  }

  close(): void {
    if (!this.isOpen || !this.overlay) return;
    this.isOpen = false;

    // Remove escape handler
    document.removeEventListener('keydown', this.handleEscape);

    // Animate out
    this.overlay.style.opacity = '0';
    if (this.card) {
      this.card.style.transform = 'scale(0.95)';
    }

    // Remove after animation
    setTimeout(() => {
      this.overlay?.remove();
      this.overlay = null;
      this.card = null;

      // Restore body scroll
      document.body.style.overflow = '';

      // Restore focus
      this.previousActiveElement?.focus();

      // Callback
      this.options.onClose?.();
    }, 300);
  }

  private handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

export function openDialog(options: DialogOptions): Dialog {
  const dialog = new Dialog(options);
  dialog.open();
  return dialog;
}

export function confirmDialog(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = new Dialog({
      title: options.title,
      content: `<p>${options.message}</p>`,
      primaryAction: options.confirmText || 'Confirm',
      secondaryAction: options.cancelText || 'Cancel',
      destructive: options.destructive,
      onPrimaryAction: () => resolve(true),
      onSecondaryAction: () => resolve(false),
      onClose: () => resolve(false),
    });
    dialog.open();
  });
}

export default Dialog;
