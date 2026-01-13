/**
 * Crisis & Safety Support Domain Tools
 *
 * CRITICAL: These tools support users in crisis situations.
 * They must ALWAYS:
 * - Surface appropriate professional resources
 * - Never replace professional help
 * - Use warm, supportive language
 * - Err on the side of caution
 * - Respect user autonomy
 *
 * DOMAIN: crisis
 * TOOLS:
 *   Resources: provideCrisisResources, findLocalResources
 *   Grounding: guideGroundingExercise, deEscalateAnxiety
 *   Safety: createSafetyPlan, findSafeResources
 *   Recovery: supportRecoveryJourney, trackSobrietyMilestone
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map