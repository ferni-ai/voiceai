/**
 * Password Reset UI Component
 *
 * Simple modal for requesting a password reset email.
 *
 * @module PasswordResetUI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { resetPassword } from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PasswordResetUI');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let resetModal: HTMLElement | null = null;

// ============================================================================
// ICONS
// ============================================================================

const LUCIDE_CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const LUCIDE_MAIL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`;

// ============================================================================
// HMR CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.password-reset-overlay').forEach((el) => el.remove());
}

// ============================================================================
// SHOW MODAL
// ============================================================================

/**
 * Show the password reset modal.
 * @param prefillEmail - Optional email to prefill
 */
export function showPasswordResetModal(prefillEmail?: string): void {
  cleanupOrphanedElements();

  if (resetModal) {
    resetModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'password-reset-overlay';

  overlay.innerHTML = `
    <div class="password-reset-backdrop"></div>
    <div class="password-reset-card" role="dialog" aria-labelledby="reset-title">
      <header class="password-reset-header">
        <div>
          <span class="eyebrow">ACCOUNT RECOVERY</span>
          <h2 id="reset-title">Reset Your Password</h2>
          <p class="tagline">We'll send you a link to create a new password.</p>
        </div>
        <button class="close-btn" aria-label="Close">${LUCIDE_CLOSE_ICON}</button>
      </header>
      
      <div class="password-reset-content">
        <form class="reset-form" id="password-reset-form">
          <div class="form-field">
            <label for="reset-email">Email Address</label>
            <input 
              type="email" 
              id="reset-email" 
              name="email" 
              required 
              autocomplete="email"
              value="${prefillEmail || ''}"
              placeholder="your@email.com"
            />
          </div>
          <button type="submit" class="submit-btn">Send Reset Link</button>
        </form>
      </div>
      
      <div class="password-reset-loading" style="display: none;">
        <div class="spinner"></div>
        <p>Sending...</p>
      </div>
      
      <div class="password-reset-success" style="display: none;">
        ${LUCIDE_MAIL_ICON}
        <h3>Check Your Email</h3>
        <p>We've sent a password reset link to your email address.</p>
      </div>
      
      <div class="password-reset-error" style="display: none;">
        <p class="error-message"></p>
        <button class="retry-btn">Try Again</button>
      </div>
    </div>
  `;

  // Apply styles
  applyResetStyles(overlay);

  // Add event listeners
  const closeBtn = overlay.querySelector('.close-btn') as HTMLElement;
  const backdrop = overlay.querySelector('.password-reset-backdrop') as HTMLElement;
  const form = overlay.querySelector('#password-reset-form') as HTMLFormElement;
  const retryBtn = overlay.querySelector('.retry-btn') as HTMLElement;

  closeBtn.addEventListener('click', () => closeResetModal());
  backdrop.addEventListener('click', () => closeResetModal());
  form.addEventListener('submit', handleResetSubmit);
  retryBtn.addEventListener('click', () => resetModalState(overlay));

  // Animate in
  document.body.appendChild(overlay);
  resetModal = overlay;

  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    const card = overlay.querySelector('.password-reset-card') as HTMLElement;
    card.style.transform = 'scale(1)';
    card.style.opacity = '1';

    // Focus email input
    const emailInput = overlay.querySelector('#reset-email') as HTMLInputElement;
    emailInput?.focus();
  });
}

/**
 * Apply modal styles
 */
