/**
 * One-tap captions switch in the call controls (captions v2).
 *
 * Captions start off on a voice call, so nothing competes with Ferni's face;
 * one tap turns them on and the choice sticks. It is the same setting as
 * "See Our Words" in Settings: anyone who already turned that on (screen-reader
 * and hard-of-hearing users, for instance) keeps captions without doing
 * anything. Only an explicit 'true' counts; the old per-device default
 * (on for desktop) does not.
 *
 * @module ui/captions/captions-toggle
 */

import { PREFERENCE_KEYS } from '../../config/storage-keys.js';
import { t } from '../../i18n/index.js';
import { transcriptUI } from '../transcript.ui.js';

const ICON =
  '<svg class="engagement-trigger-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M7 10h6M7 13h9"/></svg>';

/** True only when someone chose captions (here or in Settings). */
export function captionsOn(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEYS.SHOW_TRANSCRIPTION) === 'true';
  } catch {
    return false;
  }
}

/**
 * Add the switch to the in-call quick actions (the row of round buttons under
 * the call controls, shown only while connected), so it sits with the other
 * call tools and never crowds Disconnect or Mute. The row is built lazily, so
 * this retries when a call connects. `onChange` runs after each flip.
 */
export function mountCaptionsToggle(onChange: () => void): void {
  const mount = (): boolean => {
    const row = document.querySelector('.engagement-triggers');
    if (!row) return false;
    if (row.querySelector('.ferni-captions-toggle')) return true;
    document.querySelectorAll('.ferni-captions-toggle').forEach((el) => el.remove()); // HMR
    row.prepend(createToggle(onChange));
    return true;
  };
  if (mount()) return;
  window.addEventListener('ferni:connection-state', () => void mount());
}

function createToggle(onChange: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'engagement-trigger-btn ferni-captions-toggle';
  button.setAttribute('aria-label', t('transcript.captionsToggle'));
  button.title = t('transcript.captionsToggle');
  button.innerHTML = ICON;
  const sync = (): void => {
    const on = captionsOn();
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('ferni-captions-toggle--on', on);
  };
  button.addEventListener('click', () => {
    transcriptUI.setEnabled(!captionsOn());
    sync();
    onChange();
  });
  sync();
  return button;
}
