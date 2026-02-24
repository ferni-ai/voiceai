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
  roomName: string | undefined
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
      const { setOutboundCallContext } =
        await import('../../intelligence/context-builders/external/outbound-call-context.js');
      const roomNameForContext = roomName || `call-${metadata.callId}`;
      const outboundContext = {
        callId: metadata.callId as string,
        recipientName:
          ((metadata.contact as Record<string, unknown>)?.name as string) || 'Unknown',
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
        userName: (metadata.userName as string) || 'the user',
        originalSessionId: (metadata.originalSessionId as string) || '',
      };
      setOutboundCallContext(roomNameForContext, outboundContext);
      setOutboundCallContext(sessionId, outboundContext);
      process.stderr.write(
        `[voice-agent-entry] 📞 Outbound call context set for room: ${roomNameForContext}, sessionId: ${sessionId}\n`
      );
    } catch (error) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Failed to set outbound context: ${error}\n`);
    }
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
          | { type: string; date: Date; description: string }
          | undefined,
        relatedCommitment: metadata.relatedCommitment as
          | { summary: string; madeOn: Date; dueDate?: Date }
          | undefined,
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
