/**
 * Anti-Surveillance Language Filter
 *
 * > "Make them feel known, not tracked."
 *
 * Detects and blocks language patterns that make Ferni sound like
 * a surveillance app rather than a friend who notices.
 *
 * Philosophy:
 * - "I noticed" not "Our records show"
 * - "I keep thinking about" not "Based on your data"
 * - Observations, not statistics
 * - Felt, not explained
 *
 * @module services/revelation-moments/anti-surveillance
 */
import type { LanguagePattern, SurveillanceCategory } from './types.js';
/**
 * Patterns that sound like surveillance/tracking
 */
export declare const SURVEILLANCE_PATTERNS: LanguagePattern[];
/**
 * Human-sounding alternatives for common surveillance patterns
 */
export declare const HUMAN_ALTERNATIVES: Record<string, string[]>;
/**
 * Check text for surveillance-y language
 */
export declare function detectSurveillanceLanguage(text: string): Array<{
    pattern: LanguagePattern;
    match: string;
    index: number;
}>;
/**
 * Check if text contains any blocking surveillance language
 */
export declare function containsBlockingSurveillance(text: string): boolean;
/**
 * Get all surveillance issues in text
 */
export declare function getSurveillanceIssues(text: string): {
    hasBlocking: boolean;
    hasWarnings: boolean;
    issues: Array<{
        severity: 'block' | 'warn';
        match: string;
        alternative?: string;
        category: SurveillanceCategory;
    }>;
};
/**
 * Transform surveillance language to human language
 *
 * Note: This is a best-effort transformation. Some patterns may not
 * transform cleanly and should be manually reviewed.
 */
export declare function humanizeSurveillanceLanguage(text: string): {
    transformed: string;
    changes: Array<{
        original: string;
        replacement: string;
    }>;
};
/**
 * Generate anti-surveillance guidance for context injection
 */
export declare function getAntiSurveillanceGuidance(): string;
/**
 * Get quick anti-surveillance reminders for specific categories
 */
export declare function getAntiSurveillanceReminder(category: SurveillanceCategory): string;
//# sourceMappingURL=anti-surveillance.d.ts.map