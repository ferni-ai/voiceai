/**
 * Routines Domain Tools
 *
 * Tools for Ferni's care routines - "What I Do For You"
 * Allows voice control of automated routines, triggers, and actions.
 *
 * DOMAIN: routines
 * TOOLS:
 *   - listRoutines: See what routines are active
 *   - createRoutine: Set up a new routine
 *   - runRoutine: Trigger a routine manually
 *   - toggleRoutine: Pause or resume a routine
 *
 * WARM FRAMING:
 *   Instead of "workflows" and "automation", we use caring language:
 *   - "What I do for you" instead of "Your workflows"
 *   - "Taking care of" instead of "Executing"
 *   - "Set this up for you" instead of "Create workflow"
 */
import type { ToolDefinition } from '../../registry/types.js';
declare const routineToolDefinitions: ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { routineToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map