/**
 * The settings panels' side of messagingPrefs (services/messaging/prefs.ts).
 *
 * - /api/user/preferences (user-routes.ts): quiet hours and zone, for "When
 *   I'll Check In" and "How I reach you". Same shape as before, plus `channels`.
 * - POST /api/outreach/preferences (outreach.routes.ts): the SMS and email
 *   switches. "When I'll Check In" sends `smsEnabled`/`emailEnabled` (older
 *   clients `disabledChannels`), "How I reach you" `allowedChannels`. Both are
 *   saved to prefs. Switching one off also withdraws its consent, so it stops
 *   today, before any sender reads prefs; switching one on here never adds
 *   consent (that takes the verified-number flow in "How I reach you").
 *
 * @module api/messaging-prefs-route
 */
import { writePrefs, type MessagingPrefs } from '../services/messaging/prefs.js';
import {
  consentPatchFrom,
  readOutreachConsent,
  writeOutreachConsent,
  type ConsentContext,
} from '../services/outreach/outreach-consent.js';

/** What the panels read back from /api/user/preferences. */
export const panelView = (
  p: MessagingPrefs
): { timezone?: string; quietHoursStart: string; quietHoursEnd: string; channels: object } => ({
  timezone: p.zone,
  quietHoursStart: p.quietStart,
  quietHoursEnd: p.quietEnd,
  channels: p.channels,
});

export async function savePanelQuietHours(
  userId: string,
  u: { timezone?: string; quietHoursStart?: string; quietHoursEnd?: string }
): Promise<void> {
  const patch = { quietStart: u.quietHoursStart, quietEnd: u.quietHoursEnd, zone: u.timezone };
  await writePrefs(userId, patch, 'panel');
}

/** The SMS/email switches a POST /api/outreach/preferences body sets, on or off. */
export function panelChannels(body: unknown): Partial<Record<'sms' | 'email', boolean>> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<Record<'sms' | 'email', boolean>> = {};
  for (const c of ['sms', 'email'] as const) {
    if (Array.isArray(b.allowedChannels)) out[c] = b.allowedChannels.includes(c);
    if (Array.isArray(b.disabledChannels) && b.disabledChannels.includes(c)) out[c] = false;
    if (typeof b[`${c}Enabled`] === 'boolean') out[c] = b[`${c}Enabled`] as boolean;
  }
  return out;
}

type ConsentPatch = ReturnType<typeof consentPatchFrom>;

/** The consent this body saves: as before, plus a switched-off channel withdrawn. */
export async function panelConsentPatch(userId: string, body: unknown): Promise<ConsentPatch> {
  const patch = consentPatchFrom(body);
  const off = Object.entries(panelChannels(body)).flatMap(([c, on]) => (on ? [] : [c]));
  if (patch.channels || off.length === 0) return patch;
  const { channels } = await readOutreachConsent(userId);
  return { ...patch, channels: channels.filter((c) => !off.includes(c)) };
}

/** Saves the consent patch (with how it was given, for the consent record), then the switches to prefs. */
export async function savePanelPrefs(
  userId: string,
  patch: ConsentPatch,
  body: unknown,
  how: ConsentContext = {}
): Promise<void> {
  await writeOutreachConsent(userId, patch, how);
  const channels = panelChannels(body);
  if (Object.keys(channels).length > 0) await writePrefs(userId, { channels }, 'panel');
}
