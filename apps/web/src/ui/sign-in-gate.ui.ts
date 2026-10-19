/**
 * Sign-In Gate UI
 *
 * Full-screen sign-in overlay that blocks the app until user authenticates.
 * Required for users to access the app - matches iOS experience.
 *
 * Philosophy: Real relationships require identity. By asking users to sign in,
 * we can provide continuity across devices and sessions.
 *
 * @module SignInGateUI
 */

import { signOutReleasingPush } from '../services/push-preference.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import {
  onAuthStateChange,
  signInWithApple,
  signInWithGoogle,
  type AuthState,
} from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';
import { checkAccess, type AccessOutcome } from '../services/access-check.js';
import { signInFailureMessage } from '../services/sign-in-error.js';
import { isAppleWebSignInEnabled } from '../config/apple-web-signin-flag.js';
import { emulatorSignInButtons } from './emulator-sign-in.js';
import { createAppleIcon, createGoogleIcon } from './sign-in-provider-icons.js';
import { tryFirstButtons } from './try-first.ui.js';
import { t } from '../i18n/index.js';
import { createAiRoleLabelRow } from './ai-role-label.ui.js';
import { celebrateAdmissionOnce, showWaitingInGate } from './waiting-screen.ui.js';

const log = createLogger('SignInGate');
// app.ferni.ai serves the app for every path, so the legal pages are on the marketing site.
const TERMS_URL = 'https://ferni.ai/terms';
const PRIVACY_URL = 'https://ferni.ai/privacy';

// ELEMENT REFERENCES

let overlayEl: HTMLElement | null = null;
let isShowing = false;
let resolveSignIn: (() => void) | null = null;
let pendingSignIn: Promise<void> | null = null;

// STYLES

