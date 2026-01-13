/**
 * Small Details Module
 *
 * Extracts and manages small but meaningful details from conversations:
 * - User names
 * - Person names (family, friends)
 * - Pet names
 * - Places
 * - Companies
 * - Dates
 * - Amounts
 *
 * @module conversation-quality/small-details
 */
import type { SmallDetail } from './types.js';
/**
 * Extract specific details from user messages
 */
export declare function extractSmallDetails(text: string): SmallDetail[];
/**
 * Get a contextual reference to a remembered detail
 */
export declare function getDetailCallback(detail: SmallDetail): string;
//# sourceMappingURL=small-details.d.ts.map