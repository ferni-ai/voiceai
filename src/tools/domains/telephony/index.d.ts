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
import type { ToolDefinition } from '../../registry/types.js';
declare function getTelephonyToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getTelephonyToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map