const STYLES = `
.sign-in-gate-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-system);
  background: var(--color-bg-primary, #0a0a0f);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl, 2.618rem);
  opacity: 0;
  transition: opacity ${DURATION.SLOW}ms ${EASING.OUT_EXPO};
}

.sign-in-gate-overlay.visible {
  opacity: 1;
}

.sign-in-gate-overlay.hiding {
  opacity: 0;
  pointer-events: none;
}

.sign-in-gate-content {
  max-width: 380px;
  width: 100%;
  text-align: center;
}

.sign-in-gate-logo {
  width: 100px;
  height: 100px;
  margin: 0 auto var(--space-lg, 1.618rem);
  border-radius: var(--radius-xl, 18px);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  overflow: hidden;
}

.sign-in-gate-logo img {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg, 12px);
  object-fit: cover;
}

.sign-in-gate-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text-primary, #f4f4f5);
  margin: 0 0 var(--space-sm, 0.5rem);
  font-family: var(--font-display, inherit);
}

.sign-in-gate-subtitle {
  font-size: 1rem;
  color: var(--color-text-secondary, #a1a1aa);
  margin: 0 0 var(--space-xl, 2.618rem);
  line-height: 1.5;
}

.sign-in-gate-buttons {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 1rem);
}

.sign-in-gate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm, 0.5rem);
  padding: var(--space-md, 1rem) var(--space-lg, 1.618rem);
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: transform ${DURATION.FAST}ms ${EASING.OUT_EXPO},
              box-shadow ${DURATION.FAST}ms ${EASING.OUT_EXPO};
  min-height: 52px;
}

.sign-in-gate-btn:hover { transform: translateY(-1px); }
.sign-in-gate-btn:active { transform: translateY(0); }
/* Ring drawn inside the button, so the focused one doesn't look wider than its sibling */
.sign-in-gate-btn:focus-visible { outline: 2px solid currentColor; outline-offset: -5px;
  box-shadow: none; border-radius: var(--radius-lg, 12px); }

.sign-in-gate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.sign-in-gate-btn--google {
  background: #fff;
  color: #1f1f1f;
}

.sign-in-gate-btn--google:hover {
  box-shadow: var(--shadow-md);
}

.sign-in-gate-btn--apple {
  background: #2c2520;
  color: #fafaf9;
}

[data-theme="midnight"] .sign-in-gate-btn--apple {
  background: #f4efe6;
  color: #14110e;
}

.sign-in-gate-btn--apple:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.sign-in-gate-error {
  margin-top: var(--space-md, 1rem);
  padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
  background: var(--color-semantic-error-tint, rgba(231, 163, 154, 0.12));
  border-radius: var(--radius-md, 8px);
  color: var(--color-semantic-error, #e7a39a);
  font-size: 0.875rem;
  display: none;
}

.sign-in-gate-error.visible {
  display: block;
}

.sign-in-gate-footer {
  margin-top: var(--space-xl, 2.618rem);
  font-size: 0.75rem;
  color: var(--color-text-muted, #71717a);
}

.sign-in-gate-footer a {
  color: var(--color-text-secondary, #a1a1aa);
  text-decoration: underline;
}

/* Waitlist pending state */
.sign-in-gate-waitlist {
  display: none;
}

.sign-in-gate-waitlist.visible {
  display: block;
}

.sign-in-gate-waitlist-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-md, 1rem);
  color: var(--color-accent-primary, #3D5A45);
}

.sign-in-gate-waitlist-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #f4f4f5);
  margin: 0 0 var(--space-sm, 0.5rem);
}

.sign-in-gate-waitlist-message {
  font-size: 1rem;
  color: var(--color-text-secondary, #a1a1aa);
  margin: 0 0 var(--space-lg, 1.618rem);
  line-height: 1.6;
}

.sign-in-gate-waitlist-email {
  font-size: 0.875rem;
  color: var(--color-text-muted, #71717a);
  margin: 0 0 var(--space-xl, 2.618rem);
}

.sign-in-gate-waitlist-email strong {
  color: var(--color-text-secondary, #a1a1aa);
}

.sign-in-gate-btn--secondary {
  background: transparent;
  color: var(--color-text-secondary, #a1a1aa);
  border: 1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1));
}

.sign-in-gate-btn--secondary:hover {
  background: var(--color-bg-secondary, #1a1a2e);
  border-color: var(--color-border-medium, rgba(255, 255, 255, 0.2));
}

.sign-in-gate-checking {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md, 1rem);
}

.sign-in-gate-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-bg-tertiary, #2a2a3e);
  border-top-color: var(--color-accent-primary, #3D5A45);
  border-radius: 50%;
  animation: sign-in-gate-spin 0.8s linear infinite;
}

@keyframes sign-in-gate-spin {
  to { transform: rotate(360deg); }
}

.sign-in-gate-checking-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #a1a1aa);
}

@media (prefers-reduced-motion: reduce) {
  .sign-in-gate-overlay,
  .sign-in-gate-btn {
    transition: none;
  }
  .sign-in-gate-spinner {
    animation: none;
  }
}
`;

/**
 * Show the "checking access" state while verifying waitlist.
 */
function showCheckingState(): void {
  const content = overlayEl?.querySelector('.sign-in-gate-content');
  if (!content) return;

  // Hide buttons and error
  const buttonsDiv = content.querySelector('.sign-in-gate-buttons');
  const errorDiv = content.querySelector('.sign-in-gate-error');
  const subtitle = content.querySelector('.sign-in-gate-subtitle');

  if (buttonsDiv) (buttonsDiv as HTMLElement).style.display = 'none';
  if (errorDiv) (errorDiv as HTMLElement).style.display = 'none';
  if (subtitle) (subtitle as HTMLElement).textContent = t('auth.checkingAccess');

  // Add spinner if not already present
  if (!content.querySelector('.sign-in-gate-checking')) {
    const checkingDiv = document.createElement('div');
    checkingDiv.className = 'sign-in-gate-checking';

    const spinner = document.createElement('div');
    spinner.className = 'sign-in-gate-spinner';

    const text = document.createElement('p');
    text.className = 'sign-in-gate-checking-text';
    text.textContent = t('auth.checkingLabel');

    checkingDiv.appendChild(spinner);
    checkingDiv.appendChild(text);

    // Insert after subtitle
    subtitle?.after(checkingDiv);
  }
}

