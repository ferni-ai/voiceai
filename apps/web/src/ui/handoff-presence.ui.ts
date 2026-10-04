/**
 * Handoff presence: a quiet "Bringing in <Persona>…" on the avatar while one
 * persona hands the call to another.
 *
 * The agent's coordinator sends handoff_progress heartbeats (target, elapsedMs,
 * timeoutMs). Fast handoffs never show anything: the indicator appears only once
 * a handoff has been running for SHOW_AFTER_MS, measured on the agent's clock
 * (elapsedMs), so a late first heartbeat shows it sooner rather than later. It
 * clears on completion, failure (the handoff service reports its own timeout as
 * a failure), cancellation, or once the agent's timeout has passed with no
 * outcome at all.
 *
 * This is NOT the "Transferring to…" pill removed in 8ad5a52b8: nothing sits
 * under the connect button and there is no spinner. It lives on the avatar: a
 * thin ring sweep (static under prefers-reduced-motion) plus a short caption
 * that is also a polite live region for screen readers.
 */

import '../styles/handoff-presence.css';
import { getPersona, isKnownPersonaId } from '../config/personas.js';
import { handoffService } from '../services/handoff.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('HandoffPresence');

/** Handoffs that finish sooner than this never show the indicator. */
export const SHOW_AFTER_MS = 700;
/** Slack past the agent's own timeout before giving up on a silent handoff. */
const TIMEOUT_GRACE_MS = 1000;

/** Class on .avatar-container while the indicator is showing. */
export const HANDING_OFF_CLASS = 'is-handing-off';
const RING_CLASS = 'handoff-presence-ring';
const CAPTION_CLASS = 'handoff-presence-caption';

let target: string | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

function avatarContainer(): HTMLElement | null {
  const el = document.querySelector('.avatar-container');
  return el instanceof HTMLElement ? el : null;
}

/** Create the ring and caption up front so the live region exists before it speaks. */
function ensureElements(container: HTMLElement): HTMLElement {
  if (!container.querySelector(`.${RING_CLASS}`)) {
    const ring = document.createElement('div');
    ring.className = RING_CLASS;
    ring.setAttribute('aria-hidden', 'true');
    container.appendChild(ring);
  }
  let caption = container.querySelector<HTMLElement>(`.${CAPTION_CLASS}`);
  if (!caption) {
    caption = document.createElement('span');
    caption.className = CAPTION_CLASS;
    caption.setAttribute('role', 'status');
    caption.setAttribute('aria-live', 'polite');
    container.appendChild(caption);
  }
  return caption;
}

function removeElements(): void {
  document.querySelectorAll(`.${RING_CLASS}, .${CAPTION_CLASS}`).forEach((el) => el.remove());
}

/** The caption text for a handoff target, by first name ("Bringing in Maya…"). */
export function handoffCaption(targetPersona: string): string {
  if (!isKnownPersonaId(targetPersona)) return 'Bringing someone in…';
  const [firstName] = getPersona(targetPersona).name.split(' ');
  return `Bringing in ${firstName}…`;
}

function show(): void {
  showTimer = null;
  const container = avatarContainer();
  if (!container || !target) return;
  ensureElements(container).textContent = handoffCaption(target);
  container.classList.add(HANDING_OFF_CLASS);
  log.debug('Handoff presence shown', { target });
}

function clear(): void {
  if (showTimer) clearTimeout(showTimer);
  if (deadlineTimer) clearTimeout(deadlineTimer);
  showTimer = null;
  deadlineTimer = null;
  target = null;
  const container = avatarContainer();
  if (!container) return;
  container.classList.remove(HANDING_OFF_CLASS);
  const caption = container.querySelector<HTMLElement>(`.${CAPTION_CLASS}`);
  if (caption) caption.textContent = '';
}

function onProgress(targetPersona: string, elapsedMs: number, timeoutMs: number): void {
  if (target !== targetPersona) clear();
  target = targetPersona;

  const visible = avatarContainer()?.classList.contains(HANDING_OFF_CLASS) ?? false;
  if (!visible && !showTimer) {
    const wait = SHOW_AFTER_MS - elapsedMs;
    if (wait <= 0) show();
    else showTimer = setTimeout(show, wait);
  }

  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = setTimeout(
    () => {
      log.warn('Handoff went quiet past its timeout; clearing presence', { target });
      clear();
    },
    Math.max(0, timeoutMs - elapsedMs) + TIMEOUT_GRACE_MS
  );
}

/**
 * Subscribe the indicator to the handoff service. Returns the cleanup (also safe
 * for HMR: it removes the elements it created).
 */
export function initHandoffPresence(): () => void {
  removeElements();
  const container = avatarContainer();
  if (container) ensureElements(container);

  const unsubscribers = [
    handoffService.onHandoffProgress(onProgress),
    handoffService.onHandoffComplete(() => clear()),
    handoffService.onHandoffFailed(() => clear()),
    handoffService.onHandoffCancelled(() => clear()),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    clear();
    removeElements();
  };
}
