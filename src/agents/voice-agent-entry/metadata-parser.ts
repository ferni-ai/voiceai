/**
 * Job metadata parsing and call type context setup.
 *
 * Extracts metadata from LiveKit job, detects call types (inbound, on-behalf, proactive),
 * and sets up the appropriate context builders for each call type.
 *
 * @module agents/voice-agent-entry/metadata-parser
 */

import type { JobContext } from '@livekit/agents';
import type { ParsedMetadata } from './types.js';
import { parseOnBehalfDispatch } from '../../services/outreach/on-behalf-dispatch.js';
import { maskPhoneNumber } from '../../services/identity/phone-attestation.js';
import { createLogger } from '../../utils/safe-logger.js';
import { errorClass } from '../../utils/error-class.js';
import { jobMetadataLine } from './startup-log.js';
import { flagOn } from '../../config/env-flag.js';

// What a dispatch carries is the caller's (why Ferni calls, what to ask a
// doctor, the last talk): logged as kinds and lengths only, through the safe
// logger, never to stderr, which reaches Cloud Logging unredacted.
const log = createLogger({ module: 'metadata-parser' });

/** What an inbound dispatch says about the caller's account; honoured only when signed. */
const INBOUND_ACCOUNT_FIELDS = [
  'callerPhone',
  'userId',
  'user_id',
  'familyUserId',
  'sponsoredIdentityId',
  'sponsorUserId',
  'isKnownCaller',
  'isVoiceEnrolled',
  'callerName',
  'relationship',
  'notes',
  'accessLevel',
  'allowedPersonas',
] as const;

/**
 * A signed "call me" dispatch moving an app call to the phone (`callMove`,
 * CALL_ME_MOVES_TO_PHONE, live-agent-call.ts), and the app call it moved from
 * when it has one (`movedFrom`, absent while memory is held): ids only, never its text. The turns are read from this
 * user's own memory store (resume-after-drop.ts restoreMovedTurns). Read from
 * the raw job metadata the signature covers, never the object parseJobMetadata
 * merged room metadata into: room metadata is not signed.
 */
