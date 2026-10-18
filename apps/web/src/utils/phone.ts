/**
 * Phone numbers as the server stores and texts them (E.164).
 *
 * Mirrors toE164 in src/services/outreach/checkin-replies.ts, the server's one
 * normalizer: a leading + is kept as is, so an international number is never
 * read as American; without a +, only a US number (10 digits, or 11 starting
 * with 1) is accepted. Anything else is null. Keep the two in step; both test
 * files pin the same table.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

export function toE164(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, '');
  let e164 = compact;
  if (!compact.startsWith('+')) {
    e164 = /^1?\d{10}$/.test(compact) ? `+${compact.length === 10 ? '1' : ''}${compact}` : '';
  }
  return E164.test(e164) ? e164 : null;
}

/** "+15552017497" → "(555) 201-7497"; other numbers are shown as stored. */
export function formatPhone(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}
