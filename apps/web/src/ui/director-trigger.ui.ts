/**
 * Director Trigger
 *
 * The "Director" button in the controls bar that opens the Director Console
 * (ensemble control). Shown on demand, hidden otherwise.
 */

import { toggleDirectorConsole } from './director-console.ui.js';

const DIRECTOR_TRIGGER_ID = 'directorConsoleTrigger';

export function ensureDirectorTriggerButton(): void {
  const el = document.getElementById(DIRECTOR_TRIGGER_ID);
  if (el) {
    el.style.display = 'flex';
    return;
  }
  const controls = document.querySelector('.controls');
  if (!controls) return;
  const btn = document.createElement('button');
  btn.id = DIRECTOR_TRIGGER_ID;
  btn.type = 'button';
  btn.className = 'btn btn-secondary anticipate-btn';
  btn.setAttribute('aria-label', 'Open Director Console');
  btn.textContent = 'Director';
  btn.style.marginLeft = 'var(--space-2, 8px)';
  btn.addEventListener('click', () => toggleDirectorConsole());
  controls.appendChild(btn);
}

export function hideDirectorTriggerButton(): void {
  const el = document.getElementById(DIRECTOR_TRIGGER_ID);
  if (el) el.style.display = 'none';
}
