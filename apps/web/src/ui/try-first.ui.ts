/**
 * "Talk to Ferni" on the sign-in gate, behind the try-first flag.
 *
 * A signed-out visitor can start a short demo call (services/demo-call.service.ts)
 * instead of signing in first. While the call is on, the gate shows only the
 * call. When it ends, however it ends (hang-up, Ferni leaving, the demo time
 * limit), the gate asks "Want to keep this conversation?" above its own Google
 * and Apple buttons; signing in then claims the call through
 * demo-claim.service.ts on app start. Signing in (here or in another tab)
 * ends a call still running, since the gate is about to go away.
 *
 * Flag off: no elements, and the gate is unchanged.
 *
 * @module ui/try-first
 */

import { isTryFirstEnabled } from '../config/try-first-flag.js';
import { onAuthStateChange } from '../services/firebase-auth.service.js';
import { t } from '../i18n/index.js';
import { DemoCallError, startDemoCall, type DemoCall } from '../services/demo-call.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TryFirst');

type Phase = 'idle' | 'connecting' | 'in-call' | 'ended' | 'used-up';

/** The demo call is always with Ferni (demo-call.service asks for persona_id=ferni). */
const CALLEE = 'Ferni';
/** A connect still going after this long says so ("Still reaching Ferni…"). */
const CONNECT_SLOW_MS = 4000;

export interface TryFirstDeps {
  startCall?: () => Promise<DemoCall>;
}