/** The waitlist notice's icon: a clock. */
function createWaitlistIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('sign-in-gate-waitlist-icon');

  // Clock icon path
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  path1.setAttribute('points', '12 6 12 12 16 14');

  svg.appendChild(circle);
  svg.appendChild(path1);

  return svg;
}

type AccessNotice = Exclude<AccessOutcome, { kind: 'approved' }>;

const NOTICE_COPY: Record<AccessNotice['kind'], { title: string; message: string }> = {
  waitlisted: { title: 'auth.waitlistTitle', message: 'auth.waitlistMessage' },
  'verify-email': { title: 'auth.verifyEmailTitle', message: 'auth.verifyEmailMessage' },
  'no-email': { title: 'auth.noEmailTitle', message: 'auth.noEmailMessage' },
  unavailable: { title: 'auth.checkFailedTitle', message: 'auth.checkFailedMessage' },
};

/** Why the user can't come in yet; `unavailable` also offers to check again. */
function showAccessNotice(notice: AccessNotice, retry: () => void): void {
  const email = notice.kind === 'waitlisted' ? notice.email : undefined;
  const content = overlayEl?.querySelector('.sign-in-gate-content');
  if (!content) return;

  // Clear existing content
  content.innerHTML = '';

  // Create waitlist UI
  const waitlistDiv = document.createElement('div');
  waitlistDiv.className = 'sign-in-gate-waitlist visible';

  // Icon
  waitlistDiv.appendChild(createWaitlistIcon());

  // Title
  const title = document.createElement('h1');
  title.id = TITLE_ID; // the notice replaces the welcome content, so it names the dialog now
  title.className = 'sign-in-gate-waitlist-title';
  title.textContent = t(NOTICE_COPY[notice.kind].title);
  waitlistDiv.appendChild(title);

  // Message
  const message = document.createElement('p');
  message.className = 'sign-in-gate-waitlist-message';
  message.textContent = t(NOTICE_COPY[notice.kind].message);
  waitlistDiv.appendChild(message);

  // Email confirmation
  if (email) {
    const emailP = document.createElement('p');
    emailP.className = 'sign-in-gate-waitlist-email';
    const emailMsg = t('auth.waitlistEmail', { email: '{email}' }); // marker kept for the bold address
    emailP.innerHTML = emailMsg.replace('{email}', `<strong>${escapeHtml(email)}</strong>`);
    waitlistDiv.appendChild(emailP);
  }

  // Sign out button (to try different account)
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'sign-in-gate-buttons';

  if (notice.kind === 'unavailable') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'sign-in-gate-btn sign-in-gate-btn--google';
    retryBtn.textContent = t('common.tryAgain');
    retryBtn.addEventListener('click', retry);
    buttonsDiv.appendChild(retryBtn);
  }
  const signOutBtn = document.createElement('button');
  signOutBtn.className = 'sign-in-gate-btn sign-in-gate-btn--secondary';
  signOutBtn.textContent = t('auth.tryDifferentAccount');
  signOutBtn.addEventListener('click', handleSignOutAndRetry);
  buttonsDiv.appendChild(signOutBtn);

  waitlistDiv.appendChild(buttonsDiv);
  content.appendChild(waitlistDiv);
}
/**
 * Handle signing out and returning to the sign-in buttons.
 */
async function handleSignOutAndRetry(): Promise<void> {
  try {
    await signOutReleasingPush();
    log.info('Signed out, showing sign-in options');

    // Remove and recreate the overlay
    overlayEl?.remove();
    overlayEl = createOverlay();
    document.body.appendChild(overlayEl);
    void overlayEl.offsetHeight;
    overlayEl.classList.add('visible');
  } catch (error) {
    log.error('Sign out failed:', error);
  }
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// CREATE UI (using safe DOM methods)
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('sign-in-gate-styles')) return;

  const style = document.createElement('style');
  style.id = 'sign-in-gate-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const TITLE_ID = 'sign-in-gate-title';
