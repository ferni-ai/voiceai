/**
 * The phone part of Contact Settings (contact-settings.ui.ts): typed drafts,
 * E.164 checks, the markup under the phone input, and check-in channels. A new
 * number is stored only once its texted code checks out; texts and calls are
 * offered only for a verified number (the server enforces both). Turning
 * texts on sends the disclosure version shown beside the box; the server keeps
 * it as proof of consent and refuses texts without it.
 */

import { t } from '../i18n/index.js';
import { outreachService } from '../services/outreach.service.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { formatPhone, toE164 } from '../utils/phone.js';
import type { ContactSettingsState, Drafts } from './contact-settings-types.js';

const log = createLogger('ContactSettingsPhone');

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
    .contact-settings-disclosure { margin: 0 0 0.25rem 1.5rem; font-size: 0.8125rem; line-height: 1.45; color: var(--color-text-secondary); }
    .contact-settings-disclosure a { color: var(--persona-text); text-decoration: underline; }
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

/** The account's verified number (GET /api/user/contact), the check-in channels the user chose, and outreach on/off. */
export async function loadPhoneAndChannels(s: State): Promise<void> {
  const [contact, consent] = await Promise.all([
    apiGet<{ contactInfo?: { verifiedPhone?: string | null } | null }>('/api/user/contact').catch(
      () => null
    ),
    apiGet<{ allowedChannels?: string[]; outreachEnabled?: unknown }>(
      '/api/outreach/preferences'
    ).catch(() => null),
  ]);
  const verifiedPhone = contact?.ok ? contact.data?.contactInfo?.verifiedPhone : undefined;
  if (verifiedPhone) {
    s.contactInfo.phone = verifiedPhone;
    s.contactInfo.phoneVerified = true;
  }
  const allowed = consent?.ok ? consent.data?.allowedChannels : undefined;
  s.channels = Array.isArray(allowed) ? allowed : [];
  const reach = consent?.ok ? consent.data?.outreachEnabled : undefined;
  s.reachOn = typeof reach === 'boolean' ? reach : undefined; // the "Ferni can reach out" switch
}

const PHONE_CHANNELS = ['sms', 'call'];

/** Matches CURRENT_SMS_DISCLOSURE in src/services/outreach/outreach-consent.ts. Bump both when the text changes. */
export const SMS_DISCLOSURE_VERSION = '2026-10-18';
const SMS_TERMS_URL = 'https://ferni.ai/sms-consent';

/** What turning on texts or calls means, shown right under each box (carriers and the TCPA require it for texts). */
function disclosureHtml(channel: string): string {
  if (channel === 'call') {
    return `<p class="contact-settings-disclosure" id="call-disclosure">${escapeAttr(t('contactSettings.callDisclosure', "Ferni will only call this number when you ask, or for check-ins you've turned on."))}</p>`;
  }
  const text = t(
    'contactSettings.smsDisclosure',
    'Turn on texts and Ferni will text this number with reminders and check-ins, up to 3 a day. Msg & data rates may apply. Reply STOP to cancel, HELP for help.'
  );
  return `<p class="contact-settings-disclosure" id="sms-disclosure">${escapeAttr(text)} <a href="${SMS_TERMS_URL}" target="_blank" rel="noopener">${escapeAttr(t('contactSettings.smsTerms', 'SMS terms'))}</a></p>`;
}

/** Under the phone input: the format hint, "Send me a code", the code field, or check-in channels. */
export function phoneActionsHtml(s: State): string {
  const { e164, verified } = phoneStatus(s);
  const invalid = s.phoneInvalid && !e164 && field(s, 'phone').trim() !== '';
  // Shown while texts or calls are on even without a verified number, so they can always be turned off.
  const showChannels = verified || s.channels.some((c) => PHONE_CHANNELS.includes(c));
  const box = (channel: string, label: string): string => {
    const on = s.channels.includes(channel);
    return `<label class="contact-settings-channel"><input type="checkbox" data-channel="${channel}" aria-describedby="${channel}-disclosure" ${on ? 'checked' : ''} ${!on && !verified ? 'disabled' : ''} /> ${label}</label>${disclosureHtml(channel)}`;
  };
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
        <button type="button" class="contact-settings-verify-btn" id="resend-code-btn">${t('contactSettings.resendCode', 'Send a new code')}</button>
        <button type="button" class="contact-settings-verify-btn" id="change-number-btn">${t('contactSettings.changeNumber', 'Use a different number')}</button>
      </div>
    `
        : ''
    }
    ${
      showChannels
        ? `
      <fieldset class="contact-settings-channels" id="checkin-channels">
        <legend class="contact-settings-label">${t('contactSettings.checkInHow', 'How should I check in?')}</legend>
        <label class="contact-settings-channel"><input type="checkbox" checked disabled /> ${t('contactSettings.channelApp', 'Right here in the app')}</label>
        ${box('sms', t('contactSettings.channelTexts', 'Texts'))}
        ${box('call', t('contactSettings.channelCalls', 'Calls'))}
        ${verified ? '' : `<p class="contact-settings-quiet-note">${t('contactSettings.verifyToTurnOn', 'Verify your number to turn texts or calls on.')}</p>`}
      </fieldset>
    `
        : ''
    }
  `;
}

/** Re-draw just the phone area (typing never loses focus), then re-bind its controls. */
function refreshPhone(container: HTMLElement, s: State, rerender: Rerender): void {
  const actions = container.querySelector('#phone-actions');
  if (!actions) return;
  actions.innerHTML = phoneActionsHtml(s);
  container
    .querySelector('#phone-verified-badge')
    ?.toggleAttribute('hidden', !phoneStatus(s).verified);
  bindPhoneActions(container, s, rerender);
}

