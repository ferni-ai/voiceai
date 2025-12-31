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

import { DURATION, EASING } from '../config/animation-constants.js';
import {
  getAuthToken,
  onAuthStateChange,
  signInWithApple,
  signInWithGoogle,
  signOut,
  type AuthState,
} from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';

// ============================================================================
// TYPES
// ============================================================================

interface WaitlistCheckResult {
  approved: boolean;
  status: 'approved' | 'pending' | 'no_email' | 'not_found';
  tier?: string;
  email?: string;
  message?: string;
}

const log = createLogger('SignInGate');

// ============================================================================
// ELEMENT REFERENCES
// ============================================================================

let overlayEl: HTMLElement | null = null;
let isShowing = false;
let resolveSignIn: (() => void) | null = null;

// ============================================================================
// STYLES
// ============================================================================

const STYLES = `
.sign-in-gate-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-system, 9999);
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
  width: 80px;
  height: 80px;
  margin: 0 auto var(--space-lg, 1.618rem);
  border-radius: 50%;
  background: var(--color-bg-secondary, #1a1a2e);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  overflow: hidden;
}

.sign-in-gate-logo img {
  width: 60px;
  height: 60px;
  border-radius: 50%;
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

.sign-in-gate-btn:hover {
  transform: translateY(-1px);
}

.sign-in-gate-btn:active {
  transform: translateY(0);
}

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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.sign-in-gate-btn--apple {
  background: #000;
  color: #fff;
}

.sign-in-gate-btn--apple:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.sign-in-gate-error {
  margin-top: var(--space-md, 1rem);
  padding: var(--space-sm, 0.5rem) var(--space-md, 1rem);
  background: var(--color-semantic-error-bg, rgba(239, 68, 68, 0.1));
  border-radius: var(--radius-md, 8px);
  color: var(--color-semantic-error, #ef4444);
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

// ============================================================================
// WAITLIST CHECK
// ============================================================================

/**
 * Check if the authenticated user has access (approved on waitlist).
 * Returns the waitlist status to determine what UI to show.
 */
async function checkWaitlistAccess(): Promise<WaitlistCheckResult> {
  try {
    const token = await getAuthToken();
    if (!token) {
      log.warn('No auth token available for waitlist check');
      return { approved: false, status: 'not_found', message: 'Not authenticated' };
    }

    const response = await fetch('/api/waitlist/check', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      log.error('Waitlist check failed:', response.status);
      return { approved: false, status: 'not_found', message: 'Check failed' };
    }

    const result = (await response.json()) as WaitlistCheckResult;
    log.info('Waitlist check result:', result);
    return result;
  } catch (error) {
    log.error('Waitlist check error:', error);
    return { approved: false, status: 'not_found', message: 'Network error' };
  }
}

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
  if (subtitle) (subtitle as HTMLElement).textContent = 'Checking your access...';

  // Add spinner if not already present
  if (!content.querySelector('.sign-in-gate-checking')) {
    const checkingDiv = document.createElement('div');
    checkingDiv.className = 'sign-in-gate-checking';

    const spinner = document.createElement('div');
    spinner.className = 'sign-in-gate-spinner';

    const text = document.createElement('p');
    text.className = 'sign-in-gate-checking-text';
    text.textContent = 'Just a moment...';

    checkingDiv.appendChild(spinner);
    checkingDiv.appendChild(text);

    // Insert after subtitle
    subtitle?.after(checkingDiv);
  }
}

/**
 * Create the waitlist icon SVG (clock/hourglass icon).
 */
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

/**
 * Transform the UI to show the waitlist pending state.
 */
function showWaitlistPending(email?: string): void {
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
  title.className = 'sign-in-gate-waitlist-title';
  title.textContent = "You're on the list!";
  waitlistDiv.appendChild(title);

  // Message
  const message = document.createElement('p');
  message.className = 'sign-in-gate-waitlist-message';
  message.textContent =
    "We're rolling out Ferni gradually to ensure everyone gets the best experience. " +
    "We'll send you an email as soon as your spot opens up.";
  waitlistDiv.appendChild(message);

  // Email confirmation
  if (email) {
    const emailP = document.createElement('p');
    emailP.className = 'sign-in-gate-waitlist-email';
    emailP.innerHTML = `We'll notify you at <strong>${escapeHtml(email)}</strong>`;
    waitlistDiv.appendChild(emailP);
  }

  // Sign out button (to try different account)
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'sign-in-gate-buttons';

  const signOutBtn = document.createElement('button');
  signOutBtn.className = 'sign-in-gate-btn sign-in-gate-btn--secondary';
  signOutBtn.textContent = 'Try a different account';
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
    await signOut();
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

function createGoogleIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');

  const paths = [
    { fill: '#4285F4', d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z' },
    { fill: '#34A853', d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z' },
    { fill: '#FBBC05', d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z' },
    { fill: '#EA4335', d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' },
  ];

  for (const { fill, d } of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    svg.appendChild(path);
  }

  return svg;
}

function createAppleIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z');
  svg.appendChild(path);

  return svg;
}

function createOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'sign-in-gate-overlay';

  const content = document.createElement('div');
  content.className = 'sign-in-gate-content';

  // Logo
  const logoDiv = document.createElement('div');
  logoDiv.className = 'sign-in-gate-logo';
  const logoImg = document.createElement('img');
  logoImg.src = '/logos/ferni-avatar.webp';
  logoImg.alt = 'Ferni';
  logoImg.width = 60;
  logoImg.height = 60;
  logoImg.onerror = () => {
    logoImg.style.display = 'none';
    logoDiv.textContent = 'F';
  };
  logoDiv.appendChild(logoImg);

  // Title
  const title = document.createElement('h1');
  title.className = 'sign-in-gate-title';
  title.textContent = 'Welcome to Ferni';

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'sign-in-gate-subtitle';
  subtitle.textContent = 'Sign in to start your journey. Your conversations, memories, and progress will be saved across all your devices.';

  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'sign-in-gate-buttons';

  // Google button
  const googleBtn = document.createElement('button');
  googleBtn.className = 'sign-in-gate-btn sign-in-gate-btn--google';
  googleBtn.dataset.provider = 'google';
  googleBtn.appendChild(createGoogleIcon());
  const googleText = document.createElement('span');
  googleText.textContent = 'Continue with Google';
  googleBtn.appendChild(googleText);

  // Apple button
  const appleBtn = document.createElement('button');
  appleBtn.className = 'sign-in-gate-btn sign-in-gate-btn--apple';
  appleBtn.dataset.provider = 'apple';
  appleBtn.appendChild(createAppleIcon());
  const appleText = document.createElement('span');
  appleText.textContent = 'Continue with Apple';
  appleBtn.appendChild(appleText);

  buttonsDiv.appendChild(googleBtn);
  buttonsDiv.appendChild(appleBtn);

  // Error container
  const errorDiv = document.createElement('div');
  errorDiv.className = 'sign-in-gate-error';
  errorDiv.setAttribute('role', 'alert');

  // Footer
  const footer = document.createElement('p');
  footer.className = 'sign-in-gate-footer';
  footer.textContent = 'By continuing, you agree to our ';
  const termsLink = document.createElement('a');
  termsLink.href = '/terms';
  termsLink.target = '_blank';
  termsLink.textContent = 'Terms';
  footer.appendChild(termsLink);
  footer.appendChild(document.createTextNode(' and '));
  const privacyLink = document.createElement('a');
  privacyLink.href = '/privacy';
  privacyLink.target = '_blank';
  privacyLink.textContent = 'Privacy Policy';
  footer.appendChild(privacyLink);
  footer.appendChild(document.createTextNode('.'));

  // Assemble
  content.appendChild(logoDiv);
  content.appendChild(title);
  content.appendChild(subtitle);
  content.appendChild(buttonsDiv);
  content.appendChild(errorDiv);
  content.appendChild(footer);
  overlay.appendChild(content);

  // Add click handlers
  googleBtn.addEventListener('click', () => handleSignIn('google'));
  appleBtn.addEventListener('click', () => handleSignIn('apple'));

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
      const message =
        error instanceof Error
          ? error.message
          : 'Sign-in was cancelled or failed. Please try again.';
      errorEl.textContent = message;
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
  if (isShowing) {
    log.debug('Sign-in gate already showing');
    return new Promise((resolve) => {
      resolveSignIn = resolve;
    });
  }

  isShowing = true;
  injectStyles();

  // Create and show overlay
  overlayEl = createOverlay();
  document.body.appendChild(overlayEl);

  // Force reflow for animation
  void overlayEl.offsetHeight;
  overlayEl.classList.add('visible');

  // Subscribe to auth state changes
  const unsubscribe = onAuthStateChange((state: AuthState) => {
    if (state.isAuthenticated) {
      log.info('User authenticated, checking waitlist status');

      // Show checking state
      showCheckingState();

      // Check waitlist access
      checkWaitlistAccess()
        .then((result) => {
          if (result.approved) {
            log.info('User approved, granting access');
            hideSignInGate();
            unsubscribe();
            resolveSignIn?.();
            resolveSignIn = null;
          } else {
            log.info('User not approved, showing waitlist pending');
            showWaitlistPending(result.email);
            // Don't resolve - user stays on gate
            // Don't unsubscribe - we might need to check again if they sign out and back in
          }
        })
        .catch((error) => {
          log.error('Waitlist check failed:', error);
          // On error, show waitlist pending as safe default
          showWaitlistPending();
        });
    }
  });

  return new Promise((resolve) => {
    resolveSignIn = resolve;
  });
}

/**
 * Hide the sign-in gate overlay.
 */
export function hideSignInGate(): void {
  if (!overlayEl) return;

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
