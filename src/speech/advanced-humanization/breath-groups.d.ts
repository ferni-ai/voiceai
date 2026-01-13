/**
 * Breath Group Pacing
 *
 * Natural pauses at phrase boundaries, mimicking human breath patterns.
 * Humans speak in "breath groups" - phrases produced on a single exhalation.
 * This module identifies natural phrase boundaries and adds appropriate pauses.
 *
 * @module advanced-humanization/breath-groups
 */
import { type BreathGroupConfig } from './types.js';
/**
 * Add natural breath group pauses to text
 *
 * Humans speak in "breath groups" - phrases produced on a single exhalation.
 * This function identifies natural phrase boundaries and adds appropriate pauses.
 *
 * @param text - The text to add breath group pauses to
 * @param config - Breath group configuration
 * @returns Text with SSML breaks added at natural pause points
 */
export declare function addBreathGroupPauses(text: string, config?: BreathGroupConfig): string;
//# sourceMappingURL=breath-groups.d.ts.map