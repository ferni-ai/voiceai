/**
 * The phone part of Contact Settings (contact-settings.ui.ts): typed drafts,
 * E.164 checks, the markup under the phone input, and check-in channels. A new
 * number is stored only once its texted code checks out; texts and calls are
 * offered only for a verified number (the server enforces both).
 */

import { t } from '../i18n/index.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { formatPhone, toE164 } from '../utils/phone.js';
import type { ContactSettingsState } from './contact-settings.ui.js';

const log = createLogger('ContactSettingsPhone');

/** What the user typed, kept across re-renders. Undefined = untouched, show the stored value. */
export interface Drafts {
  phone?: string;
  email?: string;
  preferredName?: string;
}

type State = ContactSettingsState;
type Rerender = () => void;

export const PHONE_STYLES = `
    .contact-settings-verified[hidden] { display: none; }
    .contact-settings-field-error { margin: 0.5rem 0 0; font-size: 0.8125rem; color: var(--color-error, #b43c3c); }
    .contact-settings-channels {
      margin: 0.75rem 0 0; padding: 1rem; border: 1px solid var(--color-border-medium); border-radius: 8px;
      display: flex; flex-direction: column; gap: 0.5rem;
    }
    .contact-settings-channel { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--color-text-primary); }
`;

export function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** The value a field shows: what the user typed, else what was loaded. */
export function field(s: State, key: keyof Drafts): string {
  return s.drafts[key] ?? s.contactInfo[key] ?? '';
}

/** The phone in the input as E.164, and whether it is the account's verified number. */
export function phoneStatus(s: State): { e164: string | null; verified: boolean } {
  const e164 = toE164(field(s, 'phone'));
  const stored = s.contactInfo.phone ? toE164(s.contactInfo.phone) : null;
  return { e164, verified: !!s.contactInfo.phoneVerified && !!e164 && e164 === stored };
}

/** What saving does with the phone: refuse it, store it (verified), text a code (new), or clear it. */
export function planPhoneSave(s: State): {
  invalid: boolean;
  e164: string | null;
  verified: boolean;
  needsCode: boolean;
  clearPhone: boolean;
} {
  const typed = field(s, 'phone').trim();
  const { e164, verified } = phoneStatus(s);
  const stored = s.contactInfo.phone ? toE164(s.contactInfo.phone) : null;
  return {
    invalid: typed !== '' && !e164,
    e164,
    verified,
    needsCode: !!e164 && !verified && e164 !== stored,
    clearPhone: typed === '' && s.drafts.phone !== undefined && !!s.contactInfo.phone,
  };
}

/** The account's verified number (GET /api/user/contact) and the check-in channels the user chose. */
export async function loadPhoneAndChannels(s: State): Promise<void> {
  const [contact, consent] = await Promise.all([
    apiGet<{ contactInfo?: { verifiedPhone?: string | null } | null }>('/api/user/contact').catch(
      () => null
    ),
    apiGet<{ allowedChannels?: string[] }>('/api/outreach/preferences').catch(() => null),
  ]);
  const verifiedPhone = contact?.ok ? contact.data?.contactInfo?.verifiedPhone : undefined;
  if (verifiedPhone) {
    s.contactInfo.phone = verifiedPhone;
    s.contactInfo.phoneVerified = true;
  }
  const allowed = consent?.ok ? consent.data?.allowedChannels : undefined;
  s.channels = Array.isArray(allowed) ? allowed : [];
}

/** Under the phone input: the format hint, "Send me a code", the code field, or check-in channels. */
export function phoneActionsHtml(s: State): string {
  const { e164, verified } = phoneStatus(s);
  const invalid = s.phoneInvalid && !e164 && field(s, 'phone').trim() !== '';
  const on = (channel: string): string => (s.channels.includes(channel) ? 'checked' : '');
  return `
    ${invalid ? `<p class="contact-settings-field-error" role="alert">${t('contactSettings.errorPhoneFormat', "Hmm, that number doesn't look quite right. Mind adding the area code?")}</p>` : ''}
    ${
      e164 && !verified && !s.isVerifying
        ? `
      <button aria-label="${t('accessibility.verifyPhone', 'Verify phone number')}" type="button" class="contact-settings-verify-btn" id="verify-phone-btn">
        ${t('contactSettings.sendCode', 'Send me a code')}
      </button>
    `
        : ''
    }
    ${
      s.isVerifying
        ? `
      <div class="contact-settings-verification">
        <p class="contact-settings-verification-text">
          ${t('contactSettings.codeSent', 'I sent a 6-digit code to')} ${formatPhone(s.pendingPhone)}
        </p>
        <input type="text" inputmode="numeric" autocomplete="one-time-code" class="contact-settings-code-input"
          id="verification-code" placeholder="• • • • • •" maxlength="6"
          aria-label="${t('contactSettings.codeLabel', 'Your 6-digit code')}" value="${escapeAttr(s.verificationCode)}" />
      </div>
    `
        : ''
    }
    ${
      verified
        ? `
      <fieldset class="contact-settings-channels" id="checkin-channels">
        <legend class="contact-settings-label">${t('contactSettings.checkInHow', 'How should I check in?')}</legend>
        <label class="contact-settings-channel"><input type="checkbox" checked disabled /> ${t('contactSettings.channelApp', 'Right here in the app')}</label>
        <label class="contact-settings-channel"><input type="checkbox" data-channel="sms" ${on('sms')} /> ${t('contactSettings.channelTexts', 'Texts')}</label>
        <label class="contact-settings-channel"><input type="checkbox" data-channel="call" ${on('call')} /> ${t('contactSettings.channelCalls', 'Calls')}</label>
      </fieldset>
    `
        : ''
    }
  `;
}

/** Re-draw just the phone area (typing never loses focus), then re-bind its controls. */
export function refreshPhone(container: HTMLElement | null, s: State, bind: () => void): void {
  const actions = container?.querySelector('#phone-actions');
  if (!actions) return;
  actions.innerHTML = phoneActionsHtml(s);
  container
    ?.querySelector('#phone-verified-badge')
    ?.toggleAttribute('hidden', !phoneStatus(s).verified);
  bind();
}

/** Keep the typed number in state; the hint shows on blur, the code button once it's valid. */
export function bindPhoneInput(container: HTMLElement, s: State, refresh: () => void): void {
  const input = container.querySelector<HTMLInputElement>('#phone-input');
  input?.addEventListener('input', () => {
    s.drafts.phone = input.value;
    if (toE164(input.value)) s.phoneInvalid = false;
    refresh();
  });
  input?.addEventListener('blur', () => {
    s.phoneInvalid = input.value.trim() !== '' && !toE164(input.value);
    refresh();
  });
}

/** Save which channels check-ins may use, besides in-app (always on). */
export async function toggleChannel(
  s: State,
  channel: string,
  enabled: boolean,
  rerender: Rerender
): Promise<void> {
  const before = s.channels;
  const next = enabled ? [...new Set([...before, channel])] : before.filter((c) => c !== channel);
  s.channels = next;
  s.error = undefined;
  const response = await apiPost('/api/outreach/preferences', {
    preferences: { allowedChannels: next },
  }).catch(() => null);
  if (!response?.ok) {
    s.channels = before;
    s.error = t('contactSettings.errorChannels', "Couldn't save how I check in. Try again?");
    rerender();
    return;
  }
  log.info({ channels: next }, 'Check-in channels saved');
}
