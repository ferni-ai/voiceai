/**
 * "When should Ferni check in?" on a family member's edit screen.
 *
 * Hidden until the call-consent switch is on: family-call-consent.ui.ts fires
 * CALL_CONSENT_EVENT with { agreed } whenever it learns or changes the
 * switch's state. Saves on its own button, separately from the form's Save.
 *
 * @module ui/family-checkin-schedule
 */

import { getLocale, t } from '../i18n/index.js';
import { apiDelete, apiGet, apiPut } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('FamilyCheckinSchedule');

/** Fired (bubbling) by the call-consent switch with detail { agreed }. */
export const CALL_CONSENT_EVENT = 'family-call-consent-change';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DEFAULT_TIME = '10:00';

interface Schedule {
  frequency: string;
  dayOfWeek?: string;
  preferredTime: string;
  timezone: string;
}

const attr = (value: string): string =>
  value.replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c] ?? c
  );

const path = (identityId: string): string =>
  `/api/sponsored-identities/${encodeURIComponent(identityId)}/checkin-schedule`;

const browserTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Day names in the reader's language: 2024-01-01 was a Monday. */
function dayName(index: number): string {
  try {
    return new Intl.DateTimeFormat(getLocale(), { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 1 + index))
    );
  } catch {
    return DAYS[index] ?? '';
  }
}

/** The group, hidden until the consent switch says they agreed. */
export function renderCheckinSchedule(identityId: string): string {
  const days = DAYS.map((d, i) => `<option value="${d}">${dayName(i)}</option>`).join('');
  const muted = 'color: var(--color-text-muted); font-size: var(--text-xs, 12px);';
  return `
      <div class="family-form__group" data-checkin-schedule="${attr(identityId)}" hidden>
        <span class="family-form__label">${t('familyIdentities.checkinTitle')}</span>
        <small style="display: block; ${muted}">${t('familyIdentities.checkinHint')}</small>
        <div style="display: flex; flex-wrap: wrap; gap: var(--space-2, 8px); margin-top: var(--space-2, 8px);">
          <select class="family-form__select" data-field="frequency" aria-label="${attr(t('familyIdentities.checkinFrequencyLabel'))}">
            <option value="daily">${t('familyIdentities.checkinDaily')}</option>
            <option value="weekly">${t('familyIdentities.checkinWeekly')}</option>
          </select>
          <select class="family-form__select" data-field="day" aria-label="${attr(t('familyIdentities.checkinDayLabel'))}" hidden>${days}</select>
          <input type="time" class="family-form__input" data-field="time" value="${DEFAULT_TIME}" aria-label="${attr(t('familyIdentities.checkinTimeLabel'))}">
        </div>
        <small style="display: block; margin-top: var(--space-1, 4px); ${muted}" data-field="zone"></small>
        <div style="display: flex; gap: var(--space-3, 12px); align-items: center; margin-top: var(--space-2, 8px);">
          <button type="button" class="family-btn family-btn--secondary" data-field="save">${t('familyIdentities.checkinSave')}</button>
          <a href="#" data-field="remove" hidden style="${muted}">${t('familyIdentities.checkinRemove')}</a>
        </div>
      </div>`;
}

/** Wire up the group. Safe to call after every render. */
export function mountCheckinSchedule(root: ParentNode): void {
  const section = root.querySelector<HTMLElement>('[data-checkin-schedule]');
  const identityId = section?.dataset.checkinSchedule;
  if (!section || !identityId || section.dataset.mounted) return;
  section.dataset.mounted = 'true';

  const field = <T extends HTMLElement>(name: string) =>
    section.querySelector<T>(`[data-field="${name}"]`) as T;
  const frequency = field<HTMLSelectElement>('frequency');
  const day = field<HTMLSelectElement>('day');
  const time = field<HTMLInputElement>('time');
  const save = field<HTMLButtonElement>('save');
  const remove = field<HTMLAnchorElement>('remove');
  let timezone = browserTimezone();

  const show = (schedule: Schedule | null): void => {
    frequency.value = schedule?.frequency === 'weekly' ? 'weekly' : 'daily';
    if (schedule?.dayOfWeek) day.value = schedule.dayOfWeek;
    time.value = schedule?.preferredTime ?? DEFAULT_TIME;
    timezone = schedule?.timezone ?? browserTimezone();
    day.hidden = frequency.value !== 'weekly';
    remove.hidden = !schedule;
    field<HTMLElement>('zone').textContent = t('familyIdentities.checkinTimezone', {
      zone: timezone,
    });
  };
  show(null);

  let loaded = false;
  // The switch sits beside this group, so its bubbling event reaches the shared parent.
  section.parentElement?.addEventListener(CALL_CONSENT_EVENT, (event) => {
    const agreed = (event as CustomEvent<{ agreed: boolean }>).detail?.agreed === true;
    section.hidden = !agreed;
    if (agreed && !loaded) {
      loaded = true;
      void load(identityId, show).then((ok) => {
        loaded = ok;
      });
    }
  });

  frequency.addEventListener('change', () => {
    day.hidden = frequency.value !== 'weekly';
  });

  save.addEventListener('click', () => {
    const body: Schedule = { frequency: frequency.value, preferredTime: time.value, timezone };
    if (frequency.value === 'weekly') body.dayOfWeek = day.value;
    void send(save, 'save', show, () =>
      apiPut<{ schedule: Schedule | null }>(path(identityId), body)
    );
  });

  remove.addEventListener('click', (event) => {
    event.preventDefault();
    void send(save, 'remove', show, () =>
      apiDelete<{ schedule: Schedule | null }>(path(identityId))
    );
  });
}

async function load(identityId: string, show: (s: Schedule | null) => void): Promise<boolean> {
  const response = await apiGet<{ schedule: Schedule | null }>(path(identityId));
  if (!response.ok) {
    log.warn('Could not load check-in schedule', { identityId, error: response.error });
    toast.error(t('familyIdentities.checkinLoadFailed'));
    return false;
  }
  show(response.data?.schedule ?? null);
  return true;
}

type Result = { ok: boolean; data?: { schedule: Schedule | null }; error?: string };

async function send(
  button: HTMLButtonElement,
  action: 'save' | 'remove',
  show: (s: Schedule | null) => void,
  request: () => Promise<Result>
): Promise<void> {
  button.disabled = true;
  const response = await request();
  button.disabled = false;
  if (!response.ok) {
    log.warn('Could not change check-in schedule', { action, error: response.error });
    toast.error(t('familyIdentities.checkinFailed'));
    return;
  }
  show(response.data?.schedule ?? null);
  toast.success(
    t(action === 'save' ? 'familyIdentities.checkinSaved' : 'familyIdentities.checkinRemoved')
  );
}
