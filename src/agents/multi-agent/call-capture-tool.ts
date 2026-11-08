/**
 * setCallCaptureConsent: "Help shape Ferni" by voice (CALL_CAPTURE_CONSENT, off by default).
 *
 * Only the account owner proven on this call may answer (ownerProvenOnThisCall: never a phone-only
 * caller, never whoever picks up a call Ferni placed), and the tool is not on the phone-safe
 * allowlist (phone-safe-tools.ts), so an unverified turn is never offered it. A yes is refused,
 * writing nothing, while a crisis read is active on the call (crisisRiskThisCall: risk noted, or
 * a read still in flight) and on any sign the caller is under 18 (ageSignal on this call, then
 * captureBlockedForMinor, fail closed). A no always turns it off, like DELETE. An answer stamps
 * askedAt, so Ferni never asks again (not while a yes would be refused).
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
type CaptureRefusal = 'off' | 'not_owner' | 'crisis' | 'minor';
interface Call {
  userData: unknown;
  sessionId?: string;
}

/** The owner who may answer on this call, or why nobody may. */
function callOwner(call: Call, env: Env): { uid: string } | { refusal: CaptureRefusal } {
  if (!captureConsentOn(env)) return { refusal: 'off' };
  const uid = ownerProvenOnThisCall(call.userData, env as NodeJS.ProcessEnv);
  // A person's own account only: not a family member a sponsor set up, a test or a session id
  if (uid === null || !isPersonAccountId(uid) || uid.startsWith('family_') || !call.sessionId) {
    return { refusal: 'not_owner' };
  }
  return { uid };
}

/** Why the owner may not opt in on this call. Turning it off is never blocked. */
async function optInBlocked(
  uid: string,
  sessionId: string,
  env: Env
): Promise<'crisis' | 'minor' | null> {
  if (crisisRiskThisCall(sessionId)) return 'crisis';
  if (ageSignal(sessionId) || (await captureBlockedForMinor(uid, env))) return 'minor';
  return null;
}

const REFUSED: Record<CaptureRefusal, string> = {
  off: 'Not available. Nothing was saved. Do not bring up keeping recordings.',
  not_owner:
    "Nothing was saved: you don't know this caller is the account's owner. Say the owner can change it by asking Ferni on their own call.",
  crisis: 'Nothing was saved. Do not bring up recordings on this call; stay with them.',
  minor: 'Nothing was saved. Do not bring up recordings again.',
};

type VoiceStatus = 'agreed' | 'withdrawn' | 'declined' | 'not_saved' | CaptureRefusal;

/** Records the owner's spoken yes or no. A refused yes writes nothing; a no always turns it off. */
export async function setCaptureConsentByVoice(
  agree: boolean,
  call: Call,
  env: Env = process.env
): Promise<{ status: VoiceStatus; message: string }> {
  const owner = callOwner(call, env);
  if ('refusal' in owner) return { status: owner.refusal, message: REFUSED[owner.refusal] };
  const { uid } = owner;
  const blocked = await optInBlocked(uid, call.sessionId ?? '', env);
  if (agree && blocked) return { status: blocked, message: REFUSED[blocked] };
  if (!blocked) await markCaptureAsked(uid);
  if (!agree) {
    const had = await getCaptureConsent(uid);
    if (!had?.agreedAt || had.withdrawnAt) {
      return { status: 'declined', message: "Noted, nothing is kept. Say that's completely fine." };
    }
    await withdrawCaptureConsent(uid);
    return {
      status: 'withdrawn',
      message: 'Turned off. Tell them nothing more is kept, and what was kept is deleted.',
    };
  }
  const agreement = {
    version: CAPTURE_DISCLOSURE_DATE,
    agreedAt: new Date().toISOString(),
    source: 'voice' as const,
  };
  if (!(await recordCaptureConsent(uid, agreement))) {
    return {
      status: 'not_saved',
      message: "Nothing was saved just now. Say it didn't go through and they can ask again later.",
    };
  }
  return {
    status: 'agreed',
    message:
      "Saved. Thank them briefly. Say only their voice and yours are kept, never anyone else's on the line, for 120 days; they can turn it off any time by asking you, and what was kept is deleted.",
  };
}

export const SET_CALL_CAPTURE_CONSENT = 'setCallCaptureConsent';

function createCallCaptureConsentTool(ctx: Pick<ToolContext, 'sessionId'>): Tool {
  return llm.tool({
    description:
      "Help shape Ferni: whether the caller lets Ferni keep their calls for 120 days, so the team can see exactly what Ferni got right and wrong. Only the caller's own voice and Ferni's are kept, never anyone else's on the line. Adults only; they can turn it off any time and what was kept is deleted. " +
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
