/**
 * Natural Language Date Parser
 *
 * Parses human-friendly date/time expressions into Date objects.
 * Designed for voice-first interactions where users say things like:
 * - "tomorrow at 3"
 * - "next Tuesday afternoon"
 * - "in 2 hours"
 * - "the 15th"
 *
 * No external dependencies - pure TypeScript implementation.
 */
export interface ParsedDateTime {
    date: Date;
    confidence: 'high' | 'medium' | 'low';
    original: string;
    interpretation: string;
    hasTime: boolean;
    hasDate: boolean;
    ambiguous?: boolean;
}
export interface ParseOptions {
    referenceDate?: Date;
    defaultTime?: {
        hour: number;
        minute: number;
    };
    timezone?: string;
    prefer?: 'future' | 'past';
}
/**
 * Parse a natural language date/time expression
 */
export declare function parseNaturalDate(input: string, options?: ParseOptions): ParsedDateTime | null;
/**
 * Suggest how to phrase unclear inputs
 */
export declare function suggestClarification(parsed: ParsedDateTime): string | null;
/**
 * Check if a date is valid for scheduling
 */
export declare function isValidForScheduling(date: Date): {
    valid: boolean;
    reason?: string;
};
/**
 * Get suggested times for a vague request
 */
export declare function suggestTimes(vagueness: 'morning' | 'afternoon' | 'evening' | 'sometime_today' | 'sometime_this_week', reference?: Date): Date[];
//# sourceMappingURL=natural-date-parser.d.ts.map