/**
 * Ambient Mode Domain Tools
 *
 * "Better than Human" - Continuous background presence.
 *
 * Tools for ambient awareness - knowing where the user is, what time it is,
 * and being able to send gentle nudges when appropriate.
 *
 * DOMAIN: awareness
 * TOOLS:
 *   - getAmbientContext: Get current ambient context (location, time, activity)
 *   - suggestNudge: Evaluate if a nudge should be sent
 *   - setAmbientPreferences: Update ambient mode preferences
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const getAmbientContextDef: ToolDefinition;
declare const suggestNudgeDef: ToolDefinition;
declare const setQuietHoursDef: ToolDefinition;
declare const getAmbientPreferencesDef: ToolDefinition;
declare const toggleAmbientModeDef: ToolDefinition;
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getAmbientContextDef, suggestNudgeDef, setQuietHoursDef, getAmbientPreferencesDef, toggleAmbientModeDef, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map