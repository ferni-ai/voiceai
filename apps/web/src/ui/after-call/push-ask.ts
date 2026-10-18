/**
 * After-call ask: "Want Ferni to check in about this?"
 *
 * After one call a new person had no channel back: notifications were only
 * behind the settings Save button. Yes asks for permission and subscribes the
 * way settings does (subscribePush). Shown once per person per browser, only
 * with WEB_PUSH_DELIVERY on for them (webPushDelivery from GET
 * /api/outreach/preferences), signed in, and permission still "default".
 * iPhone/iPad outside the Home Screen (no web push there) get a how-to
 * instead. It never blocks closing the card.
 *
 * @module ui/after-call/push-ask
 */

import { t } from '../../i18n/index.js';
import { getFirebaseUid } from '../../services/firebase-auth.service.js';
import { subscribePush } from '../../services/push-preference.js';
import { getPushNotificationsService } from '../../services/push-notifications.service.js';
import { apiGet } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AfterCallPushAsk');

const ASK_CLASS = 'after-call-push-ask';
const STYLE_ID = 'ferni-after-call-push-ask-styles';
const ASKED_KEY_PREFIX = 'ferni:after-call-push-ask:';

export type PushAskKind = 'ask' | 'install-hint' | 'none';

export interface PushAskContext {
  /** WEB_PUSH_DELIVERY for this person, from the server. */
  flagOn: boolean;
  /** The signed-in account, or null. */
  uid: string | null;
  /** Whether this person was already asked on this browser; null when storage is blocked. */
  alreadyAsked: boolean | null;
  /** Service worker, PushManager and Notification are all there. */
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  /** iPhone or iPad, not opened from the Home Screen: web push can't work here yet. */
  needsHomeScreen: boolean;
}

/** What the after-call card shows. Pure: every input is in the context. */
export function decidePushAsk(c: PushAskContext): PushAskKind {
  if (!c.flagOn || !c.uid || c.alreadyAsked !== false) return 'none';
  if (c.needsHomeScreen) return 'install-hint';
  if (!c.supported || c.permission !== 'default') return 'none';
  return 'ask';
}

function askedKey(uid: string): string {
  return `${ASKED_KEY_PREFIX}${uid}`;
}

/** True/false when storage works; null when it is blocked (then we never ask). */
function wasAsked(uid: string): boolean | null {
  try {
    return localStorage.getItem(askedKey(uid)) !== null;
  } catch {
    return null;
  }
}

function rememberAsked(uid: string): void {
  try {
    localStorage.setItem(askedKey(uid), new Date().toISOString());
  } catch {
    // storage blocked: wasAsked() already returned null, so we never got here
  }
}

export function isIosDevice(nav: Navigator = navigator): boolean {
  const ua = nav.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    standalone ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}

function browserSupportsPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function flagOnForMe(): Promise<boolean> {
  try {
    const res = await apiGet<{ webPushDelivery?: unknown }>('/api/outreach/preferences');
    return res.ok && res.data?.webPushDelivery === true;
  } catch (error) {
    log.debug('Push ask flag not read', { error: String(error) });
    return false;
  }
}

/** Reads the browser and, only when it could matter, asks the server. */
async function readContext(): Promise<PushAskContext> {
  const uid = getFirebaseUid();
  const alreadyAsked = uid ? wasAsked(uid) : null;
  const supported = browserSupportsPush();
  const base = {
    uid,
    alreadyAsked,
    supported,
    permission: supported ? Notification.permission : ('unsupported' as const),
    needsHomeScreen: isIosDevice() && !isStandalone(),
  };
  // No server read when the answer is already "no".
  const worthAsking = decidePushAsk({ ...base, flagOn: true }) !== 'none';
  return { ...base, flagOn: worthAsking && (await flagOnForMe()) };
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${ASK_CLASS} {
      margin-top: var(--space-md);
      padding-top: var(--space-sm);
      border-top: 1px solid var(--color-border-subtle);
    }
    .${ASK_CLASS} p {
      margin: 0;
      font-size: var(--text-base);
      line-height: var(--leading-normal);
    }
    .${ASK_CLASS} .push-ask-hint { font-size: var(--text-sm); color: var(--color-text-secondary); }
    .${ASK_CLASS} .push-ask-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
      margin-top: var(--space-sm);
    }
    .${ASK_CLASS} button {
      min-height: 36px;
      border-radius: var(--radius-full);
      font-size: var(--text-sm);
      cursor: pointer;
    }
    .${ASK_CLASS} .push-ask-yes {
      padding: var(--space-xs) var(--space-md);
      border: none;
      background: var(--color-accent-primary);
      color: var(--color-text-on-accent);
      font-weight: var(--font-weight-semibold);
    }
    .${ASK_CLASS} .push-ask-later {
      padding: var(--space-xs) var(--space-sm);
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
    }
    .${ASK_CLASS} button:disabled { opacity: 0.6; cursor: default; }
  `;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Replace the ask with one quiet line the screen reader announces. */
function settle(section: HTMLElement, text: string): void {
  const line = el('p', 'push-ask-hint', text);
  line.setAttribute('role', 'status');
  section.replaceChildren(line);
}

async function onYes(section: HTMLElement): Promise<void> {
  section.querySelectorAll('button').forEach((b) => (b.disabled = true));
  let saved = false;
  try {
    await getPushNotificationsService().initialize();
    saved = await subscribePush();
  } catch (error) {
    log.warn('After-call push subscribe failed', { error: String(error) });
  }
  settle(section, t(saved ? 'afterCall.pushAskDone' : 'afterCall.pushAskLater'));
}

/** The section for `kind`, or null for 'none'. */
export function buildPushAsk(kind: PushAskKind): HTMLElement | null {
  if (kind === 'none') return null;
  injectStyles();
  const section = el('section', ASK_CLASS);
  const question = el(
    'p',
    'push-ask-question',
    t(kind === 'ask' ? 'afterCall.pushAskQuestion' : 'afterCall.pushAskHomeScreen')
  );
  question.id = 'after-call-push-ask-question';
  section.setAttribute('aria-labelledby', question.id);
  const actions = el('div', 'push-ask-actions');
  if (kind === 'ask') {
    actions.append(
      button('push-ask-yes', t('afterCall.pushAskYes'), () => void onYes(section)),
      button('push-ask-later', t('afterCall.pushAskNotNow'), () => section.remove())
    );
  } else {
    actions.append(button('push-ask-later', t('afterCall.pushAskGotIt'), () => section.remove()));
  }
  section.append(question, actions);
  return section;
}

/**
 * Add the ask to the after-call card when it applies. Never throws, and does
 * nothing if the card closed while the flag was being read.
 */
export async function addPushAsk(
  card: HTMLElement,
  read: () => Promise<PushAskContext> = readContext
): Promise<PushAskKind> {
  try {
    const context = await read();
    const kind = decidePushAsk(context);
    const section = buildPushAsk(kind);
    if (!section || !card.isConnected || !context.uid) return 'none';
    card.insertBefore(section, card.querySelector('.after-call-support'));
    rememberAsked(context.uid);
    log.info('After-call push ask shown', { kind });
    return kind;
  } catch (error) {
    log.warn('After-call push ask skipped', { error: String(error) });
    return 'none';
  }
}
