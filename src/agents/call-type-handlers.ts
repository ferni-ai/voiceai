/**
 * Call Type Detection and Context Handlers
 *
 * Handles detection and context setup for different call types:
 * - Inbound calls (someone calling Ferni)
 * - On-behalf calls (Ferni calling on user's behalf)
 * - Proactive outreach (Ferni initiating check-ins)
 *
 * @module agents/call-type-handlers
 */

import type { ProactiveTriggerType } from '../intelligence/context-builders/external/proactive-session-context.js';

// ============================================================================
// TYPES
// ============================================================================

export interface InboundCallContext {
  callSid: string;
  callerPhone: string;
  callerName?: string;
  userId?: string;
  sponsoredIdentityId?: string;
  sponsorUserId?: string;
  isKnownCaller: boolean;
  isVoiceEnrolled: boolean;
  relationship?: string;
  notes?: string;
  accessLevel?: 'full' | 'limited' | 'supervised';
  allowedPersonas?: string[];
}

export interface OutboundCallContext {
  callId: string;
  recipientName: string;
  recipientPhone: string;
  purpose: string;
  callType: 'healthcare' | 'restaurant' | 'business' | 'personal';
  objective: string;
  script: string;
  complianceScript: string;
  mustConfirm: string[];
  mustNotDo: string[];
  informationToGather: string[];
  userName: string;
  originalSessionId: string;
}

export interface ProactiveOutreachContext {
  triggerType: ProactiveTriggerType;
  triggerReason: string;
  daysSinceLastSession?: number;
  lastMood?: string;
  lastSessionSummary?: string;
  relatedDate?: { type: string; date: Date; description: string };
  relatedCommitment?: { summary: string; madeOn: Date; dueDate?: Date };
  openerStyle: 'warm' | 'celebratory' | 'gentle' | 'supportive' | 'curious';
  suggestedOpener?: string;
  avoidances?: string[];
  initiatingPersona: string;
}

export interface CallTypeResult {
  callType: 'inbound_call' | 'on_behalf_call' | 'proactive_outreach' | 'standard';
  metadata: Record<string, unknown>;
  /** Updated user_id if determined from call context */
  effectiveUserId?: string;
}

// ============================================================================
// INBOUND CALL HANDLER
// ============================================================================

/**
 * Handles inbound call detection and context setup.
 * Sets up caller context for voice verification and sponsored identities.
 */
