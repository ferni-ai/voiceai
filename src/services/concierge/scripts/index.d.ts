/**
 * Concierge Scripts
 *
 * Domain-specific conversation scripts for outbound calls.
 * Each script provides greetings, questions, and response parsing guidance.
 */
import type { OutreachScript, ConciergeDomain, ConciergeRequestType } from '../types.js';
/**
 * Get a script for a domain and request type
 */
export declare function getScript(domain: ConciergeDomain, type: ConciergeRequestType): OutreachScript | undefined;
/**
 * Get all scripts for a domain
 */
export declare function getScriptsForDomain(domain: ConciergeDomain): OutreachScript[];
/**
 * Get all available scripts
 */
export declare function getAllScripts(): OutreachScript[];
export { hotelScripts } from './hotel.js';
export { restaurantScripts } from './restaurant.js';
export { healthcareScripts } from './healthcare.js';
export { localServiceScripts } from './local-service.js';
//# sourceMappingURL=index.d.ts.map