export function movedFromOf(
  rawJobMetadata: string | undefined
): { userId: string; conversationId?: string } | undefined {
  if (!flagOn('CALL_ME_MOVES_TO_PHONE') || !rawJobMetadata) return undefined;
  let signed: Record<string, unknown>;
  try {
    signed = JSON.parse(rawJobMetadata) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const { userId, movedFrom, callMove } = signed;
  if (callMove !== true || typeof userId !== 'string' || !userId) return undefined;
  const plainId = typeof movedFrom === 'string' && /^[\w-]{1,128}$/.test(movedFrom);
  return plainId ? { userId, conversationId: movedFrom } : { userId };
}

/**
 * Parse job and room metadata from the LiveKit job context.
 */
export function parseJobMetadata(ctx: JobContext): ParsedMetadata {
  let metadata: Record<string, unknown> = {};

  if (ctx.job.metadata) {
    try {
      metadata = JSON.parse(ctx.job.metadata);
      process.stderr.write(
        `[voice-agent-entry] 🔍 DEBUG: Parsed job metadata keys: ${Object.keys(metadata).join(', ')}\n`
      );
    } catch (e) {
      process.stderr.write(
        `[voice-agent-entry] Failed to parse job.metadata: ${errorClass(e)} (${ctx.job.metadata.length} chars)\n`
      );
    }
  }
  // The call reviewer reads persona and eval calls from this line: allowlisted keys only.
  process.stderr.write(
    `[voice-agent-entry] 🔍 DEBUG: ${jobMetadataLine(ctx.job.metadata ? metadata : undefined)}\n`
  );
  if (!metadata.persona_id && ctx.job.room?.metadata) {
    try {
      const roomMeta = JSON.parse(ctx.job.room.metadata);
      if (roomMeta.persona_id) {
        metadata = { ...metadata, ...roomMeta };
      }
    } catch (e) {
      process.stderr.write(
        `[voice-agent-entry] Failed to parse room.metadata: ${errorClass(e)} (${ctx.job.room.metadata.length} chars)\n`
      );
    }
  }

  const callType = metadata.type as string | undefined;
  const personaId = (metadata.persona_id as string) || process.env.PERSONA_ID || 'ferni';
  const publisherId = (metadata.publisher_id as string) || undefined;

  process.stderr.write(`[voice-agent-entry] Resolved personaId: ${personaId}\n`);
  if (publisherId) {
    process.stderr.write(`[voice-agent-entry] 🔗 Publisher ID: ${publisherId}\n`);
  }

  return { metadata, callType, personaId, publisherId };
}

/**
 * Set up call type-specific context (inbound, on-behalf, proactive outreach).
 * This configures the appropriate context builders for downstream use.
 */
export async function setupCallTypeContexts(
  metadata: Record<string, unknown>,
  callType: string | undefined,
  sessionId: string,
  roomName: string | undefined,
  rawJobMetadata?: string
): Promise<void> {
  // =========================================================================
  // INBOUND CALL DETECTION
  // =========================================================================
  if (callType === 'inbound_call') {
    // Who the caller is came from caller ID, which can be spoofed: the number
    // and account fields count only on a dispatch our server signed, the same
    // gate as on-behalf calls. Unsigned, the caller is a stranger.
    if (!(await isTrustedDispatch(rawJobMetadata))) {
      for (const field of INBOUND_ACCOUNT_FIELDS) delete metadata[field];
      process.stderr.write(
        `[voice-agent-entry] ⚠️ Unsigned inbound dispatch: caller treated as a stranger\n`
      );
    }
    process.stderr.write(
      `[voice-agent-entry] 📞 INBOUND CALL DETECTED - setting up caller context\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 📞 Caller context: ${JSON.stringify({
        callSid: metadata.callSid,
        callerPhone:
          maskPhoneNumber(
            typeof metadata.callerPhone === 'string' ? metadata.callerPhone : undefined
          ) ?? 'unknown',
        isKnownCaller: metadata.isKnownCaller,
        isSponsored: !!metadata.sponsoredIdentityId,
      })}\n`
    );

    try {
      const { setInboundCallContext } =
        await import('../../intelligence/context-builders/external/inbound-call-context.js');

      const inboundContext = {
        callSid: (metadata.callSid as string) || '',
        callerPhone: (metadata.callerPhone as string) || '',
        callerName: metadata.callerName as string | undefined,
        userId: metadata.userId as string | undefined,
        sponsoredIdentityId: metadata.sponsoredIdentityId as string | undefined,
        sponsorUserId: metadata.sponsorUserId as string | undefined,
        isKnownCaller: (metadata.isKnownCaller as boolean) || false,
        isVoiceEnrolled: (metadata.isVoiceEnrolled as boolean) || false,
        relationship: metadata.relationship as string | undefined,
        notes: metadata.notes as string | undefined,
        accessLevel: metadata.accessLevel as 'full' | 'limited' | 'supervised' | undefined,
        allowedPersonas: metadata.allowedPersonas as string[] | undefined,
      };

      setInboundCallContext(sessionId, inboundContext);
      if (roomName) {
        setInboundCallContext(roomName, inboundContext);
      }

      process.stderr.write(
        `[voice-agent-entry] 📞 Inbound call context set for sessionId: ${sessionId}\n`
      );

      // For sponsored identities, use their familyUserId for memory storage
      if (metadata.sponsoredIdentityId) {
        if (metadata.familyUserId) {
          metadata.user_id = metadata.familyUserId as string;
          process.stderr.write(`[voice-agent-entry] 📞 Using familyUserId for memory\n`);
        } else {
          metadata.user_id = `family_${metadata.sponsoredIdentityId}`;
          process.stderr.write(`[voice-agent-entry] 📞 Using generated familyUserId for memory\n`);
        }
      } else if (metadata.userId) {
        metadata.user_id = metadata.userId;
      }
    } catch (error) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set inbound context: ${error}\n`);
    }
  }

  // =========================================================================
  // ON-BEHALF CALL DETECTION
  // =========================================================================
  if (callType === 'on_behalf_call') {
    process.stderr.write(
      `[voice-agent-entry] 📞 ON-BEHALF CALL DETECTED - using standard agent with outbound context\n`
    );
    log.info(
      {
        callId: metadata.callId,
        callType: metadata.callType,
        hasContactName: Boolean((metadata.contact as Record<string, unknown>)?.name),
        purposeChars: typeof metadata.purpose === 'string' ? metadata.purpose.length : 0,
      },
      'On-behalf call context'
    );

    try {
      const call = parseOnBehalfDispatch(metadata);
      if (!call) {
        process.stderr.write(
          `[voice-agent-entry] ⚠️ On-behalf dispatch is missing callId or requester; it can't be reported back\n`
        );
      }
      const trusted = await isTrustedDispatch(rawJobMetadata);
      const { setOutboundCallContext } =
        await import('../../intelligence/context-builders/external/outbound-call-context.js');
      const roomNameForContext = roomName || `call-${metadata.callId}`;
      const outboundContext = {
        callId: metadata.callId as string,
        recipientName: ((metadata.contact as Record<string, unknown>)?.name as string) || 'Unknown',
        recipientPhone: ((metadata.contact as Record<string, unknown>)?.phone as string) || '',
        purpose: (metadata.purpose as string) || 'General call',
        callType:
          (metadata.callType as 'healthcare' | 'restaurant' | 'business' | 'personal') ||
          'business',
        objective: (metadata.objective as string) || (metadata.purpose as string) || '',
        script: (metadata.script as string) || '',
        complianceScript: (metadata.complianceScript as string) || '',
        mustConfirm: (metadata.mustConfirm as string[]) || [],
        mustNotDo: (metadata.mustNotDo as string[]) || [],
        informationToGather: (metadata.informationToGather as string[]) || [],
        // A signed dispatch may name the requester without an id, which the parser
        // rejects: still say who Ferni is calling for. Display only, and never
        // from an unsigned dispatch (it must not put a name in Ferni's mouth).
        userName: call?.requester.name || (trusted && requesterNameOf(metadata)) || 'the user',
        originalSessionId: call?.requester.originalSessionId || '',
        // Where answered-by writes (and a voicemail reports): only a signed requester.
        requesterUserId: trusted ? call?.requester.userId : undefined,
        kind: 'on_behalf' as const,
      };
      setOutboundCallContext(roomNameForContext, outboundContext);
      setOutboundCallContext(sessionId, outboundContext);

      // Capture the call so its outcome can be reported to the requester at the end
      // Only a dispatch our server signed gets call state; a forged one could
      // name another call's id. Its turns are still kept out of memory.
      const { beginOnBehalfCall } = await import('../outbound-call/on-behalf-call-lifecycle.js');
      if (call && trusted) {
        await beginOnBehalfCall(sessionId, call);
        const { registerOnBehalfCallRoom } = await import('../outbound-call/call-control.js');
        registerOnBehalfCallRoom(sessionId, call.callId, roomNameForContext);
      }
      process.stderr.write(
        `[voice-agent-entry] 📞 Outbound call context set for room: ${roomNameForContext}, sessionId: ${sessionId}\n`
      );
    } catch (error) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set outbound context: ${error}\n`);
    }
  }

  // =========================================================================
  // FAMILY CHECK-IN: an outbound call placed for the sponsor to someone in
  // their family. Same path as on-behalf calls: the person on the line is the
  // family member, Ferni opens as the sponsor's AI friend once they pick up,
  // and the check-in prompt is the call's script, not the persona prompt.
  // =========================================================================
  // Only our server places these, so only a signed dispatch is honoured: an
  // unsigned or altered one would put its own prompt and names into the call.
  if (callType === 'family_checkin' && !(await isTrustedDispatch(rawJobMetadata))) {
    process.stderr.write(`[voice-agent-entry] ⚠️ Unsigned family check-in dispatch refused\n`);
  } else if (callType === 'family_checkin') {
    const { setOutboundCallContext } =
      await import('../../intelligence/context-builders/external/outbound-call-context.js');
    const recipientName = (metadata.familyMemberName as string) || 'Unknown';
    const userName = (metadata.sponsorName as string) || 'the user';
    const checkin = {
      callId: String(metadata.callId ?? ''),
      recipientName,
      recipientPhone: '',
      purpose: `${userName} asked you to check in on ${recipientName}.`,
      callType: 'personal' as const,
      objective: `See how ${recipientName} is doing.`,
      script: (metadata.systemPrompt as string) || '',
      complianceScript: '',
      mustConfirm: [],
      mustNotDo: [],
      informationToGather: [],
      userName,
      originalSessionId: '',
      openingLine: (metadata.openingLine as string) || undefined,
      // Where a voicemail is recorded (answered-by.ts): the signed sponsor's check-in record.
      requesterUserId: (metadata.sponsorUserId as string) || undefined,
      kind: 'family_checkin' as const,
    };
    setOutboundCallContext(sessionId, checkin);
    if (roomName) setOutboundCallContext(roomName, checkin);
    process.stderr.write(`[voice-agent-entry] 📞 Family check-in context set for ${sessionId}\n`);
  }

  // =========================================================================
  // PROACTIVE OUTREACH CALL DETECTION
  // =========================================================================
  // Only our server places these, so only a signed dispatch is honoured: an
  // unsigned one would put its own reason and opener into Ferni's mouth.
  if (callType === 'proactive_outreach' && !(await isTrustedDispatch(rawJobMetadata))) {
    process.stderr.write(`[voice-agent-entry] ⚠️ Unsigned proactive outreach dispatch refused\n`);
  } else if (callType === 'proactive_outreach') {
    process.stderr.write(
      `[voice-agent-entry] 📞 PROACTIVE OUTREACH DETECTED - setting up check-in context\n`
    );
    log.info(
      {
        triggerType: metadata.triggerType,
        triggerReasonChars:
          typeof metadata.triggerReason === 'string' ? metadata.triggerReason.length : 0,
        daysSinceLastSession: metadata.daysSinceLastSession,
      },
      'Proactive outreach context'
    );

    try {
      const { setProactiveSessionContext } =
        await import('../../intelligence/context-builders/external/proactive-session-context.js');

      const movedFrom = movedFromOf(rawJobMetadata); // CALL_ME_MOVES_TO_PHONE
      const proactiveContext = {
        triggerType: ((metadata.triggerType as string) ||
          'silence') as import('../../intelligence/context-builders/external/proactive-session-context.js').ProactiveTriggerType,
        triggerReason: (metadata.triggerReason as string) || 'Proactive check-in',
        daysSinceLastSession: metadata.daysSinceLastSession as number | undefined,
        lastMood: metadata.lastMood as string | undefined,
        lastSessionSummary: metadata.lastSessionSummary as string | undefined,
        relatedDate: metadata.relatedDate as
          { type: string; date: Date; description: string } | undefined,
        relatedCommitment: metadata.relatedCommitment as
          { summary: string; madeOn: Date; dueDate?: Date } | undefined,
        openerStyle:
          (metadata.openerStyle as 'warm' | 'celebratory' | 'gentle' | 'supportive' | 'curious') ||
          'warm',
        suggestedOpener: metadata.suggestedOpener as string | undefined,
        avoidances: metadata.avoidances as string[] | undefined,
        initiatingPersona: (metadata.persona_id as string) || 'ferni',
        ...(movedFrom && { movedFrom }),
      };

      setProactiveSessionContext(sessionId, proactiveContext);
      if (roomName) {
        setProactiveSessionContext(roomName, proactiveContext);
      }

      process.stderr.write(
        `[voice-agent-entry] 📞 Proactive session context set for sessionId: ${sessionId}\n`
      );
    } catch (error) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set proactive context: ${error}\n`);
    }
  }
}

