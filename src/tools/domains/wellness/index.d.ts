/**
 * Wellness Domain Tools (Emotional/Mental Wellness)
 *
 * Tools for emotional wellness and support.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * IMPORTANT: This domain focuses on EMOTIONAL wellness, not physical health.
 * - Physical health (exercise, nutrition, sleep) → 'health' domain
 * - Financial wellness → tools here (addressFinancialAnxiety, reframeMoneyBelief)
 * - Medication tracking → tools here but logically belongs with 'health'
 *   (see HEALTH-HOME-WELLNESS-AUDIT.md for planned migration)
 *
 * DOMAIN: wellness
 * TOOLS:
 *   Emotional: emotionalSupport (anxiety, encouragement, checkin, gratitude)
 *   Mindset: reframeBelief (money beliefs, imposter syndrome, perfectionism)
 *   Medications: manageMedication, medicationSchedule
 *
 * NOTE: Sleep tools are in 'health' domain, not here. See health.semantic.ts
 */
import type { ToolDefinition } from '../../registry/types.js';
declare function getEmotionalWellnessToolDefinitions(): ToolDefinition[];
declare function getMedicationToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getEmotionalWellnessToolDefinitions, getMedicationToolDefinitions };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map