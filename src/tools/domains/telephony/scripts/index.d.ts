/**
 * Call Script Templates
 *
 * Domain-specific conversation scripts for outbound calls on behalf of users.
 * Each script provides guidance, guardrails, and objectives for the agent.
 *
 * @module tools/domains/telephony/scripts
 */
import { healthcareScript } from './healthcare.js';
import { restaurantScript } from './restaurant.js';
import { businessScript } from './business.js';
import { personalScript } from './personal.js';
import type { CallScriptTemplate, CallObjective, ResolvedContact } from '../types.js';
export type ScriptType = 'healthcare' | 'restaurant' | 'business' | 'personal';
/**
 * Select the appropriate script based on contact and purpose
 */
export declare function selectScript(contact: ResolvedContact, purpose: string): {
    script: CallScriptTemplate;
    type: ScriptType;
};
/**
 * Build a complete script with placeholders filled in
 */
export declare function buildCallScript(template: CallScriptTemplate, params: {
    agentName: string;
    userName: string;
    contactName: string;
    purpose: string;
    objective: CallObjective;
    additionalContext?: string;
    preferredTimes?: string[];
}): string;
/**
 * Generate a human-readable summary of what the script covers
 */
export declare function getScriptSummary(type: ScriptType): string;
export { healthcareScript, restaurantScript, businessScript, personalScript };
export type { CallScriptTemplate };
//# sourceMappingURL=index.d.ts.map