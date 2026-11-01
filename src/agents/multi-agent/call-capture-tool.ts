/**
 * setCallCaptureConsent: "Help shape Ferni" by voice (CALL_CAPTURE_CONSENT, off by default).
 *
 * Only the account owner proven on this call may answer (ownerProvenOnThisCall: never a phone-only
 * caller, never whoever picks up a call Ferni placed), and the tool is not on the phone-safe
 * allowlist (phone-safe-tools.ts), so an unverified turn is never offered it. It refuses, writing
 * nothing, while a crisis read is active on the call (crisisRiskThisCall: risk noted, or a read
 * still in flight) and on any sign the caller is under 18 (ageSignal on this call, then
 * captureBlockedForMinor: the in-process or shared hold, fail closed). An answer by voice stamps
 * askedAt, so Ferni never asks again.
 *
 * @module agents/multi-agent/call-capture-tool
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  CAPTURE_DISCLOSURE_DATE,
  captureBlockedForMinor,
  captureConsentOn,
  getCaptureConsent,
  markCaptureAsked,
  recordCaptureConsent,
  withdrawCaptureConsent,
} from '../../services/call-capture-consent.js';
import { ownerProvenOnThisCall } from '../../services/identity/verified-caller.js';
import { crisisRiskThisCall } from '../../services/safety/index.js';
import { ageSignal } from '../../utils/minor-care.js';
import { isPersonAccountId } from '../../utils/synthetic-user.js';
import type { Tool, ToolContext } from '../../tools/registry/index.js';

type Env = Record<string, string | undefined>;
export type CaptureRefusal = 'off' | 'not_owner' | 'crisis' | 'minor';

/** The owner who may answer on this call, or why nobody may. */
async function captureCaller(
  call: { userData: unknown; sessionId?: string },
  env: Env = process.env
): Promise<{ uid: string } | { refusal: CaptureRefusal }> {
  if (!captureConsentOn(env)) return { refusal: 'off' };
  const uid = ownerProvenOnThisCall(call.userData, env as NodeJS.ProcessEnv);
  // A person's own account only: not a family member a sponsor set up, a test or a session id
  if (uid === null || !isPersonAccountId(uid) || uid.startsWith('family_') || !call.sessionId) {
    return { refusal: 'not_owner' };
  }
  if (crisisRiskThisCall(call.sessionId)) return { refusal: 'crisis' };
  const minor = ageSignal(call.sessionId) || (await captureBlockedForMinor(uid, env));
  return minor ? { refusal: 'minor' } : { uid };
}

const REFUSED: Record<CaptureRefusal, string> = {
  off: 'Not available. Nothing was saved. Do not bring up keeping recordings.',
  not_owner:
    "Nothing was saved: you don't know this caller is the account's owner. Say they can change it in the Ferni app's settings.",
  crisis: 'Nothing was saved. Do not bring up recordings on this call; stay with them.',
  minor: 'Nothing was saved. Do not bring up recordings again.',
};

/** Records the owner's spoken yes or no; a refusal writes nothing. */
export async function setCaptureConsentByVoice(
  agree: boolean,
  call: { userData: unknown; sessionId?: string },
  env: Env = process.env
): Promise<{ status: 'agreed' | 'withdrawn' | 'declined' | CaptureRefusal; message: string }> {
  const caller = await captureCaller(call, env);
  if ('refusal' in caller) return { status: caller.refusal, message: REFUSED[caller.refusal] };
  const { uid } = caller;
  await markCaptureAsked(uid);
  if (agree) {
    const agreedAt = new Date().toISOString();
    await recordCaptureConsent(uid, {
      version: CAPTURE_DISCLOSURE_DATE,
      agreedAt,
      source: 'voice',
    });
    return {
      status: 'agreed',
      message:
        "Saved. Thank them briefly. Say they can turn it off any time, by asking you or in the app's settings, and what was kept is deleted.",
    };
  }
  const had = await getCaptureConsent(uid);
  if (had?.agreedAt && !had.withdrawnAt) {
    await withdrawCaptureConsent(uid);
    return {
      status: 'withdrawn',
      message: 'Turned off. Tell them their calls are no longer kept.',
    };
  }
  return { status: 'declined', message: "Noted, nothing is kept. Say that's completely fine." };
}

export const SET_CALL_CAPTURE_CONSENT = 'setCallCaptureConsent';

function createCallCaptureConsentTool(ctx: Pick<ToolContext, 'sessionId'>): Tool {
  return llm.tool({
    description:
      'Help shape Ferni: whether the caller lets Ferni keep full recordings of their calls for 120 days, so the team can see exactly what Ferni got right and wrong. Adults only; they can turn it off any time and what was kept is deleted. ' +
      'Call this ONLY after the caller clearly says yes or no to it, or clearly asks to turn it on or off. Never guess: if they hesitate or change the subject, do not call it. Never bring it up if anything on the call is hard or they might be under 18. Say only what the result says.',
    parameters: z.object({
      agree: z
        .boolean()
        .describe('true: they clearly said yes. false: they clearly said no or to turn it off.'),
    }),
    execute: async ({ agree }, opts) =>
      setCaptureConsentByVoice(agree, {
        userData: (opts as { ctx?: { userData?: unknown } } | undefined)?.ctx?.userData,
        sessionId: ctx.sessionId,
      }),
  }) as Tool;
}

/** `tools` plus setCallCaptureConsent while CALL_CAPTURE_CONSENT is on; unchanged while off. */
export function withCaptureConsentTool<T>(
  tools: Record<string, T>,
  ctx: Pick<ToolContext, 'sessionId'>,
  env: Env = process.env
): Record<string, T> {
  if (!captureConsentOn(env) || SET_CALL_CAPTURE_CONSENT in tools) return tools;
  return { ...tools, [SET_CALL_CAPTURE_CONSENT]: createCallCaptureConsentTool(ctx) as T };
}