function applyResetStyles(overlay: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = `
    .password-reset-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    .password-reset-overlay.visible {
      opacity: 1;
    }
    .password-reset-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.4);
      backdrop-filter: blur(var(--glass-blur-strong, 24px));
    }
    .password-reset-card {
      position: relative;
      width: 90%;
      max-width: 400px;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 24px 48px rgba(0,0,0,0.2));
      transform: scale(0.95);
      opacity: 0;
      transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
    }
    .password-reset-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.05));
    }
    .password-reset-header .eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 4px);
    }
    .password-reset-header h2 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px) 0;
    }
    .password-reset-header .tagline {
      font-size: 0.875rem;
      color: var(--color-text-secondary, #70605a);
      margin: 0;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-2, 8px);
      color: var(--color-text-muted, #a0958f);
      border-radius: var(--radius-full, 999px);
      transition: background ${DURATION.FAST}ms;
    }
    .close-btn:hover {
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
    }
    .password-reset-content {
      padding: var(--space-6, 24px);
    }
    .reset-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 16px);
    }
    .form-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }
    .form-field label {
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--color-text-secondary, #70605a);
    }
    .form-field input {
      padding: var(--space-3, 12px);
      border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
      border-radius: var(--radius-md, 8px);
      font-size: 1rem;
      font-family: var(--font-body, Inter, sans-serif);
      transition: border-color ${DURATION.FAST}ms;
    }
    .form-field input:focus {
      outline: none;
      border-color: var(--persona-primary, #4a6741);
    }
    .submit-btn {
      padding: var(--space-3, 12px) var(--space-4, 16px);
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
      border-radius: var(--radius-lg, 12px);
      font-family: var(--font-body, Inter, sans-serif);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    .submit-btn:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }
    .password-reset-loading,
    .password-reset-success,
    .password-reset-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-8, 32px);
      text-align: center;
    }
    .password-reset-success svg {
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-4, 16px);
    }
    .password-reset-success h3 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.25rem;
      margin: 0 0 var(--space-2, 8px) 0;
      color: var(--color-text-primary, #2C2520);
    }
    .password-reset-success p {
      color: var(--color-text-secondary, #70605a);
      margin: 0;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border-subtle, rgba(0,0,0,0.1));
      border-top-color: var(--persona-primary, #4a6741);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .error-message {
      color: #c53030;
      margin-bottom: var(--space-3, 12px);
    }
    .retry-btn {
      padding: var(--space-2, 8px) var(--space-4, 16px);
      background: var(--color-background-subtle, #f5f3f0);
      border: none;
      border-radius: var(--radius-md, 8px);
      cursor: pointer;
      font-weight: 500;
    }
  `;

  overlay.appendChild(style);
}

/**
 * Close the modal
 */
function closeResetModal(): void {
  if (!resetModal) return;

  const card = resetModal.querySelector('.password-reset-card') as HTMLElement;
  card.style.transform = 'scale(0.95)';
  card.style.opacity = '0';
  resetModal.classList.remove('visible');

  setTimeout(() => {
    resetModal?.remove();
    resetModal = null;
  }, DURATION.NORMAL);
}

/**
 * Reset modal to initial state
 */
function resetModalState(overlay: HTMLElement): void {
  const content = overlay.querySelector('.password-reset-content') as HTMLElement;
  const loading = overlay.querySelector('.password-reset-loading') as HTMLElement;
  const success = overlay.querySelector('.password-reset-success') as HTMLElement;
  const error = overlay.querySelector('.password-reset-error') as HTMLElement;

  content.style.display = 'block';
  loading.style.display = 'none';
  success.style.display = 'none';
  error.style.display = 'none';
}

/**
 * Handle form submission
 */
async function handleResetSubmit(event: Event): Promise<void> {
  event.preventDefault();

  if (!resetModal) return;

  const form = event.target as HTMLFormElement;
  const email = (form.querySelector('#reset-email') as HTMLInputElement).value;

  const content = resetModal.querySelector('.password-reset-content') as HTMLElement;
  const loading = resetModal.querySelector('.password-reset-loading') as HTMLElement;
  const success = resetModal.querySelector('.password-reset-success') as HTMLElement;
  const error = resetModal.querySelector('.password-reset-error') as HTMLElement;
  const errorMessage = error.querySelector('.error-message') as HTMLElement;

  content.style.display = 'none';
  loading.style.display = 'flex';

  try {
    await resetPassword(email);

    loading.style.display = 'none';
    success.style.display = 'flex';

    log.info('Password reset email sent');

    // Auto-close after showing success
    setTimeout(() => closeResetModal(), 4000);
  } catch (err) {
    loading.style.display = 'none';
    error.style.display = 'flex';
    errorMessage.textContent = err instanceof Error ? err.message : 'Something went wrong';

    log.error('Password reset failed:', err);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const passwordResetUI = {
  show: showPasswordResetModal,
  close: closeResetModal,
};
