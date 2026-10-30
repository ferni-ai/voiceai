/**
 * Telephony Domain Tools
 *
 * Tools for phone calls and callbacks using LiveKit SIP integration.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: telephony
 * TOOLS:
 *   Calling: callUser, scheduleCallback, callOnBehalf
 *
 * REQUIREMENTS:
 *   - LiveKit server with SIP Trunk configured
 *   - SIP provider (Twilio, etc.) for PSTN connectivity
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService, Tool } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

// Import legacy tool creator
import { createTelephonyTools } from './telephony.js';

// Import on-behalf call tool
import { createCallOnBehalfTool } from './call-on-behalf.js';
// The requesting call's real session id, read from LiveKit's run context (row 12 of the audit).
import { withLiveSessionId } from '../../registry/live-session.js';
// "Did you call my dad?": read-only status from the owner's own call records
import { callStatusReply } from './call-status-tool.js';

// The call path that really rings the user's phone
import { callUserDef } from '../proactive/outreach/agent-to-user.js';

/**
 * callUser is defined once, here. The registry keeps whichever definition
 * registers last, so a second callUser in another domain made the behaviour
 * depend on load order. With TOOLS_REAL_CALL_USER=on it places the call;
 * otherwise it says honestly that no call is coming.
 *
 * Read when the tool runs, not when the definitions are built: they are built
 * once, when this module is first imported (worker start-up), before any
 * caller is known, while cohort flags (cohort-flags.ts) are applied per caller
 * at call start. So one person can have the real call path on.
 */
function isRealCallUserEnabled(): boolean {
  return process.env.TOOLS_REAL_CALL_USER === 'on';
}

type Run = (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;

/**
 * The one callUser: each run takes the real call path (agent-to-user.ts:
 * the account's verified phone only, through calling hours and quiet hours)
 * when TOOLS_REAL_CALL_USER is on for this call, the honest refusal otherwise.
 */
function callUserDefinition(refusal: unknown): ToolDefinition {
  return {
    id: 'callUser',
    name: 'Call User',
    description: 'Make an outbound phone call to the user for alerts, reminders, or check-ins',
    domain: 'telephony',
    tags: ['telephony', 'phone', 'outbound', 'call'],
    requiredServices: ['twilio'],
    create: (ctx: ToolContext): Tool => {
      const real: { execute: Run } = callUserDef.create(ctx);
      const refuse = (refusal as { execute: Run }).execute;
      return llm.tool({
        description: getToolDescription('callUser'),
        // No phone number: the call only ever goes to the verified phone on the account.
        parameters: z.object({
          reason: z
            .string()
            .describe('Why the user wants the call (e.g., "check in", "wake me up")'),
          message: z.string().optional().describe('What to say when they answer'),
        }),
        execute: async ({ reason, message }, opts) =>
          isRealCallUserEnabled()
            ? real.execute({ message: message?.trim() || reason }, opts)
            : refuse({ reason }, opts),
      });
    },
  };
}

/** callStatus: read-only, never calls anyone (call-status-tool.ts). */
function callStatusDefinition(): ToolDefinition {
  return {
    id: 'callStatus',
    name: 'Call Status',
    description: 'Whether Ferni already called someone for the owner, and how it went',
    domain: 'telephony',
    tags: ['telephony', 'phone', 'status', 'history'],
    create: (ctx: ToolContext): Tool =>
      llm.tool({
        description:
          'Check whether you already called someone for the caller and how it went: not yet ' +
          '(waiting for their yes, or set for a later hour), under way, done (answered, ' +
          'voicemail, no answer, and what they said), or failed. Use it whenever the caller ' +
          'asks "did you call my dad?", "how did the call go?" or "what did she say?". Read-only: ' +
          'it never calls anyone. Never use callOnBehalf to answer such a question.',
        parameters: z.object({
          contactQuery: z.string().describe('Who: a name or relationship, e.g. "dad" or "Sam"'),
        }),
        execute: async ({ contactQuery }, opts) => {
          const session = (opts as { ctx?: { session?: object } } | undefined)?.ctx?.session;
          return callStatusReply(ctx.userId, contactQuery, session);
        },
      }),
  };
}

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'telephony',
    tags: ['telephony', 'phone', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// TELEPHONY TOOLS
// ============================================================================

function getTelephonyToolDefinitions(): ToolDefinition[] {
  const legacyTools = createTelephonyTools();

  return [
    callUserDefinition(legacyTools.callUser),
    wrapLegacyTool(
      'scheduleCallback',
      'Schedule Callback',
      'Schedule a callback to the user at a specific time',
      legacyTools.scheduleCallback,
      { tags: ['callback', 'schedule'], requiredServices: ['twilio'] }
    ),
    // On-behalf calls: agent calls third party (doctor, restaurant, etc.)
    {
      id: 'callOnBehalf',
      name: 'Call On Behalf',
      description:
        'Call a third party on behalf of the user (doctor, restaurant, business) and handle the conversation autonomously',
      domain: 'telephony',
      tags: ['telephony', 'outbound', 'autonomous', 'on-behalf'],
      requiredServices: ['twilio'],
      create: (ctx: ToolContext) => withLiveSessionId(ctx, createCallOnBehalfTool),
    },
    // Personal conversational calls: agent calls family/friends for the user
    // This is an alias for callOnBehalf with personal call defaults
    {
      id: 'callAndConverse',
      name: 'Call and Converse',
      description:
        'Have Ferni call someone (family, friend) and have a real two-way conversation, then report back',
      domain: 'telephony',
      tags: ['telephony', 'outbound', 'personal', 'conversation'],
      requiredServices: ['twilio'],
      create: (ctx: ToolContext) => withLiveSessionId(ctx, createCallOnBehalfTool),
    },
    callStatusDefinition(),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const telephonyTools: ToolDefinition[] = getTelephonyToolDefinitions();

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'telephony',
  telephonyTools
);

export { getTelephonyToolDefinitions, callStatusReply };
export { setCallRecallPort } from './call-status-tool.js';
export type { CallQuery, CallRecallPort, RecalledCall, SeenCall } from './call-status-tool.js';
export type { CallOutcome, OnBehalfCallRequest } from './types.js';

export default getToolDefinitions;
