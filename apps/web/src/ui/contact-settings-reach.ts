/**
 * "Ferni can reach out" in How I reach you: the one on/off switch every sender obeys.
 *
 * It is the outreach consent's `enabled`, set by POST /api/outreach/pause and
 * /resume and read back as `outreachEnabled` from GET /api/outreach/preferences
 * (loadPhoneAndChannels). Off stops texts AND calls (guarded-text.ts smsTurnedOff,
 * user-reach.ts, the proactive channel policy and the daily run all check it), so
 * the label says exactly that. Until the server has answered, no switch is shown:
 * a guess would be a switch that lies.
 *
 * @module ui/contact-settings-reach
 */
import { t } from '../i18n/index.js';
import { apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { escapeAttr } from './contact-settings-phone.js';
import type { ContactSettingsState } from './contact-settings-types.js';

const log = createLogger('ContactSettingsReach');

export function reachSwitchHtml(s: ContactSettingsState): string {
  if (s.reachOn === undefined) return '';
  const on = s.reachOn;
  const label = escapeAttr(t('contactSettings.reachOut', 'Ferni can reach out'));
  const desc = escapeAttr(
    t('contactSettings.reachOutDesc', 'Calls and texts from Ferni. Off pauses both.')
  );
  return `
    <div class="contact-settings-section" id="reach-out-section">
      <div class="contact-settings-section-header">
        <div class="contact-settings-section-title" id="reach-out-label">${label}</div>
        <button type="button" role="switch" aria-checked="${on}" aria-labelledby="reach-out-label"
          aria-describedby="reach-out-desc" class="contact-settings-toggle ${on ? 'active' : ''}" id="reach-out-switch">
          <span class="contact-settings-toggle-knob"></span>
        </button>
      </div>
      <p class="contact-settings-quiet-note" id="reach-out-desc">${desc}</p>
    </div>`;
}

function showSwitch(button: HTMLElement, on: boolean): void {
  button.classList.toggle('active', on);
  button.setAttribute('aria-checked', String(on));
}

/** Flip it on the server; if that fails, put the switch back and say so. */
async function flipReach(button: HTMLButtonElement, s: ContactSettingsState): Promise<void> {
  if (s.reachOn === undefined || button.disabled) return;
  const before = s.reachOn;
  s.reachOn = !before;
  showSwitch(button, s.reachOn);
  button.disabled = true;
  const response = await apiPost(
    s.reachOn ? '/api/outreach/resume' : '/api/outreach/pause',
    {}
  ).catch(() => null);
  button.disabled = false;
  if (response?.ok) {
    log.info({ on: s.reachOn }, 'Reach-out switch saved');
    return;
  }
  s.reachOn = before;
  // A redraw while saving replaced the button: put the one on screen back too.
  for (const b of new Set([button, document.getElementById('reach-out-switch')])) {
    if (b) showSwitch(b, before);
  }
  const { toast } = await import('./whisper.ui.js'); // the app's error toast, loaded when needed
  toast.error(t('contactSettings.errorSave', "Couldn't save that. Try again?"));
}

export function bindReachSwitch(container: HTMLElement, s: ContactSettingsState): void {
  const button = container.querySelector<HTMLButtonElement>('#reach-out-switch');
  button?.addEventListener('click', () => void flipReach(button, s));
}