let inertBehindGate: HTMLElement[] = [];

/** Signed out, the app behind the gate must be out of reach of Tab and screen readers. */
function keepAppBehindGate(): void {
  inertBehindGate = [...document.body.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el !== overlayEl && !el.inert
  );
  for (const el of inertBehindGate) el.inert = true;
}

/** Undo only what the gate did: hidden panels keep the inert they set themselves */
function releaseAppBehindGate(): void {
  for (const el of inertBehindGate) el.inert = false;
  inertBehindGate = [];
}

function createAppleButton(): HTMLButtonElement {
  const appleBtn = document.createElement('button');
  appleBtn.className = 'sign-in-gate-btn sign-in-gate-btn--apple';
  appleBtn.dataset.provider = 'apple';
  appleBtn.dataset.focusRing = 'inset';
  appleBtn.appendChild(createAppleIcon());
  const appleText = document.createElement('span');
  appleText.textContent = t('auth.continueWithApple');
  appleBtn.appendChild(appleText);
  return appleBtn;
}

function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'sign-in-gate-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', TITLE_ID);

  const content = document.createElement('div');
  content.className = 'sign-in-gate-content';

  // Logo - Ferni Avatar
  const logoDiv = document.createElement('div');
  logoDiv.className = 'sign-in-gate-logo';
  const logoImg = document.createElement('img');
  logoImg.src = '/ferni-avatar.svg';
  logoImg.alt = 'Ferni';
  logoImg.width = 100;
  logoImg.height = 100;
  logoImg.onerror = () => {
    // Fallback to design-system path
    logoImg.src = '/design-system/assets/logos/personas/ferni-avatar.svg';
  };
  logoDiv.appendChild(logoImg);

  // Title
  const title = document.createElement('h1');
  title.id = TITLE_ID;
  title.className = 'sign-in-gate-title';
  title.textContent = t('auth.welcome');

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'sign-in-gate-subtitle';
  subtitle.textContent = t('auth.subtitle');

  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'sign-in-gate-buttons';

  // Google button
  const googleBtn = document.createElement('button');
  googleBtn.className = 'sign-in-gate-btn sign-in-gate-btn--google';
  googleBtn.dataset.provider = 'google';
  googleBtn.dataset.focusRing = 'inset'; // no outward pulse: the focused button would look wider
  googleBtn.appendChild(createGoogleIcon());
  const googleText = document.createElement('span');
  googleText.textContent = t('auth.continueWithGoogle');
  googleBtn.appendChild(googleText);

  const appleBtn = isAppleWebSignInEnabled() ? createAppleButton() : null; // hidden until Apple web sign-in is set up
  buttonsDiv.append(googleBtn, ...(appleBtn ? [appleBtn] : []), ...emulatorSignInButtons((e) => log.error('Emulator sign-in failed:', e)), ...tryFirstButtons());

  // Error container
  const errorDiv = document.createElement('div');
  errorDiv.className = 'sign-in-gate-error';
  errorDiv.setAttribute('role', 'alert');

  // Footer with Terms/Privacy links
  const footer = document.createElement('p');
  footer.className = 'sign-in-gate-footer';
  const parts = t('auth.agreeTerms', { terms: '{terms}', privacy: '{privacy}' }).split('{terms}'); // split around links
  const parts2 = parts[1]!.split('{privacy}');
  footer.appendChild(document.createTextNode(parts[0]!));
  const termsLink = document.createElement('a');
  termsLink.href = TERMS_URL;
  termsLink.target = '_blank';
  termsLink.rel = 'noopener noreferrer';
  termsLink.textContent = t('auth.termsLink');
  footer.appendChild(termsLink);
  footer.appendChild(document.createTextNode(parts2[0]!));
  const privacyLink = document.createElement('a');
  privacyLink.href = PRIVACY_URL;
  privacyLink.target = '_blank';
  privacyLink.rel = 'noopener noreferrer';
  privacyLink.textContent = t('auth.privacyLink');
  footer.appendChild(privacyLink);
  footer.appendChild(document.createTextNode(parts2[1]!));

  // Assemble
  content.appendChild(logoDiv);
  content.appendChild(createAiRoleLabelRow('sign-in-gate-ai-label'));
  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(buttonsDiv);
  content.appendChild(errorDiv);
  content.appendChild(footer);
  overlay.appendChild(content);

  // Add click handlers
  googleBtn.addEventListener('click', () => handleSignIn('google'));
  appleBtn?.addEventListener('click', () => handleSignIn('apple'));

  return overlay;
}

