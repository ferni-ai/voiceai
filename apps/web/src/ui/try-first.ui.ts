/**
 * "Talk to Ferni now" on the sign-in gate, behind the try-first flag.
 *
 * A signed-out visitor can start a short demo call (services/demo-call.service.ts)
 * instead of signing in first. While the call is on, the gate shows only the
 * call. When it ends, however it ends (hang-up, Ferni leaving, the demo time
 * limit), the gate asks "Want to keep this conversation?" above its own Google
 * and Apple buttons; signing in then claims the call through
 * demo-claim.service.ts on app start.
 *
 * Flag off: no elements, and the gate is unchanged.
 *
 * @module ui/try-first
 */

import { isTryFirstEnabled } from '../config/try-first-flag.js';
import { t } from '../i18n/index.js';
import { DemoCallError, startDemoCall, type DemoCall } from '../services/demo-call.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TryFirst');

type Phase = 'idle' | 'connecting' | 'in-call' | 'ended' | 'used-up';

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
.try-first-note, .try-first-status, .try-first-keep-message { margin: 0; font-size: 0.875rem; line-height: 1.5;
  color: var(--color-text-secondary); }
.try-first-status:empty, .try-first-keep { display: none; }
.try-first-keep-title { margin: 0 0 var(--space-xs); font-size: 1.25rem; font-weight: 600;
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
  block.append(keep, button, note, status);

  let call: DemoCall | null = null;
  const setPhase = (phase: Phase): void => {
    const gate = block.closest<HTMLElement>(GATE);
    if (gate) gate.dataset.tryFirst = phase;
    button.disabled = phase === 'connecting';
    button.classList.toggle('try-first-btn--end', phase === 'in-call');
    if (phase === 'connecting') button.textContent = t('tryFirst.connecting');
    else if (phase === 'in-call') button.textContent = t('tryFirst.endCall');
    else button.textContent = t('tryFirst.talkNow');
    if (phase === 'ended') keepTitle.focus();
  };

  const begin = async (): Promise<void> => {
    status.textContent = '';
    setPhase('connecting');
    try {
      call = await startCall();
    } catch (error) {
      log.warn('Demo call did not start', { error: String(error) });
      status.textContent = failureCopy(error);
      setPhase(error instanceof DemoCallError && error.failure === 'used_up' ? 'used-up' : 'idle');
      return;
    }
    status.textContent = t('tryFirst.inCall');
    setPhase('in-call');
    void call.ended.then(() => {
      call = null;
      status.textContent = '';
      setPhase('ended');
    });
  };

  button.addEventListener('click', () => {
    if (call) call.end();
    else void begin();
  });
  return [block];
}
