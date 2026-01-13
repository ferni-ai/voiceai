/**
 * Content Extractors
 *
 * Extracts time references, events, goals, people, and struggles from user messages.
 *
 * @module conversation/proactive-memory/extractors
 */
import type { ExtractedContent, ExtractedTimeReference } from './types.js';
/**
 * Extract time reference from text
 */
export declare function extractTimeReference(text: string): ExtractedTimeReference;
/**
 * Extract memorable content from text
 */
export declare function extractContent(text: string): ExtractedContent;
//# sourceMappingURL=extractors.d.ts.map