// ============================================================================
// SIGN-IN HANDLERS
// ============================================================================

async function handleSignIn(provider: 'google' | 'apple'): Promise<void> {
  const buttons = overlayEl?.querySelectorAll('.sign-in-gate-btn');
  const errorEl = overlayEl?.querySelector('.sign-in-gate-error');

  // Disable buttons
  buttons?.forEach((btn) => btn.setAttribute('disabled', 'true'));
  errorEl?.classList.remove('visible');

  try {
    log.info(`Signing in with ${provider}`);

    if (provider === 'google') {
      await signInWithGoogle();
    } else {
      await signInWithApple();
    }

    log.info(`${provider} sign-in successful`);
    // Auth state change will trigger hide()
  } catch (error) {
    log.error(`${provider} sign-in failed:`, error);

    // Show error
    if (errorEl) {
      // Say why (popup blocked, provider off, network, closed); never the raw library message.
      errorEl.textContent = signInFailureMessage(error, provider === 'google' ? 'Google' : 'Apple');
      errorEl.classList.add('visible');
    }

    // Re-enable buttons
    buttons?.forEach((btn) => btn.removeAttribute('disabled'));
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the sign-in gate overlay.
 * Returns a promise that resolves when the user successfully signs in.
 */
export async function showSignInGate(): Promise<void> {
  if (isShowing && pendingSignIn) return pendingSignIn;

  isShowing = true;
  injectStyles();
  // Create and show overlay
  overlayEl = createOverlay();
  document.body.appendChild(overlayEl);
  keepAppBehindGate();
  void overlayEl.offsetHeight; // reflow, so the fade-in animates
  overlayEl.classList.add('visible');

  // Subscribe to auth state changes
  const unsubscribe = onAuthStateChange((state: AuthState) => {
    if (state.isAuthenticated) {
      const runCheck = (): void => {
        showCheckingState();
        void checkAccess().then(async (outcome) => {
          log.info('Access check', { outcome: outcome.kind });
          if (outcome.kind !== 'approved') {
            // Stay on the gate and keep listening: they may sign in with another account
            const content = overlayEl?.querySelector('.sign-in-gate-content');
            if (outcome.kind === 'waitlisted' && content && (await showWaitingInGate(content, runCheck, handleSignOutAndRetry, TITLE_ID))) return; // prettier-ignore
            showAccessNotice(outcome, runCheck);
            return;
          }
          hideSignInGate();
          void celebrateAdmissionOnce(); // first sign-in after their spot opened
          unsubscribe();
          resolveSignIn?.();
          resolveSignIn = null;
          pendingSignIn = null;
        });
      };
      runCheck();
    }
  });

  pendingSignIn = new Promise((resolve) => {
    resolveSignIn = resolve;
  });
  return pendingSignIn;
}

/**
 * Hide the sign-in gate overlay.
 */
export function hideSignInGate(): void {
  if (!overlayEl) return;
  releaseAppBehindGate();
  overlayEl.classList.add('hiding');

  setTimeout(() => {
    overlayEl?.remove();
    overlayEl = null;
    isShowing = false;
  }, DURATION.SLOW);
}

/**
 * Check if the sign-in gate is currently showing.
 */
export function isSignInGateShowing(): boolean {
  return isShowing;
}
