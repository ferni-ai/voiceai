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

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import legacy tool creator
import { createTelephonyTools } from './telephony.js';

// Import on-behalf call tool
import { createCallOnBehalfTool } from './call-on-behalf.js';

// Import recurring call tools
import {
  scheduleRecurringCall,
  listRecurringCalls,
  cancelRecurringCall,
  scheduleRecurringCallSchema,
} from './recurring-calls.js';

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
    wrapLegacyTool(
      'callUser',
      'Call User',
      'Make an outbound phone call to the user for alerts, reminders, or check-ins',
      legacyTools.callUser,
      { tags: ['outbound', 'call'], requiredServices: ['twilio'] }
    ),
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
      create: (ctx: ToolContext) => createCallOnBehalfTool(ctx),
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
      create: (ctx: ToolContext) => createCallOnBehalfTool(ctx),
    },
    // Recurring call scheduling - "call mom every Sunday"
    {
      id: 'scheduleRecurringCall',
      name: 'Schedule Recurring Call',
      description:
        'Schedule recurring calls to a contact. Examples: "call mom every Sunday", "check in with dad weekly"',
      domain: 'telephony',
      tags: ['telephony', 'recurring', 'schedule', 'family'],
      requiredServices: ['twilio'],
      create: (ctx: ToolContext) => ({
        name: 'scheduleRecurringCall',
        description: 'Schedule a recurring phone call',
        schema: scheduleRecurringCallSchema,
        execute: async (params: unknown) => {
          return scheduleRecurringCall(
            params as Parameters<typeof scheduleRecurringCall>[0],
            { userId: ctx.userId }
          );
        },
      }),
    },
    {
      id: 'listRecurringCalls',
      name: 'List Recurring Calls',
      description: 'List all scheduled recurring calls',
      domain: 'telephony',
      tags: ['telephony', 'recurring', 'list'],
      create: (ctx: ToolContext) => ({
        name: 'listRecurringCalls',
        description: 'List recurring call schedules',
        schema: { type: 'object', properties: {} },
        execute: async () => listRecurringCalls({ userId: ctx.userId }),
      }),
    },
    {
      id: 'cancelRecurringCall',
      name: 'Cancel Recurring Call',
      description: 'Stop recurring calls to a contact',
      domain: 'telephony',
      tags: ['telephony', 'recurring', 'cancel'],
      create: (ctx: ToolContext) => ({
        name: 'cancelRecurringCall',
        description: 'Cancel a recurring call schedule',
        schema: {
          type: 'object',
          properties: {
            contactQuery: { type: 'string', description: 'Who to stop calling' },
          },
          required: ['contactQuery'],
        },
        execute: async (params: { contactQuery: string }) =>
          cancelRecurringCall(params.contactQuery, { userId: ctx.userId }),
      }),
    },
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

export { getTelephonyToolDefinitions };

export default getToolDefinitions;
