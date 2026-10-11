/**
 * Approval page (/p/:id): one pending action, Approve or Decline.
 *
 * Shows the action's stored fields exactly (key and value as text, never
 * HTML). The decision is sent with the hash of what was shown, so it can
 * only approve this exact action. The server wants a sign-in from the last
 * 5 minutes: when it says otherwise (401) the person signs in again and the
 * decision is sent once more.
 *
 * @module ApprovePage
 */

import { initI18n, t } from '../i18n/index.js';
import { initializeAuth } from '../services/auth-init.service.js';
import { signOut } from '../services/firebase-auth.service.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { showSignInGate } from './sign-in-gate.ui.js';

const log = createLogger('ApprovePage');

const PAGE = 'approve-page';
const STYLE_ID = 'approve-page-styles';

export interface PendingActionView {
  id: string;
  kind: 'send_text' | 'place_call' | 'purchase';
  payload: Record<string, string | number>;
  actionHash: string;
  moneyMoving: boolean;
  expiresAt: number;
  status: 'pending' | 'approved' | 'declined' | 'used';
}

type Decision = 'approve' | 'decline';

/** The action id in /p/:id, or null for any other path. */
export function pendingActionIdFromPath(pathname: string): string | null {
  return /^\/p\/([A-Za-z0-9_-]{43})\/?$/.exec(pathname)?.[1] ?? null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resultMessage(status: number, action: PendingActionView, decision: Decision): string {
  if (status === 200)
    return decision === 'approve' ? t('approvePage.approved') : t('approvePage.declined');
  if (status === 410) return t('approvePage.expired');
  if (status === 409) return t('approvePage.changed');
  if (status === 403)
    return action.moneyMoving ? t('approvePage.needsPasskey') : t('approvePage.blocked');
  if (status === 404) return t('approvePage.notFound');
  return t('approvePage.failed');
}

/** Send the decision; on 401 sign in again (fresh auth_time) and send it once more. */
export async function sendDecision(action: PendingActionView, decision: Decision): Promise<number> {
  const send = () =>
    apiPost<{ status: string }>(
      `/api/pending-actions/${action.id}/decision`,
      { decision, actionHash: action.actionHash },
      { maxRetries: 0 }
    );
  let res = await send();
  if (res.status === 401) {
    await signOut();
    await showSignInGate();
    res = await send();
  }
  if (!res.ok) log.warn('Decision not recorded', { status: res.status });
  return res.status;
}

/** The action as DOM, with Approve/Decline wired to onDecide. */
export function renderPendingAction(
  action: PendingActionView,
  onDecide: (decision: Decision) => Promise<string>,
  now = Date.now()
): HTMLElement {
  const card = el('article', `${PAGE}__card`);
  card.append(el('h1', `${PAGE}__title`, t(`approvePage.kind.${action.kind}`)));
  const fields = el('dl', `${PAGE}__fields`);
  for (const [key, value] of Object.entries(action.payload)) {
    fields.append(el('dt', `${PAGE}__key`, key), el('dd', `${PAGE}__value`, String(value)));
  }
  const status = el('p', `${PAGE}__status`);
  status.setAttribute('role', 'status');
  card.append(fields, status);

  if (action.status !== 'pending') {
    status.textContent = t('approvePage.alreadyAnswered');
    return card;
  }
  if (now > action.expiresAt) {
    status.textContent = t('approvePage.expired');
    return card;
  }
  const minutes = Math.max(1, Math.ceil((action.expiresAt - now) / 60_000));
  status.textContent = t('approvePage.expiresIn', { minutes });

  const actions = el('div', `${PAGE}__actions`);
  const decline = el('button', `${PAGE}__button`, t('approvePage.decline'));
  const approve = el(
    'button',
    `${PAGE}__button ${PAGE}__button--primary`,
    t('approvePage.approve')
  );
  for (const [button, decision] of [
    [decline, 'decline'],
    [approve, 'approve'],
  ] as const) {
    button.type = 'button';
    button.addEventListener('click', () => {
      decline.disabled = true;
      approve.disabled = true;
      void onDecide(decision).then((message) => {
        status.textContent = message;
        actions.remove();
      });
    });
  }
  actions.append(decline, approve);
  card.append(actions);
  return card;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${PAGE} { min-height: 100vh; display: flex; justify-content: center; box-sizing: border-box;
      padding: var(--ma-silence) var(--space-4); background: var(--color-background-primary);
      font-family: var(--font-body); color: var(--color-text-primary); }
    .${PAGE}__card { width: 100%; max-width: min(480px, 100%); align-self: flex-start;
      padding: var(--ma-rest); background: var(--color-background-elevated);
      border: 1px solid var(--color-border-subtle); border-radius: var(--radius-xl); box-shadow: var(--shadow-md); }
    .${PAGE}__title { margin: 0 0 var(--ma-pause); font-size: var(--text-lg); font-weight: var(--font-weight-semibold); }
    .${PAGE}__fields { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: var(--ma-breath) var(--ma-pause); }
    .${PAGE}__key { color: var(--color-text-muted); font-size: var(--text-sm); }
    .${PAGE}__value { margin: 0; font-size: var(--text-base); white-space: pre-wrap; overflow-wrap: anywhere; }
    .${PAGE}__status { margin: var(--ma-rest) 0 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
    .${PAGE}__actions { display: flex; gap: var(--ma-pause); justify-content: flex-end; margin-top: var(--ma-rest); }
    .${PAGE}__button { min-height: 44px; padding: 0 var(--space-6); border-radius: var(--radius-full);
      border: 1px solid var(--color-border-medium); background: var(--color-background-secondary);
      color: var(--color-text-primary); font: inherit; cursor: pointer; }
    .${PAGE}__button--primary { background: var(--color-accent-primary); border-color: var(--color-accent-primary);
      color: var(--color-text-inverse); }
    .${PAGE}__button:hover, .${PAGE}__button:focus-visible { border-color: var(--color-accent-hover); }
    .${PAGE}__button:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
    .${PAGE}__button:disabled { opacity: 0.6; cursor: default; }
  `;
  document.head.appendChild(style);
}

/** Load the action for id and show it in root (or why it can't be shown). */
export async function showPendingAction(root: HTMLElement, id: string): Promise<void> {
  injectStyles();
  root.replaceChildren(el('p', `${PAGE}__status`, t('approvePage.loading')));
  const res = await apiGet<{ action: PendingActionView }>(`/api/pending-actions/${id}`, undefined, {
    maxRetries: 1,
  });
  const action = res.ok ? res.data?.action : undefined;
  if (!action) {
    root.replaceChildren(
      el(
        'p',
        `${PAGE}__status`,
        res.status === 404 ? t('approvePage.notFound') : t('approvePage.failed')
      )
    );
    return;
  }
  const onDecide = async (decision: Decision) =>
    resultMessage(await sendDecision(action, decision), action, decision);
  root.replaceChildren(renderPendingAction(action, onDecide));
}

/** Entry for /p/:id: sign in, then show the action in place of the app. */
export async function initApprovePage(id: string): Promise<void> {
  await initI18n();
  const auth = await initializeAuth();
  if (!auth.isAuthenticated) await showSignInGate();
  const root = document.createElement('main');
  root.className = PAGE;
  document.body.replaceChildren(root);
  await showPendingAction(root, id);
}
