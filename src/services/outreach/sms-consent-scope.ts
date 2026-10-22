/**
 * Whose consent covers a text to a member (sendGuardedText): texts turned off
 * in settings or by STOP, and consent given on a call, which covers only texts
 * the member asked for (outreach-consent.ts recordVoiceSmsConsent).
 *
 * @module services/outreach/sms-consent-scope
 */

/** The member explicitly turned texts off, in outreach settings or by a STOP to the webhook. */
export function smsTurnedOff(
  userDoc: Record<string, unknown> | undefined,
  legacyChannels: unknown
): boolean {
  const prefs = (userDoc?.outreachPreferences ?? {}) as { enabled?: unknown; channels?: unknown };
  return prefs.enabled === false || withoutSms(prefs.channels) || withoutSms(legacyChannels);
}
const withoutSms = (c: unknown): boolean => Array.isArray(c) && !c.includes('sms');

/**
 * Why consent doesn't cover this text, or null. Consent given on a call (scope
 * 'requested') covers only texts the member asked for, even with texts off in
 * settings; any other text needs texts on (or never set) in settings.
 */
export function consentSkip(
  userDoc: Record<string, unknown> | undefined,
  legacyChannels: unknown,
  requested: boolean
): 'sms-off' | 'no-consent' | null {
  const prefs = (userDoc?.outreachPreferences ?? {}) as {
    enabled?: unknown;
    channels?: unknown;
    smsConsent?: { scope?: unknown; revokedAt?: unknown };
  };
  const voiceOnly = prefs.smsConsent?.scope === 'requested' && !prefs.smsConsent.revokedAt;
  if (voiceOnly && requested) {
    return prefs.enabled === false || withoutSms(legacyChannels) ? 'sms-off' : null;
  }
  if (smsTurnedOff(userDoc, legacyChannels)) return 'sms-off';
  const webSms = Array.isArray(prefs.channels) && prefs.channels.includes('sms');
  return voiceOnly && !webSms ? 'no-consent' : null;
}
