/**
 * "Check-ins by email" in When I'll Check In: the server's email consent, never this browser's copy.
 *
 * It was "Email Updates", showed localStorage (ferni-outreach-prefs), and promised
 * "milestone celebrations and weekly recaps". There is no weekly recap, and the
 * milestone email (milestone-outreach-route.ts) doesn't read this setting. The one
 * sender that does is the daily check-in run (automated-scheduler.ts
 * determineBestChannel, through outreachPreferences.channels), so the row says check-ins.
 *
 * The server never adds email consent from this panel, so the row shows only while
 * email is on there (GET /api/outreach/preferences `allowedChannels`), and stays for
 * the rest of the visit once it's switched off, so it can be switched back.
 * Off: `emailEnabled: false` (the server drops email from the current list itself).
 * Back on: the list read fresh just now, plus email, so a stale copy never
 * re-adds a channel turned off somewhere else.
 *
 * @module ui/email-checkins-switch
 */
import { t } from '../i18n/index.js';
import { apiGet, apiPost } from '../utils/api.js';
import { escapeHtml } from '../utils/escape-html.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('EmailCheckinsSwitch');
const ROUTE = '/api/outreach/preferences';

export interface EmailSwitch {
  /** On, from the server; undefined until it answers (or when it couldn't). */
  on?: boolean;
  shown: boolean;
}

export const emailSwitchState = (): EmailSwitch => ({ shown: false });

/** The check-in channels the server has saved, or null when it didn't say. */
async function serverChannels(): Promise<string[] | null> {
  const response = await apiGet<{ allowedChannels?: unknown }>(ROUTE).catch(() => null);
  const list = response?.ok ? response.data?.allowedChannels : undefined;
  return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string') : null;
}

export async function loadEmailSwitch(s: EmailSwitch): Promise<void> {
  const channels = await serverChannels();
  s.on = channels ? channels.includes('email') : undefined;
  s.shown = s.shown || s.on === true;
}

export function emailSwitchHtml(s: EmailSwitch, icon: string): string {
  if (!s.shown || s.on === undefined) return '';
  const label = escapeHtml(t('notificationSettings.emailCheckins', 'Check-ins by email'));
  const desc = escapeHtml(
    t(
      'notificationSettings.emailCheckinsDesc',
      'Whether I can check in with you by email. Off means no check-in emails.'
    )
  );
  return `
    <div class="notif-settings__capability-row">
      <div class="notif-settings__capability-icon notif-settings__capability-icon--email">${icon}</div>
      <div class="notif-settings__row-text">
        <span class="notif-settings__label">${label}</span>
        <span class="notif-settings__desc">${desc}</span>
      </div>
      <label class="notif-settings__toggle">
        <input type="checkbox" role="switch" aria-label="${label}" data-email-checkins ${s.on ? 'checked' : ''}>
        <span class="notif-settings__toggle-track" aria-hidden="true"></span>
      </label>
    </div>`;
}

async function save(on: boolean): Promise<boolean> {
  if (!on) {
    const off = await apiPost(ROUTE, { preferences: { emailEnabled: false } }).catch(() => null);
    return !!off?.ok;
  }
  const channels = await serverChannels();
  if (!channels) return false;
  const allowedChannels = [...new Set([...channels, 'email'])];
  const back = await apiPost(ROUTE, { preferences: { allowedChannels } }).catch(() => null);
  return !!back?.ok;
}

/** Saved the moment it flips; a failed save puts it back and says so. */
async function flip(box: HTMLInputElement, s: EmailSwitch): Promise<void> {
  const before = s.on;
  if (before === undefined) return;
  box.disabled = true;
  const ok = await save(box.checked);
  box.disabled = false;
  if (ok) {
    s.on = box.checked;
    log.info({ on: s.on }, 'Email check-ins saved');
    return;
  }
  box.checked = before;
  const { toast } = await import('./whisper.ui.js'); // the app's error toast, loaded when needed
  toast.error(t('contactSettings.errorSave', "Couldn't save that. Try again?"));
}

export function bindEmailSwitch(root: ParentNode, s: EmailSwitch): void {
  const box = root.querySelector<HTMLInputElement>('[data-email-checkins]');
  box?.addEventListener('change', () => void flip(box, s));
}
