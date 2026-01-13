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
// Import legacy tool creator
import { createTelephonyTools } from './telephony.js';
// Import on-behalf call tool
import { createCallOnBehalfTool } from './call-on-behalf.js';
// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================
function wrapLegacyTool(id, name, description, legacyTool, options) {
    return {
        id,
        name,
        description,
        domain: 'telephony',
        tags: ['telephony', 'phone', ...(options?.tags || [])],
        requiredServices: options?.requiredServices,
        create: (_ctx) => legacyTool,
    };
}
// ============================================================================
// TELEPHONY TOOLS
// ============================================================================
function getTelephonyToolDefinitions() {
    const legacyTools = createTelephonyTools();
    return [
        wrapLegacyTool('callUser', 'Call User', 'Make an outbound phone call to the user for alerts, reminders, or check-ins', legacyTools.callUser, { tags: ['outbound', 'call'], requiredServices: ['twilio'] }),
        wrapLegacyTool('scheduleCallback', 'Schedule Callback', 'Schedule a callback to the user at a specific time', legacyTools.scheduleCallback, { tags: ['callback', 'schedule'], requiredServices: ['twilio'] }),
        // On-behalf calls: agent calls third party (doctor, restaurant, etc.)
        {
            id: 'callOnBehalf',
            name: 'Call On Behalf',
            description: 'Call a third party on behalf of the user (doctor, restaurant, business) and handle the conversation autonomously',
            domain: 'telephony',
            tags: ['telephony', 'outbound', 'autonomous', 'on-behalf'],
            requiredServices: ['twilio'],
            create: (ctx) => createCallOnBehalfTool(ctx),
        },
        // Personal conversational calls: agent calls family/friends for the user
        // This is an alias for callOnBehalf with personal call defaults
        {
            id: 'callAndConverse',
            name: 'Call and Converse',
            description: 'Have Ferni call someone (family, friend) and have a real two-way conversation, then report back',
            domain: 'telephony',
            tags: ['telephony', 'outbound', 'personal', 'conversation'],
            requiredServices: ['twilio'],
            create: (ctx) => createCallOnBehalfTool(ctx),
        },
    ];
}
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const telephonyTools = getTelephonyToolDefinitions();
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('telephony', telephonyTools);
export { getTelephonyToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.js.map