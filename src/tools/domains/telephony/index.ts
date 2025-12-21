/**
 * Telephony Domain Tools
 *
 * Tools for phone calls and callbacks using LiveKit SIP integration.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: telephony
 * TOOLS:
 *   Calling: callUser, scheduleCallback
 *
 * REQUIREMENTS:
 *   - LiveKit server with SIP Trunk configured
 *   - SIP provider (Twilio, etc.) for PSTN connectivity
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import legacy tool creator
import { createTelephonyTools } from './telephony.js';

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
