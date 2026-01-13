/**
 * Enhanced Person Extraction
 *
 * NER-like person extraction that goes beyond simple regex:
 * - Relationship terms ("my mom", "my wife")
 * - Proper names from context ("Sarah called me", "talked to John")
 * - Titles and roles ("my boss", "the doctor", "my therapist")
 * - Possessive patterns ("Alex's sister", "Tom and I")
 * - Learn and remember names mentioned in conversation
 *
 * @module services/superhuman/semantic-intelligence/person-extractor
 */
export interface ExtractedPerson {
    /** The name or identifier (e.g., "Sarah", "mom", "boss") */
    name: string;
    /** Relationship type if detected */
    relationship?: PersonRelationship;
    /** Confidence in the extraction (0-1) */
    confidence: number;
    /** The original text snippet that contained the mention */
    contextSnippet: string;
    /** Whether this is a proper name vs relationship term */
    isProperName: boolean;
}
export type PersonRelationship = 'parent' | 'sibling' | 'spouse' | 'child' | 'extended_family' | 'friend' | 'romantic' | 'coworker' | 'professional' | 'acquaintance' | 'pet' | 'other';
/**
 * Common names to help validate extractions.
 * This is a subset - we use it to boost confidence for known names.
 */
declare const COMMON_NAMES: Set<string>;
/**
 * Words that look like names but aren't (filter list).
 */
declare const NOT_NAMES: Set<string>;
/**
 * Extract all person mentions from text.
 *
 * @param text - The user's message text
 * @returns Array of extracted persons with confidence scores
 */
export declare function extractPersons(text: string): ExtractedPerson[];
/**
 * Get the primary person mentioned (highest confidence).
 */
export declare function getPrimaryPerson(text: string): ExtractedPerson | null;
/**
 * Get the primary person's name (convenience function).
 */
export declare function getPrimaryPersonName(text: string): string | undefined;
export { COMMON_NAMES, NOT_NAMES };
//# sourceMappingURL=person-extractor.d.ts.map