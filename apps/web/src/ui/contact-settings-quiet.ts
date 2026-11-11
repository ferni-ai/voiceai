/**
 * Quiet hours in "How I reach you": the panel saves back only a window it loaded and the
 * user changed here. A failed load used to leave the fields empty, and Save then posted
 * 22:00-08:00 over the saved window; an unchanged window sent back on every Save also
 * undid a newer change made by voice.
 *
 * @module ui/contact-settings-quiet
 */

import { getUserTimezone } from '../services/timezone.service.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import type { ContactSettingsState } from './contact-settings-types.js';

const log = createLogger('ContactSettingsQuiet');

interface PrefsAnswer {
  success?: boolean;
  preferences?: { timezone?: string; quietHoursStart?: string; quietHoursEnd?: string };
}

/** Fills in the saved window, or marks it 'failed' and leaves it empty. */
export async function loadQuietHours(opened: ContactSettingsState): Promise<void> {
  const info = opened.contactInfo;
  try {
    const res = await apiGet<PrefsAnswer>('/api/user/preferences'); // never throws: { ok: false }
    const prefs = res.ok && res.data?.success ? res.data.preferences : undefined;
    if (prefs?.quietHoursStart && prefs.quietHoursEnd) {
      info.timezone = prefs.timezone;
      info.quietHoursStart = prefs.quietHoursStart;
      info.quietHoursEnd = prefs.quietHoursEnd;
      info.quietHoursEnabled = true; // Enabled by default
      opened.quiet = 'loaded';
      return;
    }
    log.warn({ status: res.status }, 'Quiet hours not loaded; Save leaves them alone');
  } catch (error) {
    log.warn({ error }, 'Quiet hours not loaded; Save leaves them alone');
    info.timezone = getUserTimezone();
  }
  opened.quiet = 'failed';
}

/**
 * Saves the window if it loaded and is on: 'off' when there is none to save, 'failed'
 * when a window changed here didn't save. Only a changed window is sent.
 */
export async function saveQuietHours(
  state: ContactSettingsState
): Promise<'saved' | 'off' | 'failed'> {
  const { quietHoursStart, quietHoursEnd, quietHoursEnabled, timezone } = state.contactInfo;
  if (state.quiet !== 'loaded' || quietHoursEnabled === false) return 'off';
  const send = !!state.quietEdited && !!quietHoursStart && !!quietHoursEnd;
  const res = await apiPost('/api/user/preferences', {
    timezone: timezone || getUserTimezone(),
    ...(send && { quietHoursStart, quietHoursEnd }),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, 'Failed to save quiet hours preferences');
    return send ? 'failed' : 'saved'; // an unchanged window still stands
  }
  if (send) state.quietEdited = false;
  return 'saved';
}
