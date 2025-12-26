/**
 * Outbound Call Context Builder
 *
 * Injects awareness into agents during outbound calls made ON BEHALF of users.
 * This is the critical bridge between the call orchestrator and the agent -
 * without it, the agent wouldn't know why it's calling or what to accomplish.
 *
 * Injections:
 * - Call purpose and objective
 * - Call script with greeting and guidelines
 * - Compliance requirements (AI disclosure, recording consent)
 * - Must-confirm and must-not-do guardrails
 *
 * @module intelligence/context-builders/outbound-call-context
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';
import { registerContextBuilder, createStandardInjection } from './index.js';
import { BuilderCategory } from './core/categories.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'context:outbound-call' });

// ============================================================================
// TYPES
// ============================================================================

interface OutboundCallContext {
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

// In-memory store for outbound call contexts (set by orchestrator)
const outboundCallContexts = new Map<string, OutboundCallContext>();

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

/**
 * Store outbound call context for a room/session
 * Called by the on-behalf-call-orchestrator when spawning an agent
 */
export function setOutboundCallContext(
  roomOrSessionId: string,
  context: OutboundCallContext
): void {
  outboundCallContexts.set(roomOrSessionId, context);
  log.info(
    {
      roomOrSessionId,
      callId: context.callId,
      recipientName: context.recipientName,
      callType: context.callType,
    },
    'Stored outbound call context'
  );
}

/**
 * Get outbound call context for a room/session
 */
export function getOutboundCallContext(roomOrSessionId: string): OutboundCallContext | undefined {
  return outboundCallContexts.get(roomOrSessionId);
}

/**
 * Clear outbound call context after call completes
 */
export function clearOutboundCallContext(roomOrSessionId: string): void {
  outboundCallContexts.delete(roomOrSessionId);
  log.debug({ roomOrSessionId }, 'Cleared outbound call context');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const outboundCallContextBuilder: ContextBuilder = {
  name: 'outbound-call-context',
  description:
    'Injects call purpose, script, and compliance guidance for outbound on-behalf calls',
  priority: 5, // Very high priority - must run early to set the stage
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;

    // Get session ID to look up call context
    const sessionId = services?.sessionId;
    if (!sessionId) {
      return [];
    }

    // Check if this is an on-behalf call session
    const callContext = getOutboundCallContext(sessionId);
    if (!callContext) {
      // Not an on-behalf call - nothing to inject
      return [];
    }

    log.debug(
      {
        sessionId,
        callId: callContext.callId,
        recipientName: callContext.recipientName,
      },
      'Building outbound call context'
    );

    const injections: ContextInjection[] = [];

    // ---------------------------------------------------------
    // 1. CRITICAL: Call Purpose & Identity
    // ---------------------------------------------------------
    const purposeContent = buildPurposeInjection(callContext);
    injections.push(
      createStandardInjection('outbound_call_purpose', purposeContent, {
        category: 'outbound-call',
        confidence: 1.0,
      })
    );

    // ---------------------------------------------------------
    // 2. CRITICAL: Compliance Requirements
    // ---------------------------------------------------------
    if (callContext.complianceScript) {
      injections.push(
        createStandardInjection('outbound_call_compliance', callContext.complianceScript, {
          category: 'compliance',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 3. Call Script & Guidelines
    // ---------------------------------------------------------
    const scriptContent = buildScriptInjection(callContext);
    injections.push(
      createStandardInjection('outbound_call_script', scriptContent, {
        category: 'outbound-call',
        confidence: 0.95,
      })
    );

    // ---------------------------------------------------------
    // 4. Guardrails: Must-Not-Do
    // ---------------------------------------------------------
    if (callContext.mustNotDo.length > 0) {
      const guardrails = buildGuardrailsInjection(callContext.mustNotDo);
      injections.push(
        createStandardInjection('outbound_call_guardrails', guardrails, {
          category: 'constraints',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 5. Information to Gather
    // ---------------------------------------------------------
    if (callContext.informationToGather.length > 0) {
      const gatherContent = buildInformationGatherInjection(callContext);
      injections.push(
        createStandardInjection('outbound_call_gather', gatherContent, {
          category: 'outbound-call',
          confidence: 0.9,
        })
      );
    }

    log.info(
      {
        sessionId,
        callId: callContext.callId,
        injectionCount: injections.length,
      },
      'Built outbound call context injections'
    );

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

function buildPurposeInjection(context: OutboundCallContext): string {
  return `
OUTBOUND CALL ON BEHALF OF USER

You are making a phone call ON BEHALF of ${context.userName}.
You are calling: ${context.recipientName}
Call type: ${context.callType}

PRIMARY OBJECTIVE: ${context.objective}

Purpose: ${context.purpose}

CRITICAL REMINDERS:
- You are Ferni, an AI assistant. You must identify yourself as an AI.
- You are authorized by ${context.userName} to make this call.
- Be professional but warm - you represent ${context.userName}.
- If they seem confused about an AI calling, reassure them and explain briefly.
- If they refuse to speak with an AI, thank them and end gracefully.

This call has ID: ${context.callId} (reference if needed)
`.trim();
}

function buildScriptInjection(context: OutboundCallContext): string {
  return `
CALL SCRIPT GUIDANCE

${context.script}

MUST CONFIRM before ending the call:
${context.mustConfirm.map((item) => `- ${item}`).join('\n')}

After the call, you should be able to report:
1. Whether the objective was achieved
2. Any next steps or follow-up required
3. Key information gathered
4. Whether a callback is needed
`.trim();
}

function buildGuardrailsInjection(mustNotDo: string[]): string {
  return `
CALL GUARDRAILS - DO NOT VIOLATE

${mustNotDo.map((item) => `- ${item}`).join('\n')}

These are hard constraints. If you're unsure about something, err on the side of caution and say you'll have ${'{userName}'} follow up directly.
`.trim();
}

function buildInformationGatherInjection(context: OutboundCallContext): string {
  return `
INFORMATION TO GATHER

Try to obtain the following during the call:
${context.informationToGather.map((item) => `- ${item}`).join('\n')}

Note: Not all information may be available. Gather what you can naturally without being pushy.
`.trim();
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(outboundCallContextBuilder);