export async function handleInboundCall(
  metadata: Record<string, unknown>,
  sessionId: string,
  roomName?: string
): Promise<{ success: boolean; effectiveUserId?: string }> {
  process.stderr.write(
    `[call-type-handlers] 📞 INBOUND CALL DETECTED - setting up caller context\n`
  );
  process.stderr.write(
    `[call-type-handlers] 📞 Caller context: ${JSON.stringify({
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
      await import('../intelligence/context-builders/external/inbound-call-context.js');

    const inboundContext: InboundCallContext = {
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

    // Store with sessionId for context builder lookup
    setInboundCallContext(sessionId, inboundContext);

    // Also store with room name for fallback
    if (roomName) {
      setInboundCallContext(roomName, inboundContext);
    }

    process.stderr.write(
      `[call-type-handlers] 📞 Inbound call context set for sessionId: ${sessionId}\n`
    );

    // Determine effective userId for memory storage
    let effectiveUserId: string | undefined;

    // For sponsored identities, use their familyUserId for memory storage
    if (metadata.sponsoredIdentityId) {
      if (metadata.familyUserId) {
        effectiveUserId = metadata.familyUserId as string;
        process.stderr.write(
          `[call-type-handlers] 📞 Using familyUserId for memory: ${metadata.familyUserId}\n`
        );
      } else {
        // Fallback to generated familyUserId (backward compatibility)
        effectiveUserId = `family_${metadata.sponsoredIdentityId}`;
        process.stderr.write(
          `[call-type-handlers] 📞 Using generated familyUserId: family_${metadata.sponsoredIdentityId}\n`
        );
      }
    } else if (metadata.userId) {
      // Non-sponsored caller - use their phone-based userId
      effectiveUserId = metadata.userId as string;
    }

    return { success: true, effectiveUserId };
  } catch (error) {
    process.stderr.write(`[call-type-handlers] ⚠️ Failed to set inbound context: ${error}\n`);
    return { success: false };
  }
}

// ============================================================================
// ON-BEHALF CALL HANDLER
// ============================================================================

/**
 * Handles on-behalf call detection and context setup.
 * Sets up outbound call context with purpose, script, and compliance info.
 */
export async function handleOnBehalfCall(
  metadata: Record<string, unknown>,
  sessionId: string,
  roomName?: string
): Promise<{ success: boolean }> {
  process.stderr.write(
    `[call-type-handlers] 📞 ON-BEHALF CALL DETECTED - using standard agent with outbound context\n`
  );
  process.stderr.write(
    `[call-type-handlers] 📞 Call context: ${JSON.stringify({
      callId: metadata.callId,
      contactName: (metadata.contact as Record<string, unknown>)?.name,
      purpose: metadata.purpose,
      callType: metadata.callType,
    })}\n`
  );

  try {
    const { setOutboundCallContext } =
      await import('../intelligence/context-builders/external/outbound-call-context.js');

    const roomNameForContext = roomName || `call-${metadata.callId}`;

    const outboundContext: OutboundCallContext = {
      callId: metadata.callId as string,
      recipientName: ((metadata.contact as Record<string, unknown>)?.name as string) || 'Unknown',
      recipientPhone: ((metadata.contact as Record<string, unknown>)?.phone as string) || '',
      purpose: (metadata.purpose as string) || 'General call',
      callType:
        (metadata.callType as 'healthcare' | 'restaurant' | 'business' | 'personal') || 'business',
      objective: (metadata.objective as string) || (metadata.purpose as string) || '',
      script: (metadata.script as string) || '',
      complianceScript: (metadata.complianceScript as string) || '',
      mustConfirm: (metadata.mustConfirm as string[]) || [],
      mustNotDo: (metadata.mustNotDo as string[]) || [],
      informationToGather: (metadata.informationToGather as string[]) || [],
      userName: (metadata.userName as string) || 'the user',
      originalSessionId: (metadata.originalSessionId as string) || '',
    };

    // Store with roomName (for legacy lookups)
    setOutboundCallContext(roomNameForContext, outboundContext);
    // Also store with sessionId (for context builder lookups)
    setOutboundCallContext(sessionId, outboundContext);

    process.stderr.write(
      `[call-type-handlers] 📞 Outbound call context set for room: ${roomNameForContext}, sessionId: ${sessionId}\n`
    );

    return { success: true };
  } catch (error) {
    process.stderr.write(`[call-type-handlers] ⚠️ Failed to set outbound context: ${error}\n`);
    return { success: false };
  }
}

// ============================================================================
// PROACTIVE OUTREACH HANDLER
// ============================================================================

/**
 * Handles proactive outreach call detection and context setup.
 * Sets up context for Ferni-initiated check-ins.
 */
export async function handleProactiveOutreach(
  metadata: Record<string, unknown>,
  sessionId: string,
  roomName?: string
): Promise<{ success: boolean }> {
  process.stderr.write(
    `[call-type-handlers] 📞 PROACTIVE OUTREACH DETECTED - setting up check-in context\n`
  );
  process.stderr.write(
    `[call-type-handlers] 📞 Outreach context: ${JSON.stringify({
      triggerType: metadata.triggerType,
      triggerReason: metadata.triggerReason,
      daysSinceLastSession: metadata.daysSinceLastSession,
    })}\n`
  );

  try {
    const { setProactiveSessionContext } =
      await import('../intelligence/context-builders/external/proactive-session-context.js');

    const proactiveContext: ProactiveOutreachContext = {
      triggerType: ((metadata.triggerType as string) || 'silence') as ProactiveTriggerType,
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

    // Store with sessionId for context builder lookup
    setProactiveSessionContext(sessionId, proactiveContext);

    // Also store with room name for fallback
    if (roomName) {
      setProactiveSessionContext(roomName, proactiveContext);
    }

    process.stderr.write(
      `[call-type-handlers] 📞 Proactive session context set for sessionId: ${sessionId}\n`
    );

    return { success: true };
  } catch (error) {
    process.stderr.write(`[call-type-handlers] ⚠️ Failed to set proactive context: ${error}\n`);
    return { success: false };
  }
}

// ============================================================================
// UNIFIED CALL TYPE DETECTION
// ============================================================================

/**
 * Detects call type from metadata and sets up appropriate context.
 * Returns the call type and any modifications to metadata (e.g., effective userId).
 */
export async function detectAndHandleCallType(
  metadata: Record<string, unknown>,
  sessionId: string,
  roomName?: string
): Promise<CallTypeResult> {
  const callType = metadata.type as string | undefined;

  if (callType === 'inbound_call') {
    const result = await handleInboundCall(metadata, sessionId, roomName);
    if (result.effectiveUserId) {
      return {
        callType: 'inbound_call',
        metadata: { ...metadata, user_id: result.effectiveUserId },
        effectiveUserId: result.effectiveUserId,
      };
    }
    return { callType: 'inbound_call', metadata };
  }

  if (callType === 'on_behalf_call') {
    await handleOnBehalfCall(metadata, sessionId, roomName);
    return { callType: 'on_behalf_call', metadata };
  }

  if (callType === 'proactive_outreach') {
    await handleProactiveOutreach(metadata, sessionId, roomName);
    return { callType: 'proactive_outreach', metadata };
  }

  return { callType: 'standard', metadata };
}
