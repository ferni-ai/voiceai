/**
 * CLI Authentication UI
 *
 * Handles browser-side authentication for the Ferni CLI.
 * Opens on /cli-auth, authenticates with Firebase, and redirects
 * back to the CLI callback server with tokens.
 */

import { getAuth, signInWithPopup, GoogleAuthProvider, type User } from 'firebase/auth';
import { t } from '../i18n/index.js';

// ============================================================================
// TYPES
// ============================================================================

interface CLIAuthParams {
  callback: string;
}

type AuthStatus = 'loading' | 'ready' | 'authenticating' | 'success' | 'error';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse query parameters from URL
 */
function getQueryParams(): CLIAuthParams {
  const params = new URLSearchParams(window.location.search);
  return {
    callback: params.get('callback') || '',
  };
}

/**
 * Build callback URL with token parameters
 */
function buildCallbackUrl(
  callback: string,
  user: User,
  token: string,
  refreshToken: string,
  expiresIn: number
): string {
  const url = new URL(callback);
  url.searchParams.set('token', token);
  url.searchParams.set('refreshToken', refreshToken);
  url.searchParams.set('userId', user.uid);
  url.searchParams.set('email', user.email || '');
  url.searchParams.set('displayName', user.displayName || '');
  url.searchParams.set('expiresIn', expiresIn.toString());
  return url.toString();
}

/**
 * Redirect to callback with error
 */
function redirectWithError(callback: string, error: string): void {
  const url = new URL(callback);
  url.searchParams.set('error', error);
  window.location.href = url.toString();
}

/**
 * Create an element with styles
 */
function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration> = {},
  textContent?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el.style, styles);
  if (textContent !== undefined) {
    el.textContent = textContent;
  }
  return el;
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Render the CLI auth page using safe DOM methods
 * @design-tokens-ignore - Standalone page without access to design system CSS variables
 */
function renderAuthPage(status: AuthStatus, message?: string): void {
  const container = document.getElementById('app') || document.body;

  // Clear container safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Set body styles
  document.body.style.cssText = `
    margin: 0;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${status === 'error' ? '#fef2f2' : '#f0fdf4'};
    box-sizing: border-box;
  `;

  // Main container
  const authContainer = createElement('div', {
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    padding: '40px',
    background: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  });

  // Logo
  const logo = createElement('div', {
    width: '64px',
    height: '64px',
    margin: '0 auto 24px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #4a6741 0%, #6b8a5c 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '28px',
    fontWeight: 'bold',
  }, 'F');

  // Title
  const title = createElement('h1', {
    fontSize: '24px',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '8px',
  }, 'Ferni CLI Authentication');

  // Status text
  const statusText = createElement('p', {
    fontSize: '16px',
    color: status === 'error' ? '#991b1b' : '#166534',
    marginBottom: '24px',
  });

  switch (status) {
    case 'loading':
      statusText.textContent = t('auth.preparing');
      break;
    case 'ready':
      statusText.textContent = t('auth.clickToSignIn');
      break;
    case 'authenticating':
      statusText.textContent = t('auth.authenticating');
      break;
    case 'success':
      statusText.textContent = t('auth.authenticationSuccessful');
      break;
    case 'error':
      statusText.textContent = t('auth.authenticationFailed');
      break;
  }

  authContainer.appendChild(logo);
  authContainer.appendChild(title);
  authContainer.appendChild(statusText);

  // Sign in button (only show when ready)
  if (status === 'ready') {
    const btn = createElement('button', {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 28px',
      background: '#4a6741',
      color: 'white',
      border: 'none',
      borderRadius: '12px',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s',
    }, 'Sign in with Google');

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#3d5a35';
      btn.style.transform = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#4a6741';
      btn.style.transform = 'translateY(0)';
    });
    btn.addEventListener('click', handleGoogleSignIn);

    authContainer.appendChild(btn);
  }

  // Message (if any)
  if (message) {
    const messageEl = createElement('div', {
      marginTop: '16px',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '14px',
      color: status === 'error' ? '#991b1b' : '#166534',
      background: status === 'error' ? '#fef2f2' : '#f0fdf4',
    }, message);
    authContainer.appendChild(messageEl);
  }

  // Help text
  if (status === 'success' || status === 'error') {
    const helpText = createElement('p', {
      marginTop: '24px',
      fontSize: '13px',
      color: '#6b7280',
    });
    helpText.textContent = status === 'success'
      ? 'You can close this window and return to your terminal.'
      : 'Please close this window and try again from the CLI.';
    authContainer.appendChild(helpText);
  }

  container.appendChild(authContainer);
}

// ============================================================================
// AUTHENTICATION FLOW
// ============================================================================

let callbackUrl = '';

/**
 * Handle Google sign in
 */
async function handleGoogleSignIn(): Promise<void> {
  renderAuthPage('authenticating');

  try {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Get the ID token
    const tokenResult = await user.getIdTokenResult();
    const idToken = tokenResult.token;
    const refreshToken = user.refreshToken;

    // Calculate expiration (Firebase tokens expire in 1 hour = 3600 seconds)
    const expiresIn = 3600;

    const welcomeMsg = `Welcome, ${user.displayName || user.email}!`;
    renderAuthPage('success', welcomeMsg);

    // Redirect to CLI callback
    setTimeout(() => {
      const redirectUrl = buildCallbackUrl(callbackUrl, user, idToken, refreshToken, expiresIn);
      window.location.href = redirectUrl;
    }, 1500);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    renderAuthPage('error', message);

    // Redirect with error after delay
    setTimeout(() => {
      redirectWithError(callbackUrl, message);
    }, 3000);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize CLI auth page
 */
export function initCLIAuth(): void {
  const params = getQueryParams();

  if (!params.callback) {
    renderAuthPage('error', 'Missing callback URL. Please run `ferni auth login` from the CLI.');
    return;
  }

  // Validate callback URL (must be localhost for security)
  try {
    const callbackUrlParsed = new URL(params.callback);
    if (!['localhost', '127.0.0.1'].includes(callbackUrlParsed.hostname)) {
      renderAuthPage('error', 'Invalid callback URL. Must be localhost.');
      return;
    }
  } catch {
    renderAuthPage('error', 'Invalid callback URL format.');
    return;
  }

  callbackUrl = params.callback;
  renderAuthPage('ready');
}
