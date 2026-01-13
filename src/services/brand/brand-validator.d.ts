/**
 * Brand Validator Service
 *
 * Real-time validation of content against brand rules.
 * Checks for banned phrases, tone mismatches, and brand compliance.
 *
 * @module @ferni/brand/brand-validator
 */
import type { ContextType, PersonaId, ValidationResult } from './types.js';
/**
 * Validate content against all brand rules
 */
export declare function validateBrandCompliance(content: string, options?: {
    persona?: PersonaId;
    context?: ContextType;
    strict?: boolean;
}): Promise<ValidationResult>;
/**
 * Quick check for banned content (no Firestore)
 */
export declare function quickValidate(content: string): {
    hasBannedContent: boolean;
    issues: string[];
};
/**
 * Auto-fix common brand violations
 */
export declare function autoFixViolations(content: string): {
    fixed: string;
    changes: string[];
};
/**
 * Get a compliance score without full validation
 */
export declare function getQuickScore(content: string): number;
//# sourceMappingURL=brand-validator.d.ts.map