/** Keep the typed number in state; the hint shows on blur, the code button once it's valid. */
export function bindPhoneInput(container: HTMLElement, s: State, rerender: Rerender): void {
  const input = container.querySelector<HTMLInputElement>('#phone-input');
  input?.addEventListener('input', () => {
    s.drafts.phone = input.value;
    if (toE164(input.value)) s.phoneInvalid = false;
    refreshPhone(container, s, rerender);
  });
  input?.addEventListener('blur', () => {
    s.phoneInvalid = input.value.trim() !== '' && !toE164(input.value);
    refreshPhone(container, s, rerender);
  });
}

/** The code button, the code field (with resend / change number), and the channel switches. */
export function bindPhoneActions(container: HTMLElement, s: State, rerender: Rerender): void {
  const click = (id: string, fn: () => void): void =>
    container.querySelector(id)?.addEventListener('click', fn);
  click('#verify-phone-btn', () => void sendCode(s, rerender));
  click('#resend-code-btn', () => void sendCode(s, rerender, s.pendingPhone));
  click('#change-number-btn', () => {
    s.isVerifying = false;
    s.verificationCode = '';
    s.error = undefined;
    s.success = undefined;
    rerender();
    container.querySelector<HTMLInputElement>('#phone-input')?.focus();
  });
  const codeInput = container.querySelector<HTMLInputElement>('#verification-code');
  codeInput?.addEventListener('input', () => {
    const value = codeInput.value.replace(/\D/g, '');
    s.verificationCode = value;
    if (value.length === 6) void confirmCode(s, value, rerender);
  });
  container.querySelectorAll<HTMLInputElement>('[data-channel]').forEach((box) => {
    box.addEventListener(
      'change',
      () => void toggleChannel(s, box.dataset.channel ?? '', box.checked, rerender)
    );
  });
}

/** Text a code to this number (default: the one in the input). True once it's on its way. */
export async function sendCode(
  s: State,
  rerender: Rerender,
  e164: string | null = phoneStatus(s).e164
): Promise<boolean> {
  s.success = undefined;
  if (!e164) {
    s.phoneInvalid = field(s, 'phone').trim() !== '';
    s.error = s.phoneInvalid
      ? undefined
      : t('contactSettings.errorNoPhone', 'Add a phone number first');
    rerender();
    return false;
  }
  s.isVerifying = true;
  s.pendingPhone = e164;
  s.verificationCode = '';
  s.error = undefined;
  rerender();
  try {
    const result = await outreachService.sendVerificationCode(e164);
    if (!result.success) throw new Error(result.error || 'Failed to send verification');
    log.info('Verification code sent');
  } catch (error) {
    s.error = t('contactSettings.errorSendCode', "Couldn't send the code. Try again?");
    s.isVerifying = false;
    log.error({ error }, 'Failed to send verification');
  }
  rerender();
  return s.isVerifying;
}

/**
 * Check the code. Verified only when the server put the number on the account
 * (phoneLinked); a code that checks out but couldn't be linked isn't verified.
 */
async function confirmCode(s: State, code: string, rerender: Rerender): Promise<void> {
  try {
    const result = await outreachService.verifyPhone(s.pendingPhone, code);
    const linked = (result as { phoneLinked?: boolean }).phoneLinked !== false;
    if (result.success && linked) {
      s.contactInfo.phone = s.pendingPhone;
      s.contactInfo.phoneVerified = true;
      s.drafts.phone = undefined;
      s.isVerifying = false;
      s.verificationCode = '';
      s.success = t('contactSettings.phoneVerified', "Got it! I'll know your number now.");
      log.info('Phone verified');
      // Only now does the number go on the profile, normalized and proven.
      const saved = await apiPost('/api/user/contact', { phone: s.pendingPhone }).catch(() => null);
      if (!saved?.ok) log.warn('Verified number not copied to contact info');
    } else if (result.success) {
      s.isVerifying = false;
      s.verificationCode = '';
      s.error = t(
        'contactSettings.errorPhoneNotLinked',
        "That code worked, but I couldn't connect the number to your account just now. Try again in a bit?"
      );
      log.warn('Code accepted but number not linked to the account');
    } else {
      s.verificationCode = '';
      s.error = t('contactSettings.errorInvalidCode', "That code didn't work. Try again?");
    }
  } catch (error) {
    s.error = t('contactSettings.errorVerifyFailed', "Couldn't verify. Want another code?");
    log.error({ error }, 'Phone verification failed');
  }
  rerender();
}

/** After a save that cleared the phone: the server turned texts and calls off too. */
export function afterPhoneCleared(s: State, channelsOff: boolean | undefined): string | undefined {
  if (!channelsOff) return undefined;
  s.channels = s.channels.filter((c) => !PHONE_CHANNELS.includes(c));
  return t('contactSettings.phoneChannelsOff', "Done. I won't text or call you now.");
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
    preferences: { allowedChannels: next, disclosureVersion: SMS_DISCLOSURE_VERSION },
  }).catch(() => null);
  if (!response?.ok) {
    s.channels = before;
    // 409: refused, e.g. this page shows an older disclosure than the server's. A retry won't help; a reload will.
    s.error =
      response?.status === 409
        ? t(
            'contactSettings.errorChannelsRefresh',
            "I couldn't turn that on just yet. Refresh the page and try again?"
          )
        : t('contactSettings.errorChannels', "Couldn't save how I check in. Try again?");
    rerender();
    return;
  }
  log.info({ channels: next }, 'Check-in channels saved');
}