const STYLE_ID = 'try-first-styles';
const GATE = '.sign-in-gate-content';
const STYLES = `
.try-first { order: -1; display: flex; flex-direction: column; gap: var(--space-sm); }
.try-first-btn { background: var(--color-accent-primary); color: var(--color-text-on-accent); }
.try-first-btn:hover, .try-first-btn:focus-visible { background: var(--color-accent-hover); }
.try-first-btn--end { background: transparent; color: var(--color-text-primary);
  border: 1px solid var(--color-border-medium); }
.try-first-btn--end:hover, .try-first-btn--end:focus-visible { background: var(--color-bg-secondary); }
.try-first-note, .try-first-status, .try-first-keep-message { margin: 0; font-size: var(--text-sm); line-height: 1.5;
  color: var(--color-text-secondary); }
.try-first-status:empty, .try-first-keep, .try-first-hear[hidden] { display: none; }
.try-first-keep-title { margin: 0 0 var(--space-xs); font-size: var(--text-xl); font-weight: 600;
  color: var(--color-text-primary); }
${GATE}[data-try-first='connecting'] .sign-in-gate-btn:not(.try-first-btn),
${GATE}[data-try-first='in-call'] .sign-in-gate-btn:not(.try-first-btn),
${GATE}[data-try-first='connecting'] .sign-in-gate-subtitle,
${GATE}[data-try-first='in-call'] .sign-in-gate-subtitle,
${GATE}[data-try-first='in-call'] .sign-in-gate-footer,
${GATE}[data-try-first='in-call'] .try-first-note,
${GATE}[data-try-first='ended'] .sign-in-gate-title,
${GATE}[data-try-first='ended'] .sign-in-gate-subtitle,
${GATE}[data-try-first='ended'] .try-first-btn,
${GATE}[data-try-first='ended'] .try-first-note,
${GATE}[data-try-first='used-up'] .try-first-btn,
${GATE}[data-try-first='used-up'] .try-first-note { display: none; }
${GATE}[data-try-first='ended'] .try-first-keep { display: block; }
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = ''
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

function failureCopy(error: unknown): string {
  if (!(error instanceof DemoCallError)) return t('tryFirst.unavailable');
  if (error.failure === 'used_up') return t('tryFirst.usedUp');
  if (error.failure === 'cooldown') return t('tryFirst.cooldown');
  if (error.failure === 'mic_blocked') return t('tryFirst.micBlocked');
  return t('tryFirst.unavailable');
}

/** The try-first block for the sign-in gate's button list: one element, or none when the flag is off. */
export function tryFirstButtons(deps: TryFirstDeps = {}): HTMLElement[] {
  if (!isTryFirstEnabled()) return [];
  injectStyles();
  const startCall = deps.startCall ?? (() => startDemoCall());

  const block = element('div', 'try-first');
  const button = element('button', 'sign-in-gate-btn try-first-btn', t('tryFirst.talkNow'));
  button.type = 'button';
  button.dataset.provider = 'try-first';
  const note = element('p', 'try-first-note', t('tryFirst.noAccount'));
  const status = element('p', 'try-first-status');
  status.setAttribute('role', 'status');
  const keep = element('div', 'try-first-keep');
  const keepTitle = element('h2', 'try-first-keep-title', t('tryFirst.keepTitle'));
  keepTitle.tabIndex = -1;
  keep.append(keepTitle, element('p', 'try-first-keep-message', t('tryFirst.keepMessage')));
  const hear = element(
    'button',
    'sign-in-gate-btn try-first-btn try-first-hear',
    t('speakerCues.tapToHear')
  );
  hear.type = 'button';
  hear.dataset.provider = 'try-first-hear';
  hear.hidden = true;
  block.append(keep, button, hear, note, status);
  // The gate adds this block to the page right after building it; the subtitle is there by then.
  queueMicrotask(() => {
    const subtitle = block.closest(GATE)?.querySelector('.sign-in-gate-subtitle');
    if (subtitle) subtitle.textContent = t('tryFirst.subtitle');
  });

  let call: DemoCall | null = null;
  let signedIn = false;
  let unsubscribeAuth: (() => void) | null = null;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;
  const setPhase = (phase: Phase): void => {
    if (slowTimer !== null) clearTimeout(slowTimer);
    slowTimer = null;
    const gate = block.closest<HTMLElement>(GATE);
    if (gate) gate.dataset.tryFirst = phase;
    button.disabled = phase === 'connecting';
    button.classList.toggle('try-first-btn--end', phase === 'in-call');
    if (phase === 'connecting') {
      button.textContent = t('tryFirst.connecting', { name: CALLEE });
      slowTimer = setTimeout(() => {
        slowTimer = null;
        button.textContent = t('entrance.stillCalling', { name: CALLEE });
      }, CONNECT_SLOW_MS);
    } else if (phase === 'in-call') button.textContent = t('tryFirst.endCall');
    else button.textContent = t('tryFirst.talkNow');
    if (phase !== 'in-call') hear.hidden = true;
    if (phase === 'ended') keepTitle.focus();
  };
  const watchSignIn = (): void => {
    unsubscribeAuth ??= onAuthStateChange((state) => {
      if (!state.isAuthenticated) return;
      signedIn = true;
      call?.end();
      stopWatching();
    });
  };
  const stopWatching = (): void => {
    unsubscribeAuth?.();
    unsubscribeAuth = null;
  };

  const begin = async (): Promise<void> => {
    status.textContent = '';
    setPhase('connecting');
    watchSignIn();
    try {
      call = await startCall();
    } catch (error) {
      log.warn('Demo call did not start', { error: String(error) });
      stopWatching();
      status.textContent = failureCopy(error);
      setPhase(error instanceof DemoCallError && error.failure === 'used_up' ? 'used-up' : 'idle');
      return;
    }
    status.textContent = t('tryFirst.inCall');
    setPhase('in-call');
    call.onPlaybackBlocked((blocked) => {
      hear.hidden = !blocked;
    });
    void call.ended.then(() => {
      call = null;
      stopWatching();
      status.textContent = '';
      setPhase('ended');
    });
    if (signedIn) call.end();
  };

  button.addEventListener('click', () => {
    if (call) call.end();
    else void begin();
  });
  hear.addEventListener('click', () => {
    void call?.resumeAudio().then(
      () => {
        hear.hidden = true;
      },
      (error: unknown) =>
        log.warn('Audio still blocked after tap to hear', { error: String(error) })
    );
  });
  return [block];
}
