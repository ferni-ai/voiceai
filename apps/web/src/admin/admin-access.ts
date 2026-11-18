/**
 * Who may open the admin portal, decided before any section loads.
 *
 * The server lets a request through as admin when the Firebase token carries the
 * `admin: true` custom claim (src/api/auth-middleware.ts), or under `vite dev`
 * with the dev-mode key. Without this check a signed-out visitor, or a signed-in
 * account without the claim, saw every section report the backend as down.
 * This only decides what the page shows; the server still checks every request.
 *
 * @module AdminAccess
 */

import { getAuthToken, initAuth, signInWithGoogle } from '../services/firebase-auth.service.js';
import { createLogger } from '../utils/logger.js';
import { initAdminPortal } from './AdminPortal.js';

const log = createLogger('AdminAccess');

export type AdminAccess =
  | { kind: 'admin' }
  | { kind: 'signed-out' }
  | { kind: 'not-admin'; email: string | null }
  | { kind: 'no-sign-in' };

/** The claims in a Firebase ID token's payload; {} if it can't be read. */
export function tokenClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims: unknown = JSON.parse(json);
    return typeof claims === 'object' && claims !== null ? (claims as Record<string, unknown>) : {};
  } catch (error) {
    log.warn({ error }, 'Could not read the sign-in token');
    return {};
  }
}

export interface AccessDeps {
  devBuild: boolean;
  initAuth: typeof initAuth;
  getAuthToken: typeof getAuthToken;
}

const liveDeps: AccessDeps = { devBuild: import.meta.env.DEV, initAuth, getAuthToken };

export async function checkAdminAccess(deps: AccessDeps = liveDeps): Promise<AdminAccess> {
  if (deps.devBuild) return { kind: 'admin' };
  const state = await deps.initAuth();
  if (!state.isConfigured) return { kind: 'no-sign-in' };
  if (!state.isLinked) return { kind: 'signed-out' };
  const token = await deps.getAuthToken();
  if (token !== null && tokenClaims(token).admin === true) return { kind: 'admin' };
  return { kind: 'not-admin', email: state.email };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderAccessGate(access: Exclude<AdminAccess, { kind: 'admin' }>): string {
  const [title, detail, canSignIn] =
    access.kind === 'signed-out'
      ? ['Sign in to use the admin portal', 'Use a Google account that has admin access.', true]
      : access.kind === 'not-admin'
        ? [
            'This account is not an admin',
            `${access.email !== null ? escapeHtml(access.email) : 'The signed-in account'} has no admin access. Sign in with another account, or ask an admin to grant it.`,
            true,
          ]
        : [
            'Sign-in is unavailable',
            'This page could not load its sign-in settings, so admin access cannot be checked. Reload to try again.',
            false,
          ];
  return `
    <div class="admin-access-gate" role="alert" style="max-width: 28rem; margin: 20vh auto; padding: 2rem; text-align: center; color: var(--color-text-primary); background: var(--color-background-surface); border-radius: var(--radius-lg, 12px);">
      <h1 style="font-size: 1.25rem; margin: 0 0 0.75rem;">${title}</h1>
      <p style="margin: 0 0 1.5rem; color: var(--color-text-secondary);">${detail}</p>
      ${canSignIn ? '<button type="button" class="admin-access-sign-in">Sign in with Google</button>' : ''}
    </div>`;
}

/** Open the portal for an admin; otherwise say why it can't open, with a way to sign in. */
export async function openAdminPortal(deps: AccessDeps = liveDeps): Promise<void> {
  const access = await checkAdminAccess(deps);
  if (access.kind === 'admin') {
    await initAdminPortal();
    return;
  }
  log.info({ access: access.kind }, 'Admin portal closed to this visitor');
  const container = document.getElementById('app') ?? document.body;
  container.innerHTML = renderAccessGate(access);
  container.querySelector('.admin-access-sign-in')?.addEventListener('click', () => {
    signInWithGoogle()
      .then(() => window.location.reload())
      .catch((error: unknown) => log.error({ error }, 'Admin sign-in failed'));
  });
}
