/**
 * Cultural Moments Detection
 *
 * Detects culturally significant moments based on date/time that
 * Ferni can reference to feel more connected to the user's world.
 *
 * @module intelligence/human-behaviors/cultural-moments
 */
export interface CulturalMoment {
    type: 'holiday' | 'tax_season' | 'market_anniversary' | 'earnings_season' | 'fed_meeting' | 'quarter_end' | 'seasonal' | 'awareness';
    name: string;
    reference: string;
    relevance: 'high' | 'medium' | 'low';
}
/**
 * Detect culturally significant moments based on current date
 *
 * Returns null if no notable moment is detected (keeps responses natural)
 */
export declare function detectCulturalMoment(): Promise<CulturalMoment | null>;
export default detectCulturalMoment;
//# sourceMappingURL=cultural-moments.d.ts.map