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

/**
 * Parse job and room metadata from the LiveKit job context.
 */
export function parseJobMetadata(ctx: JobContext): ParsedMetadata {
  let metadata: Record<string, unknown> = {};

  // DEBUG: Log raw job metadata to trace persona_id flow
  process.stderr.write(
    `[voice-agent-entry] 🔍 DEBUG: Raw job.metadata = ${ctx.job.metadata || '(empty)'}\n`
  );
  process.stderr.write(
    `[voice-agent-entry] 🔍 DEBUG: Raw room.metadata = ${ctx.job.room?.metadata || '(empty)'}\n`
  );

  if (ctx.job.metadata) {
    try {
      metadata = JSON.parse(ctx.job.metadata);
      process.stderr.write(
        `[voice-agent-entry] 🔍 DEBUG: Parsed job metadata keys: ${Object.keys(metadata).join(', ')}\n`
      );
    } catch (e) {
      process.stderr.write(`[voice-agent-entry] Failed to parse job.metadata: ${e}\n`);
    }
  }
  if (!metadata.persona_id && ctx.job.room?.metadata) {
    try {
      const roomMeta = JSON.parse(ctx.job.room.metadata);
      if (roomMeta.persona_id) {
        metadata = { ...metadata, ...roomMeta };
      }
    } catch (e) {
      process.stderr.write(`[voice-agent-entry] Failed to parse room.metadata: ${e}\n`);
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
    process.stderr.write(
      `[voice-agent-entry] 📞 INBOUND CALL DETECTED - setting up caller context\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 📞 Caller context: ${JSON.stringify({
        callSid: metadata.callSid,
        callerPhone: metadata.callerPhone
          ? `${String(metadata.callerPhone).slice(0, 4)}****`
          : 'unknown',
        callerName: metadata.callerName,
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
          process.stderr.write(
            `[voice-agent-entry] 📞 Using familyUserId for memory: ${metadata.familyUserId}\n`
          );
        } else {
          metadata.user_id = `family_${metadata.sponsoredIdentityId}`;
          process.stderr.write(
            `[voice-agent-entry] 📞 Using generated familyUserId: family_${metadata.sponsoredIdentityId}\n`
          );
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
    process.stderr.write(
      `[voice-agent-entry] 📞 Call context: ${JSON.stringify({
        callId: metadata.callId,
        contactName: (metadata.contact as Record<string, unknown>)?.name,
        purpose: metadata.purpose,
        callType: metadata.callType,
      })}\n`
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
        requesterUserId: call?.requester.userId,
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
  if (callType === 'proactive_outreach') {
    process.stderr.write(
      `[voice-agent-entry] 📞 PROACTIVE OUTREACH DETECTED - setting up check-in context\n`
    );
    process.stderr.write(
      `[voice-agent-entry] 📞 Outreach context: ${JSON.stringify({
        triggerType: metadata.triggerType,
        triggerReason: metadata.triggerReason,
        daysSinceLastSession: metadata.daysSinceLastSession,
      })}\n`
    );

    try {
      const { setProactiveSessionContext } =
        await import('../../intelligence/context-builders/external/proactive-session-context.js');

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
 * On-behalf calls report how the call went to the person who asked for it.
 */
export async function finishCallTypeContexts(
  metadata: Record<string, unknown>,
  callType: string | undefined,
  sessionId: string,
  sessionDurationMs: number,
  rawJobMetadata: string | undefined
): Promise<void> {
  if (callType !== 'on_behalf_call') return;
  const { completeOnBehalfCall } = await import('../outbound-call/on-behalf-call-lifecycle.js');
  const call = parseOnBehalfDispatch(metadata);
  if (!call) return;
  const trusted = await isTrustedDispatch(rawJobMetadata);
  await completeOnBehalfCall(sessionId, call, Math.round(sessionDurationMs / 1000), trusted);
}

/**
 * The one gate for outbound calls our server places (on-behalf, family
 * check-in): the job metadata exactly as dispatched carries a valid signature.
 */
async function isTrustedDispatch(rawJobMetadata: string | undefined): Promise<boolean> {
  const { verifyOnBehalfDispatch } = await import('../../services/outreach/on-behalf-dispatch.js');
  return verifyOnBehalfDispatch(rawJobMetadata, process.env.LIVEKIT_API_SECRET);
}

/** The requester's name as dispatched: under `requester`, or the older top-level `userName`. */
function requesterNameOf(metadata: Record<string, unknown>): string | undefined {
  const requester = metadata.requester as Record<string, unknown> | undefined;
  const name = requester?.name || metadata.userName;
  return typeof name === 'string' && name ? name : undefined;
}
