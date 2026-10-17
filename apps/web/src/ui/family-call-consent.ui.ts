/**
 * "They're happy to hear from Ferni" switch on a family member's edit screen.
 *
 * Turning it on tells the server this person agreed to Ferni calling them for a
 * check-in (#1558); turning it off withdraws that, and no more calls go out.
 * It saves as soon as it changes, separately from the form's Save button.
 *
 * @module ui/family-call-consent
 */

import { t } from '../i18n/index.js';
import { apiDelete, apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';

const log = createLogger('FamilyCallConsent');

interface ConsentState {
  agreed: boolean;
}

const attr = (value: string): string =>
  value.replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c] ?? c
  );

const path = (identityId: string): string =>
  `/api/sponsored-identities/${encodeURIComponent(identityId)}/call-consent`;

/** The switch, disabled until mountCallConsent has loaded its state. */
export function renderCallConsent(identityId: string): string {
  return `
      <div class="family-form__group" data-call-consent="${attr(identityId)}">
        <label style="display: flex; gap: var(--space-2, 8px); align-items: flex-start; cursor: pointer;">
          <input type="checkbox" role="switch" class="family-call-consent__switch" disabled>
          <span>
            <span class="family-form__label">${t('familyIdentities.callConsentLabel')}</span>
            <small style="display: block; color: var(--color-text-muted); font-size: var(--text-xs, 12px);">
              ${t('familyIdentities.callConsentHint')}
            </small>
          </span>
        </label>
      </div>`;
}

/** Load the switch's state and save each change. Safe to call after every render. */
export async function mountCallConsent(root: ParentNode): Promise<void> {
  const section = root.querySelector<HTMLElement>('[data-call-consent]');
  const input = section?.querySelector<HTMLInputElement>('.family-call-consent__switch');
  const identityId = section?.dataset.callConsent;
  if (!section || !input || !identityId || section.dataset.mounted) return;
  section.dataset.mounted = 'true';

  const response = await apiGet<ConsentState>(path(identityId));
  if (!response.ok || !response.data) {
    log.warn('Could not load call consent', { identityId, error: response.error });
    toast.error(t('familyIdentities.callConsentLoadFailed'));
    return;
  }
  input.checked = response.data.agreed;
  input.disabled = false;

  input.addEventListener('change', () => {
    void save(identityId, input);
  });
}

async function save(identityId: string, input: HTMLInputElement): Promise<void> {
  const want = input.checked;
  input.disabled = true;
  const response = want
    ? await apiPost<ConsentState>(path(identityId))
    : await apiDelete<ConsentState>(path(identityId));
  input.disabled = false;
  if (!response.ok || response.data?.agreed !== want) {
    input.checked = !want;
    log.warn('Could not save call consent', { identityId, error: response.error });
    toast.error(t('familyIdentities.callConsentFailed'));
    return;
  }
  toast.success(t('familyIdentities.callConsentSaved'));
}
