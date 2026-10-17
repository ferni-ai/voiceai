/**
 * Connection states of the status island (overlay plan item o).
 *
 * With the overlay-host flag on, being offline, reconnecting and a weak
 * connection show as states of the one top-center status island instead of a
 * full-width banner and a separate top-right pill.
 *
 * Priority (higher replaces lower): offline > reconnecting > back online >
 * weak connection > idle. Offline, reconnecting and back online hide the
 * island's other pills (transcript, message) with an attribute on the island;
 * the pills keep their own state, so they come back as they were. A weak
 * connection is a small pill above them, shown only after the call has been
 * poor for WEAK_AFTER_MS so it doesn't flap.
 *
 * The element is a live region from the start: role=alert only while offline
 * (the transition into it is the one urgent message), role=status otherwise.
 * It never takes focus or pointer events.
 *
 * @module ui/status-island-connection
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';

export type IslandConnectionState = 'idle' | 'weak' | 'back-online' | 'reconnecting' | 'offline';

export const WEAK_AFTER_MS = 3000;
export const BACK_ONLINE_MS = 2000;

const STYLE_ID = 'status-island-connection-styles';
const TAKES_OVER: ReadonlySet<IslandConnectionState> = new Set(['offline', 'reconnecting', 'back-online']);

const LABEL_KEYS: Record<Exclude<IslandConnectionState, 'idle'>, string> = {
  offline: 'connectionQuality.island.offline',
  reconnecting: 'connectionQuality.island.reconnecting',
  'back-online': 'connectionQuality.island.backOnline',
  weak: 'connectionQuality.island.weak',
};

const ICON_PATHS: Record<Exclude<IslandConnectionState, 'idle'>, string> = {
  offline:
    '<path d="m2 2 20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.3-1.5M2 9a15 15 0 0 1 4.2-2.6M10.7 5a15 15 0 0 1 11.3 4M12 20h.01"/>',
  reconnecting: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  'back-online':
    '<path d="M5 12.9a10 10 0 0 1 14 0M2 9a15 15 0 0 1 20 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01"/>',
  weak: '<path d="M4 20v-2M9 20v-5M14 20v-8M19 20V4" opacity="0.35"/><path d="M4 20v-2"/>',
};

const CSS = `
/* left: 50% leaves the island half the viewport to shrink-fit into; size it to its content instead. */
.status-island--host {
  top: calc(max(env(safe-area-inset-top), 0.5rem) + 0.5rem); gap: 0.5rem; z-index: var(--z-notification);
  width: max-content; max-width: min(22.5rem, calc(100vw - 2rem));
}
.status-island[data-connection-state] > .status-pill { display: none; }
.status-island__connection {
  --island-accent: var(--color-semantic-warning);
  display: flex; align-items: center; gap: 0.5rem; box-sizing: border-box;
  max-width: min(22.5rem, calc(100vw - 2rem)); min-height: 2.5rem; padding: 0.5rem 1rem;
  border: 1px solid var(--color-border-subtle); border-radius: 1.25rem;
  background: var(--color-background-elevated); color: var(--color-text-primary); box-shadow: var(--shadow-lg);
  font-family: var(--font-body); font-size: 0.875rem; font-weight: 500; line-height: 1.4;
  pointer-events: none; text-wrap: pretty;
  animation: status-island-in ${DURATION.NORMAL}ms ${EASING.DECELERATE};
}
.status-island__connection[data-state='idle'] {
  position: absolute; width: 1px; height: 1px; min-height: 0; padding: 0; border: 0;
  overflow: hidden; clip-path: inset(50%); animation: none;
}
.status-island__connection[data-state='weak'] { min-height: 2rem; padding: 0.25rem 0.75rem; font-size: 0.8125rem; }
.status-island__connection[data-state='reconnecting'] { --island-accent: var(--color-semantic-info); }
.status-island__connection[data-state='back-online'] { --island-accent: var(--color-semantic-success); }
.status-island__icon { flex: none; width: 1rem; height: 1rem; color: var(--island-accent); }
.status-island__connection[data-state='reconnecting'] .status-island__icon {
  animation: status-island-spin ${DURATION.ENTRANCE}ms linear infinite;
}
@keyframes status-island-in { from { opacity: 0; transform: translateY(-0.5rem); } }
@keyframes status-island-spin { to { transform: rotate(360deg); } }
@media (min-width: 769px) {
  .status-island--host, .status-island__connection { max-width: 30rem; }
}
@media (prefers-reduced-motion: reduce) {
  .status-island__connection,
  .status-island__connection[data-state='reconnecting'] .status-island__icon { animation: none; }
}
`;

let offline = false;
let reconnecting = false;
let inCall = false;
let weak = false;
let backOnline = false;
let weakTimer: ReturnType<typeof setTimeout> | undefined;
let backOnlineTimer: ReturnType<typeof setTimeout> | undefined;
let element: HTMLElement | null = null;
let shown: IslandConnectionState = 'idle';
let listening = false;

/** The state the island shows now: the highest-priority active condition. */
export function islandConnectionState(): IslandConnectionState {
  if (offline) return 'offline';
  if (reconnecting) return 'reconnecting';
  if (backOnline) return 'back-online';
  if (weak && inCall) return 'weak';
  return 'idle';
}

/** Create the live region up front, so later changes are announced. */
export function initStatusIslandConnection(): void {
  ensureElement();
}

export function setIslandOffline(next: boolean): void {
  if (next === offline) return;
  offline = next;
  if (!next) flashBackOnline();
  render();
}

/** A poor reading starts the debounce; any better reading cancels it. */
export function setIslandPoorQuality(poor: boolean): void {
  if (!poor) {
    clearTimeout(weakTimer);
    weakTimer = undefined;
    if (weak) {
      weak = false;
      render();
    }
    return;
  }
  if (weak || weakTimer) return;
  weakTimer = setTimeout(() => {
    weakTimer = undefined;
    weak = true;
    render();
  }, WEAK_AFTER_MS);
}

/** Follows the call's state ('ferni:connection-state' from app.state). */
export function handleIslandConnectionState(state: string): void {
  const wasReconnecting = reconnecting;
  reconnecting = state === 'reconnecting';
  inCall = state === 'connected' || reconnecting;
  if (!inCall) setIslandPoorQuality(false);
  if (wasReconnecting && state === 'connected') flashBackOnline();
  render();
}

export function resetStatusIslandConnection(): void {
  if (listening) window.removeEventListener('ferni:connection-state', onConnectionStateEvent);
  clearTimeout(weakTimer);
  clearTimeout(backOnlineTimer);
  element?.parentElement?.removeAttribute('data-connection-state');
  element?.parentElement?.classList.remove('status-island--host');
  element?.remove();
  offline = reconnecting = inCall = weak = backOnline = listening = false;
  weakTimer = backOnlineTimer = undefined;
  element = null;
  shown = 'idle';
}

function onConnectionStateEvent(event: Event): void {
  const state = (event as CustomEvent<{ state?: string }>).detail?.state;
  if (typeof state === 'string') handleIslandConnectionState(state);
}

function flashBackOnline(): void {
  backOnline = true;
  clearTimeout(backOnlineTimer);
  backOnlineTimer = setTimeout(() => {
    backOnline = false;
    render();
  }, BACK_ONLINE_MS);
}

function ensureElement(): HTMLElement {
  if (element?.isConnected) return element;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  let island = document.getElementById('statusIsland');
  if (!island) {
    island = document.createElement('div');
    island.id = 'statusIsland';
    island.className = 'status-island';
    document.body.appendChild(island);
  }
  island.classList.add('status-island--host');
  element = document.createElement('div');
  element.className = 'status-island__connection';
  element.dataset.state = 'idle';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-atomic', 'true');
  island.prepend(element);
  shown = 'idle';
  if (!listening) {
    window.addEventListener('ferni:connection-state', onConnectionStateEvent);
    listening = true;
    inCall = inCall || document.body.dataset.connected === 'true';
  }
  return element;
}

function render(): void {
  const node = ensureElement();
  const state = islandConnectionState();
  if (state === shown) return;
  shown = state;
  node.setAttribute('role', state === 'offline' ? 'alert' : 'status');
  node.dataset.state = state;
  const island = node.parentElement;
  if (TAKES_OVER.has(state)) island?.setAttribute('data-connection-state', state);
  else island?.removeAttribute('data-connection-state');
  node.replaceChildren();
  if (state === 'idle') return;
  node.insertAdjacentHTML(
    'beforeend',
    `<svg class="status-island__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[state]}</svg>`
  );
  const text = document.createElement('span');
  text.textContent = t(LABEL_KEYS[state]);
  node.appendChild(text);
}
