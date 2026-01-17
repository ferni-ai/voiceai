/**
 * Account Button UI Component
 *
 * Minimal account management UI following the relationship-first approach:
 * - Shows "Save Our Relationship" for anonymous users (positioned as value-add)
 * - Shows user info and settings for linked accounts
 * - Supports email/password, Google, and Apple sign-in
 *
 * Philosophy: Account linking is a feature, not a gate. Users should feel
 * invited to save their relationship, not forced to create an account.
 *
 * @module AccountButtonUI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import {
  linkWithApple,
  linkWithEmail,
  linkWithGoogle,
  onAuthStateChange,
  signOut,
  type AuthState,
} from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('AccountButtonUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let accountButton: HTMLElement | null = null;
let accountModal: HTMLElement | null = null;
let currentAuthState: AuthState | null = null;
const cleanupFunctions: (() => void)[] = [];

// ============================================================================
// CONSTANTS
// ============================================================================

const LUCIDE_USER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const LUCIDE_CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const LUCIDE_CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

const GOOGLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`;

const APPLE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

// ============================================================================
// HMR CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.account-button-container').forEach((el) => el.remove());
  document.querySelectorAll('.account-modal-overlay').forEach((el) => el.remove());
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the account button UI.
 * Call after DOM is ready.
 */
export function initAccountButtonUI(): void {
  cleanupOrphanedElements();

  // Subscribe to auth state
  const unsubscribe = onAuthStateChange(handleAuthStateChange);
  cleanupFunctions.push(unsubscribe);

  // Create the button
  createAccountButton();

  // Listen for One-Tap success - show warm confirmation toast
  const handleOneTapSuccess = (): void => {
    // Refresh button state (auth state callback will handle this)
    if (currentAuthState) {
      updateButtonState(currentAuthState);
    }
    // Show warm confirmation toast
    import('./whisper.ui.js').then(({ toast }) => {
      toast.success("Got it! I'll remember you now.");
    });
  };

  window.addEventListener('ferni:one-tap-success', handleOneTapSuccess);
  cleanupFunctions.push(() => {
    window.removeEventListener('ferni:one-tap-success', handleOneTapSuccess);
  });

  // Listen for One-Tap errors - show friendly error toast
  const handleOneTapError = (event: Event): void => {
    const customEvent = event as CustomEvent<{ error: string }>;
    const errorMessage = customEvent.detail?.error ?? 'Something went wrong';
    log.warn('One-Tap sign-in failed:', errorMessage);

    import('./whisper.ui.js').then(({ toast }) => {
      toast.error(errorMessage);
    });
  };

  window.addEventListener('ferni:one-tap-error', handleOneTapError);
  cleanupFunctions.push(() => {
    window.removeEventListener('ferni:one-tap-error', handleOneTapError);
  });

  log.debug('Account button UI initialized');
}

/**
 * Handle auth state changes
 */
function handleAuthStateChange(state: AuthState): void {
  currentAuthState = state;
  updateButtonState(state);
}

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create the account button
 */
function createAccountButton(): void {
  const container = document.createElement('div');
  container.className = 'account-button-container';
  container.innerHTML = `
    <button class="account-button" aria-label="${t('accessibility.accountSettings')}">
      ${LUCIDE_USER_ICON}
      <span class="account-button-text" role="button" tabindex="0">Remember me</span>
    </button>
  `;

  // Style the container
  Object.assign(container.style, {
    position: 'fixed',
    top: 'var(--space-4, 16px)',
    right: 'var(--space-4, 16px)',
    zIndex: 'var(--z-docked)',
  });

  // Style the button
  const button = container.querySelector('.account-button') as HTMLElement;
  Object.assign(button.style, {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2, 8px)',
    padding: 'var(--space-2, 8px) var(--space-3, 12px)',
    background: 'var(--color-background-elevated, rgba(255,255,255,0.9))',
    backdropFilter: 'blur(10px)',
    border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
    borderRadius: 'var(--radius-full, 999px)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body, Inter, sans-serif)',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--color-text-primary, #2C2520)',
    transition: `all ${DURATION.NORMAL}ms ${EASING.STANDARD}`,
  });

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.02)';
    button.style.boxShadow = 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = 'none';
  });

  // Click handler
  button.addEventListener('click', () => {
    if (currentAuthState?.isLinked) {
      showAccountMenu();
    } else {
      showLinkAccountModal();
    }
  });

  document.body.appendChild(container);
  accountButton = container;
}

