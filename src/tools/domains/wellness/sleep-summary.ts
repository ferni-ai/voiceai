/**
 * getSleepSummary: how the caller slept, from their Oura ring; the only source of sleep
 * numbers Ferni may speak. Behind OURA_SLEEP_TOOL (off by default). A link that cannot be
 * read or a night with no record comes back with no numbers at all.
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { getOuraNight } from '../../../services/identity/oura-night.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../../services/identity/unverified-user-id.js';
import { toolCallerId } from '../../registry/per-caller-tool.js';
import type { Tool, ToolDefinition } from '../../registry/types.js';
import { createSleepSummaryTool } from './wellness-tools.js';

export function ouraSleepToolEnabled(env: Env = process.env): boolean {
  return flagOn('OURA_SLEEP_TOOL', env);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const MESSAGES = {
  not_connected:
    'This caller has not connected an Oura ring, so you cannot see how they slept. Tell them that plainly, give no sleep numbers, and say they can connect Oura in the Ferni app.',
  needs_reauth:
    'This caller connected Oura, but Oura no longer lets Ferni read it. Tell them you cannot see their sleep right now and they need to connect Oura again in the Ferni app. Give no sleep numbers.',
  unavailable:
    'Oura did not answer, so you cannot see how they slept right now. Tell them that and offer to try again in a bit. Give no sleep numbers.',
  unverified:
    "You do not know this caller is the account's owner, so you cannot share sleep data. Say you can only share sleep data once you know it's them. Give no sleep numbers.",
  off: 'Sleep data is not available right now. Give no sleep numbers.',
} as const;

function durationText(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  return `${h === 0 ? '' : `${h} hour${h === 1 ? '' : 's'} `}${minutes % 60} minutes`;
}

type Caller = { userId: string; verified: boolean };

/** Always the caller the call names, never the factory's ctx.userId; verified only as the session says (verified-caller.ts). */
export function callerOf(opts: unknown): Caller {
  const userId = toolCallerId(opts);
  const userData = (opts as { ctx?: { userData?: { verifiedCaller?: unknown } } } | undefined)?.ctx
    ?.userData;
  return {
    userId,
    verified:
      userData?.verifiedCaller === true && isMemberIdentity(userId) && !isUnverifiedUserId(userId),
  };
}

export async function sleepSummaryFor(
  caller: Caller,
  date?: string,
  now: number = Date.now()
): Promise<unknown> {
  if (!ouraSleepToolEnabled()) return { status: 'unavailable', message: MESSAGES.off };
  // Health data goes only to the proven owner: a member id reached by caller ID alone is not proof.
  if (!caller.verified) return { status: 'unverified', message: MESSAGES.unverified };
  if (
    date !== undefined &&
    (!ISO_DAY.test(date) || Date.parse(`${date}T00:00:00Z`) > now + 86_400_000)
  ) {
    return {
      status: 'invalid_date',
      message:
        'The date must be a past or present day written YYYY-MM-DD. Ask which night they mean, or leave the date out for last night.',
    };
  }

  const result = await getOuraNight(caller.userId, date, now);
  switch (result.status) {
    case 'ok':
      return {
        status: 'ok',
        date: result.night.date,
        sleep: result.night.sleep,
        totalSleepText: durationText(result.night.sleep?.totalSleepMinutes ?? null),
        readiness: result.night.readiness,
        instruction: `Say only what is in this result. Do not estimate or fill in any number it does not give. "date" is the morning the sleep ended; if it is not the night they asked about, say which night it is.`,
      };
    case 'no_data':
      return {
        status: 'no_data',
        date: result.date ?? undefined,
        message: `Oura has no sleep recorded ${result.date ? `for ${result.date}` : 'for the last few nights'}. The ring may not have synced yet. Say so; give no sleep numbers.`,
      };
    default:
      return { status: result.status, message: MESSAGES[result.status] };
  }
}

export const getSleepSummaryDef: ToolDefinition = {
  id: 'getSleepSummary',
  name: 'Get Sleep Summary',
  description: 'Read how the caller slept from their connected Oura ring',
  domain: 'wellness',
  tags: ['wellness', 'sleep', 'oura', 'readiness', 'rested', 'tired', 'wearable'],
  requiresEnv: ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET'],

  create: (): Tool =>
    createSleepSummaryTool(
      'How the caller actually slept, read from their connected Oura ring: sleep score, total sleep, efficiency, time to fall asleep, deep/REM/light, readiness and what fed it. Use when they ask how they slept, how rested they are or what their readiness is. Leave date out for last night, or pass YYYY-MM-DD for another night. ' +
        'Speak ONLY the numbers this tool returns. If status is not "ok", tell them you cannot see their sleep and why (not connected, needs reconnecting, no data for that night), and give no numbers. Never guess or estimate sleep. This is not medical advice.',
      (date, opts) => sleepSummaryFor(callerOf(opts), date)
    ),
};
