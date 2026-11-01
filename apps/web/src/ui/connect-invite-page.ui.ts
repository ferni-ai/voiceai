/**
 * Connect page (/connect#i=<invite>): the one-tap link a connect moment texts
 * to the owner's own phone or email, after they said yes on a call.
 *
 * It says plainly what connecting shares, then its button spends the invite
 * (POST /auth/oauth/start-from-invite) and goes on to the provider's normal
 * consent screen. The invite rides the fragment, which no server or link
 * preview ever sees; the router clears it from the address bar before this
 * page opens. No sign-in is needed: the invite names the account. A browser
 * signed in as someone else is refused by the server.
 *
 * @module ConnectInvitePage
 */

import { initI18n, t } from '../i18n/index.js';
import { initializeAuth } from '../services/auth-init.service.js';
import { isSameOriginPath } from '../services/oauth-connect.service.js';
import { apiPost } from '../utils/api.js';
import { refuseFraming } from '../utils/frame-guard.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ConnectInvitePage');

export const CONNECT_PAGE_PATH = '/connect';
export const CONNECT_INVITE_START_PATH = '/auth/oauth/start-from-invite';

const PAGE_CLASS = 'connect-invite-page';
const STYLE_ID = 'connect-invite-page-styles';
const SHARED_KEYS = ['sees', 'changes', 'never', 'undo'] as const;

/** The invite in a /connect link (#i=<43 characters>), or null for anything else. */
export function connectInviteFromLocation(pathname: string, hash: string): string | null {
  if (pathname !== CONNECT_PAGE_PATH && pathname !== `${CONNECT_PAGE_PATH}/`) return null;
  return /^#i=([A-Za-z0-9_-]{43})$/.exec(hash)?.[1] ?? null;
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

/** Why the server wouldn't start the flow, in words for the person holding the link. */
function refusal(status: number): string {
  if (status === 410) return t('connectInvite.expired');
  if (status === 403) return t('connectInvite.otherAccount');
  return t('connectInvite.failed');
}

/** Spend the invite and go to the provider; on refusal, say why in place of the button. */
async function connect(button: HTMLButtonElement, invite: string): Promise<void> {
  button.disabled = true;
  button.textContent = t('connectInvite.opening');
  const res = await apiPost<{ url?: string }>(
    CONNECT_INVITE_START_PATH,
    { invite },
    { maxRetries: 0 } // the invite is single use: a retry could only be refused
  );
  const url = res.ok ? res.data?.url : undefined;
  if (isSameOriginPath(url)) {
    window.location.href = url;
    return;
  }
  log.warn('Connect invite refused', { status: res.status });
  const status = el('p', `${PAGE_CLASS}__status`, refusal(res.status));
  status.setAttribute('role', 'status');
  button.replaceWith(status);
}

/** The consent card: what connecting shares, and one button. */
export function renderConnectInvite(invite: string): HTMLElement {
  const card = el('article', `${PAGE_CLASS}__card`);
  const list = el('ul', `${PAGE_CLASS}__list`);
  list.append(
    ...SHARED_KEYS.map((key) => el('li', `${PAGE_CLASS}__item`, t(`connectInvite.${key}`)))
  );
  const button = el('button', `${PAGE_CLASS}__button`, t('connectInvite.connect'));
  button.type = 'button';
  button.addEventListener('click', () => void connect(button, invite), { once: true });
  card.append(
    el('h1', `${PAGE_CLASS}__title`, t('connectInvite.title')),
    el('p', `${PAGE_CLASS}__lead`, t('connectInvite.lead')),
    list,
    button
  );
  return card;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${PAGE_CLASS} { min-height: 100vh; display: flex; justify-content: center; box-sizing: border-box;
      padding: var(--ma-silence) var(--space-4); background: var(--color-background-primary);
      font-family: var(--font-body); color: var(--color-text-primary); }
    .${PAGE_CLASS}__card { width: 100%; max-width: min(480px, 100%); padding: var(--ma-rest); align-self: flex-start;
      background: var(--color-background-elevated); border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl); box-shadow: var(--shadow-md); }
    .${PAGE_CLASS}__title { margin: 0 0 var(--ma-breath); font-family: var(--font-display, var(--font-body));
      font-size: var(--text-xl); font-weight: var(--font-weight-semibold); line-height: var(--leading-tight); }
    .${PAGE_CLASS}__lead { margin: 0 0 var(--ma-pause); font-size: var(--text-base);
      line-height: var(--leading-relaxed); color: var(--color-text-secondary); }
    .${PAGE_CLASS}__list { margin: 0; padding-left: var(--space-6); }
    .${PAGE_CLASS}__item { margin-bottom: var(--ma-breath); font-size: var(--text-sm); line-height: var(--leading-relaxed); }
    .${PAGE_CLASS}__button { width: 100%; min-height: 48px; margin-top: var(--ma-rest); padding: 0 var(--space-6);
      border-radius: var(--radius-full); border: 0; font: inherit; font-weight: var(--font-weight-semibold);
      background: var(--color-accent-primary); color: var(--color-text-on-accent, #fff); cursor: pointer; }
    .${PAGE_CLASS}__button:hover { background: var(--color-accent-hover); }
    .${PAGE_CLASS}__button:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
    .${PAGE_CLASS}__button:disabled { cursor: progress; opacity: 0.7; }
    .${PAGE_CLASS}__status { margin: var(--ma-rest) 0 0; font-size: var(--text-base); line-height: var(--leading-relaxed); }
  `;
  document.head.appendChild(style);
}

/** Entry for /connect#i=…: the consent card in place of the app. */
export async function initConnectInvitePage(invite: string): Promise<void> {
  if (refuseFraming()) return;
  await initI18n();
  // Not a sign-in gate: this only lets a signed-in browser send its token, so
  // the server can refuse a link opened in someone else's account.
  await initializeAuth();
  injectStyles();
  const root = document.createElement('main');
  root.className = PAGE_CLASS;
  root.append(renderConnectInvite(invite));
  document.body.replaceChildren(root);
}