/**
 * Update button state based on auth
 */
function updateButtonState(state: AuthState): void {
  if (!accountButton) return;

  const button = accountButton.querySelector('.account-button') as HTMLElement;
  const textSpan = accountButton.querySelector('.account-button-text') as HTMLElement;

  if (state.isLinked) {
    // Show user info
    textSpan.textContent = state.displayName ?? state.email?.split('@')[0] ?? 'Account';
    button.setAttribute('aria-label', `Account menu for ${state.email ?? 'linked account'}`);
  } else if (state.isAuthenticated) {
    // Anonymous user - warm invitation to be remembered
    textSpan.textContent = t('ui.accountbutton.rememberMe');
    button.setAttribute('aria-label', 'Let Ferni remember you across devices');
  } else {
    // Not configured or error
    textSpan.textContent = t('ui.accountbutton.rememberMe');
    button.setAttribute('aria-label', 'Let Ferni remember you across devices');
  }
}

// ============================================================================
// LINK ACCOUNT MODAL
// ============================================================================

/**
 * Show the link account modal
 */
function showLinkAccountModal(): void {
  if (accountModal) {
    accountModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'account-modal-overlay';

  overlay.innerHTML = `
    <div class="account-modal-backdrop"></div>
    <div class="account-modal-card" role="dialog" aria-labelledby="account-modal-title">
      <header class="account-modal-header">
        <div>
          <span class="eyebrow">OUR RELATIONSHIP</span>
          <h2 id="account-modal-title">Let me remember you</h2>
          <p class="tagline">I'll never forget what we've shared—from any device, anytime.</p>
        </div>
        <button class="close-btn" aria-label="${t('common.close')}">${LUCIDE_CLOSE_ICON}</button>
      </header>
      
      <div class="account-modal-content">
        <div class="social-buttons" role="button" tabindex="0">
          <button aria-label="${t('accessibility.continueWithGoogle')}" class="social-btn google-btn" data-provider="google">
            ${GOOGLE_ICON}
            <span>Continue with Google</span>
          </button>
          <button aria-label="${t('accessibility.continueWithApple')}" class="social-btn apple-btn" data-provider="apple">
            ${APPLE_ICON}
            <span>Continue with Apple</span>
          </button>
        </div>
        
        <div class="divider">
          <span>or use email</span>
        </div>
        
        <form class="email-form" id="account-email-form">
          <div class="form-field">
            <label for="account-email">Email</label>
            <input type="email" id="account-email" name="email" required autocomplete="email" />
          </div>
          <div class="form-field">
            <label for="account-password">Password</label>
            <input type="password" id="account-password" name="password" required minlength="6" autocomplete="new-password" />
          </div>
          <button aria-label="${t('accessibility.rememberMe')}" type="submit" class="submit-btn">Remember me</button>
        </form>
        
        <p class="privacy-note">
          Your conversations stay between us. I just need a way to find you again.
        </p>
      </div>
      
      <div class="account-modal-loading" style="display: none;">
        <div class="spinner"></div>
        <p>Making a note...</p>
      </div>
      
      <div class="account-modal-success" style="display: none;">
        ${LUCIDE_CHECK_ICON}
        <p>I'll remember you now. Wherever you go, I'll know you.</p>
      </div>
      
      <div class="account-modal-error" style="display: none;">
        <p class="error-message"></p>
        <button aria-label="${t('accessibility.tryAgain')}" class="retry-btn">Try Again</button>
      </div>
    </div>
  `;

  // Apply styles
  applyModalStyles(overlay);

  // Add event listeners
  const closeBtn = overlay.querySelector('.close-btn') as HTMLElement;
  const backdrop = overlay.querySelector('.account-modal-backdrop') as HTMLElement;
  const googleBtn = overlay.querySelector('.google-btn') as HTMLElement;
  const appleBtn = overlay.querySelector('.apple-btn') as HTMLElement;
  const emailForm = overlay.querySelector('#account-email-form') as HTMLFormElement;
  const retryBtn = overlay.querySelector('.retry-btn') as HTMLElement;

  closeBtn.addEventListener('click', () => closeModal());
  backdrop.addEventListener('click', () => closeModal());

  googleBtn.addEventListener('click', () => handleSocialLink('google'));
  appleBtn.addEventListener('click', () => handleSocialLink('apple'));
  emailForm.addEventListener('submit', handleEmailSubmit);
  retryBtn.addEventListener('click', () => resetModalState(overlay));

  // Animate in
  document.body.appendChild(overlay);
  accountModal = overlay;

  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    const card = overlay.querySelector('.account-modal-card') as HTMLElement;
    card.style.transform = 'scale(1)';
    card.style.opacity = '1';
  });
}

