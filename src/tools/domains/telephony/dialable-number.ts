/**
 * Whether Ferni may dial a number on someone's behalf (used by compliance.ts
 * and the call read-back in call-confirm.ts). No imports, so the tool registry
 * can load it cheaply.
 *
 * @module tools/domains/telephony/dialable-number
 */

export type DialCheck = { ok: true; e164: string; spoken: string } | { ok: false; reason: string };

const EMERGENCY_NUMBERS = new Set(['911', '112', '999', '000', '988', '933']);

/**
 * Whether Ferni may dial this number on someone's behalf. Mirrors how the
 * orchestrator normalizes (digits only, US +1): 10 digits, or 11 starting
 * with 1, with a real area code. Never emergency/N11 or premium-rate numbers.
 */
export function checkDialableNumber(raw: string): DialCheck {
  const digits = raw.replace(/\D/g, '');
  if (EMERGENCY_NUMBERS.has(digits) || /^[2-9]11$/.test(digits)) {
    return {
      ok: false,
      reason: `${digits} is an emergency or service number, so the caller should dial it themselves`,
    };
  }
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10 || !/^[2-9]\d{2}/.test(national) || /^[2-9]11/.test(national)) {
    return { ok: false, reason: `"${raw}" isn't a valid US phone number` };
  }
  if (national.startsWith('900') || national.slice(3, 6) === '976') {
    return { ok: false, reason: `"${raw}" is a premium-rate number, which I won't dial` };
  }
  const spoken = `${national.slice(0, 3)}-${national.slice(3, 6)}-${national.slice(6)}`;
  return { ok: true, e164: `+1${national}`, spoken };
}