/**
 * Close out call-type work when the session ends, on every exit path.
 * On-behalf calls report how the call went to the person who asked for it;
 * a family check-in honours the family member asking not to be called again.
 */
export async function finishCallTypeContexts(
  metadata: Record<string, unknown>,
  callType: string | undefined,
  sessionId: string,
  sessionDurationMs: number,
  rawJobMetadata: string | undefined
): Promise<void> {
  if (callType === 'family_checkin') {
    const { finishFamilyCheckin } = await import('../outbound-call/family-checkin-stop.js');
    await finishFamilyCheckin(sessionId, metadata, await isTrustedDispatch(rawJobMetadata));
    return;
  }
  if (callType !== 'on_behalf_call') return;
  const { completeOnBehalfCall } = await import('../outbound-call/on-behalf-call-lifecycle.js');
  const call = parseOnBehalfDispatch(metadata);
  if (!call) return;
  const trusted = await isTrustedDispatch(rawJobMetadata);
  await completeOnBehalfCall(sessionId, call, Math.round(sessionDurationMs / 1000), trusted);
}

/**
 * Runs `finish` once, from whichever comes first: the entrypoint's own exit
 * path, or LiveKit's shutdown callbacks. The job gives the entrypoint only 15 s
 * after the room closes (ENTRYPOINT_SHUTDOWN_TIMEOUT in @livekit/agents) and
 * then exits the process, but it awaits its shutdown callbacks first. Without
 * this, a call report still running at the end of a slow cleanup (the LLM read
 * of the call, the requester's push and records) was dropped with no log line.
 */
export function finishOnce(
  ctx: { addShutdownCallback: (callback: () => Promise<void>) => void },
  finish: () => Promise<void>
): () => Promise<void> {
  let running: Promise<void> | undefined;
  const once = (): Promise<void> => (running ??= finish());
  ctx.addShutdownCallback(once);
  return once;
}

/**
 * The one gate for outbound calls our server places (on-behalf, family
 * check-in, proactive outreach): the job metadata exactly as dispatched
 * carries a valid signature.
 */
async function isTrustedDispatch(rawJobMetadata: string | undefined): Promise<boolean> {
  const { dispatchVerifySecrets, verifyOnBehalfDispatch } =
    await import('../../services/outreach/on-behalf-dispatch.js');
  return verifyOnBehalfDispatch(rawJobMetadata, dispatchVerifySecrets());
}

/** The requester's name as dispatched: under `requester`, or the older top-level `userName`. */
function requesterNameOf(metadata: Record<string, unknown>): string | undefined {
  const requester = metadata.requester as Record<string, unknown> | undefined;
  const name = requester?.name || metadata.userName;
  return typeof name === 'string' && name ? name : undefined;
}