/**
 * Apply modal styles
 */
function applyModalStyles(overlay: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = `
    .account-modal-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-dropdown);
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    .account-modal-overlay.visible {
      opacity: 1;
    }
    .account-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.75);
    }
    .account-modal-card {
      position: relative;
      width: 90%;
      max-width: min(400px, 100%);
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl, 0 24px 48px rgba(0,0,0,0.2));
      transform: scale(0.95);
      opacity: 0;
      transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
    }
    .account-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-6, 24px);
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.05));
    }
    .account-modal-header .eyebrow {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-1, 4px);
    }
    .account-modal-header h2 {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px) 0;
    }
    .account-modal-header .tagline {
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
    .account-modal-content {
      padding: var(--space-6, 24px);
    }
    .social-buttons {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
    }
    .social-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3, 12px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
      border-radius: var(--radius-lg, 12px);
      background: var(--color-background-elevated, white);
      font-family: var(--font-body, Inter, sans-serif);
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    .social-btn:hover {
      background: var(--color-background-subtle, #f5f3f0);
      transform: translateY(-1px);
    }
    .google-btn { color: #1f1f1f; }
    .apple-btn { color: var(--color-text-primary, #000); }
    .divider {
      display: flex;
      align-items: center;
      gap: var(--space-4, 16px);
      margin: var(--space-5, 20px) 0;
      color: var(--color-text-muted, #a0958f);
      font-size: 0.8125rem;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border-subtle, rgba(0,0,0,0.1));
    }
    .email-form {
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
    .privacy-note {
      font-size: 0.75rem;
      color: var(--color-text-muted, #a0958f);
      text-align: center;
      margin-top: var(--space-4, 16px);
    }
    .account-modal-loading,
    .account-modal-success,
    .account-modal-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-8, 32px);
      text-align: center;
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
    .account-modal-success svg {
      width: 48px;
      height: 48px;
      color: var(--persona-primary, #4a6741);
      margin-bottom: var(--space-3, 12px);
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
function closeModal(): void {
  if (!accountModal) return;

  const card = accountModal.querySelector('.account-modal-card') as HTMLElement;
  card.style.transform = 'scale(0.95)';
  card.style.opacity = '0';
  accountModal.classList.remove('visible');

  trackedTimeout(() => {
    accountModal?.remove();
    accountModal = null;
  }, DURATION.NORMAL);
}

/**
 * Reset modal to initial state
 */
function resetModalState(overlay: HTMLElement): void {
  const content = overlay.querySelector('.account-modal-content') as HTMLElement;
  const loading = overlay.querySelector('.account-modal-loading') as HTMLElement;
  const success = overlay.querySelector('.account-modal-success') as HTMLElement;
  const error = overlay.querySelector('.account-modal-error') as HTMLElement;

  content.style.display = 'block';
  loading.style.display = 'none';
  success.style.display = 'none';
  error.style.display = 'none';
}

/**
 * Show loading state
 */
function showModalLoading(): void {
  if (!accountModal) return;

  const content = accountModal.querySelector('.account-modal-content') as HTMLElement;
  const loading = accountModal.querySelector('.account-modal-loading') as HTMLElement;

  content.style.display = 'none';
  loading.style.display = 'flex';
}

/**
 * Show success state
 */
function showModalSuccess(): void {
  if (!accountModal) return;

  const loading = accountModal.querySelector('.account-modal-loading') as HTMLElement;
  const success = accountModal.querySelector('.account-modal-success') as HTMLElement;

  loading.style.display = 'none';
  success.style.display = 'flex';

  // Auto-close after success
  trackedTimeout(() => closeModal(), 2000);
}

/**
 * Show error state
 */
function showModalError(message: string): void {
  if (!accountModal) return;

  const loading = accountModal.querySelector('.account-modal-loading') as HTMLElement;
  const error = accountModal.querySelector('.account-modal-error') as HTMLElement;
  const errorMessage = error.querySelector('.error-message') as HTMLElement;

  loading.style.display = 'none';
  error.style.display = 'flex';
  errorMessage.textContent = message;
}

// ============================================================================
// AUTH HANDLERS
// ============================================================================

/**
 * Handle social account linking
 */
async function handleSocialLink(provider: 'google' | 'apple'): Promise<void> {
  showModalLoading();

  try {
    if (provider === 'google') {
      await linkWithGoogle();
    } else {
      await linkWithApple();
    }
    showModalSuccess();
    log.info(`Linked ${provider} account`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    showModalError(message);
    log.error(`Failed to link ${provider}:`, error);
  }
}

/**
 * Handle email form submission
 */
async function handleEmailSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const email = (form.querySelector('#account-email') as HTMLInputElement).value;
  const password = (form.querySelector('#account-password') as HTMLInputElement).value;

  showModalLoading();

  try {
    await linkWithEmail(email, password);
    showModalSuccess();
    log.info('Linked email account');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    showModalError(message);
    log.error('Failed to link email:', error);
  }
}

// ============================================================================
// ACCOUNT MENU (for linked accounts)
// ============================================================================

/**
 * Show account menu for linked users
 */
function showAccountMenu(): void {
  if (!currentAuthState?.isLinked) return;

  // Simple dropdown menu
  const existing = document.querySelector('.account-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.innerHTML = `
    <div class="account-menu-item account-info">
      <span class="account-label">I'll remember you as</span>
      <span class="account-email">${currentAuthState.email ?? currentAuthState.displayName ?? 'You'}</span>
    </div>
    <button aria-label="${t('accessibility.forgetThisDevice')}" class="account-menu-item" data-action="signout">Forget this device</button>
  `;

  Object.assign(menu.style, {
    position: 'fixed',
    top: 'var(--space-14, 56px)',
    right: 'var(--space-4, 16px)',
    background: 'var(--color-background-elevated, white)',
    borderRadius: 'var(--radius-lg, 12px)',
    boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.15))',
    overflow: 'hidden',
    zIndex: 'var(--z-dropdown)',
    minWidth: 'min(200px, 100%)',
  });

  const style = document.createElement('style');
  style.textContent = `
    .account-menu-item {
      display: block;
      width: 100%;
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border: none;
      background: none;
      text-align: left;
      font-family: var(--font-body, Inter, sans-serif);
      font-size: 0.875rem;
      cursor: pointer;
      transition: background ${DURATION.FAST}ms;
    }
    .account-menu-item:hover {
      background: var(--color-background-subtle, #f5f3f0);
    }
    .account-info {
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.1));
      cursor: default;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .account-info:hover {
      background: none;
    }
    .account-label {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7f75);
    }
    .account-email {
      font-weight: 500;
      color: var(--color-text-primary, #2C2520);
    }
  `;
  menu.appendChild(style);

  // Sign out handler
  const signoutBtn = menu.querySelector('[data-action="signout"]');
  signoutBtn?.addEventListener('click', async () => {
    await signOut();
    menu.remove();
  });

  // Close on click outside
  const closeMenu = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && !accountButton?.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  };
  trackedTimeout(() => document.addEventListener('click', closeMenu), 0);

  document.body.appendChild(menu);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup the account button UI
 */
export function destroyAccountButtonUI(): void {
  cleanupFunctions.forEach((fn) => fn());
  cleanupFunctions.length = 0;

  accountButton?.remove();
  accountModal?.remove();
  accountButton = null;
  accountModal = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const accountButtonUI = {
  init: initAccountButtonUI,
  destroy: destroyAccountButtonUI,
};
