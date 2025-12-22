/**
 * Confirmation Modal UI
 *
 * A branded confirmation modal that replaces the native browser confirm().
 * Follows Ferni design system with warm, human-centered messaging.
 *
 * @module confirm-modal.ui
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { soundUI } from './sound.ui.js';

const log = createLogger('ConfirmModal');

// ============================================================================
// TYPES
// ============================================================================

export interface ConfirmModalOptions {
  /** Title text */
  title: string;
  /** Description/message */
  message: string;
  /** Confirm button text */
  confirmText?: string;
  /** Cancel button text */
  cancelText?: string;
  /** Destructive action (red confirm button) */
  destructive?: boolean;
  /** Icon type */
  icon?: 'warning' | 'delete' | 'info' | 'question';
}

// ============================================================================
// STATE
// ============================================================================

let modalElement: HTMLElement | null = null;
let resolvePromise: ((value: boolean) => void) | null = null;

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  warning: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
  delete: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18"/>
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>
  </svg>`,
  info: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>`,
  question: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`,
};

// ============================================================================
// MODAL CREATION
// ============================================================================

function ensureStylesExist(): void {
  if (document.getElementById('confirm-modal-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'confirm-modal-styles';
  styles.textContent = `
    .confirm-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .confirm-modal-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }
    
    .confirm-modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-heavy, rgba(0, 0, 0, 0.6));
      backdrop-filter: blur(8px);
    }
    
    .confirm-modal-container {
      position: relative;
      width: 90vw;
      max-width: min(400px, 100%);
      background: var(--color-bg-elevated, #1e1e2e);
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--shadow-2xl);
      transform: scale(0.95) translateY(10px);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      overflow: hidden;
    }
    
    .confirm-modal-overlay.open .confirm-modal-container {
      transform: scale(1) translateY(0);
    }
    
    .confirm-modal-content {
      padding: var(--space-xl, 32px);
      text-align: center;
    }
    
    .confirm-modal-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto var(--space-md, 16px);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.05));
      color: var(--color-text-muted);
    }
    
    .confirm-modal-icon--destructive {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    
    .confirm-modal-icon--warning {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
    }
    
    .confirm-modal-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm, 8px);
    }
    
    .confirm-modal-message {
      font-size: 0.95rem;
      color: var(--color-text-muted);
      margin: 0;
      line-height: 1.5;
    }
    
    .confirm-modal-actions {
      display: flex;
      gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px) var(--space-xl, 32px) var(--space-xl, 32px);
    }
    
    .confirm-modal-btn {
      flex: 1;
      padding: var(--space-sm, 12px) var(--space-md, 16px);
      border-radius: var(--radius-lg, 12px);
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms;
      border: none;
    }
    
    .confirm-modal-btn:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    
    .confirm-modal-btn--cancel {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.05));
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border-subtle);
    }
    
    .confirm-modal-btn--cancel:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }
    
    .confirm-modal-btn--confirm {
      background: var(--color-accent, #4a6741);
      color: white;
    }
    
    .confirm-modal-btn--confirm:hover {
      filter: brightness(1.1);
    }
    
    .confirm-modal-btn--destructive {
      background: #ef4444;
      color: white;
    }
    
    .confirm-modal-btn--destructive:hover {
      background: #dc2626;
    }
  `;
  document.head.appendChild(styles);
}

function createModal(options: ConfirmModalOptions): HTMLElement {
  // Clean up any existing modal
  document.querySelectorAll('.confirm-modal-overlay').forEach((el) => el.remove());

  const iconType = options.icon || (options.destructive ? 'delete' : 'question');
  const iconClass = options.destructive
    ? 'confirm-modal-icon--destructive'
    : iconType === 'warning'
      ? 'confirm-modal-icon--warning'
      : '';

  const modal = document.createElement('div');
  modal.className = 'confirm-modal-overlay';
  modal.innerHTML = `
    <div class="confirm-modal-backdrop" data-action="cancel" role="button" tabindex="0"></div>
    <div class="confirm-modal-container" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div class="confirm-modal-content">
        <div class="confirm-modal-icon ${iconClass}">
          ${ICONS[iconType]}
        </div>
        <h2 class="confirm-modal-title" id="confirm-title">${options.title}</h2>
        <p class="confirm-modal-message" id="confirm-message">${options.message}</p>
      </div>
      <div class="confirm-modal-actions" role="button" tabindex="0">
        <button aria-label="Cancel" class="confirm-modal-btn confirm-modal-btn--cancel" data-action="cancel">
          ${options.cancelText || 'Cancel'}
        </button>
        <button aria-label="Cancel" class="confirm-modal-btn ${options.destructive ? 'confirm-modal-btn--destructive' : 'confirm-modal-btn--confirm'}" data-action="confirm">
          ${options.confirmText || 'Confirm'}
        </button>
      </div>
    </div>
  `;

  return modal;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleClick(e: Event): void {
  const target = e.target as HTMLElement;
  const action = target.closest('[data-action]')?.getAttribute('data-action');

  if (action === 'cancel') {
    closeModal(false);
  } else if (action === 'confirm') {
    closeModal(true);
  }
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closeModal(false);
  } else if (e.key === 'Enter') {
    // Only if focus is on confirm button
    const focused = document.activeElement;
    if (focused?.getAttribute('data-action') === 'confirm') {
      closeModal(true);
    }
  }
}

function closeModal(result: boolean): void {
  if (!modalElement) return;

  modalElement.classList.remove('open');
  soundUI.play('click');

  // Wait for animation before removing
  setTimeout(() => {
    modalElement?.remove();
    modalElement = null;

    if (resolvePromise) {
      resolvePromise(result);
      resolvePromise = null;
    }
  }, DURATION.NORMAL);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Shows a confirmation modal and returns a promise that resolves to true/false
 *
 * @example
 * const confirmed = await confirm({
 *   title: 'Delete agent?',
 *   message: 'This cannot be undone.',
 *   destructive: true,
 * });
 * if (confirmed) {
 *   await deleteAgent(id);
 * }
 */
export function confirm(options: ConfirmModalOptions): Promise<boolean> {
  ensureStylesExist();

  return new Promise((resolve) => {
    resolvePromise = resolve;
    modalElement = createModal(options);

    modalElement.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);

    document.body.appendChild(modalElement);

    // Trigger open animation
    requestAnimationFrame(() => {
      modalElement?.classList.add('open');
      // Focus the confirm button for keyboard users
      const confirmBtn = modalElement?.querySelector('[data-action="confirm"]') as HTMLElement;
      confirmBtn?.focus();
    });

    soundUI.play('switch');
    log.debug('Confirm modal opened:', options.title);
  });
}

/**
 * Shorthand for destructive confirmation (delete operations)
 */
export function confirmDelete(
  itemName: string,
  options?: Partial<ConfirmModalOptions>
): Promise<boolean> {
  return confirm({
    title: `Delete ${itemName}?`,
    message: 'This cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Keep',
    destructive: true,
    icon: 'delete',
    ...options,
  });
}

/**
 * Shorthand for warning confirmation
 */
export function confirmWarning(
  title: string,
  message: string,
  options?: Partial<ConfirmModalOptions>
): Promise<boolean> {
  return confirm({
    title,
    message,
    confirmText: 'Continue',
    cancelText: 'Cancel',
    icon: 'warning',
    ...options,
  });
}

