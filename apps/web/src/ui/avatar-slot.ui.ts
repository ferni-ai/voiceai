/**
 * The slot just under the avatar has one owner at a time:
 *   handoff caption > status whisper > thinking indicator.
 *
 * - While a whisper shows, the thinking indicator yields (WHISPER_OWNS_SLOT_CLASS
 *   on #coach, styled in avatar-slot.css) and comes back when the whisper ends,
 *   if Ferni is still thinking.
 * - While the handoff caption shows, a new whisper waits for it to end. Only the
 *   latest waits; it is dropped if it is older than STALE_WHISPER_MS by then.
 *   An already-visible whisper is hidden by CSS for the length of the handoff.
 *
 * The handoff is read from the class handoff-presence.ui.ts puts on
 * .avatar-container (its HANDING_OFF_CLASS), so that module stays untouched.
 */

import '../styles/avatar-slot.css';

/** Mirrors HANDING_OFF_CLASS in handoff-presence.ui.ts (pinned by a test). */
export const HANDOFF_CLASS = 'is-handing-off';
/** On #coach while a status whisper is visible. */
export const WHISPER_OWNS_SLOT_CLASS = 'has-status-whisper';
/** A whisper that waited longer than this for a handoff is no longer news. */
export const STALE_WHISPER_MS = 4000;

let pending: { show: () => void; queuedAt: number } | null = null;
let observer: MutationObserver | null = null;

function avatarContainer(): HTMLElement | null {
  const el = document.querySelector('.avatar-container');
  return el instanceof HTMLElement ? el : null;
}

export function isHandoffCaptionVisible(): boolean {
  return avatarContainer()?.classList.contains(HANDOFF_CLASS) ?? false;
}

function release(): void {
  observer?.disconnect();
  observer = null;
  const next = pending;
  pending = null;
  if (next && Date.now() - next.queuedAt <= STALE_WHISPER_MS) next.show();
}

/** Show a whisper now, or once the handoff caption has cleared. Latest one wins. */
export function requestWhisperSlot(show: () => void): void {
  const container = avatarContainer();
  if (!container || !isHandoffCaptionVisible()) {
    show();
    return;
  }
  pending = { show, queuedAt: Date.now() };
  if (observer) return;
  observer = new MutationObserver(() => {
    if (!isHandoffCaptionVisible()) release();
  });
  observer.observe(container, { attributes: true, attributeFilter: ['class'] });
}

/** Mark whether the whisper holds the slot; the thinking indicator yields while it does. */
export function setWhisperOwnsSlot(host: HTMLElement | null, owns: boolean): void {
  host?.classList.toggle(WHISPER_OWNS_SLOT_CLASS, owns);
}

/** Forget any waiting whisper (on dispose). */
export function resetAvatarSlot(): void {
  observer?.disconnect();
  observer = null;
  pending = null;
}
